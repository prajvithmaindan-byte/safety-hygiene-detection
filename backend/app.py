from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO
import cv2
import base64
import os
import datetime
import numpy as np
import threading
import time
import logging

from database import init_db, insert_violation, get_all_violations, get_hourly_stats, get_violation_type_stats
from detector import analyze_frame

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Configure directories relative to app.py
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SNAPSHOTS_DIR = os.path.join(BASE_DIR, "snapshots")
os.makedirs(SNAPSHOTS_DIR, exist_ok=True)
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))

# Initialize database
init_db()

# State variables
worker = None


def make_synthetic_frame(t):
    """Draw a beautiful futuristic mock stream canvas with moving hand and face mesh"""
    frame = np.zeros((720, 1280, 3), dtype=np.uint8)
    
    # 1. Neon background grid
    for x in range(0, 1280, 80):
        cv2.line(frame, (x, 0), (x, 720), (12, 17, 23), 1)
    for y in range(0, 720, 80):
        cv2.line(frame, (0, y), (1280, y), (12, 17, 23), 1)
        
    # Draw radar circles
    cv2.circle(frame, (640, 360), 300, (18, 26, 36), 1)
    cv2.circle(frame, (640, 360), 200, (18, 26, 36), 1)
    
    # 2. Wireframe Face
    face_cx, face_cy = 640, 340
    cv2.ellipse(frame, (face_cx, face_cy), (120, 160), 0, 0, 360, (0, 255, 136), 1)
    # Eyes & Nose mesh
    cv2.circle(frame, (600, 300), 8, (0, 255, 136), 1)
    cv2.circle(frame, (680, 300), 8, (0, 255, 136), 1)
    cv2.line(frame, (640, 280), (640, 340), (0, 255, 136), 1)
    cv2.line(frame, (640, 340), (610, 350), (0, 255, 136), 1)
    cv2.line(frame, (640, 340), (670, 350), (0, 255, 136), 1)
    
    # Determine simulated phase based on time ticks (loops every 500 ticks)
    phase = (t // 80) % 5
    violations = []
    
    # 3. Handle Mask State
    if phase != 1:  # Phase 1 = Mask Under Nose
        # Draw beautiful translucent mask
        mask_overlay = frame.copy()
        cv2.ellipse(mask_overlay, (face_cx, face_cy + 60), (85, 55), 0, 0, 180, (0, 170, 255), -1)
        # Elastic straps
        cv2.line(mask_overlay, (555, 400), (520, 340), (0, 170, 255), 2)
        cv2.line(mask_overlay, (725, 400), (760, 340), (0, 170, 255), 2)
        cv2.addWeighted(mask_overlay, 0.4, frame, 0.6, 0, frame)
        cv2.ellipse(frame, (face_cx, face_cy + 60), (85, 55), 0, 0, 180, (0, 170, 255), 2)
        cv2.putText(frame, "SHIELD ACTIVE", (590, 420), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 170, 255), 1)
    else:
        # Draw bare mouth structure
        cv2.ellipse(frame, (face_cx, face_cy + 55), (35, 15), 0, 0, 360, (255, 45, 85), 2)
        violations.append({"type": "No Mouth Mask", "confidence": 0.88})
    
    # 4. Handle Hand & Gesture Simulation
    hand_cx, hand_cy = 1050, 580
    if phase == 2:  # Nose Touching
        hand_cx, hand_cy = face_cx - 15, face_cy + 10
        violations.append({"type": "Nose Touching", "confidence": 0.85})
    elif phase == 3:  # Hair Touching
        hand_cx, hand_cy = face_cx, face_cy - 140
        violations.append({"type": "Hair Touching", "confidence": 0.82})
    elif phase == 4:  # No Gloves
        hand_cx, hand_cy = 850, 480
        # Draw bare skin color hand (skintone BGR values)
        cv2.circle(frame, (hand_cx, hand_cy), 35, (100, 150, 220), -1)
        for idx in range(5):
            cv2.line(frame, (hand_cx, hand_cy), (hand_cx - 45 + idx * 22, hand_cy - 70), (100, 150, 220), 8)
        violations.append({"type": "No Hand Gloves", "confidence": 0.80})
    
    if phase != 4:
        # Draw neon blue gloves
        glove_overlay = frame.copy()
        cv2.circle(glove_overlay, (hand_cx, hand_cy), 35, (255, 170, 0), -1)
        for idx in range(5):
            cv2.line(glove_overlay, (hand_cx, hand_cy), (hand_cx - 45 + idx * 22, hand_cy - 70), (255, 170, 0), 8)
        cv2.addWeighted(glove_overlay, 0.4, frame, 0.6, 0, frame)
        cv2.circle(frame, (hand_cx, hand_cy), 35, (255, 170, 0), 2)
        for idx in range(5):
            cv2.line(frame, (hand_cx, hand_cy), (hand_cx - 45 + idx * 22, hand_cy - 70), (255, 170, 0), 2)

    # 5. UI overlays
    scan_y = int((t * 6) % 720)
    cv2.line(frame, (0, scan_y), (1280, scan_y), (0, 255, 136), 1)
    
    # Status telemetry boxes
    cv2.rectangle(frame, (10, 10), (320, 50), (20, 25, 30), -1)
    cv2.rectangle(frame, (10, 10), (320, 50), (0, 255, 136), 1)
    cv2.putText(frame, "FEED SOURCE: SIMULATOR V1.2", (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 136), 1)
    
    # Bounding markers on features in simulation
    if phase == 2:
        cv2.rectangle(frame, (face_cx - 40, face_cy - 20), (face_cx + 40, face_cy + 40), (255, 45, 85), 2)
        cv2.putText(frame, "ALERT: HAND-NOSE PROXIMITY", (face_cx - 100, face_cy - 40), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 45, 85), 1)
    elif phase == 3:
        cv2.rectangle(frame, (face_cx - 80, face_cy - 180), (face_cx + 80, face_cy - 100), (255, 45, 85), 2)
        cv2.putText(frame, "ALERT: HAIR-TOUCHING", (face_cx - 80, face_cy - 200), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 45, 85), 1)
        
    return frame, violations


