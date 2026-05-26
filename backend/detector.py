import cv2
import mediapipe as mp
import numpy as np
import logging

# Configure logging for debugging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

mp_face_mesh = mp.solutions.face_mesh
mp_hands = mp.solutions.hands
mp_face_detection = mp.solutions.face_detection

face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=2,  # REDUCED from 5 to 2
    min_detection_confidence=0.75,  # INCREASED from 0.7
    min_tracking_confidence=0.75
)
hands_detector = mp_hands.Hands(
    max_num_hands=2,  # REDUCED from 4 to 2
    min_detection_confidence=0.8,  # INCREASED from 0.75
    min_tracking_confidence=0.8
)

# ─── MASK DETECTION ────────────────────────────────────────────────
MOUTH_LANDMARKS = [61, 291, 0, 17, 269, 270, 409, 291, 375, 321, 405, 314]
UPPER_LIP = [13, 312, 311, 310, 415, 308]
LOWER_LIP = [14, 317, 402, 318, 324, 308]

def check_mask(face_landmarks, frame_h, frame_w):
    """
    Returns True if NO mask detected (violation).
    STRICTER: Requires mouth span > 16% of face height (was 12%)
    """
    try:
        # Get upper and lower lip y-positions
        upper_y = np.mean([face_landmarks.landmark[i].y * frame_h for i in UPPER_LIP])
        lower_y = np.mean([face_landmarks.landmark[i].y * frame_h for i in LOWER_LIP])
        mouth_vertical_span = abs(lower_y - upper_y)

        # Get nose tip and chin for face scale reference
        nose_y = face_landmarks.landmark[1].y * frame_h
        chin_y = face_landmarks.landmark[152].y * frame_h
        face_height = abs(chin_y - nose_y)

        if face_height < 1:
            return False  # Can't determine, skip

        # Mouth span relative to face height
        ratio = mouth_vertical_span / face_height

        # STRICTER: > 16% required (was 12%)
        no_mask = ratio > 0.16
        
        if no_mask:
            logger.debug(f"[MASK] Bare mouth detected - ratio: {ratio:.3f}")
        
        return no_mask
    except Exception as e:
        logger.error(f"[MASK] Error: {e}")
        return False


# ─── NOSE TOUCH DETECTION ─────────────────────────────────────────
NOSE_TIP = 4

def check_nose_touching(face_landmarks, hand_landmarks_list, frame_h, frame_w):
    """
    Returns True only if 2+ FINGERTIPS are within 12% of nose-to-chin distance.
    STRICTER: Requires 2 fingertips (was 1), 12% threshold (was 18%)
    """
    try:
        # Nose tip position
        nose = face_landmarks.landmark[NOSE_TIP]
        nx = nose.x * frame_w
        ny = nose.y * frame_h

        # Face scale reference: distance from nose to chin
        chin = face_landmarks.landmark[152]
        chin_y = chin.y * frame_h
        face_scale = abs(chin_y - ny)

        # Threshold: 12% of nose-to-chin distance (was 18%)
        threshold = face_scale * 0.12
        threshold = max(threshold, 20)  # minimum 20px

        fingertip_count = 0
        FINGERTIPS = [4, 8, 12, 16, 20]

        for hand in hand_landmarks_list:
            for tip_idx in FINGERTIPS:
                lm = hand.landmark[tip_idx]
                hx = lm.x * frame_w
                hy = lm.y * frame_h
                dist = np.sqrt((hx - nx)**2 + (hy - ny)**2)
                if dist < threshold:
                    fingertip_count += 1

        # Requires 2+ fingertips in proximity (was 1)
        detected = fingertip_count >= 2
        if detected:
            logger.debug(f"[NOSE] {fingertip_count} fingertips at nose distance: {threshold:.1f}px")
        return detected
    except Exception as e:
        logger.error(f"[NOSE] Error: {e}")
        return False


# ─── HAIR TOUCH DETECTION ─────────────────────────────────────────
FOREHEAD_LANDMARKS = [10, 67, 109, 338, 297]

