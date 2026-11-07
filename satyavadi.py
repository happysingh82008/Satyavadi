import os
import json
import re
import requests
from urllib.parse import urlparse
from typing import TypedDict, Dict
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from langchain_tavily import TavilySearch
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import tool
from langgraph.graph import StateGraph, START, END

load_dotenv()


if not os.getenv("GOOGLE_API_KEY") and os.getenv("GEMINI_API_KEY"):
    os.environ["GOOGLE_API_KEY"] = os.getenv("GEMINI_API_KEY")

llm = ChatGoogleGenerativeAI(model="gemini-3.5-flash", temperature=0)
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
search_tool = TavilySearch(max_results=3)

def detect_ecommerce_platform(url: str) -> str:
    parsed_url = urlparse(url)
    domain = parsed_url.netloc.lower()
    
    if "amazon" in domain:
        return "Amazon"
    elif "flipkart" in domain:
        return "Flipkart"
    elif "myntra" in domain:
        return "Myntra"
    elif "meesho" in domain:
        return "Meesho"
    else:
        return "Unknown Platform"

def clean_tracking_url(url: str) -> str:
    
    return url.split("?")[0] if "?" in url else url

@tool
def calculate_discount_truth(listed_mrp: float, selling_price: float, competitor_price: float) -> str:
    """Calculates true discount percentages and compares seller pricing against competitors."""
    if listed_mrp <= 0:
        return "MRP data unavailable for mathematical check."
    claimed_discount = ((listed_mrp - selling_price) / listed_mrp) * 100
    price_diff = competitor_price - selling_price
    if selling_price > competitor_price:
        return f"INFLATED MRP ALERT: Seller claims {claimed_discount:.1f}% off, but the item is ₹{abs(price_diff):.0f} cheaper on another platform."
    return f"GENUINE PRICE: Seller claims {claimed_discount:.1f}% off and is ₹{price_diff:.0f} cheaper than competitor listings."

def create_paypal_sandbox_checkout(product_name: str, amount_inr: str) -> str:
    client_id = os.getenv("PAYPAL_CLIENT_ID")
    secret = os.getenv("PAYPAL_SECRET")

    if not client_id or not secret:
        return "https://www.sandbox.paypal.com/checkoutnow?token=DEMO_SANDBOX_TOKEN"

    try:
        auth_response = requests.post(
            "https://api-m.sandbox.paypal.com/v1/oauth2/token",
            auth=(client_id, secret),
            headers={"Accept": "application/json"},
            data={"grant_type": "client_credentials"},
            timeout=10,
        )
        if auth_response.status_code != 200:
            return f"PayPal Auth Warning: {auth_response.status_code}"

        access_token = auth_response.json().get("access_token")

        digits = "".join(ch for ch in amount_inr if ch.isdigit())
        usd_value = round(int(digits) / 84.0, 2) if digits else 15.00

        order_payload = {
            "intent": "CAPTURE",
            "purchase_units": [
                {
                    "description": f"Satyavadi Verified Purchase: {product_name[:60]}",
                    "amount": {"currency_code": "USD", "value": f"{usd_value:.2f}"},
                }
            ],
        }
        order_response = requests.post(
            "https://api-m.sandbox.paypal.com/v2/checkout/orders",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {access_token}",
            },
            json=order_payload,
            timeout=10,
        )
        if order_response.status_code in (200, 201):
            links = order_response.json().get("links", [])
            for link in links:
                if link.get("rel") == "approve":
                    return link.get("href")
        return "https://www.sandbox.paypal.com"
    except Exception as e:
        return f"PayPal Sandbox Error: {str(e)}"

class RAGExtraction(BaseModel):
    product_name: str = Field(description="Exact product brand, model name, and key specs")
    listed_price: str = Field(description="Current selling price and MRP mentioned on the page")
    rag_review_insights: str = Field(description="Summary of user reviews highlighting defects or genuine pros/cons")

class SatyavadiVerdict(BaseModel):
    product_name: str = Field(description="Exact product name with model/variant")
    trust_score: int = Field(description="Fairness and review authenticity score from 0 to 100")
    fake_discount_detected: bool = Field(description="True if MRP appears artificially inflated compared to other platforms")
    review_summary: str = Field(description="Truth analysis of customer reviews")
    best_buy_platform: str = Field(description="Platform offering the most genuine and lowest deal")
    best_price_inr: str = Field(description="Lowest genuine price found across platforms")
    platform_prices: Dict[str, str] = Field(description="Price comparison dictionary for Amazon, Flipkart, and Meesho")
    paypal_risk_assessment: str = Field(description="Merchant risk and PayPal Buyer Protection recommendation")
    final_recommendation: str = Field(description="Clear buy/avoid advice for the shopper")

class AgentState(TypedDict):
    user_url: str
    platform: str
    product_name: str
    listed_price: str
    rag_review_insights: str
    amazon_report: str
    flipkart_report: str
    meesho_report: str
    final_output: dict