class StreamWorker:
    def __init__(self):
        self.cap = None
        self.frame_b64 = ""
        self.violations = []
        self.snapshot_b64 = None
        self.running = False
        self.is_using_mock = False
        self.thread = None
        self.grabber_thread = None
        self.latest_raw_frame = None
        self.lock = threading.Lock()
        self.last_log_time = {}
        self.frame_count = 0

    def start(self):
        with self.lock:
            if self.running:
                return
            self.running = True
        self.thread = threading.Thread(target=self._run)
        self.thread.daemon = True
        self.thread.start()
        logger.info("[WORKER] Stream worker started")

    def stop(self):
        with self.lock:
            self.running = False
        if self.thread:
            self.thread.join(timeout=2.0)
        if self.grabber_thread:
            self.grabber_thread.join(timeout=2.0)
        if self.cap:
            try:
                self.cap.release()
            except Exception as e:
                logger.warning(f"[WORKER] Error releasing camera: {e}")
            self.cap = None
        logger.info("[WORKER] Stream worker stopped")

    def get_latest_data(self):
        with self.lock:
            return self.frame_b64, self.violations, self.snapshot_b64

    def _grab_frames(self):
        """Background thread to drain camera buffer"""
        while True:
            with self.lock:
                if not self.running or self.cap is None:
                    break
                cap = self.cap
            try:
                ret, frame = cap.read()
                if not ret:
                    break
                with self.lock:
                    self.latest_raw_frame = frame
            except Exception as e:
                logger.warning(f"[GRABBER] Frame grab error: {e}")
                break
            time.sleep(0.001)

    def _run(self):
        try:
            # Attempt to open camera with timeout
            logger.info("[WORKER] Attempting camera initialization...")
            cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
            if not cap.isOpened():
                cap = cv2.VideoCapture(0)
            
            with self.lock:
                self.cap = cap
            
            if cap.isOpened():
                logger.info("[WORKER] Camera opened successfully")
                try:
                    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
                    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                except Exception as e:
                    logger.warning(f"[WORKER] Could not set camera properties: {e}")
                
                # Read first frame to verify camera works
                ret, frame = cap.read()
                if not ret or frame is None:
                    logger.warning("[WORKER] Camera opened but cannot read frames. Using mock mode.")
                    self.is_using_mock = True
                    try:
                        cap.release()
                    except Exception:
                        pass
                    with self.lock:
                        self.cap = None
                else:
                    logger.info("[WORKER] Camera frame read successful. Real mode enabled.")
                    self.is_using_mock = False
                    with self.lock:
                        self.latest_raw_frame = frame
                    # Start grabber thread
                    self.grabber_thread = threading.Thread(target=self._grab_frames)
                    self.grabber_thread.daemon = True
                    self.grabber_thread.start()
            else:
                logger.warning("[WORKER] Camera not available. Using mock mode.")
                self.is_using_mock = True
        except Exception as e:
            logger.error(f"[WORKER] Camera init exception: {e}")
            self.is_using_mock = True

        logger.info(f"[WORKER] Stream mode: {'MOCK' if self.is_using_mock else 'REAL'}")
        tick_count = 0
        
        while True:
            try:
                with self.lock:
                    if not self.running:
                        break
                        
                frame = None
                violations = []
                
                if self.is_using_mock:
                    tick_count += 1
                    frame, violations = make_synthetic_frame(tick_count)
                    time.sleep(0.033)  # ~30 FPS for mock
                else:
                    with self.lock:
                        frame = self.latest_raw_frame
                    
                    if frame is None or frame.shape[0] < 100 or frame.shape[1] < 100:
                        time.sleep(0.01)
                        continue
                    
                    # Copy frame for thread-safe processing
                    frame = frame.copy()
                    
                    # Analyze frame for violations
                    try:
                        violations = analyze_frame(frame)
                    except Exception as e:
                        logger.error(f"[WORKER] Frame analysis error: {e}")
                        violations = []

                # Draw status overlay
                try:
                    status_color = (85, 255, 0) if not violations else (85, 45, 255)
                    cv2.rectangle(frame, (0, 0), (frame.shape[1], 60), (10, 13, 18), -1)
                    cv2.line(frame, (0, 60), (frame.shape[1], 60), status_color, 2)
                    
                    status_text = "✓ STATUS: ALL CLEAR" if not violations else f"⚠ VIOLATION: {', '.join(v['type'] for v in violations)}"
                    cv2.putText(frame, status_text.upper(), (20, 42), cv2.FONT_HERSHEY_SIMPLEX, 0.7, status_color, 2)
                except Exception as e:
                    logger.warning(f"[WORKER] Overlay drawing error: {e}")

                snapshot_b64 = None
                if violations:
                    now = time.time()
                    should_log = False
                    for v in violations:
                        vtype = v["type"]
                        last_logged = self.last_log_time.get(vtype, 0)
                        # Log every 3 seconds per violation type
                        if now - last_logged > 3.0:
                            should_log = True
                            self.last_log_time[vtype] = now
                    
                    if should_log:
                        try:
                            ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
                            snap_path = os.path.join(SNAPSHOTS_DIR, f"{ts}.jpg")
                            cv2.imwrite(snap_path, frame)
                            for v in violations:
                                insert_violation(v["type"], snap_path, v.get("confidence", 0.80))
                            logger.info(f"[WORKER] Violation logged: {[v['type'] for v in violations]}")
                        except Exception as e:
                            logger.error(f"[WORKER] Snapshot save error: {e}")
                    
                    try:
                        clean_snapshot = frame[60:]
                        _, buf = cv2.imencode('.jpg', clean_snapshot, [cv2.IMWRITE_JPEG_QUALITY, 80])
                        snapshot_b64 = base64.b64encode(buf).decode()
                    except Exception as e:
                        logger.warning(f"[WORKER] Snapshot encode error: {e}")
                
                # Encode main frame
                try:
                    _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                    frame_b64 = base64.b64encode(buf).decode()
                except Exception as e:
                    logger.error(f"[WORKER] Frame encode error: {e}")
                    continue
                
                # Update shared state
                with self.lock:
                    self.frame_b64 = frame_b64
                    self.violations = violations
                    self.snapshot_b64 = snapshot_b64
                    self.frame_count += 1
                    
                if not self.is_using_mock:
                    time.sleep(0.005)
                    
            except Exception as e:
                logger.error(f"[WORKER] Main loop exception: {e}")
                time.sleep(0.1)
                continue


