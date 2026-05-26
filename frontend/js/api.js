/**
 * HygieneGuard Smart API Client and Browser Simulator Fallback
 * Provides seamless switching between Live Local Python Backend and fully simulated Client-Side environment.
 */

const DEFAULT_MOCK_VIOLATIONS = [
  { id: 101, type: "No Mouth Mask", timestamp: "2026-05-26 10:15:32", confidence: 0.94, image: null },
  { id: 102, type: "Nose Touching", timestamp: "2026-05-26 11:22:04", confidence: 0.88, image: null },
  { id: 103, type: "No Hand Gloves", timestamp: "2026-05-26 12:45:19", confidence: 0.91, image: null },
  { id: 104, type: "Hair Touching", timestamp: "2026-05-26 14:02:11", confidence: 0.85, image: null },
  { id: 105, type: "No Mouth Mask", timestamp: "2026-05-26 15:30:45", confidence: 0.96, image: null }
];

// Initialize local mock store
if (!localStorage.getItem("hg_mock_violations")) {
  localStorage.setItem("hg_mock_violations", JSON.stringify(DEFAULT_MOCK_VIOLATIONS));
}

// Get API base URL (either relative, or custom from settings)
function getApiBase() {
  const custom = localStorage.getItem("hg_backend_url");
  if (custom) {
    return custom.replace(/\/$/, "");
  }
  // If running on local development port 5000, default to relative. Otherwise default to local dev server.
  if (window.location.port === "5000" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return ""; // Relative path to Flask unified server
  }
  // Default fallback to standard local Python backend port
  return "http://localhost:5000";
}

// Check if we should run in simulation mode
function isSimulationMode() {
  const isLocal = window.location.hostname === "localhost" || 
                  window.location.hostname === "127.0.0.1" || 
                  window.location.port === "5000";
  
  const customUrl = localStorage.getItem("hg_backend_url");

  // Force simulation mode on remote production hosts (Vercel) if no custom backend is configured
  // This bypasses any stale local storage hg_mode values from previous sessions
  if (!isLocal && !customUrl) {
    return true;
  }

  const storedMode = localStorage.getItem("hg_mode");
  if (storedMode) {
    return storedMode === "simulation";
  }

  if (customUrl) {
    return false; // If custom backend URL is configured, try to connect to it
  }

  // Default: if running on secure HTTPS, default to simulation mode
  if (window.location.protocol === "https:") {
    return true;
  }
  return false;
}

// ============================================================================
// PREMIUM INTERACTIVE AI SIMULATION CONTROL PANEL FOR VERCEL DEMOS
// ============================================================================

window.hgSimState = {
  maskUnderNose: false,
  noseTouching: false,
  hairTouching: false,
  noGloves: false,
  autoLoop: false
};

