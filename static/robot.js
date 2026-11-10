(function () {
  'use strict';

  const trustRanges = [
    {
      min: 0,
      max: 20,
      color: '#ef4444',
      rowId: 'row-range-0',
      zoneName: 'RED FAILURE',
      label: 'Red Zone (0-20): Failure / High Manipulation',
      prediction: 'Failure',
      explanation:
        'Critical manipulation alert! Multi-agent audit detected inflated fake MRP, suspicious seller history, or high failure risk.'
    },
    {
      min: 21,
      max: 40,
      color: '#f97316',
      rowId: 'row-range-1',
      zoneName: 'ORANGE BOT',
      label: 'Orange Zone (21-40): Bot-Generated Manipulation',
      prediction: 'Bot-Generated',
      explanation:
        'Synthetic activity detected! High concentration of repetitive bot-generated reviews and artificial rating spikes.'
    },
    {
      min: 41,
      max: 60,
      color: '#eab308',
      rowId: 'row-range-2',
      zoneName: 'YELLOW CAUTION',
      label: 'Yellow Zone (41-60): Discounted Item (Verify Seller)',
      prediction: 'Discounted Item',
      explanation:
        'Moderate trust level. The item shows a partial discount, but compare alternative platforms below before checkout.'
    },
    {
      min: 61,
      max: 100,
      color: '#15803d',
      rowId: 'row-range-3',
      zoneName: 'VERIFIED GREEN',
      label: 'Dark Green Zone (61-100): Verified Discounted Item & Trusted',
      prediction: 'Discounted Item (Verified)',
      explanation:
        'Multi-agent price history and seller audit confirm a genuine discounted item with authentic buyer reviews.'
    }
  ];

  function evaluateTrustRangeWithLoop(score) {
    const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
    let matchedRange = trustRanges[0];

    for (let i = 0; i < trustRanges.length; i++) {
      const range = trustRanges[i];
      if (clampedScore >= range.min && clampedScore <= range.max) {
        matchedRange = range;
        break;
      }
    }
    return matchedRange;
  }

  let scene = null;
  let camera = null;
  let renderer = null;
  let controls = null;
  let robotGroup = null;
  let leftArmGroup = null;
  let rightArmGroup = null;
  let leftLegGroup = null;
  let rightLegGroup = null;
  let headGroup = null;
  let chestCoreMesh = null;
  let chestRingMesh = null;
  let visorMesh = null;
  let backVentsMesh = null;
  let starField = null;
  let autoRotateEnabled = true;
  let scanPulseTimer = 0;
  let targetCamAngle = null;

  function initRoboticHumanoid3D() {
    const container = document.getElementById('robot-canvas-container');
    if (!container || typeof THREE === 'undefined') {
      return;
    }

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 310;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02040a);
    scene.fog = new THREE.FogExp2(0x02040a, 0.035);

    camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 200);
    camera.position.set(0, 1.3, 6.2);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);

    if (typeof THREE.OrbitControls !== 'undefined') {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.enablePan = false;
      controls.minDistance = 3.5;
      controls.maxDistance = 10;
      controls.target.set(0, 0.5, 0);
    }

    const ambientLight = new THREE.AmbientLight(0x94a3b8, 0.75);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.25);
    keyLight.position.set(5, 8, 6);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.9);
    rimLight.position.set(-5, 4, -6);
    scene.add(rimLight);

    const emeraldPoint = new THREE.PointLight(0x22c55e, 1.4, 12);
    emeraldPoint.position.set(0, 1.2, 3);
    scene.add(emeraldPoint);

    const starGeo = new THREE.BufferGeometry();
    const starCount = 1400;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 90;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 90;

      const tint = Math.random();
      if (tint > 0.75) {
        colors[i * 3] = 0.52;
        colors[i * 3 + 1] = 0.93;
        colors[i * 3 + 2] = 0.67;
      } else if (tint > 0.5) {
        colors[i * 3] = 0.56;
        colors[i * 3 + 1] = 0.82;
        colors[i * 3 + 2] = 0.99;
      } else {
        colors[i * 3] = 0.98;
        colors[i * 3 + 1] = 0.98;
        colors[i * 3 + 2] = 1.0;
      }
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const starMat = new THREE.PointsMaterial({
      size: 0.16,
      vertexColors: true,
      transparent: true,
      opacity: 0.9
    });
    starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    robotGroup = new THREE.Group();
    scene.add(robotGroup);

    const armorMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.78,
      roughness: 0.26
    });
    const darkJointMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.65,
      roughness: 0.4
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.9,
      roughness: 0.18
    });
    const coreGlowMat = new THREE.MeshStandardMaterial({
      color: 0x15803d,
      emissive: 0x22c55e,
      emissiveIntensity: 0.95,
      roughness: 0.15
    });
    const cyanGlowMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.85,
      roughness: 0.2
    });

    headGroup = new THREE.Group();
    headGroup.position.set(0, 2.02, 0);
    robotGroup.add(headGroup);

    const cranium = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.68, 0.74), armorMat);
    headGroup.add(cranium);

    visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.2, 0.08), coreGlowMat);
    visorMesh.position.set(0, 0.04, 0.37);
    headGroup.add(visorMesh);

    const earGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.18, 16);
    earGeo.rotateZ(Math.PI / 2);
    const leftEar = new THREE.Mesh(earGeo, cyanGlowMat);
    leftEar.position.set(-0.44, 0.04, 0);
    const rightEar = new THREE.Mesh(earGeo, cyanGlowMat);
    rightEar.position.set(0.44, 0.04, 0);
    headGroup.add(leftEar, rightEar);

    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.26, 0.55), cyanGlowMat);
    crest.position.set(0, 0.42, -0.04);
    headGroup.add(crest);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.26, 16), darkJointMat);
    neck.position.set(0, 1.58, 0);
    robotGroup.add(neck);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.32, 1.38, 0.78), armorMat);
    torso.position.set(0, 0.82, 0);
    robotGroup.add(torso);

    const frontChestPlate = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.92, 0.12), chromeMat);
    frontChestPlate.position.set(0, 0.92, 0.38);
    robotGroup.add(frontChestPlate);

    chestCoreMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 24), coreGlowMat);
    chestCoreMesh.position.set(0, 0.94, 0.44);
    robotGroup.add(chestCoreMesh);

    chestRingMesh = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 16, 36), cyanGlowMat);
    chestRingMesh.position.set(0, 0.94, 0.45);
    robotGroup.add(chestRingMesh);

    const backPack = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.88, 0.34), darkJointMat);
    backPack.position.set(0, 0.94, -0.52);
    robotGroup.add(backPack);

    const thrusterGeo = new THREE.CylinderGeometry(0.14, 0.18, 0.75, 18);
    const leftThruster = new THREE.Mesh(thrusterGeo, chromeMat);
    leftThruster.position.set(-0.28, 0.92, -0.66);
    const rightThruster = new THREE.Mesh(thrusterGeo, chromeMat);
    rightThruster.position.set(0.28, 0.92, -0.66);
    robotGroup.add(leftThruster, rightThruster);

    backVentsMesh = new THREE.Group();
    for (let s = 0; s < 4; s++) {
      const spineNode = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.12), coreGlowMat);
      spineNode.position.set(0, 1.24 - s * 0.22, -0.7);
      backVentsMesh.add(spineNode);
    }
    robotGroup.add(backVentsMesh);

    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.32, 0.66), darkJointMat);
    pelvis.position.set(0, 0.0, 0);
    robotGroup.add(pelvis);

    function createRoboticArm(sideMultiplier) {
      const armRoot = new THREE.Group();
      armRoot.position.set(sideMultiplier * 0.88, 1.36, 0);

      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 20), chromeMat);
      armRoot.add(shoulder);

      const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.65, 16), armorMat);
      upperArm.position.set(0, -0.38, 0);
      armRoot.add(upperArm);

      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), cyanGlowMat);
      elbow.position.set(0, -0.74, 0);
      armRoot.add(elbow);

      const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.62, 0.26), armorMat);
      forearm.position.set(0, -1.1, 0.06);
      armRoot.add(forearm);

      const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 16), chromeMat);
      wrist.position.set(0, -1.44, 0.06);
      armRoot.add(wrist);

      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.14), coreGlowMat);
      palm.position.set(0, -1.58, 0.08);
      armRoot.add(palm);

      for (let f = -1; f <= 1; f++) {
        const finger = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.05), chromeMat);
        finger.position.set(f * 0.07, -1.74, 0.08);
        armRoot.add(finger);
      }
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.06), chromeMat);
      thumb.position.set(-sideMultiplier * 0.13, -1.62, 0.14);
      armRoot.add(thumb);

      return armRoot;
    }

    leftArmGroup = createRoboticArm(-1);
    rightArmGroup = createRoboticArm(1);
    robotGroup.add(leftArmGroup, rightArmGroup);

    function createRoboticLeg(sideMultiplier) {
      const legRoot = new THREE.Group();
      legRoot.position.set(sideMultiplier * 0.36, -0.16, 0);

      const hip = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), darkJointMat);
      legRoot.add(hip);

      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.72, 0.36), armorMat);
      thigh.position.set(0, -0.44, 0);
      legRoot.add(thigh);

      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), cyanGlowMat);
      knee.position.set(0, -0.84, 0.04);
      legRoot.add(knee);

      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.74, 16), chromeMat);
      shin.position.set(0, -1.26, 0);
      legRoot.add(shin);

      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.58), armorMat);
      foot.position.set(0, -1.68, 0.1);
      legRoot.add(foot);

      return legRoot;
    }

    leftLegGroup = createRoboticLeg(-1);
    rightLegGroup = createRoboticLeg(1);
    robotGroup.add(leftLegGroup, rightLegGroup);

    const baseDisk = new THREE.Mesh(
      new THREE.CylinderGeometry(1.45, 1.6, 0.12, 36),
      darkJointMat
    );
    baseDisk.position.set(0, -2.02, 0);
    robotGroup.add(baseDisk);

    const baseGlowRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.48, 0.04, 16, 48),
      coreGlowMat
    );
    baseGlowRing.rotation.x = Math.PI / 2;
    baseGlowRing.position.set(0, -1.95, 0);
    robotGroup.add(baseGlowRing);

    window.addEventListener('resize', function () {
      if (!container || !renderer || !camera) return;
      const newW = container.clientWidth || 800;
      const newH = container.clientHeight || 310;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    });

    let clock = new THREE.Clock();
    function animate3D() {
      requestAnimationFrame(animate3D);
      const elapsed = clock.getElapsedTime();

      if (starField) {
        starField.rotation.y = elapsed * 0.025;
      }

      if (robotGroup) {
        robotGroup.position.y = Math.sin(elapsed * 2.1) * 0.06;

        if (targetCamAngle !== null) {
          robotGroup.rotation.y += (targetCamAngle - robotGroup.rotation.y) * 0.08;
          if (Math.abs(targetCamAngle - robotGroup.rotation.y) < 0.01) {
            targetCamAngle = null;
          }
        } else if (autoRotateEnabled) {
          robotGroup.rotation.y += 0.0075;
        }

        if (scanPulseTimer > 0) {
          scanPulseTimer -= 0.02;
          rightArmGroup.rotation.x = -Math.PI * 0.38 + Math.sin(elapsed * 10) * 0.18;
          leftArmGroup.rotation.x = -Math.PI * 0.22 - Math.sin(elapsed * 10) * 0.15;
          headGroup.rotation.y = Math.sin(elapsed * 8) * 0.22;
        } else {
          rightArmGroup.rotation.x = Math.sin(elapsed * 1.8) * 0.12;
          leftArmGroup.rotation.x = -Math.sin(elapsed * 1.8) * 0.12;
          headGroup.rotation.y = Math.sin(elapsed * 0.9) * 0.08;
        }
      }

      if (controls) {
        controls.update();
      }
      renderer.render(scene, camera);
    }

    animate3D();
  }

  function updateRobotCoreColor(hexColor, zoneText, score) {
    if (chestCoreMesh && chestCoreMesh.material) {
      chestCoreMesh.material.color.set(hexColor);
      chestCoreMesh.material.emissive.set(hexColor);
    }
    const hudCore = document.getElementById('hud-core-status');
    if (hudCore) {
      hudCore.textContent = zoneText + ' (' + score + '/100)';
      hudCore.style.color = hexColor;
    }
    scanPulseTimer = 1.6;
  }

  function detectPlatformFromUrl(rawUrl) {
    const lower = (rawUrl || '').toLowerCase();
    if (lower.includes('flipkart')) return 'Flipkart';
    if (lower.includes('meesho')) return 'Meesho';
    if (lower.includes('amazon') || lower.includes('amzn')) return 'Amazon';
    return 'Amazon';
  }

  function computeDeterministicScoreFromUrl(rawUrl, manualSliderVal) {
    const sliderNum = parseInt(manualSliderVal, 10);
    if (!isNaN(sliderNum) && sliderNum > 0) {
      return Math.max(1, Math.min(100, sliderNum));
    }

    const lower = (rawUrl || '').toLowerCase();
    if (lower.includes('scam') || lower.includes('fail') || lower.includes('fake')) {
      return 14;
    }
    if (lower.includes('bot') || lower.includes('clone') || lower.includes('boost')) {
      return 31;
    }
    if (lower.includes('flash') || lower.includes('sale') || lower.includes('itm')) {
      return 52;
    }
    if (lower.includes('verified') || lower.includes('deal') || lower.includes('B0CHX1W1XY'.toLowerCase())) {
      return 84;
    }

    let hash = 0;
    for (let i = 0; i < rawUrl.length; i++) {
      hash = (hash * 31 + rawUrl.charCodeAt(i)) % 100;
    }
    return Math.max(1, hash || 74);
  }

  function formatINR(amount) {
    return '\u20B9' + Math.round(amount).toLocaleString('en-IN');
  }

  function runSatyavadiUrlAudit(rawUrl, forcedScore, showPopupModal) {
    const cleanUrl = (rawUrl || '').trim() || 'https://www.amazon.in/dp/B0CHX1W1XY/pro-anc-headphones';
    const sliderEl = document.getElementById('score-override-slider');
    const sliderVal = sliderEl ? sliderEl.value : '0';

    const score =
      typeof forcedScore === 'number'
        ? forcedScore
        : computeDeterministicScoreFromUrl(cleanUrl, sliderVal);

    const detectedPlatform = detectPlatformFromUrl(cleanUrl);

    const matchedRange = evaluateTrustRangeWithLoop(score);

    let seed = 0;
    for (let c = 0; c < cleanUrl.length; c++) {
      seed += cleanUrl.charCodeAt(c) * (c + 1);
    }
    const baseFairValue = 1299 + (seed % 3400);

    let listedPrice = baseFairValue;
    let botProbText = '8% (Organic)';
    if (score <= 20) {
      listedPrice = Math.round(baseFairValue * 1.65);
      botProbText = '89% (Severe Manipulation)';
    } else if (score <= 40) {
      listedPrice = Math.round(baseFairValue * 1.28);
      botProbText = '68% (Bot Review Cluster)';
    } else if (score <= 60) {
      listedPrice = Math.round(baseFairValue * 1.08);
      botProbText = '29% (Mixed Reviews)';
    } else {
      listedPrice = Math.round(baseFairValue * 0.92);
      botProbText = Math.max(4, 100 - score) + '% (Verified Organic)';
    }

    const platformData = {
      Amazon: {
        name: 'Amazon',
        price: detectedPlatform === 'Amazon' ? listedPrice : Math.round(baseFairValue * 0.94),
        trust: detectedPlatform === 'Amazon' ? score : Math.min(96, Math.max(64, score + 12)),
        status: 'Discounted Item'
      },
      Flipkart: {
        name: 'Flipkart',
        price: detectedPlatform === 'Flipkart' ? listedPrice : Math.round(baseFairValue * 0.97),
        trust: detectedPlatform === 'Flipkart' ? score : Math.min(92, Math.max(61, score + 6)),
        status: 'Discounted Item'
      },
      Meesho: {
        name: 'Meesho',
        price: detectedPlatform === 'Meesho' ? listedPrice : Math.round(baseFairValue * 0.89),
        trust: detectedPlatform === 'Meesho' ? score : Math.min(85, Math.max(48, score - 4)),
        status: 'Verify Seller'
      }
    };

    platformData[detectedPlatform].status = matchedRange.prediction;

    const sortedPlatforms = Object.values(platformData).sort(function (a, b) {
      return b.trust - a.trust;
    });
    const bestPlatform = sortedPlatforms[0];
    const belowBestPlatform = sortedPlatforms[1];
    const thirdPlatform = sortedPlatforms[2];

    const chartScorePill = document.getElementById('chart-score-pill');
    if (chartScorePill) {
      chartScorePill.textContent = score + ' / 100';
      chartScorePill.style.background = matchedRange.color;
    }

    const pointer = document.getElementById('spectrum-pointer');
    const pointerLabel = document.getElementById('pointer-label');
    if (pointer) {
      pointer.style.left = score + '%';
    }
    if (pointerLabel) {
      pointerLabel.textContent = String(score);
    }

    for (let r = 0; r < trustRanges.length; r++) {
      const rowEl = document.getElementById(trustRanges[r].rowId);
      if (rowEl) {
        if (trustRanges[r].rowId === matchedRange.rowId) {
          rowEl.classList.add('active-range-row');
          rowEl.style.borderColor = matchedRange.color;
        } else {
          rowEl.classList.remove('active-range-row');
          rowEl.style.borderColor = 'rgba(255, 255, 255, 0.08)';
        }
      }
    }

    const detectedPill = document.getElementById('detected-platform-pill');
    if (detectedPill) {
      detectedPill.textContent = 'Fetched: ' + detectedPlatform;
    }

    const verdictBanner = document.getElementById('audit-verdict-banner');
    if (verdictBanner) {
      verdictBanner.style.borderColor = matchedRange.color;
    }

    const verdictTitle = document.getElementById('verdict-prediction-text');
    if (verdictTitle) {
      verdictTitle.textContent = matchedRange.prediction;
      verdictTitle.style.color = matchedRange.color === '#eab308' ? '#fde047' : '#ffffff';
    }

    const verdictDesc = document.getElementById('verdict-explanation');
    if (verdictDesc) {
      verdictDesc.textContent = matchedRange.explanation;
    }

    const verdictOrb = document.getElementById('verdict-score-orb');
    const verdictNum = document.getElementById('verdict-score-num');
    if (verdictOrb) {
      verdictOrb.style.borderColor = matchedRange.color;
    }
    if (verdictNum) {
      verdictNum.textContent = String(score);
    }

    const metricPlatform = document.getElementById('metric-platform');
    const metricListed = document.getElementById('metric-listed-price');
    const metricFair = document.getElementById('metric-fair-price');
    const metricBot = document.getElementById('metric-bot-prob');

    if (metricPlatform) metricPlatform.textContent = detectedPlatform + ' Marketplace';
    if (metricListed) metricListed.textContent = formatINR(listedPrice);
    if (metricFair) metricFair.textContent = formatINR(baseFairValue);
    if (metricBot) metricBot.textContent = botProbText;

    const bestNameEl = document.getElementById('best-platform-name');
    const bestDetailEl = document.getElementById('best-platform-detail');
    const belowNameEl = document.getElementById('below-best-platform-name');
    const belowDetailEl = document.getElementById('below-best-platform-detail');

    if (bestNameEl) bestNameEl.textContent = bestPlatform.name;
    if (bestDetailEl) {
      bestDetailEl.textContent =
        'Effective Price: ' +
        formatINR(bestPlatform.price) +
        ' \u2022 Trust Score: ' +
        bestPlatform.trust +
        '/100 \u2022 Top Recommended';
    }

    if (belowNameEl) belowNameEl.textContent = belowBestPlatform.name;
    if (belowDetailEl) {
      belowDetailEl.textContent =
        'Effective Price: ' +
        formatINR(belowBestPlatform.price) +
        ' \u2022 Trust Score: ' +
        belowBestPlatform.trust +
        '/100 \u2022 Runner-Up Option';
    }

    function assignRoleLabel(pName) {
      if (pName === bestPlatform.name) return '\u2605 Best Platform';
      if (pName === belowBestPlatform.name) return '\u2193 Below Best Platform';
      return '3rd Option (' + thirdPlatform.name + ')';
    }

    const cardMap = [
      { key: 'Amazon', cardId: 'ecom-card-amazon', priceId: 'amz-price', trustId: 'amz-trust', statusId: 'amz-status', roleId: 'amz-role-tag' },
      { key: 'Flipkart', cardId: 'ecom-card-flipkart', priceId: 'flp-price', trustId: 'flp-trust', statusId: 'flp-status', roleId: 'flp-role-tag' },
      { key: 'Meesho', cardId: 'ecom-card-meesho', priceId: 'msh-price', trustId: 'msh-trust', statusId: 'msh-status', roleId: 'msh-role-tag' }
    ];

    for (let k = 0; k < cardMap.length; k++) {
      const item = cardMap[k];
      const pInfo = platformData[item.key];
      const cardEl = document.getElementById(item.cardId);
      const priceEl = document.getElementById(item.priceId);
      const trustEl = document.getElementById(item.trustId);
      const statusEl = document.getElementById(item.statusId);
      const roleEl = document.getElementById(item.roleId);

      if (priceEl) priceEl.textContent = formatINR(pInfo.price);
      if (trustEl) trustEl.textContent = pInfo.trust + ' / 100';
      if (statusEl) statusEl.textContent = pInfo.status;
      if (roleEl) roleEl.textContent = assignRoleLabel(item.key);

      if (cardEl) {
        if (item.key === bestPlatform.name) {
          cardEl.classList.add('winner-platform-card');
        } else {
          cardEl.classList.remove('winner-platform-card');
        }
      }
    }

    updateRobotCoreColor(matchedRange.color, matchedRange.zoneName, score);

    try {
      const apiEndpoint = [window.location.origin, 'api', 'audit'].join('/');
      fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl, score: score })
      }).catch(function () {
      });
    } catch (e) {
    }

    if (showPopupModal) {
      openSatyavadiPopup({
        url: cleanUrl,
        platform: detectedPlatform,
        score: score,
        range: matchedRange,
        bestPlatform: bestPlatform,
        belowBestPlatform: belowBestPlatform
      });
    }
  }

  function openSatyavadiPopup(auditData) {
    const popup = document.getElementById('satyavadi-popup');
    if (!popup) return;

    const banner = document.getElementById('popup-score-banner');
    const scoreVal = document.getElementById('popup-score-value');
    const rangeLabel = document.getElementById('popup-range-label');
    const predBadge = document.getElementById('popup-prediction-badge');
    const urlText = document.getElementById('popup-url-text');
    const platText = document.getElementById('popup-platform-text');
    const bestText = document.getElementById('popup-best-platform');
    const belowText = document.getElementById('popup-below-best-platform');

    if (banner) {
      banner.style.borderColor = auditData.range.color;
      banner.style.background = 'rgba(15, 23, 42, 0.9)';
    }
    if (scoreVal) {
      scoreVal.textContent = auditData.score + ' / 100';
      scoreVal.style.color = auditData.range.color;
    }
    if (rangeLabel) rangeLabel.textContent = auditData.range.label;
    if (predBadge) predBadge.textContent = 'Predicted Status: ' + auditData.range.prediction;
    if (urlText) urlText.textContent = auditData.url;
    if (platText) platText.textContent = auditData.platform;
    if (bestText) {
      bestText.textContent =
        auditData.bestPlatform.name +
        ' (' +
        formatINR(auditData.bestPlatform.price) +
        ' \u2022 ' +
        auditData.bestPlatform.trust +
        '/100)';
    }
    if (belowText) {
      belowText.textContent =
        auditData.belowBestPlatform.name +
        ' (' +
        formatINR(auditData.belowBestPlatform.price) +
        ' \u2022 ' +
        auditData.belowBestPlatform.trust +
        '/100)';
    }

    popup.classList.remove('hidden');
  }

  function closeSatyavadiPopup() {
    const popup = document.getElementById('satyavadi-popup');
    if (popup) {
      popup.classList.add('hidden');
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    initRoboticHumanoid3D();

    const auditForm = document.getElementById('satyavadi-audit-form');
    const urlInput = document.getElementById('product-url-input');
    const scoreSlider = document.getElementById('score-override-slider');
    const sliderReadout = document.getElementById('slider-val-readout');

    if (auditForm) {
      auditForm.addEventListener('submit', function (evt) {
        evt.preventDefault();
        const urlVal = urlInput ? urlInput.value : '';
        runSatyavadiUrlAudit(urlVal, undefined, true);
      });
    }

    const sampleBtns = document.querySelectorAll('.sample-url-btn');
    for (let i = 0; i < sampleBtns.length; i++) {
      sampleBtns[i].addEventListener('click', function () {
        const presetUrl = this.getAttribute('data-url');
        const presetScore = parseInt(this.getAttribute('data-score'), 10);
        if (urlInput && presetUrl) {
          urlInput.value = presetUrl;
        }
        if (scoreSlider) {
          scoreSlider.value = '0';
        }
        if (sliderReadout) {
          sliderReadout.textContent = 'Auto (' + presetScore + '/100)';
        }
        runSatyavadiUrlAudit(presetUrl, presetScore, true);
      });
    }

    if (scoreSlider) {
      scoreSlider.addEventListener('input', function () {
        const val = parseInt(this.value, 10);
        if (sliderReadout) {
          sliderReadout.textContent = val === 0 ? 'Auto (URL Hash)' : val + ' / 100';
        }
        if (val > 0) {
          runSatyavadiUrlAudit(urlInput ? urlInput.value : '', val, false);
        }
      });
      scoreSlider.addEventListener('change', function () {
        const val = parseInt(this.value, 10);
        if (val > 0) {
          runSatyavadiUrlAudit(urlInput ? urlInput.value : '', val, true);
        }
      });
    }

    const closeBtn = document.getElementById('close-popup-btn');
    const ackBtn = document.getElementById('popup-ack-btn');
    const popupBackdrop = document.getElementById('satyavadi-popup');

    if (closeBtn) closeBtn.addEventListener('click', closeSatyavadiPopup);
    if (ackBtn) ackBtn.addEventListener('click', closeSatyavadiPopup);
    if (popupBackdrop) {
      popupBackdrop.addEventListener('click', function (e) {
        if (e.target === popupBackdrop) {
          closeSatyavadiPopup();
        }
      });
    }

    const camBtns = document.querySelectorAll('.cam-btn[data-view]');
    for (let b = 0; b < camBtns.length; b++) {
      camBtns[b].addEventListener('click', function () {
        for (let j = 0; j < camBtns.length; j++) {
          camBtns[j].classList.remove('active');
        }
        this.classList.add('active');

        const view = this.getAttribute('data-view');
        if (view === 'front') {
          targetCamAngle = 0;
        } else if (view === 'back') {
          targetCamAngle = Math.PI;
        } else if (view === 'hands') {
          targetCamAngle = Math.PI * 0.35;
          scanPulseTimer = 1.8;
        } else if (view === 'legs') {
          targetCamAngle = -Math.PI * 0.25;
        }
      });
    }

    const spinBtn = document.getElementById('btn-toggle-spin');
    if (spinBtn) {
      spinBtn.addEventListener('click', function () {
        autoRotateEnabled = !autoRotateEnabled;
        this.textContent = 'Auto-Rotate: ' + (autoRotateEnabled ? 'ON' : 'OFF');
      });
    }

    let isExactSpoken = false;
    const copyModeBtn = document.getElementById('toggle-copy-mode-btn');
    if (copyModeBtn) {
      copyModeBtn.addEventListener('click', function () {
        isExactSpoken = !isExactSpoken;
        const p2Lead = document.getElementById('part-2-lead');
        const p5Text = document.getElementById('part-5-text');
        if (isExactSpoken) {
          if (p2Lead) p2Lead.textContent = '22 eradicate';
          if (p5Text) p5Text.textContent = 'and protect your heart and money from despite sellers.';
          this.textContent = 'Text Mode: Exact Spoken';
        } else {
          if (p2Lead) p2Lead.textContent = 'To eradicate';
          if (p5Text) p5Text.textContent = 'and protect your hard-earned money from deceptive sellers.';
          this.textContent = 'Text Mode: Polished';
        }
      });
    }

    runSatyavadiUrlAudit(
      urlInput ? urlInput.value : 'https://www.amazon.in/dp/B0CHX1W1XY/pro-anc-headphones-deal',
      84,
      false
    );
  });
})();