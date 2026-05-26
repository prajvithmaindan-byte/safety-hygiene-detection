# ⬡ HygieneGuard — Food Safety Hygiene Monitoring System

A premium, full-stack, real-time Food Safety Hygiene Monitoring System featuring OpenCV & MediaPipe violation detection, SQLite database logging, an advanced Web Audio synthesizer warning alarm, and dynamic Analytics charts.

---

## 🚀 Key Features

- **Real-Time CV Intelligence**: Tracks face-mesh structures and hands proximity to identify mask-wearing compliance, nose-touching, hair-touching, and glove-wearing breaches.
- **Robust Simulation Mode Fallback**: If a physical camera is not connected to your workstation, the system **automatically switches to a futuristic Simulated Telemetry feed** displaying synthetic face wireframes and hand coordinate sweeps. This lets you inspect the entire system's functionality out of the box!
- **Futuristic SCI-FI Theme**: Glassmorphic styling, neon pulsing badges, neon frames, and smooth transitions.
- **Web Audio Alert Synthesizer**: Generates custom futuristic synthesizer alarm frequencies directly inside the browser using native audio node oscillators.
- **Historic Logs & Visual Filters**: Includes dynamic data tables with confidence meters, type filtering, and snapshot viewer overlay overlays.
- **Data Analytics Engine**: Render live charts powered by Chart.js mapping categorical densities and frequency counts.

---

## 🛠️ Windows Installation & Setup Guide

Ensure you have **Python 3.8+** installed. Follow these quick steps in PowerShell:

### 1. Initialize Virtual Environment
Navigate to the `hygieneguard` project folder:
```powershell
cd "c:\Users\Prajvith G\OneDrive\Desktop\idt 2026\hygieneguard"
```
Create a python virtual environment:
```powershell
python -m venv venv
```
Activate the environment:
```powershell
.\venv\Scripts\Activate.ps1
```

### 2. Install Packages
Install backend dependencies:
```powershell
pip install -r backend/requirements.txt
```

### 3. Launch Flask Backend Server
Start the core server process:
```powershell
python backend/app.py
```
The server will bind to `http://localhost:5000` and automatically create the SQLite database `violations.db` and the snapshots output folder.

### 4. Connect Frontend Client
Open the user interface page in any modern web browser:
- Open `frontend/index.html` to access the **Live Monitor**.
- Navigate using the header bar to **Violations** or **Analytics**.
- Click **▶ START** on the top right to start the camera feed or simulated stream.

---

## 🗂️ Project Directory Outline

```
hygieneguard/
├── backend/
│   ├── app.py                  # Flask REST API and Simulation Engine
│   ├── detector.py             # MediaPipe FaceMesh & Hands CV rules
│   ├── database.py             # SQLite DB handlers and stats aggregators
│   ├── requirements.txt        # PIP Dependency package list
│   └── violations.db           # SQLite Database file (generated)
├── frontend/
│   ├── index.html              # Real-Time Monitoring Portal
│   ├── dashboard.html          # Dynamic Historic Breach Logs Table
│   ├── analytics.html          # Graphical telemetry charts (Chart.js)
│   ├── css/
│   │   └── style.css           # Global Industrial Theme styling variables
│   └── js/
│       ├── monitor.js          # Live polling loops and alarm synths
│       ├── dashboard.js        # Dynamic row generators and filter bounds
│       └── analytics.js        # Rest aggregate mappings & Chart models
└── README.md                   # Installation & documentation guide
```
