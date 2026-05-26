const API_BASE = "/api";
let isStreaming = false;
let frameTimeout = null;

// Audio context nodes for high-tech warning alerts
let audioCtx = null;
let alertOscillator = null;
let alertGain = null;
let lfoInterval = null;

// Connection state
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function startAlertTone() {
  initAudio();
  if (alertOscillator) return; // Siren already playing

  alertOscillator = audioCtx.createOscillator();
  alertGain = audioCtx.createGain();

  // Sawtooth waveform for industrial warning feel
  alertOscillator.type = 'sawtooth';
  alertOscillator.frequency.setValueAtTime(380, audioCtx.currentTime);

  // REDUCED volume from 0.04 to 0.02 (50% quieter)
  alertGain.gain.setValueAtTime(0.02, audioCtx.currentTime);

  alertOscillator.connect(alertGain);
  alertGain.connect(audioCtx.destination);
  alertOscillator.start();

  // Siren modulation
  lfoInterval = setInterval(() => {
    if (!alertOscillator || !audioCtx) return;
    const now = audioCtx.currentTime;
    // Rapid high-low alert siren sweep
    alertOscillator.frequency.setValueAtTime(380, now);
    alertOscillator.frequency.linearRampToValueAtTime(520, now + 0.15);
    alertOscillator.frequency.linearRampToValueAtTime(380, now + 0.3);
  }, 300);
}

function stopAlertTone() {
  if (lfoInterval) {
    clearInterval(lfoInterval);
    lfoInterval = null;
  }
  if (alertOscillator) {
    try {
      alertOscillator.stop();
      alertOscillator.disconnect();
    } catch(e) {}
    alertOscillator = null;
  }
}

async function startCamera() {
  initAudio();
  try {
    const res = await fetch(`${API_BASE}/start`, { 
      method: 'POST',
      timeout: 5000
    });
    const data = await res.json();
    if (data.status === "started") {
      isStreaming = true;
      consecutiveErrors = 0;
      document.getElementById("cameraPlaceholder").style.display = "none";
      document.getElementById("cameraFeed").style.display = "block";
      document.getElementById("startBtn").style.display = "none";
      document.getElementById("stopBtn").style.display = "inline-block";
      document.getElementById("audioBar").classList.add("playing");
      
      // Update UI bar status
      const statusText = document.getElementById("statusText");
      statusText.innerText = "✓ SYSTEM STATUS: SECURE MONITOR ACTIVE";
      statusText.className = "status-text clear";
      
      console.log("[MONITOR] Stream started successfully");
      // Start processing loop
      pollFrame();
    }
  } catch (err) {
    console.error("[MONITOR] Failed to start camera:", err);
    alert("Connection Error: Backend server is not running or camera is locked.\n\nDebug: " + err.message);
  }
}

async function stopCamera() {
  isStreaming = false;
  if (frameTimeout) {
    clearTimeout(frameTimeout);
    frameTimeout = null;
  }
  stopAlertTone();
  
  try {
    await fetch(`${API_BASE}/stop`, { method: 'POST' });
  } catch(e) {
    console.error("[MONITOR] Error stopping stream:", e);
  }
  
  document.getElementById("cameraFeed").style.display = "none";
  document.getElementById("cameraPlaceholder").style.display = "flex";
  document.getElementById("startBtn").style.display = "inline-block";
  document.getElementById("stopBtn").style.display = "none";
  document.getElementById("audioBar").classList.remove("playing");
  
  // Reset Alert Visuals
  const statusLight = document.getElementById("statusLight");
  const statusText = document.getElementById("statusText");
  const cameraContainer = document.getElementById("cameraContainer");
  
  statusLight.classList.remove("violation");
  statusText.innerText = "SYSTEM STATUS: MONITOR STANDBY";
  statusText.className = "status-text clear";
  cameraContainer.classList.remove("violation-active", "clear-active");
  
  // Reset panel placeholder
  const panel = document.getElementById("violationPanel");
  panel.innerHTML = `
    <div id="noViolationsPlaceholder" style="height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--text-muted); font-size:0.85rem; text-align:center;">
      <span style="color:var(--text-muted); font-size:1.5rem; margin-bottom:0.5rem;">⬡</span>
      MONITOR SHUTDOWN. CAM FEED DISCONNECTED.
    </div>
  `;
  
  console.log("[MONITOR] Stream stopped");
}

async function pollFrame() {
  if (!isStreaming) return;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const res = await fetch(`${API_BASE}/frame`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    // Update live frame source
    const feed = document.getElementById("cameraFeed");
    if (data.frame) {
      feed.src = `data:image/jpeg;base64,${data.frame}`;
    }
    
    // Update Violation Telemetry
    updateAlertState(data.violations);
    consecutiveErrors = 0;  // Reset error counter on success
    
  } catch (err) {
    consecutiveErrors++;
    console.error(`[MONITOR] Frame poll error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, err.message);
    
    // Auto disconnect after max errors
    if (consecutiveErrors > MAX_CONSECUTIVE_ERRORS) {
      console.error("[MONITOR] Max connection errors reached, auto-disconnecting");
      stopCamera();
      alert("Connection lost. Backend server may be down.");
      return;
    }
  }
  
  // Poll again after 33ms for smooth real-time stream (~30 FPS)
  // Slightly increased from 33ms to 40ms for stability
  frameTimeout = setTimeout(pollFrame, 40);
}

function updateAlertState(violations) {
  const statusLight = document.getElementById("statusLight");
  const statusText = document.getElementById("statusText");
  const cameraContainer = document.getElementById("cameraContainer");
  const panel = document.getElementById("violationPanel");
  
  if (!violations || violations.length === 0) {
    // SAFE STATE
    stopAlertTone();
    statusLight.classList.remove("violation");
    statusText.innerText = "✓ SYSTEM STATUS: SAFE ALL CLEAR";
    statusText.className = "status-text clear";
    cameraContainer.classList.remove("violation-active");
    cameraContainer.classList.add("clear-active");
    
    panel.innerHTML = `
      <div id="noViolationsPlaceholder" style="height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--text-muted); font-size:0.85rem; text-align:center;">
        <span style="color:var(--green); font-size:1.5rem; margin-bottom:0.5rem;">✓</span>
        SECURE PERIMETER. NO HYGIENE VIOLATIONS DETECTED.
      </div>
    `;
  } else {
    // VIOLATION STATE
    startAlertTone();
    statusLight.classList.add("violation");
    
    const violationNames = violations.map(v => v.type).join(", ");
    statusText.innerText = `⚠ SYSTEM ALERT: HYGIENE BREACH - [${violationNames.toUpperCase()}]`;
    statusText.className = "status-text violation";
    
    cameraContainer.classList.remove("clear-active");
    cameraContainer.classList.add("violation-active");
    
    // Render dynamic active violation cards
    panel.innerHTML = violations.map(v => {
      const confPercent = Math.round(v.confidence * 100);
      return `
        <div class="violation-item">
          <div class="violation-type">⚠ ${v.type.toUpperCase()}</div>
          <div class="violation-conf">AI CONFIDENCE: ${confPercent}%</div>
        </div>
      `;
    }).join('');
    
    console.log("[MONITOR] Violations detected:", violations.map(v => v.type));
  }
}