def check_hair_touching(face_landmarks, hand_landmarks_list, frame_h, frame_w):
    """
    Returns True only if 3+ FINGERTIPS are ABOVE forehead (in hair zone).
    STRICTER: Requires 3 fingertips (was 1), 30px offset (was 10px)
    """
    try:
        # Average forehead y position
        forehead_ys = [face_landmarks.landmark[i].y * frame_h for i in FOREHEAD_LANDMARKS]
        forehead_y = np.mean(forehead_ys)

        # Face width for horizontal bounding
        left_x = face_landmarks.landmark[234].x * frame_w
        right_x = face_landmarks.landmark[454].x * frame_w
        face_width = abs(right_x - left_x)
        margin = face_width * 0.4  # 40% margin (was 30%)

        FINGERTIPS = [4, 8, 12, 16, 20]
        fingertip_count = 0

        for hand in hand_landmarks_list:
            for tip_idx in FINGERTIPS:
                lm = hand.landmark[tip_idx]
                hx = lm.x * frame_w
                hy = lm.y * frame_h

                # Must be ABOVE forehead (30px, was 10px)
                above_forehead = hy < (forehead_y - 30)
                within_face_width = (left_x - margin) < hx < (right_x + margin)

                if above_forehead and within_face_width:
                    fingertip_count += 1

        # Requires 3+ fingertips (was 1)
        detected = fingertip_count >= 3
        if detected:
            logger.debug(f"[HAIR] {fingertip_count} fingertips above forehead")
        return detected
    except Exception as e:
        logger.error(f"[HAIR] Error: {e}")
        return False


# ─── GLOVE DETECTION ────────────────────────────────────────��─────
def check_gloves(hand_landmarks_list, frame, frame_h, frame_w):
    """
    Returns True if gloves ARE worn (safe).
    Returns False if bare skin detected (violation).
    STRICTER: 0.45 skin threshold (was 0.35), 75% majority (was 60%)
    """
    if not hand_landmarks_list:
        return True  # No hands visible → no violation

    PALM_SAMPLE_LANDMARKS = [0, 5, 9, 13, 17]

    try:
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

                # Multi-range skin detection
                lower1 = np.array([0, 30, 60])
                upper1 = np.array([15, 170, 255])
                lower2 = np.array([160, 30, 60])
                upper2 = np.array([180, 170, 255])

                mask1 = cv2.inRange(hsv, lower1, upper1)
                mask2 = cv2.inRange(hsv, lower2, upper2)
                combined = cv2.bitwise_or(mask1, mask2)

                skin_ratio = np.sum(combined > 0) / combined.size
                total_samples += 1
                # STRICTER: 0.45 threshold (was 0.35)
                if skin_ratio > 0.45:
                    skin_hits += 1

            if total_samples == 0:
                continue

            # STRICTER: 75% majority (was 60%)
            skin_ratio = skin_hits / total_samples
            if skin_ratio > 0.75:
                logger.debug(f"[GLOVES] Bare skin detected - {skin_ratio*100:.1f}% skin")
                return False  # No gloves — violation

        return True  # Gloves detected or uncertain → safe
    except Exception as e:
        logger.error(f"[GLOVES] Error: {e}")
        return True


# ─── DEBOUNCE / STABILITY SYSTEM ──────────────────────────────────
VIOLATION_BUFFER = {}
REQUIRED_FRAMES = 6  # INCREASED from 4 to 6 (200ms at 30fps)

def stabilize_violations(new_violations):
    """
    Only return a violation if detected for REQUIRED_FRAMES consecutive frames.
    STRICTER: 6 frames (200ms) required (was 4 frames / 133ms)
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
        buffer_count = VIOLATION_BUFFER.get(v["type"], 0)
        if buffer_count >= REQUIRED_FRAMES:
            stable.append(v)
            logger.debug(f"[STABLE] {v['type']} confirmed ({buffer_count}/{REQUIRED_FRAMES})")

    return stable


# ─── MAIN ANALYSIS ────────────────────────────────────────────────
def analyze_frame(frame):
    """
    Main entry point. Returns stable, confirmed violations only.
    Includes comprehensive error handling.
    """
    violations = []
    
    try:
        # Frame validation
        if frame is None or frame.size == 0:
            logger.warning("[FRAME] Invalid frame received")
            return []
        
        h, w = frame.shape[:2]
        if h < 100 or w < 100:
            logger.warning(f"[FRAME] Frame too small: {w}x{h}")
            return []
        
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        face_results = face_mesh.process(rgb)
        hand_results = hands_detector.process(rgb)
        
        hand_landmarks_list = hand_results.multi_hand_landmarks or []
        
        if face_results.multi_face_landmarks:
            for face_idx, face in enumerate(face_results.multi_face_landmarks):
                
                # MASK CHECK
                if check_mask(face, h, w):
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
        
    except Exception as e:
        logger.error(f"[ANALYZE] Fatal error: {e}")
        return []
    
    # Run through stability filter
    stable = stabilize_violations(violations)
    
    if stable:
        logger.info(f"[VIOLATIONS] {len(stable)} confirmed: {[v['type'] for v in stable]}")
    
    return stable
