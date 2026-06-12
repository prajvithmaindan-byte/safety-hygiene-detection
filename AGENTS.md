# HygieneGuard Agent Guide

This guide is for AI coding agents working in this repository. It summarizes the codebase shape, runtime flow, and common change points so future agents can get productive quickly.

## Project Summary

HygieneGuard is a local-first food safety hygiene monitoring app.

- Backend: Python Flask API in `backend/`
- Computer vision: OpenCV plus MediaPipe in `backend/detector.py`
- Persistence: SQLite database created at `backend/violations.db`
- Frontend: Static HTML/CSS/JS in `frontend/`
- Deployment/demo fallback: frontend simulation mode, with `vercel.json` rewriting traffic to `frontend/`

The app can run in live backend mode with a local webcam, or simulation mode when the backend/camera is unavailable.

## Repository Map

```text
hygieneguard/
|-- backend/
|   |-- app.py              # Flask routes, stream worker, camera/mock frame loop
|   |-- detector.py         # MediaPipe/OpenCV hygiene detection rules
|   |-- database.py         # SQLite schema and query helpers
|   |-- requirements.txt    # Python dependencies
|   |-- test_cam.py         # Camera test helper
|   `-- test_detector.py    # Detector test/helper script
|-- frontend/
|   |-- index.html          # Live monitor screen
|   |-- dashboard.html      # Violation history table
|   |-- analytics.html      # Chart.js analytics screen
|   |-- css/
|   |   |-- style.css       # Main app styling
|   |   `-- intro.css       # Intro splash styling
|   `-- js/
|       |-- api.js          # Smart API client and browser simulation fallback
|       |-- monitor.js      # Live frame polling, alert state, audio alarm
|       |-- dashboard.js    # Violation table, filters, delete actions
|       |-- analytics.js    # Stats cards and charts
|       `-- intro.js        # Intro splash behavior
|-- Launch_HygieneGuard.bat # Windows launch helper
|-- README.md               # User setup guide
|-- recover.py              # Recovery/helper script
`-- vercel.json             # Static frontend rewrite config
```

## How To Run Locally

From the repo root:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
python backend\app.py
```

Then open:

- `http://localhost:5000/`
- `http://localhost:5000/dashboard.html`
- `http://localhost:5000/analytics.html`

The Flask app also serves the frontend files, so using the Flask URL is usually better than opening `frontend/index.html` directly.

## Backend Architecture

`backend/app.py` owns the Flask app and the streaming lifecycle.

Key objects and functions:

- `make_synthetic_frame(t)`: creates mock video frames and mock violations when no camera is available.
- `StreamWorker`: background worker that opens a camera, grabs frames, analyzes frames, draws overlays, and writes violation snapshots.
- `start_stream()`: `POST /api/start`, resets and starts the worker.
- `stop_stream()`: `POST /api/stop`, stops and releases worker resources.
- `get_frame()`: `GET /api/frame`, returns latest JPEG frame as base64 plus violation/person data.
- Static frontend routes serve `frontend/*.html`, `frontend/css/*`, and `frontend/js/*`.

The worker first tries camera indexes `0`, `1`, and `2`. If no usable camera frame is found, it switches to mock mode automatically.

Live stream optimization:

- `DETECTION_CACHE_FRAMES` in `backend/app.py` defaults to `5`.
- The worker runs expensive detection on one live frame, then reuses that same detection result for the next 5 live frames.
- Drawing and JPEG encoding still happen on the current camera frame, so the UI stays visually smooth while MediaPipe runs far less often.
- Override with `HG_DETECTION_CACHE_FRAMES`, for example `HG_DETECTION_CACHE_FRAMES=2` for more frequent analysis.
- `HG_ADAPTIVE_DETECTION` defaults to enabled. When analysis gets slow, the worker raises reuse frames up to `HG_MAX_DETECTION_CACHE_FRAMES`.
- `HG_TARGET_ANALYSIS_MS` controls the adaptive target. Default is `80`.
- `HG_PROCESS_WIDTH` and `HG_PROCESS_HEIGHT` control the frame size used for detection, overlay drawing, and streaming. Defaults are `640x360`.
- `HG_CAMERA_WIDTH`, `HG_CAMERA_HEIGHT`, and `HG_CAMERA_FPS` control camera capture requests. Defaults match the processing size at 30 FPS.
- `HG_JPEG_QUALITY` controls stream and snapshot JPEG quality. Default is `55` for lower latency.
- `HG_REAL_LOOP_SLEEP` controls the tiny sleep between real camera loop iterations. Default is `0.001`.

