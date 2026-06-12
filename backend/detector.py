import cv2
import mediapipe as mp
import numpy as np
import collections

mp_face_mesh = mp.solutions.face_mesh
mp_hands     = mp.solutions.hands

face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    max_num_faces=10,
    refine_landmarks=True,
    min_detection_confidence=0.35,
    min_tracking_confidence=0.35
)
hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=20,
    min_detection_confidence=0.35,
    min_tracking_confidence=0.35
)

MOUTH_INDICES = [13, 14, 78, 308, 80, 310, 82, 312]

# Violation smoothing — confirm only after 3 of 4 frames
violation_history = collections.defaultdict(
    lambda: collections.deque(maxlen=4))

# Person ID tracker
person_tracker = {}

def preprocess_frame(frame):
    # MediaPipe is highly optimized for raw camera feeds; upscaling and heavy filters
    # are CPU-intensive and cause lag. Returning the frame directly maximizes FPS.
    return frame

def get_face_bbox(face_lm, h, w):
    xs = [lm.x * w for lm in face_lm.landmark]
    ys = [lm.y * h for lm in face_lm.landmark]
    pad = 25
    return (max(0, int(min(xs))-pad),
            max(0, int(min(ys))-pad),
            min(w, int(max(xs))+pad),
            min(h, int(max(ys))+pad))

def check_mask(face_lm, frame, h, w, face_height_px):
    # Get center of mouth (landmark 13)
    mouth_center = face_lm.landmark[13]
    cx = int(mouth_center.x * w)
    cy = int(mouth_center.y * h)
    
    # Define ROI size dynamically based on face height to stay scale-invariant
    roi_size = max(5, int(face_height_px * 0.12))
    
    y1, y2 = max(0, cy - roi_size), min(h, cy + roi_size)
    x1, x2 = max(0, cx - roi_size), min(w, cx + roi_size)
    roi = frame[y1:y2, x1:x2]
    
    if roi.size == 0:
        return False
        
    # Check skin color ratio in mouth area.
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    skin_mask = cv2.inRange(hsv, np.array([0, 15, 60]), np.array([25, 255, 255]))
    skin_ratio = np.sum(skin_mask > 0) / skin_mask.size
    
    # If skin ratio is low, it indicates a mask is worn (returns True)
    return skin_ratio < 0.18

def check_nose_touch(face_lm, hand_list, h, w, face_height_px):
    nose = face_lm.landmark[1]
    nx, ny = nose.x * w, nose.y * h
    # Scale-invariant nose touch threshold (22% of face height)
    threshold = face_height_px * 0.22
    for hand in hand_list:
        for lm in hand.landmark:
            hx, hy = lm.x * w, lm.y * h
            if abs(hx - nx) < threshold and abs(hy - ny) < threshold:
                return True
    return False

def check_hair_touch(face_lm, hand_list, h, w, face_height_px):
    fore = face_lm.landmark[10]
    fx, fy = fore.x * w, fore.y * h
    # Scale-invariant hair touch horizontal threshold (30% of face height)
    thresh_x = face_height_px * 0.30
    # Scale-invariant vertical boundary relative to forehead
    min_y = -0.10 * face_height_px
    max_y = 0.55 * face_height_px
    for hand in hand_list:
        for lm in hand.landmark:
            hx, hy = lm.x * w, lm.y * h
            dy = fy - hy
            if abs(hx - fx) < thresh_x and min_y < dy < max_y:
                return True
    return False

def check_gloves(hand_list, frame, h, w):
    if not hand_list:
        return True
    for hand in hand_list:
        palm = hand.landmark[9]
        wrist = hand.landmark[0]
        # Calculate palm/hand scale dynamically to keep ROI size scale-invariant
        hand_scale_px = np.sqrt(((palm.x - wrist.x) * w) ** 2 + ((palm.y - wrist.y) * h) ** 2)
        roi_radius = max(4, int(hand_scale_px * 0.25))
        
        cx = int(palm.x * w)
        cy = int(palm.y * h)
        if 0 < cx < w and 0 < cy < h:
            y1, y2 = max(0, cy - roi_radius), min(h, cy + roi_radius)
            x1, x2 = max(0, cx - roi_radius), min(w, cx + roi_radius)
            roi = frame[y1:y2, x1:x2]
            if roi.size == 0:
                continue
            hsv  = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
            
            # Double HSV threshold to capture all skin tones (warm, cool, shadows, ethnic variations)
            skin_mask1 = cv2.inRange(hsv, np.array([0, 8, 30]), np.array([25, 255, 255]))
            skin_mask2 = cv2.inRange(hsv, np.array([165, 8, 30]), np.array([180, 255, 255]))
            skin_mask = cv2.bitwise_or(skin_mask1, skin_mask2)
            
            skin_ratio = np.sum(skin_mask > 0) / skin_mask.size
            
            # If skin-like color occupies > 10% of the palm ROI, bare hand (no gloves) is detected (False)
            if skin_ratio > 0.10:
                return False
    return True

def match_hand_to_face(hand_lm, bboxes, h, w):
    wrist = hand_lm.landmark[0]
    hx, hy = wrist.x*w, wrist.y*h
    best_i, best_d = 0, float('inf')
    for i, (x1,y1,x2,y2) in enumerate(bboxes):
        cx, cy = (x1+x2)/2, (y1+y2)/2
        d = ((hx-cx)**2+(hy-cy)**2)**0.5
        if d < best_d:
            best_d, best_i = d, i
    return best_i