function injectSimHud() {
  if (document.getElementById("hudSimController")) return;
  
  const container = document.getElementById("cameraContainer");
  if (!container) return;

  const controller = document.createElement("div");
  controller.id = "hudSimController";
  controller.className = "hud-sim-controller";
  
  controller.innerHTML = `
    <div class="hud-title">⬡ AI SIMULATION PANEL</div>
    <div class="hud-btn-grid">
      <button class="hud-btn" id="hudBtnMask" onclick="toggleSimState('maskUnderNose')">MASK BREACH</button>
      <button class="hud-btn" id="hudBtnNose" onclick="toggleSimState('noseTouching')">NOSE TOUCH</button>
      <button class="hud-btn" id="hudBtnHair" onclick="toggleSimState('hairTouching')">HAIR TOUCH</button>
      <button class="hud-btn" id="hudBtnGloves" onclick="toggleSimState('noGloves')">NO GLOVES</button>
    </div>
    <div class="hud-footer">
      <button class="hud-btn-loop inactive" id="hudBtnLoop" onclick="toggleSimLoop()">■ MANUAL CONTROL</button>
    </div>
  `;
  container.appendChild(controller);
  
  // Inject standard style
  const style = document.createElement("style");
  style.id = "hudSimStyles";
  style.innerHTML = `
    .hud-sim-controller {
      position: absolute;
      bottom: 15px;
      right: 15px;
      background: rgba(10, 13, 22, 0.88);
      border: 1px solid rgba(0, 242, 254, 0.35);
      border-radius: 6px;
      padding: 0.8rem;
      font-family: 'Rajdhani', sans-serif;
      backdrop-filter: blur(10px);
      box-shadow: 0 10px 30px rgba(0,0,0,0.6), 0 0 15px rgba(0, 242, 254, 0.15);
      z-index: 999;
      width: 210px;
      transition: all 0.3s ease;
      animation: pulse-border 3s infinite alternate;
    }
    @keyframes pulse-border {
      0% { border-color: rgba(0, 242, 254, 0.3); }
      100% { border-color: rgba(0, 242, 254, 0.6); }
    }
    .hud-title {
      font-family: 'Orbitron', sans-serif;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 1.5px;
      color: #00f2fe;
      margin-bottom: 0.65rem;
      text-shadow: 0 0 8px rgba(0, 242, 254, 0.5);
      text-align: center;
    }
    .hud-btn-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.45rem;
      margin-bottom: 0.65rem;
    }
    .hud-btn {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(0, 242, 254, 0.15);
      color: #8b80b0;
      font-size: 0.65rem;
      font-weight: 600;
      font-family: 'Rajdhani', sans-serif;
      padding: 0.4rem 0.2rem;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s ease;
      outline: none;
      text-align: center;
    }
    .hud-btn:hover {
      background: rgba(0, 242, 254, 0.08);
      border-color: rgba(0, 242, 254, 0.4);
      color: #f0ecfa;
    }
    .hud-btn.active {
      background: rgba(255, 0, 127, 0.15) !important;
      border-color: #ff007f !important;
      color: #ff007f !important;
      text-shadow: 0 0 5px rgba(255, 0, 127, 0.4);
      box-shadow: 0 0 5px rgba(255, 0, 127, 0.2);
    }
    .hud-btn-loop {
      width: 100%;
      background: rgba(0, 242, 254, 0.12);
      border: 1px solid #00f2fe;
      color: #00f2fe;
      font-size: 0.68rem;
      font-weight: 700;
      font-family: 'Rajdhani', sans-serif;
      padding: 0.4rem;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s ease;
      outline: none;
      text-align: center;
      text-shadow: 0 0 5px rgba(0, 242, 254, 0.4);
    }
    .hud-btn-loop:hover {
      background: rgba(0, 242, 254, 0.2);
      box-shadow: 0 0 8px rgba(0, 242, 254, 0.3);
    }
    .hud-btn-loop.inactive {
      background: rgba(255, 255, 255, 0.02) !important;
      border-color: rgba(255, 255, 255, 0.15) !important;
      color: #8b80b0 !important;
      text-shadow: none !important;
      box-shadow: none !important;
    }
  `;
  document.head.appendChild(style);
}

function removeSimHud() {
  const controller = document.getElementById("hudSimController");
  if (controller) controller.remove();
  const style = document.getElementById("hudSimStyles");
  if (style) style.remove();
}

window.toggleSimState = function(key) {
  // If auto loop is on, turn it off first
  if (window.hgSimState.autoLoop) {
    window.toggleSimLoop();
  }
  
  window.hgSimState[key] = !window.hgSimState[key];
  
  // Update button active state
  const btnMap = {
    maskUnderNose: "hudBtnMask",
    noseTouching: "hudBtnNose",
    hairTouching: "hudBtnHair",
    noGloves: "hudBtnGloves"
  };
  
  const btn = document.getElementById(btnMap[key]);
  if (btn) {
    if (window.hgSimState[key]) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  }
};

