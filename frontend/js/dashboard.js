const API_BASE = "/api";
let allViolations = [];

document.addEventListener("DOMContentLoaded", () => {
  fetchViolations();
});

async function fetchViolations() {
  const tableBody = document.getElementById("violationsTableBody");
  tableBody.innerHTML = `
    <tr>
      <td colspan="5" style="text-align:center; color:var(--text-muted); padding:3rem;">
        CONNECTING TO SECURITY INFRASTRUCTURE...
      </td>
    </tr>
  `;
  
  try {
    const res = await fetch(`${API_BASE}/violations`);
    if (!res.ok) throw new Error("Violations fetch failure");
    allViolations = await res.json();
    filterViolations();
  } catch (err) {
    console.error("Error fetching violations log", err);
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; color:var(--red); padding:3rem; font-family:var(--font-display); font-size:0.8rem; letter-spacing:1px;">
          ⚠ SYSTEM ERROR: FAILED TO FETCH VIOLATIONS DATABASE. MAKE SURE BACKEND IS ONLINE.
        </td>
      </tr>
    `;
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
  
  if (!violations || violations.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; color:var(--text-muted); padding:4rem; font-size:0.9rem;">
          ✓ SECURE STATUS: NO RECORDED VIOLATIONS MATCHING CURRENT CRITERIA.
        </td>
      </tr>
    `;
    return;
  }
  
  tableBody.innerHTML = violations.map(v => {
    const badgeClass = getBadgeClass(v.type);
    const confidencePercent = Math.round(v.confidence * 100);
    
    // Thumbnail or text placeholder
    const imageCell = v.image 
      ? `<img class="snapshot-thumb" src="${v.image}" alt="Snapshot" onclick="openModal('${v.image}', '${v.type}', '${v.timestamp}', ${v.confidence})">`
      : `<span style="color:var(--text-muted); font-size:0.8rem;">N/A</span>`;
      
    return `
      <tr>
        <td style="font-family:var(--font-display); font-size:0.8rem; color:var(--text-muted);">#${v.id}</td>
        <td><span class="badge ${badgeClass}">${v.type.toUpperCase()}</span></td>
        <td>${v.timestamp}</td>
        <td style="font-family:var(--font-display); font-size:0.85rem; font-weight:700; color:var(--green);">${confidencePercent}%</td>
        <td>${imageCell}</td>
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
    filtered = filtered.filter(v => v.confidence >= confVal);
  }
  
  renderViolations(filtered);
}

function openModal(imageSrc, type, timestamp, confidence) {
  const modal = document.getElementById("snapshotModal");
  const modalTitle = document.getElementById("modalTitle");
  const modalImage = document.getElementById("modalImage");
  const modalTimestamp = document.getElementById("modalTimestamp");
  const modalConfidence = document.getElementById("modalConfidence");
  
  modalTitle.innerText = `VIOLATION DETECTED: ${type.toUpperCase()}`;
  modalImage.src = imageSrc;
  modalTimestamp.innerText = timestamp;
  modalConfidence.innerText = `${Math.round(confidence * 100)}%`;
  
  modal.classList.add("open");
}

function closeModal(event) {
  const modal = document.getElementById("snapshotModal");
  modal.classList.remove("open");
}
