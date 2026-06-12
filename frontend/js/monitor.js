// Use smartFetch client wrapper for seamless Simulation/Live backend routing
const API_BASE = "/api";
const fetch = smartFetch;
let isStreaming = false;
let frameTimeout = null;

// ─── LOUD BUZZER ALARM SYSTEM ────────────────────────────────────
let audioCtx = null;
let alarmPlaying = false;
let alarmInterval = null;
let isMuted = false;
let masterGain = null;
let compressor = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// Auto-unlock audio on first user interaction (browsers block audio until click)
document.addEventListener('click', function unlockAudio() {
  initAudio();
  // Play silent buffer to unlock audio context
  const buffer = audioCtx.createBuffer(1, 1, 22050);
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(audioCtx.destination);
  source.start(0);
  document.removeEventListener('click', unlockAudio);
}, { once: true });

function playBuzzer() {
  if (isMuted) return;
  if (!audioCtx) initAudio();
  if (alarmPlaying) return;
  alarmPlaying = true;

  // Master gain booster — cranks volume to max
  masterGain = audioCtx.createGain();
  masterGain.gain.setValueAtTime(3.0, audioCtx.currentTime); // 3x volume boost

  // Compressor to prevent distortion at high volume
  compressor = audioCtx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-20, audioCtx.currentTime);
  compressor.knee.setValueAtTime(10, audioCtx.currentTime);
  compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
  compressor.attack.setValueAtTime(0, audioCtx.currentTime);
  compressor.release.setValueAtTime(0.1, audioCtx.currentTime);

  masterGain.connect(compressor);
  compressor.connect(audioCtx.destination);

  function beep() {
    if (!alarmPlaying) return;

    // Layer 1 — main loud buzz (sawtooth sweep up)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.connect(gain1);
    gain1.connect(masterGain);
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(440, audioCtx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1);
    gain1.gain.setValueAtTime(2.0, audioCtx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    osc1.start(audioCtx.currentTime);
    osc1.stop(audioCtx.currentTime + 0.5);

    // Layer 2 — harsh distortion layer (square wave)
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(220, audioCtx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(110, audioCtx.currentTime + 0.5);
    gain2.gain.setValueAtTime(1.5, audioCtx.currentTime);
    gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    osc2.start(audioCtx.currentTime);
    osc2.stop(audioCtx.currentTime + 0.5);

    // Layer 3 — high pitch screech on top
    const osc3 = audioCtx.createOscillator();
    const gain3 = audioCtx.createGain();
    osc3.connect(gain3);
    gain3.connect(masterGain);
    osc3.type = 'sawtooth';
    osc3.frequency.setValueAtTime(1400, audioCtx.currentTime);
    osc3.frequency.exponentialRampToValueAtTime(700, audioCtx.currentTime + 0.5);
    gain3.gain.setValueAtTime(1.2, audioCtx.currentTime);
    gain3.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    osc3.start(audioCtx.currentTime);
    osc3.stop(audioCtx.currentTime + 0.5);

    // Flash screen with every beep
    flashScreen();
  }

  // Repeat beep every 500ms while violation active
  beep();
  alarmInterval = setInterval(beep, 500);
}

function stopBuzzer() {
  alarmPlaying = false;
  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }
  if (masterGain) {
    try { masterGain.disconnect(); } catch(e) {}
    masterGain = null;
  }
  if (compressor) {
    try { compressor.disconnect(); } catch(e) {}
    compressor = null;
  }
}

// ─── SCREEN FLASH EFFECT ─────────────────────────────────────────
function flashScreen() {
  const flash = document.createElement('div');
  flash.style.cssText = `
    position: fixed;
    top: 0; left: 0;
    width: 100vw; height: 100vh;
    background: rgba(255, 45, 85, 0.15);
    pointer-events: none;
    z-index: 9999;
    animation: flashFade 0.5s ease-out forwards;
  `;
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 500);
}

// ─── MUTE / UNMUTE TOGGLE ────────────────────────────────────────
function toggleMute() {
  isMuted = !isMuted;
  const btn = document.getElementById('muteBtn');
  if (btn) {
    if (isMuted) {
      stopBuzzer();
      btn.textContent = '🔇 SOUND OFF';
      btn.style.borderColor = '#6b7a8d';
      btn.style.color = '#6b7a8d';
    } else {
      btn.textContent = '🔊 SOUND ON';
      btn.style.borderColor = '#ffd700';
      btn.style.color = '#ffd700';
    }
  }
}