window.toggleSimLoop = function() {
  window.hgSimState.autoLoop = !window.hgSimState.autoLoop;
  const loopBtn = document.getElementById("hudBtnLoop");
  if (loopBtn) {
    if (window.hgSimState.autoLoop) {
      loopBtn.innerText = "⟳ AUTO LOOP: ON";
      loopBtn.classList.remove("inactive");
      
      // Reset all individual states
      const keys = ["maskUnderNose", "noseTouching", "hairTouching", "noGloves"];
      keys.forEach(k => {
        window.hgSimState[k] = false;
        const btnMap = {
          maskUnderNose: "hudBtnMask",
          noseTouching: "hudBtnNose",
          hairTouching: "hudBtnHair",
          noGloves: "hudBtnGloves"
        };
        const btn = document.getElementById(btnMap[k]);
        if (btn) btn.classList.remove("active");
      });
    } else {
      loopBtn.innerText = "■ MANUAL CONTROL";
      loopBtn.classList.add("inactive");
    }
  }
};

// Browser-based camera stream for simulation mode
let simVideoStream = null;
let simVideoElement = null;

async function startSimWebcam() {
  if (simVideoStream) return;
  try {
    simVideoStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 360 }
    });
    simVideoElement = document.createElement("video");
    simVideoElement.srcObject = simVideoStream;
    simVideoElement.autoplay = true;
    simVideoElement.playsInline = true;
  } catch (err) {
    console.warn("Could not acquire browser webcam for simulation mode:", err);
  }
}

function stopSimWebcam() {
  if (simVideoStream) {
    try {
      simVideoStream.getTracks().forEach(track => track.stop());
    } catch(e) {}
    simVideoStream = null;
  }
  if (simVideoElement) {
    simVideoElement.srcObject = null;
    simVideoElement = null;
  }
}

