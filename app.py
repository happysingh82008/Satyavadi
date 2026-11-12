from flask import Flask, jsonify, render_template, request
from satyavadi import run_Satyavadi
app = Flask(__name__, static_folder="static", template_folder="templates")

TRUST_RANGES = [
    {
        "min": 0,
        "max": 20,
        "color": "#ef4444",
        "label": "Red Zone (0-20): Failure / High Manipulation",
        "prediction": "Failure",
    },
    {
        "min": 21,
        "max": 40,
        "color": "#f97316",
        "label": "Orange Zone (21-40): Bot-Generated Manipulation",
        "prediction": "Bot-Generated",
    },
    {
        "min": 41,
        "max": 60,
        "color": "#eab308",
        "label": "Yellow Zone (41-60): Discounted Item (Verify Seller)",
        "prediction": "Discounted Item",
    },
    {
        "min": 61,
        "max": 100,
        "color": "#15803d",
        "label": "Dark Green Zone (61-100): Verified Discounted Item & Trusted",
        "prediction": "Discounted Item (Verified)",
    },
]


@app.route("/")
def home():
    """Renders templates/Ui.html with static/style.css and static/robot.js linked via url_for."""
    return render_template("Ui.html")


@app.route("/api/audit", methods=["POST"])
def audit_url():
    """Evaluates a pasted product URL across Amazon, Flipkart, and Meesho using a loop."""
    payload = request.get_json(silent=True) or {}
    product_url = str(payload.get("url", "")).strip()
    score = int(payload.get("score", 78))
    score = max(0, min(100, score))

    lower_url = product_url.lower()
    if "flipkart" in lower_url:
        platform = "Flipkart"
    elif "meesho" in lower_url:
        platform = "Meesho"
    else:
        platform = "Amazon"

    matched_range = TRUST_RANGES[0]
    for item in TRUST_RANGES:
        if item["min"] <= score <= item["max"]:
            matched_range = item
            break

    return jsonify(
        {
            "status": "ok",
            "url": product_url,
            "detected_platform": platform,
            "score": score,
            "range": matched_range,
        }
    )


if __name__ == "__main__":
    app.run(debug=True, port=5000)