@app.route('/api/start', methods=['POST'])
def start_stream():
    global worker
    try:
        if worker:
            worker.stop()
        worker = StreamWorker()
        worker.start()
        logger.info("[API] Stream start requested")
        return jsonify({"status": "started", "message": "Stream worker initialized"})
    except Exception as e:
        logger.error(f"[API] Start stream error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/stop', methods=['POST'])
def stop_stream():
    global worker
    try:
        if worker:
            worker.stop()
            worker = None
        logger.info("[API] Stream stop requested")
        return jsonify({"status": "stopped"})
    except Exception as e:
        logger.error(f"[API] Stop stream error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/frame', methods=['GET'])
def get_frame():
    global worker
    try:
        if not worker:
            worker = StreamWorker()
            worker.start()
            
        frame_b64, violations, snapshot_b64 = worker.get_latest_data()
        
        return jsonify({
            "frame": frame_b64 or "",
            "violations": violations or [],
            "snapshot": snapshot_b64,
            "status": "violation" if violations else "clear"
        })
    except Exception as e:
        logger.error(f"[API] Frame get error: {e}")
        return jsonify({
            "frame": "",
            "violations": [],
            "status": "error",
            "message": str(e)
        }), 500


@app.route('/api/violations', methods=['GET'])
def api_violations():
    try:
        rows = get_all_violations()
        data = []
        for r in rows:
            img_url = None
            if r[3]:
                filename = os.path.basename(r[3])
                img_url = f"/snapshots/{filename}"
            data.append({
                "id": r[0],
                "type": r[1],
                "timestamp": r[2],
                "image": img_url,
                "confidence": r[4]
            })
        return jsonify(data)
    except Exception as e:
        logger.error(f"[API] Violations query error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/stats/hourly', methods=['GET'])
def api_hourly():
    try:
        rows = get_hourly_stats()
        return jsonify([{"hour": r[0], "type": r[1], "count": r[2]} for r in rows])
    except Exception as e:
        logger.error(f"[API] Hourly stats error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/stats/types', methods=['GET'])
def api_types():
    try:
        rows = get_violation_type_stats()
        return jsonify([{"type": r[0], "count": r[1]} for r in rows])
    except Exception as e:
        logger.error(f"[API] Type stats error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/snapshots/<path:filename>')
def serve_snapshot(filename):
    try:
        # Security: validate filename format
        if not filename.endswith('.jpg'):
            return jsonify({"error": "Invalid file format"}), 400
        return send_from_directory(SNAPSHOTS_DIR, filename)
    except Exception as e:
        logger.error(f"[API] Snapshot serve error: {e}")
        return jsonify({"error": "Snapshot not found"}), 404


# Unified Frontend Routing
@app.route('/')
@app.route('/index.html')
def serve_index():
    try:
        return send_from_directory(FRONTEND_DIR, 'index.html')
    except Exception as e:
        logger.error(f"[API] Serve index error: {e}")
        return "Frontend not found", 404


@app.route('/dashboard.html')
def serve_dashboard():
    try:
        return send_from_directory(FRONTEND_DIR, 'dashboard.html')
    except Exception as e:
        logger.error(f"[API] Serve dashboard error: {e}")
        return "Dashboard not found", 404


@app.route('/analytics.html')
def serve_analytics():
    try:
        return send_from_directory(FRONTEND_DIR, 'analytics.html')
    except Exception as e:
        logger.error(f"[API] Serve analytics error: {e}")
        return "Analytics not found", 404


@app.route('/css/<path:path>')
def serve_css(path):
    try:
        return send_from_directory(os.path.join(FRONTEND_DIR, 'css'), path)
    except Exception as e:
        logger.error(f"[API] Serve CSS error: {e}")
        return "CSS not found", 404


@app.route('/js/<path:path>')
def serve_js(path):
    try:
        return send_from_directory(os.path.join(FRONTEND_DIR, 'js'), path)
    except Exception as e:
        logger.error(f"[API] Serve JS error: {e}")
        return "JS not found", 404


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.datetime.now().isoformat(),
        "worker_active": worker is not None
    })


if __name__ == '__main__':
    logger.info("="*60)
    logger.info("HYGIENEGUARD BACKEND STARTING")
    logger.info("="*60)
    socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)