// High-tech synthetic canvas generator (runs at ~15 FPS in simulation mode)
let mockTick = 0;
function drawMockFrame() {
  mockTick++;
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext("2d");

  const isCameraActive = (simVideoElement && simVideoElement.readyState >= 2);

  // 1. Draw live webcam if running in browser
  if (isCameraActive) {
    ctx.drawImage(simVideoElement, 0, 0, 640, 360);
    // Draw semi-translucent overlay to keep the industrial cyber aesthetic
    ctx.fillStyle = "rgba(12, 15, 20, 0.45)";
    ctx.fillRect(0, 0, 640, 360);
  } else {
    // Futuristic dark mesh grid background fallback
    ctx.fillStyle = "#0c0f14";
    ctx.fillRect(0, 0, 640, 360);
  }

  ctx.strokeStyle = "rgba(0, 255, 136, 0.03)";
  ctx.lineWidth = 1;
  for (let x = 0; x < 640; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 360); ctx.stroke();
  }
  for (let y = 0; y < 360; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(640, y); ctx.stroke();
  }

  const faceCX = 320;
  const faceCY = 170;

  // Draw concentric radar lines (only when camera is NOT active)
  if (!isCameraActive) {
    ctx.strokeStyle = "rgba(0, 255, 136, 0.05)";
    ctx.beginPath(); ctx.arc(320, 180, 140, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(320, 180, 80, 0, 2 * Math.PI); ctx.stroke();
  }

  // 2. Neon Face outline (only when camera is NOT active)
  if (!isCameraActive) {
    ctx.strokeStyle = "#00ff88";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#00ff88";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.ellipse(faceCX, faceCY, 60, 80, 0, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.shadowBlur = 0; // Reset

    // Wireframe features
    ctx.fillStyle = "#00ff88";
    ctx.beginPath(); ctx.arc(300, 150, 4, 0, 2 * Math.PI); ctx.fill(); // Left eye
    ctx.beginPath(); ctx.arc(340, 150, 4, 0, 2 * Math.PI); ctx.fill(); // Right eye
    ctx.beginPath(); ctx.moveTo(320, 140); ctx.lineTo(320, 175); ctx.lineTo(305, 180); ctx.strokeStyle = "#00ff88"; ctx.stroke();
  }

  // Initialize state if not present
  if (!window.hgSimState) {
    window.hgSimState = {
      maskUnderNose: false,
      noseTouching: false,
      hairTouching: false,
      noGloves: false,
      autoLoop: false
    };
  }

  // Inject simulation panel if webcam is active
  if (isCameraActive) {
    injectSimHud();
  } else {
    removeSimHud();
  }

  // 3. Simulated states (Auto Loop or Manual control Panel)
  let violations = [];

  if (isCameraActive) {
    if (window.hgSimState.autoLoop) {
      // Loop phases automatically every 2 seconds
      const phase = Math.floor(mockTick / 60) % 5;
      if (phase === 1) {
        violations.push({ type: "No Mouth Mask", confidence: 0.94 });
      } else if (phase === 2) {
        violations.push({ type: "Nose Touching", confidence: 0.89 });
      } else if (phase === 3) {
        violations.push({ type: "Hair Touching", confidence: 0.86 });
      } else if (phase === 4) {
        violations.push({ type: "No Hand Gloves", confidence: 0.83 });
      }
    } else {
      // Use manual floating HUD controls
      if (window.hgSimState.maskUnderNose) {
        violations.push({ type: "No Mouth Mask", confidence: 0.94 });
      }
      if (window.hgSimState.noseTouching) {
        violations.push({ type: "Nose Touching", confidence: 0.89 });
      }
      if (window.hgSimState.hairTouching) {
        violations.push({ type: "Hair Touching", confidence: 0.86 });
      }
      if (window.hgSimState.noGloves) {
        violations.push({ type: "No Hand Gloves", confidence: 0.83 });
      }
    }
  } else {
    // Static offline fallback loop
    const phase = Math.floor(mockTick / 60) % 5;
    
    // Face shield (only when camera is NOT active)
    if (phase !== 1) {
      ctx.fillStyle = "rgba(0, 170, 255, 0.25)";
      ctx.strokeStyle = "#00aaff";
      ctx.beginPath();
      ctx.ellipse(faceCX, faceCY + 30, 42, 28, 0, 0, Math.PI);
      ctx.fill();
      ctx.stroke();
      
      ctx.fillStyle = "#00aaff";
      ctx.font = "bold 9px Rajdhani, monospace";
      ctx.fillText("SHIELD ACTIVE", faceCX - 30, faceCY + 45);
    } else {
      // Red bare mouth (Mask breach)
      ctx.strokeStyle = "#ff2d55";
      ctx.beginPath();
      ctx.ellipse(faceCX, faceCY + 28, 18, 8, 0, 0, 2 * Math.PI);
      ctx.stroke();
      violations.push({ type: "No Mouth Mask", confidence: 0.94 });
    }

    // Simulated Hands / Gestures
    let handX = 520;
    let handY = 280;

    if (phase === 2) {
      handX = faceCX - 8;
      handY = faceCY + 5;
      violations.push({ type: "Nose Touching", confidence: 0.89 });
    } else if (phase === 3) {
      handX = faceCX;
      handY = faceCY - 70;
      violations.push({ type: "Hair Touching", confidence: 0.86 });
    } else if (phase === 4) {
      handX = 420;
      handY = 240;
      // Bare hand
      ctx.fillStyle = "#ffaa44";
      ctx.beginPath(); ctx.arc(handX, handY, 18, 0, 2 * Math.PI); ctx.fill();
      violations.push({ type: "No Hand Gloves", confidence: 0.83 });
    }

    if (phase !== 4) {
      // Render high-tech blue gloves
      ctx.fillStyle = "rgba(0, 170, 255, 0.4)";
      ctx.strokeStyle = "#00aaff";
      ctx.beginPath(); ctx.arc(handX, handY, 18, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    }
  }

  // 4. Matrix Scanning Line
  const scanY = (mockTick * 3) % 360;
  ctx.strokeStyle = "rgba(0, 255, 136, 0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, scanY); ctx.lineTo(640, scanY); ctx.stroke();

  // 5. Tech Overlays
  ctx.fillStyle = "rgba(20, 25, 30, 0.8)";
  ctx.fillRect(10, 10, 220, 25);
  ctx.strokeStyle = "#00ff88";
  ctx.strokeRect(10, 10, 220, 25);
  ctx.fillStyle = "#00ff88";
  ctx.font = "bold 9px Rajdhani, monospace";
  ctx.fillText("FEED: SIMULATION_ENVIRONMENT_V1.2", 18, 25);

  // If active violation, highlight telemetry bounding box (only when camera is NOT active)
  if (violations.length > 0 && !isCameraActive) {
    ctx.strokeStyle = "#ff2d55";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(faceCX - 50, faceCY - 60, 100, 115);
    ctx.fillStyle = "#ff2d55";
    ctx.fillText("ALARM: HYGIENE BREACH", faceCX - 48, faceCY - 68);
  }

  // Draw HUD top bar status
  const barColor = violations.length > 0 ? "#ff2d55" : "#00ff88";
  ctx.fillStyle = "rgba(10, 13, 18, 0.9)";
  ctx.fillRect(0, 0, 640, 30);
  ctx.fillStyle = barColor;
  ctx.fillRect(0, 28, 640, 2);
  ctx.font = "bold 11px Rajdhani, monospace";
  const txt = violations.length > 0 
    ? `⚠ VIOLATION: ${violations.map(v => v.type.toUpperCase()).join(", ")}` 
    : "✓ SYSTEM STATUS: SECURE & SAFE";
  ctx.fillText(txt, 15, 18);

  return {
    frame: canvas.toDataURL("image/jpeg").split(",")[1], // Extract Base64
    violations: violations,
    status: violations.length > 0 ? "violation" : "clear"
  };
}

// Handle mock violations logger
let lastLoggedPhase = -1;
function logSimulatedViolation(violations) {
  if (violations.length === 0) return;
  const phase = Math.floor(mockTick / 60) % 5;
  if (phase === lastLoggedPhase) return; // Only log once per phase
  lastLoggedPhase = phase;

  const mockDb = JSON.parse(localStorage.getItem("hg_mock_violations") || "[]");
  violations.forEach(v => {
    const newId = mockDb.length > 0 ? Math.max(...mockDb.map(item => item.id)) + 1 : 101;
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 10) + " " + now.toTimeString().slice(0, 8);
    mockDb.unshift({
      id: newId,
      type: v.type,
      timestamp: timestamp,
      confidence: v.confidence,
      image: null
    });
  });
  localStorage.setItem("hg_mock_violations", JSON.stringify(mockDb));
}

