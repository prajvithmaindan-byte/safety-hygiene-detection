// Use smartFetch client wrapper for seamless Simulation/Live backend routing
const API_BASE = "/api";
const fetch = smartFetch;
let allViolations = [];

// ─── AUTO RETRY SYSTEM ───────────────────────────────────────────
let retryInterval = null;

function startAutoRetry() {
    if (retryInterval) return;
    retryInterval = setInterval(async () => {
        try {
            const res = await fetch(`${API_BASE}/health`);
            if (res.ok) {
                clearInterval(retryInterval);
                retryInterval = null;
                fetchViolations();
            }
        } catch (e) {}
    }, 3000);
}

// ─── BACKEND STATUS INDICATOR ────────────────────────────────────
async function checkBackendStatus() {
    const dot = document.getElementById('backendDot');
    const label = document.getElementById('backendLabel');
    if (!dot || !label) return;

    try {
        const res = await fetch(`${API_BASE}/health`);
        if (res.ok) {
            dot.style.background = '#00ff88';
            dot.style.boxShadow = '0 0 8px #00ff88';
            label.style.color = '#00ff88';
            label.textContent = 'BACKEND ONLINE';
        } else {
            throw new Error('Backend offline');
        }
    } catch {
        dot.style.background = '#ff2d55';
        dot.style.boxShadow = '0 0 8px #ff2d55';
        label.style.color = '#ff2d55';
        label.textContent = 'BACKEND OFFLINE';
        startAutoRetry();
    }
}

// ─── PAGE INIT ───────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    fetchViolations().catch(() => startAutoRetry());
    checkBackendStatus();
    setInterval(checkBackendStatus, 5000);
});

