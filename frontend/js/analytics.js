// Use smartFetch client wrapper for seamless Simulation/Live backend routing
const API_BASE = "/api";
const fetch = smartFetch;
let hourlyChartInstance = null;
let typeChartInstance = null;

document.addEventListener("DOMContentLoaded", () => {
  initAnalytics();
});

async function initAnalytics() {
  try {
    // 1. Fetch data from SQLite backend API routes
    const [violationsRes, hourlyRes, typesRes] = await Promise.all([
      fetch(`${API_BASE}/violations`),
      fetch(`${API_BASE}/stats/hourly`),
      fetch(`${API_BASE}/stats/types`)
    ]);

    if (!violationsRes.ok || !hourlyRes.ok || !typesRes.ok) {
      throw new Error("Analytics REST API routes failed to load.");
    }

    const violations = await violationsRes.json();
    const hourlyData = await hourlyRes.json();
    const typesData = await typesRes.json();

    // 2. Render counter cards
    updateStatsCards(violations);

    // 3. Render modern dark high-tech charts
    renderHourlyTrend(hourlyData);
    renderTypeBreakdown(typesData);

  } catch (err) {
    console.error("Critical: Failed to generate analytics datasets.", err);
    // Draw empty/error state charts
    renderHourlyTrend([]);
    renderTypeBreakdown([]);
  }
}

function updateStatsCards(violations) {
  const total = violations.length;
  const noMask = violations.filter(v => v.type === "No Mouth Mask").length;
  const noGloves = violations.filter(v => v.type === "No Hand Gloves").length;
  
  // Calculate dynamic compliance: start at 100%, subtract 4% per logged breach (min 42%)
  const compliance = total === 0 ? 100 : Math.max(42, 100 - (total * 4.5));

  document.getElementById("statTotal").innerText = total;
  document.getElementById("statMask").innerText = noMask;
  document.getElementById("statGloves").innerText = noGloves;
  document.getElementById("statCompliance").innerText = `${Math.round(compliance)}%`;
}

function renderHourlyTrend(data) {
  const ctx = document.getElementById("hourlyTrendChart").getContext("2d");
  
  if (hourlyChartInstance) {
    hourlyChartInstance.destroy();
  }

  // Parse hourly values into chart slots (e.g. ['09:00', '10:00', ...])
  // If data is empty, insert mock telemetry slots
  const labels = data.length > 0 ? [...new Set(data.map(item => item.hour))] : ["12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
  
  // Group counts by hour
  const countsMap = {};
  labels.forEach(lbl => { countsMap[lbl] = 0; });
  data.forEach(item => {
    if (countsMap[item.hour] !== undefined) {
      countsMap[item.hour] += item.count;
    }
  });
  
  const datasetValues = labels.map(lbl => countsMap[lbl] || 0);

  hourlyChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'BREACH COUNT',
        data: datasetValues,
        borderColor: '#00ff88',
        backgroundColor: 'rgba(0, 255, 136, 0.08)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointBackgroundColor: '#00ff88',
        pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: '#6b7a8d', font: { family: 'Rajdhani', size: 12 } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: '#6b7a8d', font: { family: 'Rajdhani', size: 12 } },
          min: 0,
          suggestedMax: 5
        }
      }
    }
  });
}

function renderTypeBreakdown(data) {
  const ctx = document.getElementById("typeBreakdownChart").getContext("2d");

  if (typeChartInstance) {
    typeChartInstance.destroy();
  }

  // Predefined color profiles matching design variables
  const categoryColors = {
    "No Mouth Mask": "#ff2d55",
    "Nose Touching": "#ffaa44",
    "Hair Touching": "#a97be8",
    "No Hand Gloves": "#00aaff"
  };

  const labels = data.length > 0 ? data.map(item => item.type) : ["No Mouth Mask", "Nose Touching", "Hair Touching", "No Hand Gloves"];
  const values = data.length > 0 ? data.map(item => item.count) : [0, 0, 0, 0];
  const bgColors = labels.map(lbl => categoryColors[lbl] || "#6b7a8d");

  typeChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: bgColors,
        borderWidth: 2,
        borderColor: '#13181f' // Matches card color
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#e0e8f0',
            font: { family: 'Rajdhani', size: 12, weight: 600 }
          }
        }
      },
      cutout: '70%'
    }
  });
}