Generated runtime artifacts:

- `backend/violations.db`
- `backend/snapshots/*.jpg`

Do not commit generated database or snapshot files unless the user explicitly asks for fixtures.

## Detection Pipeline

`backend/detector.py` is the computer vision rule engine.

Main entry point:

```python
analyze_frame(frame)
```

It returns:

```json
{
  "total_persons": 1,
  "persons": [
    {
      "id": 1,
      "bbox": [x1, y1, x2, y2],
      "violations": ["No Mouth Mask"],
      "status": "VIOLATION"
    }
  ],
  "violations": [
    {
      "type": "No Mouth Mask",
      "confidence": 0.91
    }
  ]
}
```

Current rule checks:

- `check_mask(...)`: samples mouth ROI for skin-tone ratio; high skin ratio means no mouth mask.
- `check_nose_touching(...)`: checks fingertip proximity to face landmark 4.
- `check_hair_touching(...)`: checks fingertips near/above forehead landmarks.
- `check_gloves(...)`: samples palm landmarks for skin-tone ratio.
- `stabilize_violations(...)`: requires a violation type to appear for `HG_REQUIRED_ANALYSIS_FRAMES` analyzed frames before surfacing it. The default is `2`, tuned for the frame-cache optimization.

Important note: MediaPipe detector instances are module-level globals. Be careful with concurrency changes or test isolation.

Optional person detector:

- `backend/detector.py` can use a local Ultralytics YOLO model for person boxes when `HG_PERSON_DETECTOR=yolo` is set.
- Set `HG_YOLO_MODEL` to an existing local model path, such as a `.pt` or TensorRT `.engine` file. The code intentionally does not download a model automatically.
- Set `HG_YOLO_DEVICE` to choose the inference device when supported by Ultralytics, for example `0` or `cuda:0` for NVIDIA GPU use.
- Set `HG_YOLO_CONFIDENCE` to tune person-box confidence threshold. Default is `0.35`.
- Set `HG_YOLO_IMGSZ` to tune YOLO inference image size. Default is `640`.
- Set `HG_YOLO_HALF=1` to request half-precision inference on supported NVIDIA/CUDA setups.
- If YOLO or the model path is unavailable, the app falls back to MediaPipe-only behavior.
- YOLO boxes improve multi-person counting and full-body bounding boxes; MediaPipe still provides the hygiene landmarks/rules.

MediaPipe performance knobs:

- `HG_MAX_PEOPLE` controls FaceMesh maximum faces. Default is `10`.
- `HG_MAX_HANDS` controls Hands maximum hands. Default is `HG_MAX_PEOPLE * 2`.
- `HG_MEDIAPIPE_DETECTION_CONFIDENCE` and `HG_MEDIAPIPE_TRACKING_CONFIDENCE` default to `0.4`.
- `HG_GLOVE_PATCH_RADIUS` controls glove color sample patch size. Default is `8`, meaning 16x16 patches.

## Database Contract

`backend/database.py` creates and uses this SQLite table:

```sql
CREATE TABLE IF NOT EXISTS violations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER DEFAULT 0,
    type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    image_path TEXT,
    confidence REAL
);
```

Main helpers:

- `init_db()`
- `insert_violation(person_id, vtype, image_path, confidence)`
- `get_all_violations()`
- `get_hourly_stats()`
- `get_violation_type_stats()`
- `delete_violation(violation_id)`
- `delete_all_violations()`

## API Reference

Base URL in local Flask mode is `http://localhost:5000`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/start` | Start/reset stream worker |
| `POST` | `/api/stop` | Stop stream worker |
| `GET` | `/api/frame` | Return latest frame, people, violations, status |
| `GET` | `/api/violations` | Return violation log rows |
| `DELETE` | `/api/violations/<id>` | Delete one violation row |
| `DELETE` | `/api/violations/all` | Delete all violation rows |
| `GET` | `/api/stats/hourly` | Return hourly grouped stats |
| `GET` | `/api/stats/types` | Return type grouped stats |
| `GET` | `/api/health` | Return basic backend health |
| `GET` | `/snapshots/<filename>.jpg` | Serve captured violation image |

`GET /api/frame` response shape:

```json
{
  "frame": "base64-jpeg",
  "violations": [{"type": "No Mouth Mask", "confidence": 0.91}],
  "total_persons": 1,
  "persons": [{"id": 1, "bbox": [0, 0, 100, 100], "violations": [], "status": "CLEAR"}],
  "snapshot": null,
  "status": "clear"
}
```

## Frontend Flow

All frontend API calls go through `frontend/js/api.js`.

`api.js`:

- Defines `smartFetch(endpoint, options)`.
- Chooses a backend URL from `localStorage.hg_backend_url`, relative Flask paths, or `http://localhost:5000`.
- Uses simulation mode when `localStorage.hg_mode === "simulation"`.
- Falls back to browser-side mock endpoints if live backend requests fail.
- Stores simulated violation history in `localStorage.hg_mock_violations`.

