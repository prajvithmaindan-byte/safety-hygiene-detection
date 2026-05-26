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
  return localStorage.getItem("hg_mode") === "simulation";
}

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

  // 1. Draw live webcam if running in browser
  if (simVideoElement && simVideoElement.readyState >= 2) {
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

  // Draw concentric radar lines
  ctx.strokeStyle = "rgba(0, 255, 136, 0.05)";
  ctx.beginPath(); ctx.arc(320, 180, 140, 0, 2 * Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.arc(320, 180, 80, 0, 2 * Math.PI); ctx.stroke();

  // 2. Neon Face outline
  const faceCX = 320;
  const faceCY = 170;
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

  // 3. Simulated states (rotating loop phases)
  const phase = Math.floor(mockTick / 60) % 5;
  let violations = [];

  // Face shield
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
    violations.append ? violations.append({ type: "No Mouth Mask", confidence: 0.94 }) : violations.push({ type: "No Mouth Mask", confidence: 0.94 });
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

  // If active violation, highlight telemetry bounding box
  if (violations.length > 0) {
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
  const base = getApiBase();
  const fullUrl = base + endpoint;

  // If we already know we are in simulation, directly use mock values
  if (isSimulationMode()) {
    return handleMockEndpoints(endpoint);
  }

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
    nav.insertBefore(wrapper, nav.querySelector(".audio-bar").parentNode);
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
});
