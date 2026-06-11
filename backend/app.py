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

from database import (init_db, insert_violation, get_all_violations,
                      get_hourly_stats, get_violation_type_stats,
                      delete_violation, delete_all_violations)
from detector import analyze_frame

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'hygieneguard2025'

CORS(app, resources={
    r"/api/*": {
        "origins": "*",
        "methods": ["GET", "POST", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    },
    r"/snapshots/*": {
        "origins": "*"
    }
})

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode='threading'
)

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
    persons = []
    
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
        
    # Build per-person data from mock violations
    if violations:
        persons = [{
            "id": 1,
            "bbox": [520, 180, 760, 500],
            "violations": [v["type"] for v in violations],
            "status": "VIOLATION"
        }]
    else:
        persons = [{
            "id": 1,
            "bbox": [520, 180, 760, 500],
            "violations": [],
            "status": "CLEAR"
        }]
    
    return frame, violations, persons


class StreamWorker:
    def __init__(self):
        self.cap = None
        self.frame_b64 = ""
        self.violations = []
        self.persons = []
        self.snapshot_b64 = None
        self.running = False
        self.is_using_mock = False
        self.thread = None
        self.grabber_thread = None
        self.latest_raw_frame = None
        self.lock = threading.Lock()
        self.last_log_time = {}
        self.frame_count = 0
        self.frame_id = 0

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
            return self.frame_b64, self.violations, self.snapshot_b64, self.persons

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
                    time.sleep(0.01)
                    continue
                with self.lock:
                    self.latest_raw_frame = frame
                    self.frame_id += 1
            except Exception as e:
                logger.warning(f"[GRABBER] Frame grab error: {e}")
                break
            time.sleep(0.01)

    def _run(self):
        try:
            # Try multiple camera indices — DroidCam can shift the built-in webcam
            logger.info("[WORKER] Attempting camera initialization...")
            cap = None
            opened_index = -1
            
            for cam_index in [0, 1, 2]:
                logger.info(f"[WORKER] Trying camera index {cam_index}...")
                test_cap = cv2.VideoCapture(cam_index)
                if test_cap.isOpened():
                    ret, frame = test_cap.read()
                    if ret and frame is not None:
                        cap = test_cap
                        opened_index = cam_index
                        logger.info(f"[WORKER] Camera found at index {cam_index}! Resolution: {frame.shape[1]}x{frame.shape[0]}")
                        break
                    else:
                        test_cap.release()
                else:
                    try:
                        test_cap.release()
                    except Exception:
                        pass
            
            if cap is not None and cap.isOpened():
                with self.lock:
                    self.cap = cap
                
                logger.info(f"[WORKER] Camera opened successfully at index {opened_index}")
                try:
                    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
                    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
                    cap.set(cv2.CAP_PROP_FPS, 30)
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                except Exception as e:
                    logger.warning(f"[WORKER] Could not set camera properties: {e}")
                
                # Verify frame read after setting resolution
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
                    logger.info(f"[WORKER] Camera frame read successful at index {opened_index}. Real mode enabled.")
                    self.is_using_mock = False
                    with self.lock:
                        self.cap = cap
                        self.latest_raw_frame = frame
                    # Start grabber thread
                    self.grabber_thread = threading.Thread(target=self._grab_frames)
                    self.grabber_thread.daemon = True
                    self.grabber_thread.start()
            else:
                logger.warning("[WORKER] No camera available at any index. Using mock mode.")
                self.is_using_mock = True
        except Exception as e:
            logger.error(f"[WORKER] Camera init exception: {e}")
            self.is_using_mock = True

        logger.info(f"[WORKER] Stream mode: {'MOCK' if self.is_using_mock else 'REAL'}")
        last_processed_id = -1
        tick_count = 0
        
        while True:
            try:
                with self.lock:
                    if not self.running:
                        break
                        
                frame = None
                violations = []
                persons = []
                
                if self.is_using_mock:
                    tick_count += 1
                    frame, violations, persons = make_synthetic_frame(tick_count)
                    time.sleep(0.033)  # ~30 FPS for mock
                else:
                    with self.lock:
                        frame = self.latest_raw_frame
                        current_id = self.frame_id
                    
                    if frame is None or current_id == last_processed_id:
                        time.sleep(0.01) # Wait for a new frame
                        continue
                    
                    last_processed_id = current_id
                    
                    if frame.shape[0] < 50 or frame.shape[1] < 50:
                        time.sleep(0.01)
                        continue
                    
                    # Resize to 640x360 for high-performance processing and network speed
                    try:
                        frame = cv2.resize(frame, (640, 360))
                    except Exception as e:
                        logger.warning(f"[WORKER] Resize error: {e}")
                    
                    # Copy frame for thread-safe processing
                    frame = frame.copy()
                    
                    # Analyze frame for violations
                    try:
                        result = analyze_frame(frame)
                        violations = result.get("violations", [])
                        persons = result.get("persons", [])
                    except Exception as e:
                        logger.error(f"[WORKER] Frame analysis error: {e}")
                        violations = []
                        persons = []

                # Draw status overlay, bounding boxes, and labels on the frame
                try:
                    total_persons = len(persons)
                    font = cv2.FONT_HERSHEY_SIMPLEX
                    
                    # Draw system status bar (at the top, 35 pixels high)
                    status_color = (85, 255, 0) if not violations else (85, 45, 255)
                    cv2.rectangle(frame, (0, 0), (frame.shape[1], 35), (10, 13, 18), -1)
                    cv2.line(frame, (0, 35), (frame.shape[1], 35), status_color, 1)
                    
                    # ── DRAW PERSON COUNT TOP LEFT (Overlaid nicely on the status bar) ──
                    count_label = f"PERSONS: {total_persons}"
                    (cw, ch), _ = cv2.getTextSize(count_label, font, 0.45, 1)
                    cv2.rectangle(frame, (8, 6), (cw + 20, 29), (10, 13, 18), -1)
                    cv2.rectangle(frame, (8, 6), (cw + 20, 29), (0, 255, 136), 1)
                    cv2.putText(frame, count_label, (14, 21), font, 0.45, (0, 255, 136), 1, cv2.LINE_AA)
                    
                    # Write the system status text
                    status_text = "SYSTEM STATUS: SECURE" if not violations else f"BREACH DETECTED: {', '.join(v['type'] for v in violations)}"
                    cv2.putText(frame, status_text.upper(), (cw + 35, 22), font, 0.45, status_color, 1, cv2.LINE_AA)

                    # ── DRAW EACH PERSON BOX AND LABEL ─────────────────────
                    for person in persons:
                        pid        = person.get("id", 0)
                        bbox       = person.get("bbox", None)
                        p_violations = person.get("violations", [])
                        has_viol   = len(p_violations) > 0

                        if not bbox:
                            continue

                        x1 = int(bbox[0])
                        y1 = int(bbox[1])
                        x2 = int(bbox[2])
                        y2 = int(bbox[3])

                        # Clamp to frame bounds
                        h_frame, w_frame = frame.shape[:2]
                        x1 = max(0, min(x1, w_frame - 1))
                        y1 = max(0, min(y1, h_frame - 1))
                        x2 = max(0, min(x2, w_frame - 1))
                        y2 = max(0, min(y2, h_frame - 1))

                        color = (85, 45, 255) if has_viol else (85, 255, 0) # BGR colors (red if breach, green if safe)

                        # Semi-transparent fill inside box
                        overlay = frame.copy()
                        cv2.rectangle(overlay, (x1, y1), (x2, y2), color, -1)
                        cv2.addWeighted(overlay, 0.07, frame, 0.93, 0, frame)

                        # Main bounding box
                        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

                        # Corner bracket lines
                        cl = 20
                        ct = 3
                        # Top-left
                        cv2.line(frame, (x1, y1), (x1+cl, y1), color, ct)
                        cv2.line(frame, (x1, y1), (x1, y1+cl), color, ct)
                        # Top-right
                        cv2.line(frame, (x2, y1), (x2-cl, y1), color, ct)
                        cv2.line(frame, (x2, y1), (x2, y1+cl), color, ct)
                        # Bottom-left
                        cv2.line(frame, (x1, y2), (x1+cl, y2), color, ct)
                        cv2.line(frame, (x1, y2), (x1, y2-cl), color, ct)
                        # Bottom-right
                        cv2.line(frame, (x2, y2), (x2-cl, y2), color, ct)
                        cv2.line(frame, (x2, y2), (x2, y2-cl), color, ct)

                        # Person label background above box
                        p_label = f"PERSON {pid}"
                        (plw, plh), _ = cv2.getTextSize(p_label, font, 0.45, 1)
                        lbg_y1 = max(35, y1 - plh - 14)
                        lbg_y2 = y1
                        
                        # Adjust if label overlaps with status bar
                        if y1 < 35:
                            lbg_y1 = y1
                            lbg_y2 = y1 + plh + 14
                            text_draw_y = y1 + plh + 7
                        else:
                            text_draw_y = y1 - 5
                            
                        cv2.rectangle(frame, (x1, lbg_y1), (x1 + plw + 12, lbg_y2), color, -1)
                        cv2.putText(frame, p_label,
                            (x1 + 6, text_draw_y),
                            font, 0.45,
                            (0, 0, 0),
                            1, cv2.LINE_AA)

                        # Violation or CLEAR text below box
                        text_y = y2 + 18
                        if has_viol:
                            for v in p_violations:
                                v_label = f"! {v.upper()}"
                                (vw, vh), _ = cv2.getTextSize(v_label, font, 0.4, 1)
                                cv2.rectangle(frame,
                                    (x1, text_y - vh - 5),
                                    (x1 + vw + 10, text_y + 5),
                                    (0, 0, 180), -1)
                                cv2.putText(frame, v_label,
                                    (x1 + 5, text_y),
                                    font, 0.4,
                                    (255, 100, 120),
                                    1, cv2.LINE_AA)
                                text_y += vh + 10
                        else:
                            ok_label = "✓ CLEAR"
                            (ow, oh), _ = cv2.getTextSize(ok_label, font, 0.4, 1)
                            cv2.rectangle(frame,
                                (x1, text_y - oh - 5),
                                (x1 + ow + 10, text_y + 5),
                                (0, 80, 40), -1)
                            cv2.putText(frame, ok_label,
                                (x1 + 5, text_y),
                                font, 0.4,
                                (0, 255, 136),
                                1, cv2.LINE_AA)
                except Exception as e:
                    logger.warning(f"[WORKER] Drawing execution error: {e}")

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
                                insert_violation(0, v["type"], snap_path, v.get("confidence", 0.80))
                            logger.info(f"[WORKER] Violation logged: {[v['type'] for v in violations]}")
                        except Exception as e:
                            logger.error(f"[WORKER] Snapshot save error: {e}")
                    
                    try:
                        clean_snapshot = frame[35:]
                        _, buf = cv2.imencode('.jpg', clean_snapshot, [cv2.IMWRITE_JPEG_QUALITY, 60])
                        snapshot_b64 = base64.b64encode(buf).decode()
                    except Exception as e:
                        pointer = None
                
                # Encode main frame
                try:
                    _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 60])
                    frame_b64 = base64.b64encode(buf).decode()
                except Exception as e:
                    logger.error(f"[WORKER] Frame encode error: {e}")
                    continue
                
                # Update shared state
                with self.lock:
                    self.frame_b64 = frame_b64
                    self.violations = violations
                    self.persons = persons
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
            
        frame_b64, violations, snapshot_b64, persons = worker.get_latest_data()
        
        return jsonify({
            "frame": frame_b64 or "",
            "violations": violations or [],
            "total_persons": len(persons) if persons else 0,
            "persons": persons or [],
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
            # Schema: id, person_id, type, timestamp, image_path, confidence
            img_url = None
            if len(r) > 4 and r[4]:
                filename = os.path.basename(str(r[4]))
                img_url = f"/snapshots/{filename}"
            data.append({
                "id": r[0],
                "person_id": r[1] if len(r) > 5 else 0,
                "type": r[2] if len(r) > 5 else r[1],
                "timestamp": r[3] if len(r) > 5 else r[2],
                "image": img_url,
                "confidence": r[5] if len(r) > 5 else (r[4] if len(r) > 4 else 0.0)
            })
        return jsonify(data)
    except Exception as e:
        logger.error(f"[API] Violations query error: {e}")
        return jsonify([]), 200


@app.route('/api/stats/hourly', methods=['GET'])
def api_hourly():
    try:
        rows = get_hourly_stats()
        return jsonify([{"hour": r[0], "type": r[1], "count": r[2]} for r in rows])
    except Exception as e:
        logger.error(f"[API] Hourly stats error: {e}")
        return jsonify([]), 200


@app.route('/api/stats/types', methods=['GET'])
def api_types():
    try:
        rows = get_violation_type_stats()
        return jsonify([{"type": r[0], "count": r[1]} for r in rows])
    except Exception as e:
        logger.error(f"[API] Type stats error: {e}")
        return jsonify([]), 200


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


@app.route('/assets/<path:path>')
def serve_assets(path):
    try:
        return send_from_directory(os.path.join(FRONTEND_DIR, 'assets'), path)
    except Exception as e:
        logger.error(f"[API] Serve Assets error: {e}")
        return "Asset not found", 404


@app.route('/api/violations/<int:violation_id>', methods=['DELETE', 'OPTIONS'])
def delete_single_violation(violation_id):
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    try:
        delete_violation(violation_id)
        return jsonify({"status": "deleted", "id": violation_id})
    except Exception as e:
        logger.error(f"[API] Delete violation error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/violations/all', methods=['DELETE', 'OPTIONS'])
def delete_all():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    try:
        delete_all_violations()
        return jsonify({"status": "all deleted"})
    except Exception as e:
        logger.error(f"[API] Delete all violations error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "online",
        "database": "connected",
        "timestamp": datetime.datetime.now().isoformat(),
        "worker_active": worker is not None
    })


if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 5000))
    logger.info("="*60)
    logger.info("HYGIENEGUARD BACKEND STARTING")
    logger.info(f"Starting HygieneGuard on http://localhost:{port}")
    logger.info("="*60)
    socketio.run(
        app,
        host='0.0.0.0',
        port=port,
        debug=False,
        use_reloader=False,
        log_output=True,
        allow_unsafe_werkzeug=True
    )