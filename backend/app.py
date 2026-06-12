from flask import Flask, jsonify, request, send_from_directory, Response
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
CORS(app, resources={r"/api/*": {"origins": "*",
     "methods": ["GET","POST","DELETE","OPTIONS"],
     "allow_headers": ["Content-Type"]}})
socketio = SocketIO(app, cors_allowed_origins="*",
                    async_mode='threading')

# Configure directories relative to app.py
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SNAPSHOTS_DIR = os.path.join(BASE_DIR, "snapshots")
os.makedirs(SNAPSHOTS_DIR, exist_ok=True)
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))

init_db()

# ── Camera source config ───────────────────────────────────
# Change CAMERA_SOURCE to switch camera:
# 0          = laptop built-in webcam
# 1          = external USB webcam
# "http://192.168.x.x:4747/video"  = DroidCam WiFi
# "http://localhost:4747/video"     = DroidCam USB
CAMERA_SOURCE = 0

# ── Global state ──────────────────────────────────────────
camera         = None
camera_lock    = threading.Lock()
latest_frame   = None
latest_result  = {"total_persons": 0, "persons": [],
                  "annotated_frame": None, "status": "clear"}
frame_lock     = threading.Lock()
result_lock    = threading.Lock()
is_running     = False
active_source  = None

# ── Snapshot throttle ─────────────────────────────────────
last_snapshot_time     = {}
snapshot_count_minute  = 0
minute_start           = time.time()
SNAPSHOT_COOLDOWN      = 5
MAX_SNAPSHOTS_PER_MIN  = 10

def should_save_snapshot(person_id, vtype):
    global snapshot_count_minute, minute_start
    now = time.time()
    if now - minute_start >= 60:
        snapshot_count_minute = 0
        minute_start = now
    if snapshot_count_minute >= MAX_SNAPSHOTS_PER_MIN:
        return False
    key = f"{person_id}_{vtype}"
    if now - last_snapshot_time.get(key, 0) >= SNAPSHOT_COOLDOWN:
        last_snapshot_time[key] = now
        snapshot_count_minute += 1
        return True
    return False

def reset_person_cooldown(person_id):
    keys = [k for k in last_snapshot_time
            if k.startswith(f"{person_id}_")]
    for k in keys:
        try:
            del last_snapshot_time[k]
        except KeyError:
            pass

def save_snapshot_async(pid, vtype, ts, annotated_frame):
    try:
        snap_filename = f"P{pid}_{vtype.replace(' ','_')}_{ts}.jpg"
        snap_path = os.path.join(SNAPSHOTS_DIR, snap_filename)
        cv2.imwrite(snap_path, annotated_frame)
        
        # Store a relative web URL path in the database: /snapshots/filename.jpg
        web_path = f"/snapshots/{snap_filename}"
        insert_violation(pid, vtype, web_path, 0.91)
    except Exception as e:
        logger.error(f"Error saving snapshot asynchronously: {e}")

# ── Camera functions ──────────────────────────────────────
def open_camera(source):
    cap = None
    if isinstance(source, int):
        cap = cv2.VideoCapture(source, cv2.CAP_DSHOW)
        if not cap.isOpened():
            cap = cv2.VideoCapture(source)
    else:
        cap = cv2.VideoCapture(source)

    if cap and cap.isOpened():
        cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        cap.set(cv2.CAP_PROP_FPS,          30)
        cap.set(cv2.CAP_PROP_BUFFERSIZE,   1)
        if isinstance(source, int):
            try:
                cap.set(cv2.CAP_PROP_AUTOFOCUS,     1)
                cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 0.75)
            except Exception:
                pass
        logger.info(f"Camera opened: {source}")
        return cap
    logger.error(f"Failed to open camera: {source}")
    return None

def get_fresh_frame():
    global camera
    with camera_lock:
        cap = camera
        if cap is None or not cap.isOpened():
            return None
    try:
        ret, frame = cap.read()
        if ret and frame is not None:
            return frame
    except Exception as e:
        logger.error(f"Error retrieving frame: {e}")
    return None

# ── Background threads ────────────────────────────────────
def capture_thread():
    global latest_frame, camera, is_running
    logger.info("Capture thread started")
    while is_running:
        frame = get_fresh_frame()
        if frame is not None:
            with frame_lock:
                latest_frame = frame
        else:
            time.sleep(0.033)