// High-performance custom fetch wrapper supporting automatic mock simulation
async function smartFetch(endpoint, options = {}) {
  // If we already know we are in simulation, directly use mock values
  if (isSimulationMode()) {
    return handleMockEndpoints(endpoint);
  }

  const base = getApiBase();
  const fullUrl = base + endpoint;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout

    const response = await window.fetch(fullUrl, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error("HTTP error status");
    
    // Successfully connected to backend, verify live mode
    localStorage.setItem("hg_mode", "live");
    return response;
  } catch (err) {
    console.warn(`Connection to Flask backend [${fullUrl}] failed. Switching to Simulation Mode.`, err);
    localStorage.setItem("hg_mode", "simulation");
    updateConnectionIndicator();
    return handleMockEndpoints(endpoint);
  }
}

// Router to handle mock endpoints client-side
function handleMockEndpoints(endpoint) {
  const mockDb = JSON.parse(localStorage.getItem("hg_mock_violations") || "[]");

  let payload = null;

  if (endpoint.startsWith("/api/violations")) {
    payload = mockDb;
  } else if (endpoint.startsWith("/api/stats/hourly")) {
    // Generate simulated hourly stats from mock data
    const hours = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
    payload = [];
    hours.forEach(hr => {
      const matchCount = mockDb.filter(v => v.timestamp.includes(` ${hr.slice(0, 2)}:`)).length;
      if (matchCount > 0) {
        payload.push({ hour: hr, type: "Breach", count: matchCount });
      }
    });
    // Ensure at least some items to keep charts populated
    if (payload.length === 0) {
      payload = [
        { hour: "09:00", type: "Breach", count: 1 },
        { hour: "11:00", type: "Breach", count: 2 },
        { hour: "14:00", type: "Breach", count: 1 },
        { hour: "16:00", type: "Breach", count: 1 }
      ];
    }
  } else if (endpoint.startsWith("/api/stats/types")) {
    const types = ["No Mouth Mask", "Nose Touching", "Hair Touching", "No Hand Gloves"];
    payload = types.map(t => ({
      type: t,
      count: mockDb.filter(v => v.type === t).length
    }));
  } else if (endpoint === "/api/start" || endpoint === "/api/stop") {
    if (endpoint === "/api/start") {
      startSimWebcam();
    } else {
      stopSimWebcam();
    }
    payload = { status: endpoint === "/api/start" ? "started" : "stopped" };
  } else if (endpoint === "/api/frame") {
    const simData = drawMockFrame();
    logSimulatedViolation(simData.violations);
    payload = simData;
  }

  // Return a mocked Response object
  return {
    ok: true,
    json: async () => payload
  };
}