def smooth_violations(person_id, current):
    hist = violation_history[person_id]
    hist.append(set(current))
    confirmed = []
    all_types = set()
    for h in hist:
        all_types.update(h)
    for vtype in all_types:
        count = sum(1 for h in hist if vtype in h)
        if count >= len(hist) * 0.75:
            confirmed.append(vtype)
    return confirmed

def get_stable_id(bbox, tracker, w, force_single=False):
    x1,y1,x2,y2 = bbox
    cx,cy = (x1+x2)/2, (y1+y2)/2
    best_id, best_d = None, float('inf')
    
    # If there is exactly one person in the frame and tracker, force a match to preserve ID stability
    if force_single and len(tracker) == 1:
        return list(tracker.keys())[0]

    # Scale-invariant matching threshold: 35% of the frame width
    threshold = w * 0.35

    for pid, data in tracker.items():
        px,py = data['center']
        d = ((cx-px)**2+(cy-py)**2)**0.5
        if d < threshold and d < best_d:
            best_d, best_id = d, pid
    return best_id

def update_tracker(persons, w):
    global person_tracker
    for pid in person_tracker:
        person_tracker[pid]['seen'] = False

    # Force a match if both the frame and tracker contain exactly 1 person
    force_single = (len(persons) == 1 and len(person_tracker) == 1)

    # Compute next_id based on non-stale active keys to avoid permanent increment leaks
    active_keys = [pid for pid, d in person_tracker.items() if d.get('seen', True) or d.get('age', 0) < 45]
    if active_keys:
        next_id = max(active_keys) + 1
    else:
        next_id = 1

    result  = []

    for p in persons:
        bbox = p['bbox']
        x1,y1,x2,y2 = bbox
        cx,cy = (x1+x2)/2,(y1+y2)/2
        matched = get_stable_id(bbox, person_tracker, w, force_single=force_single)

        if matched is not None:
            person_tracker[matched].update(
                {'center':(cx,cy),'seen':True,'age':0})
            stable_id = matched
        else:
            person_tracker[next_id] = {
                'center':(cx,cy),'seen':True,'age':0}
            stable_id = next_id
            next_id  += 1

        result.append({**p, 'id': stable_id})

    # Remove stale tracks after 45 frames (approx. 1.5 seconds of persistent loss)
    stale = [pid for pid,d in person_tracker.items()
             if not d['seen'] and
             person_tracker[pid].setdefault('age',0)+1 > 45]
    for pid in stale:
        del person_tracker[pid]
    for pid in person_tracker:
        if not person_tracker[pid]['seen']:
            person_tracker[pid]['age'] = \
                person_tracker[pid].get('age',0)+1

    return result

def analyze_frame(frame):
    proc    = preprocess_frame(frame)
    ph, pw  = proc.shape[:2]
    oh, ow  = frame.shape[:2]
    sx, sy  = ow/pw, oh/ph
    rgb     = cv2.cvtColor(proc, cv2.COLOR_BGR2RGB)

    # Robust detection — try boosted if no faces
    face_res = face_mesh.process(rgb)
    if not face_res.multi_face_landmarks:
        boosted = cv2.convertScaleAbs(
            cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR),
            alpha=1.3, beta=15)
        face_res = face_mesh.process(
            cv2.cvtColor(boosted, cv2.COLOR_BGR2RGB))

    hand_res  = hands.process(rgb)
    hand_list = hand_res.multi_hand_landmarks or []

    bboxes  = []
    persons = []

    if face_res.multi_face_landmarks:
        for face in face_res.multi_face_landmarks:
            x1,y1,x2,y2 = get_face_bbox(face, ph, pw)
            bboxes.append((
                int(x1*sx), int(y1*sy),
                int(x2*sx), int(y2*sy)
            ))

    for idx, face in enumerate(
            face_res.multi_face_landmarks or []):
        x1,y1,x2,y2 = bboxes[idx]
        viols = []

        # Calculate face height dynamically for scale-invariant distance checking
        forehead = face.landmark[10]
        chin = face.landmark[152]
        face_height_px = abs(forehead.y - chin.y) * ph

        if not check_mask(face, proc, ph, pw, face_height_px):
            viols.append("No Mouth Mask")

        matched_hands = [
            hl for hi,hl in enumerate(hand_list)
            if match_hand_to_face(hl,bboxes,oh,ow)==idx
        ]
        if matched_hands:
            if check_nose_touch(face, matched_hands, ph, pw, face_height_px):
                viols.append("Nose Touching")
            if check_hair_touch(face, matched_hands, ph, pw, face_height_px):
                viols.append("Hair Touching")
            if not check_gloves(matched_hands, frame, oh, ow):
                viols.append("No Hand Gloves")

        viols = smooth_violations(idx, viols)
        persons.append({
            "id":         idx+1,
            "bbox":       [x1,y1,x2,y2],
            "violations": viols,
            "status":     "VIOLATION" if viols else "CLEAR"
        })

    persons = update_tracker(persons, pw)
    return {"total_persons": len(persons), "persons": persons}