// ─── FETCH VIOLATIONS ────────────────────────────────────────────
async function fetchViolations() {
    const tableBody = document.getElementById("violationsTableBody");
    tableBody.innerHTML = `
        <tr>
            <td colspan="7" style="text-align:center; color:var(--text-muted); padding:3rem;
            font-family:var(--font-display); font-size:0.7rem; letter-spacing:2px;">
                ⟳ CONNECTING TO SECURITY INFRASTRUCTURE...
            </td>
        </tr>
    `;

    try {
        const res = await fetch(`${API_BASE}/violations`);
        if (!res.ok) throw new Error("Violations fetch failure");
        allViolations = await res.json();

        // Handle case where backend returns error object instead of array
        if (!Array.isArray(allViolations)) {
            allViolations = [];
        }

        filterViolations();
    } catch (err) {
        console.error("Error fetching violations log", err);
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; color:var(--red); padding:3rem;
                font-family:var(--font-display); font-size:0.8rem; letter-spacing:1px;">
                    ⚠ SYSTEM ERROR: FAILED TO FETCH VIOLATIONS DATABASE.<br>
                    <span style="color:var(--text-muted); font-size:0.65rem; margin-top:0.5rem; display:block;">
                        Make sure backend is running: python app.py
                    </span>
                    <button onclick="fetchViolations()" style="
                        margin-top:1rem;
                        font-family:var(--font-display); font-size:0.6rem;
                        letter-spacing:2px; padding:0.4rem 1rem;
                        border-radius:6px; border:1px solid var(--green);
                        background:rgba(0,255,136,0.1); color:var(--green);
                        cursor:pointer;">
                        ↺ RETRY
                    </button>
                </td>
            </tr>
        `;
        startAutoRetry();
    }
}

function getBadgeClass(type) {
    switch (type) {
        case "No Mouth Mask": return "badge-mask";
        case "Nose Touching": return "badge-nose";
        case "Hair Touching": return "badge-hair";
        case "No Hand Gloves": return "badge-gloves";
        default: return "badge-mask";
    }
}

function renderViolations(violations) {
    const tableBody = document.getElementById("violationsTableBody");

    // Reset select all checkbox
    const selectAll = document.getElementById("selectAllCheckbox");
    if (selectAll) selectAll.checked = false;
    updateDeleteSelectedBtn();

    if (!violations || violations.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; color:var(--text-muted); padding:4rem; font-size:0.9rem;">
                    ✓ SECURE STATUS: NO RECORDED VIOLATIONS MATCHING CURRENT CRITERIA.
                </td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = violations.map(v => {
        const badgeClass = getBadgeClass(v.type);
        const confidencePercent = Math.round((v.confidence || 0) * 100);

        // Prepend getApiBase() to absolute relative paths so images load from local backend
        const base = getApiBase();
        const fullImgUrl = v.image ? (v.image.startsWith("http") ? v.image : base + v.image) : null;

        // Thumbnail or text placeholder
        const imageCell = fullImgUrl
            ? `<img class="snapshot-thumb" src="${fullImgUrl}" alt="Snapshot"
                 onclick="openModal('${fullImgUrl}', '${v.type}', '${v.timestamp}', ${v.confidence || 0})"
                 onerror="this.style.display='none'">`
            : `<span style="color:var(--text-muted); font-size:0.8rem;">N/A</span>`;

        return `
            <tr id="row-${v.id}" style="transition: opacity 0.3s ease;">
                <td><input type="checkbox" class="row-checkbox" value="${v.id}" onchange="updateDeleteSelectedBtn()"></td>
                <td style="font-family:var(--font-display); font-size:0.8rem; color:var(--text-muted);">#${v.id}</td>
                <td><span class="badge ${badgeClass}">${v.type.toUpperCase()}</span></td>
                <td>${v.timestamp}</td>
                <td style="font-family:var(--font-display); font-size:0.85rem; font-weight:700; color:var(--green);">${confidencePercent}%</td>
                <td>${imageCell}</td>
                <td><button class="trash-btn" onclick="deleteViolation(${v.id})" title="Delete this record">🗑</button></td>
            </tr>
        `;
    }).join('');
}

function filterViolations() {
    const typeVal = document.getElementById("typeFilter").value;
    const confVal = parseFloat(document.getElementById("confidenceFilter").value);

    let filtered = allViolations;

    // Filter by violation type
    if (typeVal !== "ALL") {
        filtered = filtered.filter(v => v.type === typeVal);
    }

    // Filter by confidence threshold
    if (confVal > 0) {
        filtered = filtered.filter(v => (v.confidence || 0) >= confVal);
    }

    renderViolations(filtered);
}

// ─── DELETE FUNCTIONS ────────────────────────────────────────────

// Delete single violation (no confirmation, smooth fade out)
async function deleteViolation(id) {
    try {
        await fetch(`${API_BASE}/violations/${id}`, { method: 'DELETE' });
        const row = document.getElementById(`row-${id}`);
        if (row) {
            row.style.opacity = '0';
            setTimeout(() => {
                row.remove();
                // Remove from local array too
                allViolations = allViolations.filter(v => v.id !== id);
                // Check if table is now empty
                const tableBody = document.getElementById("violationsTableBody");
                if (tableBody && tableBody.children.length === 0) {
                    tableBody.innerHTML = `
                        <tr>
                            <td colspan="7" style="text-align:center; color:var(--text-muted); padding:4rem; font-size:0.9rem;">
                                ✓ SECURE STATUS: NO RECORDED VIOLATIONS MATCHING CURRENT CRITERIA.
                            </td>
                        </tr>
                    `;
                }
            }, 300);
        }
    } catch (err) {
        console.error("Delete violation error:", err);
    }
}

// Delete all violations (with confirmation)
async function deleteAllViolations() {
    const confirmed = confirm(
        'Are you sure you want to delete ALL violation records? This cannot be undone.'
    );
    if (!confirmed) return;

    try {
        await fetch(`${API_BASE}/violations/all`, { method: 'DELETE' });
        allViolations = [];
        fetchViolations();
    } catch (err) {
        console.error("Delete all violations error:", err);
    }
}

// Delete selected violations (with confirmation)
async function deleteSelected() {
    const checkboxes = document.querySelectorAll('.row-checkbox:checked:not(#selectAllCheckbox)');
    if (checkboxes.length === 0) return;

    const confirmed = confirm(`Delete ${checkboxes.length} selected violation(s)?`);
    if (!confirmed) return;

    for (const cb of checkboxes) {
        const id = parseInt(cb.value);
        try {
            await fetch(`${API_BASE}/violations/${id}`, { method: 'DELETE' });
            const row = document.getElementById(`row-${id}`);
            if (row) {
                row.style.opacity = '0';
                await new Promise(r => setTimeout(r, 150));
                row.remove();
            }
            allViolations = allViolations.filter(v => v.id !== id);
        } catch (err) {
            console.error(`Delete violation ${id} error:`, err);
        }
    }

    // Refresh after all deletions
    updateDeleteSelectedBtn();
    const tableBody = document.getElementById("violationsTableBody");
    if (tableBody && tableBody.children.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; color:var(--text-muted); padding:4rem; font-size:0.9rem;">
                    ✓ SECURE STATUS: NO RECORDED VIOLATIONS MATCHING CURRENT CRITERIA.
                </td>
            </tr>
        `;
    }
}

// Select/Deselect all checkboxes
function toggleSelectAll(checked) {
    document.querySelectorAll('.row-checkbox:not(#selectAllCheckbox)').forEach(cb => {
        cb.checked = checked;
    });
    updateDeleteSelectedBtn();
}

// Show/hide Delete Selected button based on checked state
function updateDeleteSelectedBtn() {
    const btn = document.getElementById('deleteSelectedBtn');
    if (!btn) return;
    const checked = document.querySelectorAll('.row-checkbox:checked:not(#selectAllCheckbox)');
    if (checked.length > 0) {
        btn.style.display = 'inline-block';
        btn.textContent = `🗑 DELETE SELECTED (${checked.length})`;
    } else {
        btn.style.display = 'none';
    }
}

// ─── MODAL ───────────────────────────────────────────────────────

function openModal(imageSrc, type, timestamp, confidence) {
    const modal = document.getElementById("snapshotModal");
    const modalTitle = document.getElementById("modalTitle");
    const modalImage = document.getElementById("modalImage");
    const modalTimestamp = document.getElementById("modalTimestamp");
    const modalConfidence = document.getElementById("modalConfidence");

    modalTitle.innerText = `VIOLATION DETECTED: ${type.toUpperCase()}`;
    modalImage.src = imageSrc;
    modalTimestamp.innerText = timestamp;
    modalConfidence.innerText = `${Math.round((confidence || 0) * 100)}%`;

    modal.classList.add("open");
}

function closeModal(event) {
    const modal = document.getElementById("snapshotModal");
    modal.classList.remove("open");
}
