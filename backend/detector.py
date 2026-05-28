import mediapipe as mp
import cv2
import numpy as np

mp_face_mesh = mp.solutions.face_mesh
mp_hands = mp.solutions.hands


face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=5,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.7
)
hands_detector = mp_hands.Hands(
    max_num_hands=2,
    min_detection_confidence=0.50,
    min_tracking_confidence=0.50,
    model_complexity=1
)

# ─── MASK DETECTION ────────────────────────────────────────────────
# Uses mouth landmark spread AND lip visibility to confirm no mask
MOUTH_LANDMARKS = [61, 291, 0, 17, 269, 270, 409, 291, 375, 321, 405, 314]
UPPER_LIP = [13, 312, 311, 310, 415, 308]
LOWER_LIP = [14, 317, 402, 318, 324, 308]

def check_mask(face_landmarks, frame, frame_h, frame_w):
    """
    Returns True if NO mask is worn (violation).
    Returns False if mask IS worn (safe).
    
    Logic: Samples a precise bounding box tightly focused on the mouth region.
    If the mouth region contains skin colors, no mask is worn.
    If skin color ratio is low, it indicates a mask is covering the mouth.
    """
    # Mouth center landmark (0 or 13)
    lm_mouth = face_landmarks.landmark[13]
    cx = int(lm_mouth.x * frame_w)
    cy = int(lm_mouth.y * frame_h)
    
    # Face width for reference size
    left_x = face_landmarks.landmark[234].x * frame_w
    right_x = face_landmarks.landmark[454].x * frame_w
    face_width = abs(right_x - left_x)
    
    # Tighter ROI focused strictly on the mouth to prevent cheek/chin skin leakage
    rw = int(face_width * 0.12)
    rh = int(face_width * 0.06)
    
    # Bounds check
    min_x = max(0, cx - rw)
    max_x = min(frame_w - 1, cx + rw)
    min_y = max(0, cy - rh)
    max_y = min(frame_h - 1, cy + rh)
    
    if (max_x - min_x) < 5 or (max_y - min_y) < 5:
        return False  # Uncertain, skip
        
    mouth_roi = frame[min_y:max_y+1, min_x:max_x+1]
    if mouth_roi.size == 0:
        return False
        
    # Convert to HSV
    hsv = cv2.cvtColor(mouth_roi, cv2.COLOR_BGR2HSV)
    
    # Robust dual skin tone HSV thresholds (fully inclusive of all skin tones and lighting conditions)
    lower1 = np.array([0, 15, 40])
    upper1 = np.array([20, 255, 255])
    lower2 = np.array([160, 15, 40])
    upper2 = np.array([180, 255, 255])
    
    mask1 = cv2.inRange(hsv, lower1, upper1)
    mask2 = cv2.inRange(hsv, lower2, upper2)
    combined = cv2.bitwise_or(mask1, mask2)
    
    skin_ratio = np.sum(combined > 0) / combined.size
    
    # Telemetry logging to diagnose detection threshold
    print(f"[Telemetry] Mouth Skin Ratio: {skin_ratio:.3f} | No Mask Detected: {skin_ratio > 0.25}")
    
    # If skin ratio is high (> 25%), skin is exposed -> NO mask (True = violation)
    # If skin ratio is low (< 25%), mouth is covered by a mask -> Mask worn (False = safe)
    no_mask = skin_ratio > 0.25
    return no_mask


# ─── NOSE TOUCH DETECTION ─────────────────────────────────────────
NOSE_TIP = 4
NOSE_BRIDGE_LANDMARKS = [1, 2, 4, 5, 6, 19, 20, 94, 195, 197]

def check_nose_touching(face_landmarks, hand_landmarks_list, frame_h, frame_w):
    """
    Returns True if 1 or more fingertips are within the scale-invariant proximity threshold of the nose tip.
    Uses nose tip (landmark 4) as anchor.
    """
    # Nose tip position
    nose = face_landmarks.landmark[NOSE_TIP]
    nx = nose.x * frame_w
    ny = nose.y * frame_h

    # Face scale reference: face width (distance between landmarks 234 and 454)
    left_x = face_landmarks.landmark[234].x * frame_w
    right_x = face_landmarks.landmark[454].x * frame_w
    face_width = abs(right_x - left_x)

    # Proximity threshold: 22% of face width (highly robust and standard)
    threshold = face_width * 0.22

    FINGERTIPS = [4, 8, 12, 16, 20]
    for hand in hand_landmarks_list:
        for tip_idx in FINGERTIPS:
            lm = hand.landmark[tip_idx]
            hx = lm.x * frame_w
            hy = lm.y * frame_h
            dist = np.sqrt((hx - nx)**2 + (hy - ny)**2)
            if dist < threshold:
                return True  # Responsive single-finger nose touch confirmation
    return False


# ─── HAIR TOUCH DETECTION ─────────────────────────────────────────
FOREHEAD_LANDMARKS = [10, 67, 109, 338, 297]  # Top of head region