def detection_thread():
    global latest_result, is_running
    logger.info("Detection thread started")
    last_time = 0
    MIN_INTERVAL = 0.033  # 30 FPS detection max

    while is_running:
        now = time.time()
        if now - last_time < MIN_INTERVAL:
            time.sleep(0.01)
            continue

        with frame_lock:
            if latest_frame is None:
                time.sleep(0.01)
                continue
            frame_copy = latest_frame.copy()

        try:
            # Resize if extremely large to ensure peak performance
            h_orig, w_orig = frame_copy.shape[:2]
            if h_orig > 720 or w_orig > 1280:
                frame_copy = cv2.resize(frame_copy, (1280, 720))

            result   = analyze_frame(frame_copy)
            persons  = result.get("persons", [])
            total    = result.get("total_persons", 0)
            annotated = draw_on_frame(frame_copy, persons, total)
            any_viol  = any(
                len(p.get("violations", [])) > 0
                for p in persons)

            with result_lock:
                latest_result = {
                    "total_persons": total,
                    "persons":       persons,
                    "annotated_frame": annotated,
                    "status": "violation" if any_viol else "clear"
                }

            # Save snapshots asynchronously during violation events
            ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            for person in persons:
                if person.get("violations"):
                    for vtype in person["violations"]:
                        pid = person["id"]
                        if should_save_snapshot(pid, vtype):
                            threading.Thread(
                                target=save_snapshot_async,
                                args=(pid, vtype, ts, annotated.copy()),
                                daemon=True
                            ).start()
                else:
                    reset_person_cooldown(person["id"])

            last_time = time.time()
        except Exception as e:
            logger.error(f"Detection error: {e}")
            time.sleep(0.02)

# ── Drawing function ──────────────────────────────────────
def draw_on_frame(frame, persons, total_persons):
    frame = frame.copy()
    H, W  = frame.shape[:2]
    font  = cv2.FONT_HERSHEY_SIMPLEX

    # Collect all violations for status bar
    all_v_types = []
    for person in persons:
        all_v_types.extend(person.get("violations", []))

    # Draw system status bar (at the top, 35 pixels high)
    status_color = (0, 255, 136) if not all_v_types else (0, 0, 255)
    cv2.rectangle(frame, (0, 0), (W, 35), (10, 13, 18), -1)
    cv2.line(frame, (0, 35), (W, 35), status_color, 1)

    # Person count top-left inside status bar
    label = f"PERSONS: {total_persons}"
    (tw, th), _ = cv2.getTextSize(label, font, 0.45, 1)
    cv2.rectangle(frame, (8, 6), (tw + 20, 29), (10, 13, 18), -1)
    cv2.rectangle(frame, (8, 6), (tw + 20, 29), (0, 255, 136), 1)
    cv2.putText(frame, label, (14, 21), font, 0.45, (0, 255, 136), 1, cv2.LINE_AA)

    # Write system status text inside status bar
    status_text = "SYSTEM STATUS: SECURE" if not all_v_types else f"BREACH DETECTED: {', '.join(all_v_types)}"
    cv2.putText(frame, status_text.upper(), (tw + 35, 22), font, 0.45, status_color, 1, cv2.LINE_AA)

    for p in persons:
        pid      = p.get("id", 0)
        bbox     = p.get("bbox")
        viols    = p.get("violations", [])
        has_viol = len(viols) > 0
        if not bbox:
            continue

        x1 = max(0, min(int(bbox[0]), W-1))
        y1 = max(0, min(int(bbox[1]), H-1))
        x2 = max(0, min(int(bbox[2]), W-1))
        y2 = max(0, min(int(bbox[3]), H-1))
        
        # Clamp drawing coordinates below the status bar (y1 >= 35) to keep status bar clean
        y1_draw = max(35, y1)
        
        color = (0, 0, 255) if has_viol else (0, 255, 136)

        # Semi-transparent fill
        ov = frame.copy()
        cv2.rectangle(ov, (x1, y1_draw), (x2, y2), color, -1)
        cv2.addWeighted(ov, 0.07, frame, 0.93, 0, frame)

        # Box + corners
        cv2.rectangle(frame, (x1, y1_draw), (x2, y2), color, 2)
        cl, ct = 20, 3
        for pts in [((x1, y1_draw), (x1+cl, y1_draw)), ((x1, y1_draw), (x1, y1_draw+cl)),
                    ((x2, y1_draw), (x2-cl, y1_draw)), ((x2, y1_draw), (x2, y1_draw+cl)),
                    ((x1, y2), (x1+cl, y2)), ((x1, y2), (x1, y2-cl)),
                    ((x2, y2), (x2-cl, y2)), ((x2, y2), (x2, y2-cl))]:
            cv2.line(frame, pts[0], pts[1], color, ct)

        # Person label
        pl = f"PERSON {pid}"
        (plw, plh), _ = cv2.getTextSize(pl, font, 0.45, 1)
        by1 = max(35, y1_draw - plh - 14)
        cv2.rectangle(frame, (x1, by1), (x1+plw+12, y1_draw), color, -1)
        cv2.putText(frame, pl, (x1+6, y1_draw-5), font, 0.45, (0, 0, 0), 1, cv2.LINE_AA)

        # Violation / clear text
        ty = y2 + 22
        if has_viol:
            for v in viols:
                vl = f"! {v.upper()}"
                (vw, vh), _ = cv2.getTextSize(vl, font, 0.42, 1)
                cv2.rectangle(frame, (x1, ty-vh-5), (x1+vw+10, ty+5), (120, 0, 80), -1)
                cv2.putText(frame, vl, (x1+5, ty), font, 0.42, (255, 80, 120), 1, cv2.LINE_AA)
                ty += vh + 12
        else:
            (ow, oh), _ = cv2.getTextSize("CLEAR", font, 0.42, 1)
            cv2.rectangle(frame, (x1, ty-oh-5), (x1+ow+10, ty+5), (0, 60, 30), -1)
            cv2.putText(frame, "CLEAR", (x1+5, ty), font, 0.42, (0, 255, 136), 1, cv2.LINE_AA)
    return frame