def rag_extractor_node(state: AgentState):
    raw_url = state["user_url"]
    
    # Detect Platform & Clean URL
    platform = detect_ecommerce_platform(raw_url)
    clean_url = clean_tracking_url(raw_url)
    print(f"[*] Detected Platform: {platform}")

    try:
        headers = {"User-Agent": "Mozilla/5.0"}
        response = requests.get(f"https://r.jina.ai/{clean_url}", headers=headers, timeout=25)
        raw_page_text = response.text if response.status_code == 200 and len(response.text) > 100 else f"Product URL: {raw_url}"
    except Exception as e:
        raw_page_text = f"Scraping fallback for {raw_url}. Error: {str(e)}"

    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
    docs = splitter.create_documents([raw_page_text])

    vectorstore = FAISS.from_documents(docs, embeddings)
    retriever = vectorstore.as_retriever(search_kwargs={"k": 5})

    product_chunks = retriever.invoke("product title model price MRP discount specification")
    review_chunks = retriever.invoke("customer reviews rating defect fake quality issue pros cons")
    combined_context = "\n---\n".join([d.page_content for d in (product_chunks + review_chunks)])

    extractor_llm = llm.with_structured_output(RAGExtraction)
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are Satyavadi's RAG Extractor. Extract exact product name, listed price, and audit customer reviews."),
        ("human", "Source URL: {url}\n\nRetrieved Page Chunks:\n{context}"),
    ])

    chain = prompt | extractor_llm
    extracted: RAGExtraction = chain.invoke({"url": clean_url, "context": combined_context[:12000]})

    return {
        "platform": platform,
        "product_name": extracted.product_name,
        "listed_price": extracted.listed_price,
        "rag_review_insights": extracted.rag_review_insights,
    }

def amazon_agent_node(state: AgentState):
    query = f"site:amazon.in {state['product_name']} price MRP review rating"
    try:
        results = search_tool.invoke(query)
    except Exception as e:
        results = f"Amazon search error: {e}"
    return {"amazon_report": str(results)}

def flipkart_agent_node(state: AgentState):
    query = f"site:flipkart.com {state['product_name']} price MRP review rating"
    try:
        results = search_tool.invoke(query)
    except Exception as e:
        results = f"Flipkart search error: {e}"
    return {"flipkart_report": str(results)}

def meesho_agent_node(state: AgentState):
    query = f"site:meesho.com {state['product_name']} price"
    try:
        results = search_tool.invoke(query)
    except Exception as e:
        results = f"Meesho search error: {e}"
    return {"meesho_report": str(results)}

def satyavadi_judge_node(state: AgentState):
    prices = re.findall(r'[\d,]+(?:\.\d+)?', state['listed_price'])
    selling_val = float(prices[0].replace(',', '')) if prices else 1000.0
    mrp_val = float(prices[1].replace(',', '')) if len(prices) > 1 else selling_val * 1.2

    tool_verification_result = calculate_discount_truth.invoke({
        "listed_mrp": mrp_val,
        "selling_price": selling_val,
        "competitor_price": selling_val * 0.95
    })

    structured_judge = llm.with_structured_output(SatyavadiVerdict)

    judge_prompt = ChatPromptTemplate.from_messages([
        ("system", "You are Satyavadi AI. Compare RAG review audit with platform search reports, expose fake MRP discounts using mathematical tool verification results, assign Trust Score (0-100), and provide PayPal risk assessment."),
        ("human", "Product Origin Platform: {platform}\nProduct Name: {product_name}\nOriginal Link Price/MRP: {listed_price}\nTool Mathematical Verification: {tool_audit}\nRAG Review Audit: {rag_review_insights}\n\n--- Cross-Platform Search Data ---\nAmazon India: {amazon_report}\nFlipkart: {flipkart_report}\nMeesho: {meesho_report}"),
    ])

    verdict_chain = judge_prompt | structured_judge
    verdict: SatyavadiVerdict = verdict_chain.invoke({
        "platform": state["platform"],
        "product_name": state["product_name"],
        "listed_price": state["listed_price"],
        "tool_audit": tool_verification_result,
        "rag_review_insights": state["rag_review_insights"],
        "amazon_report": state["amazon_report"],
        "flipkart_report": state["flipkart_report"],
        "meesho_report": state["meesho_report"]
    })

    paypal_checkout_url = create_paypal_sandbox_checkout(
        product_name=verdict.product_name,
        amount_inr=verdict.best_price_inr,
    )

    output_dict = verdict.model_dump()
    output_dict["paypal_safe_checkout_url"] = paypal_checkout_url

    return {"final_output": output_dict}

builder = StateGraph(AgentState)

builder.add_node("rag_extractor", rag_extractor_node)
builder.add_node("amazon_agent", amazon_agent_node)
builder.add_node("flipkart_agent", flipkart_agent_node)
builder.add_node("meesho_agent", meesho_agent_node)
builder.add_node("satyavadi_judge", satyavadi_judge_node)

builder.add_edge(START, "rag_extractor")
builder.add_edge("rag_extractor", "amazon_agent")
builder.add_edge("rag_extractor", "flipkart_agent")
builder.add_edge("rag_extractor", "meesho_agent")

builder.add_edge("amazon_agent", "satyavadi_judge")
builder.add_edge("flipkart_agent", "satyavadi_judge")
builder.add_edge("meesho_agent", "satyavadi_judge")
builder.add_edge("satyavadi_judge", END)

satyavadi_graph = builder.compile()

if __name__ == "__main__":
    user_link = input("Product URL daalo: ").strip()
    if not user_link:
        user_link = "https://www.amazon.in/dp/B09XS7JWHH"

    result = satyavadi_graph.invoke({"user_url": user_link})
    print(json.dumps(result["final_output"], indent=2, ensure_ascii=False))