def check_hair_touching(face_landmarks, hand_landmarks_list, frame_h, frame_w):
    """
    Returns True if 1 or more fingertips are in the hair/scalp zone.
    Uses forehead landmark y with a scale-invariant threshold as the boundary.
    """
    # Average forehead y position
    forehead_ys = [face_landmarks.landmark[i].y * frame_h for i in FOREHEAD_LANDMARKS]
    forehead_y = np.mean(forehead_ys)

    # Face width for scale-invariant thresholds
    left_x = face_landmarks.landmark[234].x * frame_w
    right_x = face_landmarks.landmark[454].x * frame_w
    face_width = abs(right_x - left_x)
    margin = face_width * 0.4  # Widen search horizontal margin to 40% to catch side hair touches
    
    # Scale-invariant vertical tolerance (allows touching upper forehead/hairline)
    tolerance = face_width * 0.15

    FINGERTIPS = [4, 8, 12, 16, 20]
    hair_touch_count = 0

    for hand in hand_landmarks_list:
        for tip_idx in FINGERTIPS:
            lm = hand.landmark[tip_idx]
            hx = lm.x * frame_w
            hy = lm.y * frame_h

            # Hand must be ABOVE the forehead boundary (with vertical tolerance)
            # and horizontally within the width of the face plus margin
            above_forehead = hy < (forehead_y + tolerance)
            within_face_width = (left_x - margin) < hx < (right_x + margin)

            if above_forehead and within_face_width:
                hair_touch_count += 1
                if hair_touch_count >= 1:
                    return True  # Responsive single-finger hair touch confirmation
    return False


# ─── GLOVE DETECTION ──────────────────────────────────────────────
def check_gloves(hand_landmarks_list, frame, frame_h, frame_w):
    """
    Returns True if gloves ARE worn (safe).
    Returns False if bare skin detected (violation).
    
    Samples palm center + multiple points.
    Uses HSV skin detection with strict thresholds.
    Only flags violation if majority of samples show skin.
    """
    if not hand_landmarks_list:
        return True  # No hands visible → no violation

    PALM_SAMPLE_LANDMARKS = [0, 5, 9, 13, 17]  # Wrist + knuckle base points

    for hand in hand_landmarks_list:
        skin_hits = 0
        total_samples = 0

        for lm_idx in PALM_SAMPLE_LANDMARKS:
            lm = hand.landmark[lm_idx]
            cx = int(lm.x * frame_w)
            cy = int(lm.y * frame_h)

            # Bounds check
            if not (20 < cx < frame_w - 20 and 20 < cy < frame_h - 20):
                continue

            # Sample 20x20 patch
            patch = frame[cy-10:cy+10, cx-10:cx+10]
            if patch.size == 0:
                continue

            hsv = cv2.cvtColor(patch, cv2.COLOR_BGR2HSV)

            # Multi-range skin detection (covers different skin tones)
            lower1 = np.array([0, 30, 60])
            upper1 = np.array([15, 170, 255])
            lower2 = np.array([160, 30, 60])
            upper2 = np.array([180, 170, 255])

            mask1 = cv2.inRange(hsv, lower1, upper1)
            mask2 = cv2.inRange(hsv, lower2, upper2)
            combined = cv2.bitwise_or(mask1, mask2)

            skin_ratio = np.sum(combined > 0) / combined.size
            total_samples += 1
            if skin_ratio > 0.45:  # Stricter skin threshold
                skin_hits += 1

        if total_samples == 0:
            continue

        # Only flag if majority (>70%) of samples show skin
        if skin_hits / total_samples > 0.7:
            return False  # No gloves — violation

    return True  # Gloves detected or uncertain → safe


# ─── DEBOUNCE / STABILITY SYSTEM ──────────────────────────────────
# Prevents flicker: violation must appear in N consecutive frames

VIOLATION_BUFFER = {}
REQUIRED_FRAMES = 6  # Must detect for 6 frames in a row

def stabilize_violations(new_violations):
    """
    Only return a violation if it has been detected for REQUIRED_FRAMES
    consecutive frames. Clears count if not detected in a frame.
    """
    global VIOLATION_BUFFER
    current_types = {v["type"] for v in new_violations}

    # Increment counts for detected, reset for non-detected
    all_known = set(VIOLATION_BUFFER.keys()) | current_types
    for vtype in all_known:
        if vtype in current_types:
            VIOLATION_BUFFER[vtype] = VIOLATION_BUFFER.get(vtype, 0) + 1
        else:
            VIOLATION_BUFFER[vtype] = 0

    # Only pass through violations that have been stable
    stable = []
    for v in new_violations:
        if VIOLATION_BUFFER.get(v["type"], 0) >= REQUIRED_FRAMES:
            stable.append(v)

    return stable


# ─── MAIN ANALYSIS ────────────────────────────────────────────────
def analyze_frame(frame):
    """
    Main entry point. Returns stable, confirmed violations only.
    """
    violations = []
    h, w = frame.shape[:2]
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    face_results = face_mesh.process(rgb)
    hand_results = hands_detector.process(rgb)

    hand_landmarks_list = hand_results.multi_hand_landmarks or []

    if face_results.multi_face_landmarks:
        for face in face_results.multi_face_landmarks:

            # MASK CHECK
            if check_mask(face, frame, h, w):
                violations.append({"type": "No Mouth Mask", "confidence": 0.91})

            # NOSE TOUCH — only if hands are present
            if hand_landmarks_list:
                if check_nose_touching(face, hand_landmarks_list, h, w):
                    violations.append({"type": "Nose Touching", "confidence": 0.88})

                # HAIR TOUCH — only if hands are present
                if check_hair_touching(face, hand_landmarks_list, h, w):
                    violations.append({"type": "Hair Touching", "confidence": 0.85})

    # GLOVES CHECK — only if hands are visible
    if hand_landmarks_list:
        if not check_gloves(hand_landmarks_list, frame, h, w):
            violations.append({"type": "No Hand Gloves", "confidence": 0.82})

    # Run through stability filter
    return stabilize_violations(violations)