// Render dynamic connection settings and overlay badge in UI
function initConnectionUi() {
  // 1. Inject modern Status / Settings control in navbar if not present
  const nav = document.querySelector("nav");
  if (nav && !document.getElementById("connectionSettingsWrapper")) {
    const wrapper = document.createElement("div");
    wrapper.id = "connectionSettingsWrapper";
    wrapper.style.cssText = "display:flex; align-items:center; gap:0.75rem;";
    
    // Connection toggle badge
    const badge = document.createElement("div");
    badge.id = "apiStatusBadge";
    badge.style.cssText = "font-family:var(--font-display); font-size:0.7rem; font-weight:700; letter-spacing:1px; padding:0.25rem 0.5rem; border-radius:3px; cursor:pointer;";
    badge.onclick = toggleBackendSettings;

    wrapper.appendChild(badge);
    
    const audioBar = nav.querySelector(".audio-bar");
    if (audioBar && audioBar.parentNode) {
      nav.insertBefore(wrapper, audioBar.parentNode);
    } else {
      nav.appendChild(wrapper);
    }
  }
  
  updateConnectionIndicator();
}

function updateConnectionIndicator() {
  const badge = document.getElementById("apiStatusBadge");
  if (!badge) return;

  const mode = localStorage.getItem("hg_mode") || "live";
  const customUrl = localStorage.getItem("hg_backend_url");

  if (mode === "simulation") {
    badge.innerText = "⬡ SIMULATION ACTIVE";
    badge.style.background = "rgba(255, 170, 0, 0.1)";
    badge.style.color = "#ffaa44";
    badge.style.border = "1px solid rgba(255, 170, 0, 0.2)";
    badge.title = "Local backend offline or using Vercel. Showing simulated environment. Click to configure connection.";
  } else {
    badge.innerText = "⚡ BACKEND CONNECTED";
    badge.style.background = "rgba(0, 255, 136, 0.1)";
    badge.style.color = "#00ff88";
    badge.style.border = "1px solid rgba(0, 255, 136, 0.2)";
    badge.title = `Communicating with local Python backend: ${getApiBase()}. Click to configure connection.`;
  }
}