# ── API endpoints ─────────────────────────────────────────
@app.route('/api/start', methods=['POST'])
def start_stream():
    global camera, is_running, active_source

    # Stop existing if running
    is_running = False
    time.sleep(0.2)
    with camera_lock:
        if camera:
            camera.release()
            camera = None
        active_source = None

    # Get source from request or use config
    data   = request.get_json(silent=True) or {}
    source = data.get('source', CAMERA_SOURCE)

    # Convert string index to int
    try:
        source = int(source)
    except (ValueError, TypeError):
        pass  # keep as string URL

    with camera_lock:
        camera = open_camera(source)
        if camera is None:
            return jsonify({
                "status": "error",
                "message": f"Cannot open camera: {source}"
            }), 500
        active_source = source

    is_running = True

    # Start background threads
    threading.Thread(
        target=capture_thread, daemon=True).start()
    threading.Thread(
        target=detection_thread, daemon=True).start()

    return jsonify({
        "status": "started",
        "source": str(source)
    })

@app.route('/api/stop', methods=['POST'])
def stop_stream():
    global is_running, camera, latest_frame, latest_result, active_source
    is_running = False
    time.sleep(0.3)
    with camera_lock:
        if camera:
            camera.release()
            camera = None
    active_source = None
    with frame_lock:
        latest_frame = None
    with result_lock:
        latest_result = {
            "total_persons": 0, "persons": [],
            "annotated_frame": None, "status": "clear"
        }
    return jsonify({"status": "stopped"})

