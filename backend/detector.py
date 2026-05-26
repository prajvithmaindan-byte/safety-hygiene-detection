import cv2
import mediapipe as mp
import numpy as np

# Initialize MediaPipe solutions
mp_face_mesh = mp.solutions.face_mesh
mp_hands = mp.solutions.hands

# Lowered detection/tracking confidence to 0.4 to prevent tracking dropouts when hands overlap/occlude the face
# Enabled high-accuracy hand model complexity=1 for precise structural tracking during overlap
face_mesh = mp_face_mesh.FaceMesh(max_num_faces=2, min_detection_confidence=0.4, min_tracking_confidence=0.4, refine_landmarks=False)
hands = mp_hands.Hands(max_num_hands=2, min_detection_confidence=0.4, min_tracking_confidence=0.4, model_complexity=1)

# Landmarking indices for face features
NOSE_INDICES = [1, 2, 168, 4, 195, 5, 6, 197, 195, 5]
MOUTH_INDICES = [13, 14, 78, 308, 80, 310, 82, 312]
HAIR_INDICES = [10, 338, 297, 332, 284]

def check_mask(face_landmarks, frame, frame_h, frame_w):
    """
    Evaluates mask compliance strictly by skin/lip tone ratio in the nose region.
    No movement, motion, or compression heuristics.
    
    Returns:
      - "Mask Under Nose" if nose tip is exposed (skin ratio >= 0.50)
      - None if nose is covered
    """
    # Define skin tone bounds in HSV
    lower_skin_1 = np.array([0, 28, 50])
    upper_skin_1 = np.array([25, 255, 255])
    lower_skin_2 = np.array([165, 28, 50])
    upper_skin_2 = np.array([180, 255, 255])

    # EVALUATE NOSE TIP REGION ONLY
    # Landmark 1 is the nose tip. Tightly center around it to avoid the exposed upper nose bridge.
    lm_nose = face_landmarks.landmark[1]
    cx_nose, cy_nose = int(lm_nose.x * frame_w), int(lm_nose.y * frame_h)
    
    # 2.5% of width and 3.5% of height covers the nose tip safely on a 720p frame (~64x50 px)
    radius_x = max(10, int(frame_w * 0.025))
    radius_y = max(10, int(frame_h * 0.035))
    
    min_nx = max(0, cx_nose - radius_x)
    max_nx = min(frame_w - 1, cx_nose + radius_x)
    min_ny = max(0, cy_nose - radius_y)
    max_ny = min(frame_h - 1, cy_nose + radius_y)
    
    nose_roi = frame[min_ny:max_ny+1, min_nx:max_nx+1]
    
    skin_ratio_nose = 0.0
    is_nose_covered = True
    if nose_roi.size > 0:
        hsv_nose = cv2.cvtColor(nose_roi, cv2.COLOR_BGR2HSV)
        mask1_nose = cv2.inRange(hsv_nose, lower_skin_1, upper_skin_1)
        mask2_nose = cv2.inRange(hsv_nose, lower_skin_2, upper_skin_2)
        skin_mask_nose = cv2.bitwise_or(mask1_nose, mask2_nose)
        skin_ratio_nose = np.sum(skin_mask_nose > 0) / skin_mask_nose.size
        is_nose_covered = skin_ratio_nose < 0.50

    # Print real-time telemetry console logs for monitoring
    print(f"[Telemetry] Nose Skin Ratio: {skin_ratio_nose:.2f}")

    if not is_nose_covered:
        return "Mask Under Nose"

    # Nose covered -> fully compliant
    return None

def get_face_width(face_landmarks, frame_w, frame_h):
    """Calculate horizontal width of the face between outer edges (landmarks 234 and 454)"""
    p1 = face_landmarks.landmark[234]
    p2 = face_landmarks.landmark[454]
    x1, y1 = p1.x * frame_w, p1.y * frame_h
    x2, y2 = p2.x * frame_w, p2.y * frame_h
    return np.sqrt((x2 - x1)**2 + (y2 - y1)**2)

