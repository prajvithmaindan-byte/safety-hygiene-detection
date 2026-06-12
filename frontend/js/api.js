/**
 * HygieneGuard Smart API Client and Browser Simulator Fallback
 * Provides seamless switching between Live Local Python Backend and fully simulated Client-Side environment.
 */

const DEFAULT_MOCK_VIOLATIONS = [];

// Initialize local storage mock violations if not present
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
  const mode = localStorage.getItem("hg_mode") || "live";
  if (mode === "simulation") {
    return true;
  }

  const isLocal = window.location.hostname === "localhost" || 
                  window.location.hostname === "127.0.0.1" || 
                  window.location.port === "5000" ||
                  window.location.protocol === "file:";
  
  const customUrl = localStorage.getItem("hg_backend_url");

  // Force simulation mode on remote production hosts (Vercel) if no custom backend is configured
  if (mode === "live" && !isLocal && !customUrl) {
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
let persistentCanvas = null;
function drawMockFrame() {
  mockTick++;
  if (!persistentCanvas) {
    persistentCanvas = document.createElement("canvas");
    persistentCanvas.width = 640;
    persistentCanvas.height = 360;
  }
  const canvas = persistentCanvas;
  const ctx = canvas.getContext("2d");

  const isCameraActive = (simVideoElement && simVideoElement.readyState >= 2);

  // 1. Draw live webcam if running in browser
  if (isCameraActive) {
    ctx.drawImage(simVideoElement, 0, 0, 640, 360);
    // Draw semi-translucent overlay to keep the industrial cyber aesthetic
    ctx.fillStyle = "rgba(12, 15, 20, 0.25)";
    ctx.fillRect(0, 0, 640, 360);
  } else {
    // Futuristic dark mesh grid background fallback
    ctx.fillStyle = "#0c0f14";
    ctx.fillRect(0, 0, 640, 360);
  }

  // Draw cyber-tech scan grid lines
  ctx.strokeStyle = "rgba(0, 255, 136, 0.04)";
  ctx.lineWidth = 1;
  for (let x = 0; x < 640; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 360); ctx.stroke();
  }
  for (let y = 0; y < 360; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(640, y); ctx.stroke();
  }

  const faceCX = 320;
  const faceCY = 165;
  
  // High-tech scanning reticle circles
  ctx.strokeStyle = isCameraActive ? "rgba(0, 255, 136, 0.1)" : "rgba(0, 255, 136, 0.05)";
  ctx.beginPath(); ctx.arc(320, 165, 120, 0, 2 * Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.arc(320, 165, 60, 0, 2 * Math.PI); ctx.stroke();

  // Dynamic automatic simulator cycle loop (every ~80 ticks per phase)
  const phase = Math.floor(mockTick / 80) % 5;
  let violations = [];

  // Face shield & Facial indicators
  if (isCameraActive) {
    // Draw real-time face tracking box overlay on webcam!
    const trackColor = phase === 0 ? "#00ff88" : "#ff2d55";
    ctx.strokeStyle = trackColor;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = trackColor;
    ctx.shadowBlur = 6;
    
    // Draw bounding box corners to look high-tech
    const boxX = faceCX - 70;
    const boxY = faceCY - 85;
    const boxW = 140;
    const boxH = 170;
    
    ctx.strokeRect(boxX, boxY, boxW, boxH);
    ctx.shadowBlur = 0;

    // Corner brackets
    ctx.fillStyle = trackColor;
    ctx.fillRect(boxX - 2, boxY - 2, 15, 3);
    ctx.fillRect(boxX - 2, boxY - 2, 3, 15);
    ctx.fillRect(boxX + boxW - 13, boxY - 2, 15, 3);
    ctx.fillRect(boxX + boxW - 1, boxY - 2, 3, 15);
    ctx.fillRect(boxX - 2, boxY + boxH - 1, 15, 3);
    ctx.fillRect(boxX - 2, boxY + boxH - 13, 3, 15);
    ctx.fillRect(boxX + boxW - 13, boxY + boxH - 1, 15, 3);
    ctx.fillRect(boxX + boxW - 1, boxY + boxH - 13, 3, 15);

    // Text label above face
    ctx.font = "bold 9px Rajdhani, monospace";
    ctx.fillText("SUBJECT_01_TRACKED", boxX + 5, boxY - 6);

    // Interactive custom state toggle OR fallback to automatic demo loop
    const activeBreach = {
      maskUnderNose: window.hgSimState.maskUnderNose || (phase === 1),
      noseTouching: window.hgSimState.noseTouching || (phase === 2),
      hairTouching: window.hgSimState.hairTouching || (phase === 3),
      noGloves: window.hgSimState.noGloves || (phase === 4)
    };

    if (activeBreach.maskUnderNose) {
      violations.push({ type: "No Mouth Mask", confidence: 0.94 });
      ctx.strokeStyle = "#ff2d55";
      ctx.strokeRect(faceCX - 25, faceCY + 20, 50, 25);
      ctx.fillStyle = "#ff2d55";
      ctx.fillText("BREACH: NO MASK", faceCX - 23, faceCY + 15);
    } else {
      // Shield Active overlay
      ctx.strokeStyle = "#00aaff";
      ctx.strokeRect(faceCX - 25, faceCY + 20, 50, 25);
      ctx.fillStyle = "#00aaff";
      ctx.fillText("MASK ACTIVE", faceCX - 23, faceCY + 15);
    }

    let handX = 490;
    let handY = 250;

    if (activeBreach.noseTouching) {
      violations.push({ type: "Nose Touching", confidence: 0.89 });
      handX = faceCX - 10;
      handY = faceCY + 5;
      
      ctx.strokeStyle = "#ff2d55";
      ctx.beginPath(); ctx.arc(handX, handY, 15, 0, 2 * Math.PI); ctx.stroke();
      ctx.fillStyle = "#ff2d55";
      ctx.fillText("NOSE TOUCH DETECTED", handX + 20, handY + 5);
    } else if (activeBreach.hairTouching) {
      violations.push({ type: "Hair Touching", confidence: 0.86 });
      handX = faceCX;
      handY = faceCY - 90;
      
      ctx.strokeStyle = "#ff2d55";
      ctx.beginPath(); ctx.arc(handX, handY, 15, 0, 2 * Math.PI); ctx.stroke();
      ctx.fillStyle = "#ff2d55";
      ctx.fillText("HAIR TOUCH DETECTED", handX + 20, handY + 5);
    } else if (activeBreach.noGloves) {
      violations.push({ type: "No Hand Gloves", confidence: 0.83 });
      ctx.strokeStyle = "#ff2d55";
      ctx.strokeRect(handX - 20, handY - 20, 40, 40);
      ctx.fillStyle = "#ff2d55";
      ctx.fillText("BREACH: NO GLOVES", handX - 25, handY - 28);
    } else {
      // Gloves standard safe trace
      ctx.strokeStyle = "#00aaff";
      ctx.strokeRect(handX - 20, handY - 20, 40, 40);
      ctx.fillStyle = "#00aaff";
      ctx.fillText("GLOVES DETECTED", handX - 25, handY - 28);
    }

  } else {
    // 2. Futuristic Neon Face outline (Offline Fallback Loop)
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
    ctx.beginPath(); ctx.arc(300, 145, 4, 0, 2 * Math.PI); ctx.fill(); // Left eye
    ctx.beginPath(); ctx.arc(340, 145, 4, 0, 2 * Math.PI); ctx.fill(); // Right eye
    ctx.beginPath(); ctx.moveTo(320, 135); ctx.lineTo(320, 170); ctx.lineTo(305, 175); ctx.strokeStyle = "#00ff88"; ctx.stroke();

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
  ctx.fillStyle = "rgba(20, 25, 30, 0.85)";
  ctx.fillRect(10, 10, 230, 25);
  ctx.strokeStyle = "#00ff88";
  ctx.strokeRect(10, 10, 230, 25);
  ctx.fillStyle = "#00ff88";
  ctx.font = "bold 9px Rajdhani, monospace";
  ctx.fillText("FEED: SIMULATION_ENVIRONMENT_V1.2", 18, 25);

  // If active violation and camera is NOT active, highlight telemetry bounding box
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

  // Build per-person data for simulation
  const persons = [];
  if (violations.length > 0) {
    persons.push({
      id: 1,
      violations: violations.map(v => v.type),
      status: "VIOLATION"
    });
  } else {
    persons.push({
      id: 1,
      violations: [],
      status: "CLEAR"
    });
  }

  return {
    frame: canvas.toDataURL("image/jpeg").split(",")[1], // Extract Base64
    violations: violations,
    total_persons: persons.length,
    persons: persons,
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

// Global runtime state indicating if the live backend is offline
window.hg_backend_offline = false;

// High-performance custom fetch wrapper supporting automatic mock simulation
async function smartFetch(endpoint, options = {}) {
  // If we already know we are in simulation, directly use mock values
  if (isSimulationMode()) {
    return handleMockEndpoints(endpoint);
  }

  const base = getApiBase();
  const fullUrl = base + endpoint;

  try {
    const timeoutMs = (endpoint === "/api/frame") ? 1500 : 10000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Bypass ngrok and localtunnel landing warning page checks
    const requestHeaders = {
      ...(options.headers || {}),
      "ngrok-skip-browser-warning": "true",
      "Bypass-Tunnel-Reminder": "true"
    };

    const response = await window.fetch(fullUrl, { 
      ...options, 
      headers: requestHeaders,
      signal: controller.signal 
    });
    clearTimeout(timeoutId);

    // Successfully connected to backend, verify live mode and clear offline flag
    localStorage.setItem("hg_mode", "live");
    window.hg_backend_offline = false;
    updateConnectionIndicator();
    return response;
  } catch (err) {
    console.warn(`Connection to Flask backend [${fullUrl}] failed. Switching to temporary Simulation Mode.`, err);
    // Mark as offline at runtime, but DO NOT save "simulation" permanently to localStorage
    window.hg_backend_offline = true;
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
  } else if (endpoint === "/api/camera/test") {
    payload = { status: "ok", message: "Simulation Camera working" };
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

  if (isSimulationMode()) {
    badge.innerText = "⬡ SIMULATION ACTIVE";
    badge.style.background = "rgba(255, 170, 0, 0.12)";
    badge.style.color = "#ffaa44";
    badge.style.border = "1px solid rgba(255, 170, 0, 0.35)";
    badge.style.boxShadow = "0 0 10px rgba(255, 170, 0, 0.1)";
    badge.title = "Showing simulated demonstration environment. Click to configure connection.";
  } else if (window.hg_backend_offline) {
    badge.innerText = "⚠️ BACKEND OFFLINE (SIMULATED)";
    badge.style.background = "rgba(255, 45, 85, 0.15)";
    badge.style.color = "#ff2d55";
    badge.style.border = "1px solid rgba(255, 45, 85, 0.35)";
    badge.style.boxShadow = "0 0 10px rgba(255, 45, 85, 0.1)";
    badge.title = "Local Flask server is not responding. Running in temporary simulation mode. Click to configure.";
  } else {
    badge.innerText = "⚡ BACKEND CONNECTED";
    badge.style.background = "rgba(0, 255, 136, 0.12)";
    badge.style.color = "#00ff88";
    badge.style.border = "1px solid rgba(0, 255, 136, 0.3)";
    badge.style.boxShadow = "0 0 10px rgba(0, 255, 136, 0.1)";
    badge.title = `Communicating with local Python backend: ${getApiBase()}. Click to configure connection.`;
  }
}

let selectedModalMode = "live";

window.setModalMode = function(mode) {
  selectedModalMode = mode;
  const liveBtn = document.getElementById("modeLiveBtn");
  const simBtn = document.getElementById("modeSimBtn");
  
  if (!liveBtn || !simBtn) return;
  
  if (mode === "live") {
    liveBtn.style.background = "rgba(0, 255, 136, 0.12)";
    liveBtn.style.color = "#00ff88";
    liveBtn.style.border = "1px solid rgba(0, 255, 136, 0.3)";
    liveBtn.style.boxShadow = "0 0 8px rgba(0, 255, 136, 0.15)";
    
    simBtn.style.background = "transparent";
    simBtn.style.color = "var(--text-muted)";
    simBtn.style.border = "1px solid transparent";
    simBtn.style.boxShadow = "none";
  } else {
    simBtn.style.background = "rgba(255, 170, 0, 0.12)";
    simBtn.style.color = "#ffaa44";
    simBtn.style.border = "1px solid rgba(255, 170, 0, 0.3)";
    simBtn.style.boxShadow = "0 0 8px rgba(255, 170, 0, 0.15)";
    
    liveBtn.style.background = "transparent";
    liveBtn.style.color = "var(--text-muted)";
    liveBtn.style.border = "1px solid transparent";
    liveBtn.style.boxShadow = "none";
  }
};

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
          Configure execution settings. Live mode triggers local webcam feed through the Flask server AI, while Simulation runs simulated frontend demos.
        </p>
        
        <!-- Segmented Operation Mode Control -->
        <div style="margin-bottom:1.5rem;">
          <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:0.5rem; letter-spacing:1px;">OPERATION MODE</label>
          <div style="display:flex; background:#0c0f14; border:1px solid var(--border); border-radius:6px; padding:0.25rem; gap:0.25rem;">
            <button id="modeLiveBtn" onclick="setModalMode('live')" style="flex:1; background:transparent; border:1px solid transparent; color:var(--text-muted); padding:0.55rem; border-radius:4px; font-weight:700; font-size:0.72rem; cursor:pointer; font-family:Rajdhani; transition:all 0.2s;">⚡ LIVE BACKEND</button>
            <button id="modeSimBtn" onclick="setModalMode('simulation')" style="flex:1; background:transparent; border:1px solid transparent; color:var(--text-muted); padding:0.55rem; border-radius:4px; font-weight:700; font-size:0.72rem; cursor:pointer; font-family:Rajdhani; transition:all 0.2s;">⬡ SIMULATOR</button>
          </div>
        </div>

        <div style="margin-bottom:1.5rem;">
          <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:0.5rem; letter-spacing:1px;">FLASK SERVER URL</label>
          <input type="text" id="backendUrlInput" placeholder="http://localhost:5000" style="width:100%; padding:0.6rem 0.8rem; background:#0c0f14; border:1px solid var(--border); border-radius:4px; color:#e0e8f0; font-family:var(--font-display); font-size:0.9rem; outline:none; transition:border 0.2s;" />
        </div>

        <div style="margin-bottom:1.5rem;">
          <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:0.5rem; letter-spacing:1px;">CAMERA SOURCE (e.g. DroidCam IP / Index)</label>
          <input type="text" id="cameraSourceInput" placeholder="http://192.168.1.5:4747/video or 0" style="width:100%; padding:0.6rem 0.8rem; background:#0c0f14; border:1px solid var(--border); border-radius:4px; color:#e0e8f0; font-family:var(--font-display); font-size:0.9rem; outline:none; transition:border 0.2s;" />
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
      #backendUrlInput:focus, #cameraSourceInput:focus { border-color: #00ff88 !important; box-shadow: 0 0 5px rgba(0,255,136,0.2); }
    `;
    document.head.appendChild(style);
  }

  const current = localStorage.getItem("hg_backend_url") || "";
  document.getElementById("backendUrlInput").value = current;

  const currentCam = localStorage.getItem("hg_camera_source") || "";
  document.getElementById("cameraSourceInput").value = currentCam;

  const currentMode = localStorage.getItem("hg_mode") || "live";
  window.setModalMode(currentMode);

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
  
  const camVal = document.getElementById("cameraSourceInput").value.trim();
  if (camVal === "") {
    localStorage.removeItem("hg_camera_source");
  } else {
    localStorage.setItem("hg_camera_source", camVal);
  }
  
  localStorage.setItem("hg_mode", selectedModalMode);
  
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