// Camera source switcher change event listener
document.addEventListener("DOMContentLoaded", () => {
  const cameraSelect = document.getElementById('cameraSource');
  const customInput = document.getElementById('customUrl');
  const droidcamInput = document.getElementById('droidcamIp');
  
  if (cameraSelect) {
    cameraSelect.addEventListener('change', function() {
      const val = this.value;
      if (customInput) customInput.style.display = (val === 'custom') ? 'block' : 'none';
      if (droidcamInput) droidcamInput.style.display = (val === 'droidcam_wifi') ? 'block' : 'none';
      localStorage.setItem("hg_camera_source_dropdown", val);
    });

    // Restore saved choice
    const savedSource = localStorage.getItem("hg_camera_source_dropdown");
    if (savedSource) {
      cameraSelect.value = savedSource;
      if (customInput) customInput.style.display = (savedSource === 'custom') ? 'block' : 'none';
      if (droidcamInput) droidcamInput.style.display = (savedSource === 'droidcam_wifi') ? 'block' : 'none';
    }
  }
  
  if (droidcamInput) {
    droidcamInput.value = localStorage.getItem("hg_droidcam_ip") || "172.26.161.207";
  }
});

// Update startCamera to use selected source
async function startCamera() {
  initAudio();
  let source = document.getElementById('cameraSource').value;
  if (source === 'custom') {
    source = document.getElementById('customUrl').value;
  } else if (source === 'droidcam_wifi') {
    let ip = document.getElementById('droidcamIp').value.trim();
    if (!ip) {
      alert("Please enter a valid IP address!");
      return;
    }
    // Clean input (strip protocols, paths, etc.)
    ip = ip.replace(/^(https?:\/\/)/i, "");
    ip = ip.replace(/(\/video|\/mjpegfeed|\/)$/i, "");
    localStorage.setItem("hg_droidcam_ip", ip);
    
    if (!ip.includes(":")) {
      source = `http://${ip}:4747/video`;
    } else {
      source = `http://${ip}/video`;
    }
  }

  // Try to parse as number
  const num = parseInt(source);
  const payload = isNaN(num)
      ? { source: source }
      : { source: num };

  try {
    const res = await fetch(`${API_BASE}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data && data.status === "started") {
      isStreaming = true;
      document.getElementById("cameraPlaceholder").style.display = "none";
      document.getElementById("cameraFeed").style.display = "block";
      
      // Set native MJPEG stream if not in simulation mode
      const isSim = isSimulationMode() || window.hg_backend_offline;
      if (!isSim) {
        document.getElementById("cameraFeed").src = `${getApiBase()}/api/stream?t=${new Date().getTime()}`;
      }
      
      document.getElementById("startBtn").style.display = "none";
      document.getElementById("stopBtn").style.display = "inline-block";
      document.getElementById("audioBar").classList.add("playing");
      
      // Update UI bar status
      const statusText = document.getElementById("statusText");
      statusText.innerText = "✓ SYSTEM STATUS: SECURE MONITOR ACTIVE";
      statusText.className = "status-text clear";
      
      // Start processing loop
      pollFrame();
    } else {
      alert("Camera error: " + ((data && data.message) || "Check camera source and try again"));
    }
  } catch (err) {
    console.error("Failed to start camera", err);
    alert("Connection Error: Backend server is not running or camera is locked.");
  }
}

// Test camera before starting
async function testCamera() {
  let source = document.getElementById('cameraSource').value;
  if (source === 'custom') {
    source = document.getElementById('customUrl').value;
  } else if (source === 'droidcam_wifi') {
    let ip = document.getElementById('droidcamIp').value.trim();
    if (!ip) {
      alert("Please enter a valid IP address!");
      return;
    }
    // Clean input (strip protocols, paths, etc.)
    ip = ip.replace(/^(https?:\/\/)/i, "");
    ip = ip.replace(/(\/video|\/mjpegfeed|\/)$/i, "");
    localStorage.setItem("hg_droidcam_ip", ip);
    
    if (!ip.includes(":")) {
      source = `http://${ip}:4747/video`;
    } else {
      source = `http://${ip}/video`;
    }
  }
  const num = parseInt(source);
  const payload = isNaN(num)
      ? { source: source }
      : { source: num };

  try {
    const res = await fetch(`${API_BASE}/camera/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data && data.status === "ok") {
      alert(data.message || "Test status: ok");
    } else {
      alert("Test Error: " + ((data && data.message) || "Camera is not available."));
    }
  } catch (err) {
    console.error("Failed to test camera", err);
    alert("Test Error: Camera is not available or backend server is not responding.");
  }
}

async function stopCamera() {
  isStreaming = false;
  if (frameTimeout) {
    clearTimeout(frameTimeout);
    frameTimeout = null;
  }
  stopBuzzer();
  
  try {
    await fetch(`${API_BASE}/stop`, { method: 'POST' });
  } catch(e) {}
  
  document.getElementById("cameraFeed").style.display = "none";
  document.getElementById("cameraFeed").src = ""; // Stop the MJPEG request
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
  
  // Reset persons panel
  document.getElementById("totalPersons").textContent = "0";
  document.getElementById("totalPersons").style.color = "#6b7a8d";
  document.getElementById("personsList").innerHTML = `
    <div style="text-align:center; color:var(--text-muted); font-family:var(--font-display); font-size:0.7rem; letter-spacing:2px; padding:1.5rem;">
      <span style="display:block; font-size:1.5rem; margin-bottom:0.5rem;">⬡</span>
      MONITOR SHUTDOWN. CAM FEED DISCONNECTED.
    </div>
  `;
}

// ─── FRAME POLLING ───────────────────────────────────────────────
let consecutivePollErrors = 0;
const MAX_POLL_ERRORS = 3;

async function pollFrame() {
  if (!isStreaming) return;
  
  const isSim = isSimulationMode() || window.hg_backend_offline;
  const endpoint = isSim ? `${API_BASE}/frame` : `${API_BASE}/metadata`;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500); // 1.5s timeout
    
    const res = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!res.ok) throw new Error("Server responded with error status");
    const data = await res.json();
    
    // Reset error counter
    consecutivePollErrors = 0;
    
    // Update live frame source only in simulation mode
    const feed = document.getElementById("cameraFeed");
    if (isSim) {
      feed.src = `data:image/jpeg;base64,${data.frame}`;
    }
    
    // Update Violation Telemetry
    updateAlertState(data.violations || []);
    
    // Update persons panel
    updatePersonsPanel(data);
    
  } catch (err) {
    consecutivePollErrors++;
    console.error(`Frame polling error (${consecutivePollErrors}/${MAX_POLL_ERRORS})`, err);
    
    if (consecutivePollErrors >= MAX_POLL_ERRORS) {
      console.warn("Too many consecutive polling errors. Automatically disconnecting from server.");
      // Auto disconnect on network drop
      stopCamera();
      alert("Lost Connection: The backend server stopped responding or went offline.");
      return;
    }
  }
  
  // Poll again: 100ms for metadata (live mode), 66ms for simulated frames (simulation mode)
  const pollInterval = isSim ? 66 : 100;
  frameTimeout = setTimeout(pollFrame, pollInterval);
}

// ─── PERSONS PANEL RENDERER ──────────────────────────────────────
function updatePersonsPanel(data) {
    const total = data.total_persons || 0;
    
    // Update counter
    const counterEl = document.getElementById('totalPersons');
    if (counterEl) {
        counterEl.textContent = total;
        counterEl.style.color = total > 0 ? '#00ff88' : '#6b7a8d';
    }

    const list = document.getElementById('personsList');
    if (!list) return;
    list.innerHTML = '';

    if (total === 0 || !data.persons || data.persons.length === 0) {
        list.innerHTML = `
            <div style="
                text-align: center;
                color: #6b7a8d;
                font-family: Orbitron, monospace;
                font-size: 0.65rem;
                letter-spacing: 2px;
                padding: 1.5rem 0;
            ">NO PERSONS IN FRAME</div>`;
        return;
    }

    data.persons.forEach(function(person) {
        const hasViolation = person.violations && person.violations.length > 0;

        // Build violation or clear content
        let innerContent = '';
        if (hasViolation) {
            person.violations.forEach(function(v) {
                innerContent += `
                    <div style="
                        font-size: 0.68rem;
                        color: #ff6b8a;
                        padding: 0.15rem 0 0.15rem 0.6rem;
                        border-left: 2px solid #ff2d55;
                        margin-top: 0.2rem;
                    ">⚠ ${v}</div>`;
            });
        } else {
            innerContent = `
                <div style="
                    font-size: 0.68rem;
                    color: #00ff88;
                    padding: 0.15rem 0 0.15rem 0.6rem;
                    border-left: 2px solid #00ff88;
                    margin-top: 0.2rem;
                ">✓ NO VIOLATIONS DETECTED</div>`;
        }

        const cardBg = hasViolation
            ? 'rgba(255,45,85,0.08)'
            : 'rgba(0,255,136,0.06)';
        const cardBorder = hasViolation
            ? '1px solid rgba(255,45,85,0.3)'
            : '1px solid rgba(0,255,136,0.2)';
        const leftBorder = hasViolation
            ? '3px solid #ff2d55'
            : '3px solid #00ff88';
        const badgeBg = hasViolation
            ? 'rgba(255,45,85,0.15)'
            : 'rgba(0,255,136,0.15)';
        const badgeColor = hasViolation ? '#ff2d55' : '#00ff88';
        const badgeText = hasViolation ? '⚠ VIOLATION' : '✓ CLEAR';

        const card = document.createElement('div');
        card.id = `person-card-${person.id}`;
        card.style.cssText = `
            background: ${cardBg};
            border: ${cardBorder};
            border-left: ${leftBorder};
            border-radius: 8px;
            padding: 0.6rem 0.8rem;
            margin-bottom: 0.4rem;
        `;

        card.innerHTML = `
            <div style="
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 0.35rem;
            ">
                <span style="
                    font-family: Orbitron, monospace;
                    font-size: 0.72rem;
                    font-weight: 700;
                    letter-spacing: 1px;
                    color: #e0e8f0;
                ">PERSON ${person.id}</span>
                <span style="
                    font-family: Orbitron, monospace;
                    font-size: 0.58rem;
                    letter-spacing: 1px;
                    padding: 0.15rem 0.45rem;
                    border-radius: 4px;
                    background: ${badgeBg};
                    color: ${badgeColor};
                    border: 1px solid ${badgeColor};
                ">${badgeText}</span>
            </div>
            ${innerContent}
        `;

        list.appendChild(card);
    });
}

// ─── ALERT STATE HANDLER ─────────────────────────────────────────
function updateAlertState(violations) {
  const statusLight = document.getElementById("statusLight");
  const statusText = document.getElementById("statusText");
  const cameraContainer = document.getElementById("cameraContainer");
  
  const isSim = isSimulationMode() || window.hg_backend_offline;
  
  if (!violations || violations.length === 0) {
    // SAFE STATE — stop buzzer
    stopBuzzer();
    statusLight.classList.remove("violation");
    
    if (isSim) {
      statusText.innerText = "✓ SYSTEM STATUS: OFFLINE SIMULATION ACTIVE";
      statusText.className = "status-text clear simulated-status";
    } else {
      statusText.innerText = "✓ SYSTEM STATUS: SAFE ALL CLEAR";
      statusText.className = "status-text clear";
    }
    
    cameraContainer.classList.remove("violation-active");
    cameraContainer.classList.add("clear-active");
  } else {
    // VIOLATION STATE — play loud buzzer
    playBuzzer();
    statusLight.classList.add("violation");
    
    const violationNames = violations.map(v => v.type).join(", ");
    if (isSim) {
      statusText.innerText = `⚠ SYSTEM ALERT (SIMULATED): HYGIENE BREACH - [${violationNames.toUpperCase()}]`;
      statusText.className = "status-text violation simulated-violation";
    } else {
      statusText.innerText = `⚠ SYSTEM ALERT: HYGIENE BREACH - [${violationNames.toUpperCase()}]`;
      statusText.className = "status-text violation";
    }
    
    cameraContainer.classList.remove("clear-active");
    cameraContainer.classList.add("violation-active");
  }
}