def check_nose_touching(face_landmarks, hand_landmarks, frame_h, frame_w):
    """Check if any fingertip is touching or extremely close to the nose tip (scale-invariant threshold)"""
    face_width = get_face_width(face_landmarks, frame_w, frame_h)
    nose = face_landmarks.landmark[1]
    nx, ny = nose.x * frame_w, nose.y * frame_h
    
    # Fingertip indices in MediaPipe Hands: Thumb(4), Index(8), Middle(12), Ring(16), Pinky(20)
    fingertips = [4, 8, 12, 16, 20]
    
    # Scale-invariant proximity threshold (8% of face width for high accuracy)
    threshold = 0.08 * face_width
    
    for hand in hand_landmarks:
        for idx in fingertips:
            lm = hand.landmark[idx]
            hx, hy = lm.x * frame_w, lm.y * frame_h
            dist = np.sqrt((hx - nx)**2 + (hy - ny)**2)
            if dist < threshold:
                return True
    return False

def check_hair_touching(face_landmarks, hand_landmarks, frame_h, frame_w):
    """Check if any fingertip is touching or extremely close to the hair/forehead landmarks"""
    face_width = get_face_width(face_landmarks, frame_w, frame_h)
    
    # Fingertip indices in MediaPipe Hands: Thumb(4), Index(8), Middle(12), Ring(16), Pinky(20)
    fingertips = [4, 8, 12, 16, 20]
    
    # Forehead / hairline landmarks
    hair_landmarks = [10, 338, 297, 332, 284]
    
    # Scale-invariant proximity threshold (10% of face width for high accuracy)
    threshold = 0.10 * face_width
    
    for hand in hand_landmarks:
        for idx in fingertips:
            lm = hand.landmark[idx]
            hx, hy = lm.x * frame_w, lm.y * frame_h
            
            # Check proximity to any forehead/hair landmark
            for hair_idx in hair_landmarks:
                hair_lm = face_landmarks.landmark[hair_idx]
                hair_x, hair_y = hair_lm.x * frame_w, hair_lm.y * frame_h
                dist = np.sqrt((hx - hair_x)**2 + (hy - hair_y)**2)
                if dist < threshold:
                    return True
    return False

def check_gloves(hand_landmarks, frame, frame_h, frame_w):
    """Check skin color in hand region — gloves = non-skin color"""
    if not hand_landmarks:
        return True  # No hands = no glove check needed
    
    for hand in hand_landmarks:
        # Sample palm region color
        palm = hand.landmark[9]
        cx, cy = int(palm.x * frame_w), int(palm.y * frame_h)
        if 0 < cx < frame_w and 0 < cy < frame_h:
            region = frame[max(0,cy-15):cy+15, max(0,cx-15):cx+15]
            if region.size == 0:
                continue
            hsv = cv2.cvtColor(region, cv2.COLOR_BGR2HSV)
            # Skin tone HSV range
            lower_skin = np.array([0, 20, 70])
            upper_skin = np.array([20, 255, 255])
            mask = cv2.inRange(hsv, lower_skin, upper_skin)
            skin_ratio = np.sum(mask > 0) / mask.size
            if skin_ratio > 0.25:  # Mostly skin = no gloves
                return False
    return True

def analyze_frame(frame):
    """Main analysis function — returns list of violations"""
    violations = []
    h, w = frame.shape[:2]
    
    # Downscale image to 640x360 to significantly boost inference speed
    small_w, small_h = 640, 360
    small_frame = cv2.resize(frame, (small_w, small_h))
    rgb = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)
    
    face_results = face_mesh.process(rgb)
    hand_results = hands.process(rgb)
    
    hand_landmarks_list = hand_results.multi_hand_landmarks or []
    
    if face_results.multi_face_landmarks:
        for face in face_results.multi_face_landmarks:
            mask_violation = check_mask(face, frame, h, w)
            if mask_violation == "Mask Under Nose":
                violations.append({"type": "Mask Under Nose", "confidence": 0.89})
            
            if hand_landmarks_list:
                if check_nose_touching(face, hand_landmarks_list, h, w):
                    violations.append({"type": "Nose Touching", "confidence": 0.88})
                if check_hair_touching(face, hand_landmarks_list, h, w):
                    violations.append({"type": "Hair Touching", "confidence": 0.85})
    
    if hand_landmarks_list:
        if not check_gloves(hand_landmarks_list, frame, h, w):
            violations.append({"type": "No Hand Gloves", "confidence": 0.82})
    
    # De-duplicate violations by type to prevent multiple identical alerts (e.g. from multiple faces)
    unique_violations = []
    seen = set()
    for v in violations:
        if v["type"] not in seen:
            seen.add(v["type"])
            unique_violations.append(v)
            
    return unique_violations