// Open setting modal to configure local Flask server IP/URL
function toggleBackendSettings() {
  let modal = document.getElementById("backendSettingsModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "backendSettingsModal";
    modal.style.cssText = "position:fixed; inset:0; background:rgba(6,8,12,0.85); backdrop-filter:blur(5px); display:flex; align-items:center; justify-content:center; z-index:9999; font-family:Rajdhani, sans-serif; opacity:0; pointer-events:none; transition:opacity 0.3s ease;";
    
    modal.innerHTML = `
      <div style="background:#13181f; border:1px solid var(--border); border-radius:8px; width:90%; max-width:400px; padding:2rem; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
        <div style="font-size:1.1rem; font-weight:700; color:#00ff88; margin-bottom:1rem; letter-spacing:1px; display:flex; justify-content:between; align-items:center;">
          <span>⬡ BACKEND CONNECTION SETTINGS</span>
        </div>
        <p style="color:var(--text-muted); font-size:0.8rem; line-height:1.4; margin-bottom:1.5rem;">
          To stream from a real webcam, enter the local URL of your running Flask server (e.g. <code style="color:#00aaff;">http://127.0.0.1:5000</code>). Leave blank to auto-detect or default to simulator.
        </p>
        <div style="margin-bottom:1.5rem;">
          <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:0.5rem; letter-spacing:1px;">FLASK SERVER URL</label>
          <input type="text" id="backendUrlInput" placeholder="http://localhost:5000" style="width:100%; padding:0.6rem 0.8rem; background:#0c0f14; border:1px solid var(--border); border-radius:4px; color:#e0e8f0; font-family:var(--font-display); font-size:0.9rem; outline:none; transition:border 0.2s;" />
        </div>
        <div style="display:flex; justify-content:end; gap:0.75rem;">
          <button onclick="closeBackendSettings()" style="background:transparent; border:1px solid var(--border); color:var(--text-muted); padding:0.5rem 1rem; border-radius:4px; font-weight:600; cursor:pointer; font-family:Rajdhani;">CANCEL</button>
          <button onclick="saveBackendSettings()" style="background:#00ff88; border:none; color:#06080c; padding:0.5rem 1.2rem; border-radius:4px; font-weight:700; cursor:pointer; font-family:Rajdhani;">SAVE & RELOAD</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    // Style inputs dynamically
    const style = document.createElement("style");
    style.innerHTML = `
      #backendUrlInput:focus { border-color: #00ff88 !important; box-shadow: 0 0 5px rgba(0,255,136,0.2); }
    `;
    document.head.appendChild(style);
  }

  const current = localStorage.getItem("hg_backend_url") || "";
  document.getElementById("backendUrlInput").value = current;

  modal.style.opacity = "1";
  modal.style.pointerEvents = "all";
}

function closeBackendSettings() {
  const modal = document.getElementById("backendSettingsModal");
  if (modal) {
    modal.style.opacity = "0";
    modal.style.pointerEvents = "none";
  }
}

function saveBackendSettings() {
  const val = document.getElementById("backendUrlInput").value.trim();
  if (val === "") {
    localStorage.removeItem("hg_backend_url");
  } else {
    localStorage.setItem("hg_backend_url", val);
  }
  // Force re-evaluation next time
  localStorage.removeItem("hg_mode");
  
  closeBackendSettings();
  window.location.reload();
}

// Auto-run when DOM loaded
document.addEventListener("DOMContentLoaded", () => {
  initConnectionUi();
  initCyberSnowfall();
});

// Highly optimized, premium 60 FPS HTML5 Canvas Cyber-Snowfall Particle Effect
function initCyberSnowfall() {
  const canvas = document.createElement("canvas");
  canvas.id = "cyberSnowCanvas";
  canvas.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; pointer-events:none; z-index:-1;";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  let width = canvas.width = window.innerWidth;
  let height = canvas.height = window.innerHeight;

  window.addEventListener("resize", () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const numParticles = 75;
  const particles = [];

  for (let i = 0; i < numParticles; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 2.2 + 0.8, // radius
      vy: Math.random() * 1.0 + 0.4, // vertical velocity
      vx: Math.random() * 0.8 - 0.4, // horizontal drift
      color: Math.random() > 0.6 
        ? "rgba(240, 236, 250, 0.7)" // Bright white snow glow
        : (Math.random() > 0.5 ? "rgba(0, 242, 254, 0.6)" : "rgba(255, 0, 127, 0.6)") // Cyber Cyan or Cyber Magenta
    });
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    for (let i = 0; i < numParticles; i++) {
      const p = particles[i];
      ctx.beginPath();
      // Glowing radial gradient for each snowflake flake
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.2);
      grad.addColorStop(0, p.color);
      grad.addColorStop(0.3, p.color);
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      
      ctx.fillStyle = grad;
      ctx.arc(p.x, p.y, p.r * 2.2, 0, Math.PI * 2, true);
      ctx.fill();
    }
    update();
  }

  function update() {
    for (let i = 0; i < numParticles; i++) {
      const p = particles[i];
      p.y += p.vy;
      p.x += p.vx;

      // Re-spawn at the top if falling off the bottom
      if (p.y > height) {
        particles[i] = {
          x: Math.random() * width,
          y: -10,
          r: p.r,
          vy: p.vy,
          vx: p.vx,
          color: p.color
        };
      }
      
      // Wrap horizontal borders
      if (p.x > width) {
        p.x = 0;
      } else if (p.x < 0) {
        p.x = width;
      }
    }
  }

  function animate() {
    draw();
    requestAnimationFrame(animate);
  }

  animate();
}
