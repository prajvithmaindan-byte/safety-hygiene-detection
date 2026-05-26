import cv2
import numpy as np
import sys
import os

# Append current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from detector import analyze_frame, REQUIRED_FRAMES

def run_tests():
    print("="*60)
    print("HYGIENEGUARD DETECTION SYSTEM UNIT TESTS")
    print("="*60)

    # Verify frame stability frames threshold configuration
    print(f"[Config] Stability frames REQUIRED_FRAMES: {REQUIRED_FRAMES}")
    assert REQUIRED_FRAMES == 6, f"Expected 6 stability frames, got {REQUIRED_FRAMES}"
    print("[Config] [OK] Stability frames configured correctly")

    # Test 1: Empty frame (should return no violations immediately)
    h, w = 480, 640
    test_frame = np.zeros((h, w, 3), dtype=np.uint8)
    cv2.putText(test_frame, "Neutral Test Frame", (50, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
    
    print("[Test 1] Running empty frame detection...")
    violations = analyze_frame(test_frame)
    print(f"[Test 1] Result: {violations}")
    assert len(violations) == 0, f"Expected 0 violations, got {violations}"
    print("[Test 1] [OK] Neutral frame successfully evaluated as SAFE")

    # Test 2: Invalid/corrupt frames should be handled gracefully by calling function
    print("[Test 2] Verifying dummy frame analyze_frame execution...")
    try:
        dummy_small = np.zeros((10, 10, 3), dtype=np.uint8)
        analyze_frame(dummy_small)
        print("[Test 2] [OK] Evaluated small dummy frame successfully")
    except Exception as e:
        print(f"[Test 2] Failed: {e}")
        sys.exit(1)

    print("="*60)
    print("ALL TESTS PASSED SUCCESSFULLY!")
    print("="*60)

if __name__ == "__main__":
    run_tests()