Screens:

- `index.html` + `monitor.js`: starts/stops camera, polls `/api/frame` about every 33 ms, renders frame image, people panel, violation state, and Web Audio alarm.
- `dashboard.html` + `dashboard.js`: fetches `/api/violations`, filters by type/confidence, shows snapshots, deletes records.
- `analytics.html` + `analytics.js`: fetches violation, hourly, and type stats, then renders Chart.js charts.

## Common Change Points

Add or rename a violation type:

1. Update detector output in `backend/detector.py`.
2. Update simulation output in `backend/app.py` and `frontend/js/api.js`.
3. Update dashboard filters/badges in `frontend/dashboard.html` and `frontend/js/dashboard.js`.
4. Update analytics category colors in `frontend/js/analytics.js`.

Change the camera behavior:

1. Start in `StreamWorker._run()` in `backend/app.py`.
2. Camera indexes, resolution, FPS, and buffer size are configured there.
3. Keep `stop()` resource cleanup intact when changing threading.

Change detection performance:

1. Start with `DETECTION_CACHE_FRAMES` in `backend/app.py`; one analyzed frame plus 5 reused frames is the current default.
2. Tune `HG_REQUIRED_ANALYSIS_FRAMES` in `backend/detector.py` if changing the cache interval.
3. For multi-person box detection, enable the optional YOLO path with `HG_PERSON_DETECTOR=yolo` and `HG_YOLO_MODEL=<local model path>`.
4. For NVIDIA acceleration, use an Ultralytics-compatible CUDA/TensorRT setup and pass `HG_YOLO_DEVICE`; do not assume GPU dependencies exist on every machine.
5. For maximum realtime speed, reduce `HG_PROCESS_WIDTH`/`HG_PROCESS_HEIGHT`, lower `HG_JPEG_QUALITY`, and cap `HG_MAX_PEOPLE`/`HG_MAX_HANDS` to the expected room size.

Change database fields:

1. Update `init_db()` in `backend/database.py`.
2. Update insert/query helpers.
3. Update API response mapping in `backend/app.py`.
4. Update dashboard/analytics consumers.

Change frontend backend connection behavior:

1. Start in `frontend/js/api.js`.
2. Preserve simulation fallback unless the user explicitly wants live-backend-only behavior.

## Testing And Verification

There is no formal test runner configured in the current repository. Practical verification steps:

```powershell
python backend\app.py
```

Then check:

- `GET http://localhost:5000/api/health`
- `POST http://localhost:5000/api/start`
- `GET http://localhost:5000/api/frame`
- Monitor page start/stop button behavior
- Dashboard table loading and delete actions
- Analytics charts rendering

For detector work, also run any existing helper scripts after inspecting them:

```powershell
python backend\test_cam.py
python backend\test_detector.py
```

Camera and MediaPipe behavior depends on host hardware, lighting, camera permissions, and installed packages. When hardware is unavailable, rely on the app's mock/simulation mode for UI verification.

Optional YOLO verification:

```powershell
$env:HG_PERSON_DETECTOR="yolo"
$env:HG_YOLO_MODEL="C:\path\to\yolov8n.pt"
$env:HG_YOLO_DEVICE="0"
python backend\app.py
```

`ultralytics` is not a required package in `backend/requirements.txt`. Install it only in environments that will use the YOLO path.

## Agent Notes And Cautions

- The existing README contains some mojibake/encoding artifacts. New docs should stay ASCII unless intentionally cleaning that file.
- The frontend uses inline styles heavily. Match the existing style unless doing a deliberate cleanup.
- `frontend/js/monitor.js`, `dashboard.js`, and `analytics.js` declare `const API_BASE` and `const fetch = smartFetch`; avoid loading multiple page-specific scripts together in one HTML page.
- `app.py` imports `flask_socketio` and creates `socketio`, but the current frontend uses HTTP polling rather than Socket.IO.
- Snapshot serving only allows `.jpg` filenames.
- `api_violations()` has compatibility branches for older row shapes; keep backward compatibility in mind if changing the schema.
- Avoid broad refactors unless requested. The app is small and highly integrated, so narrowly scoped edits are easier to verify.