@app.route('/api/stream')
def video_stream():
    def gen():
        global latest_result, is_running
        while is_running:
            time.sleep(0.01)  # small sleep to prevent high CPU loop
            with result_lock:
                annotated = latest_result.get("annotated_frame")
            
            if annotated is not None:
                ret, jpeg = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 75])
                if ret:
                    try:
                        yield (b'--frame\r\n'
                               b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n\r\n')
                    except GeneratorExit:
                        # Client disconnected, stop generating
                        break
                    except Exception:
                        break
    return Response(gen(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/metadata', methods=['GET'])
def get_metadata():
    with result_lock:
        result = latest_result.copy()
    
    persons = result.get("persons", [])
    total = result.get("total_persons", 0)
    any_viol = result.get("status") == "violation"
    
    # Collect violations array for alert UI compatibility
    violations = []
    for p in persons:
        if p.get("violations"):
            for v in p["violations"]:
                violations.append({"type": v})
                
    return jsonify({
        "total_persons": total,
        "persons": persons,
        "violations": violations,
        "status": "violation" if any_viol else "clear"
    })

@app.route('/api/frame', methods=['GET'])
def get_frame():
    with result_lock:
        result    = latest_result.copy()
        annotated = result.get("annotated_frame")

    if annotated is None:
        # Return raw frame while detection warms up
        with frame_lock:
            raw = latest_frame
        if raw is not None:
            _, buf = cv2.imencode('.jpg', raw,
                [cv2.IMWRITE_JPEG_QUALITY, 75])
            return jsonify({
                "frame": base64.b64encode(buf).decode(),
                "total_persons": 0,
                "persons": [], "status": "clear"
            })
        return jsonify({"error": "No frame"}), 500

    persons   = result.get("persons", [])
    total     = result.get("total_persons", 0)
    any_viol  = result.get("status") == "violation"

    # Snapshots are handled in the background detection thread to support native stream routing

    _, buf = cv2.imencode('.jpg', annotated,
        [cv2.IMWRITE_JPEG_QUALITY, 75])

    return jsonify({
        "frame":         base64.b64encode(buf).decode(),
        "total_persons": total,
        "persons":       persons,
        "status":        "violation" if any_viol else "clear"
    })

@app.route('/api/camera/source', methods=['POST'])
def change_camera_source():
    data   = request.get_json(silent=True) or {}
    source = data.get('source', 0)
    # Restart with new source
    return start_stream()

@app.route('/api/camera/test', methods=['POST'])
def test_camera():
    global camera, is_running, active_source
    data   = request.get_json(silent=True) or {}
    source = data.get('source', 0)
    try:
        source = int(source)
    except (ValueError, TypeError):
        pass

    # If already running that source, bypass test and return ok to prevent port busy error
    with camera_lock:
        if is_running and camera is not None and camera.isOpened() and str(source) == str(active_source):
            return jsonify({
                "status": "ok",
                "message": f"Camera {source} is active and streaming"
            })

    cap = open_camera(source)
    if cap and cap.isOpened():
        ret, frame = cap.read()
        cap.release()
        if ret:
            return jsonify({
                "status": "ok",
                "message": f"Camera {source} working"
            })
    return jsonify({
        "status": "error",
        "message": f"Camera {source} not available"
    }), 404

@app.route('/api/violations', methods=['GET'])
def api_violations():
    try:
        rows = get_all_violations()
        violations = []
        for r in rows:
            img_path = r[4]
            if img_path:
                # If absolute Windows or POSIX path, parse basename to serve relatively
                if "\\" in img_path or "/" in img_path:
                    filename = os.path.basename(img_path)
                    web_img_path = f"/snapshots/{filename}"
                else:
                    web_img_path = img_path
            else:
                web_img_path = None
            
            violations.append({
                "id":         r[0],
                "person_id":  r[1],
                "type":       r[2],
                "timestamp":  r[3],
                "image":      web_img_path,
                "confidence": r[5]
            })
        return jsonify(violations)
    except Exception as e:
        logger.error(f"Violations error: {e}")
        return jsonify([]), 200

@app.route('/api/violations/<int:vid>',
           methods=['DELETE','OPTIONS'])
def delete_one(vid):
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    try:
        delete_violation(vid)
        return jsonify({"status": "deleted", "id": vid})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/violations/all',
           methods=['DELETE','OPTIONS'])
def delete_all_route():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    try:
        delete_all_violations()
        return jsonify({"status": "all deleted"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/stats/hourly', methods=['GET'])
def api_hourly():
    try:
        rows = get_hourly_stats()
        return jsonify([{
            "hour": r[0], "type": r[1], "count": r[2]
        } for r in rows])
    except Exception:
        return jsonify([]), 200

@app.route('/api/stats/types', methods=['GET'])
def api_types():
    try:
        rows = get_violation_type_stats()
        return jsonify([{
            "type": r[0], "count": r[1]
        } for r in rows])
    except Exception:
        return jsonify([]), 200

@app.route('/api/health', methods=['GET'])
def health():
    with camera_lock:
        cam_ok = camera is not None and camera.isOpened()
    return jsonify({
        "status":   "online",
        "camera":   "connected" if cam_ok else "disconnected",
        "running":  is_running,
        "source":   str(CAMERA_SOURCE)
    })

# Unified Frontend Routing
@app.route('/')
@app.route('/index.html')
def serve_index():
    try:
        return send_from_directory(FRONTEND_DIR, 'index.html')
    except Exception as e:
        return "Frontend not found", 404

@app.route('/dashboard.html')
def serve_dashboard():
    try:
        return send_from_directory(FRONTEND_DIR, 'dashboard.html')
    except Exception as e:
        return "Dashboard not found", 404

@app.route('/analytics.html')
def serve_analytics():
    try:
        return send_from_directory(FRONTEND_DIR, 'analytics.html')
    except Exception as e:
        return "Analytics not found", 404

@app.route('/css/<path:path>')
def serve_css(path):
    try:
        return send_from_directory(os.path.join(FRONTEND_DIR, 'css'), path)
    except Exception as e:
        return "CSS not found", 404

@app.route('/js/<path:path>')
def serve_js(path):
    try:
        return send_from_directory(os.path.join(FRONTEND_DIR, 'js'), path)
    except Exception as e:
        return "JS not found", 404

@app.route('/assets/<path:path>')
def serve_assets(path):
    try:
        return send_from_directory(os.path.join(FRONTEND_DIR, 'assets'), path)
    except Exception as e:
        return "Asset not found", 404

@app.route('/snapshots/<path:filename>')
def serve_snapshot(filename):
    return send_from_directory(SNAPSHOTS_DIR, filename)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    logger.info(f"HygieneGuard starting on http://localhost:{port}")
    socketio.run(app, host='0.0.0.0', port=port,
                 debug=False, use_reloader=False,
                 log_output=True, allow_unsafe_werkzeug=True)