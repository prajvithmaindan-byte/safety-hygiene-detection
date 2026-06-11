import cv2
print("Testing all camera indices...")
for i in range(5):
    cap = cv2.VideoCapture(i)
    if cap.isOpened():
        ret, frame = cap.read()
        if ret and frame is not None:
            print(f"  Index {i}: WORKS! Resolution: {frame.shape[1]}x{frame.shape[0]}")
        else:
            print(f"  Index {i}: Opens but cannot read frames")
        cap.release()
    else:
        print(f"  Index {i}: Cannot open")

print("\nTesting with CAP_DSHOW...")
for i in range(5):
    cap = cv2.VideoCapture(i, cv2.CAP_DSHOW)
    if cap.isOpened():
        ret, frame = cap.read()
        if ret and frame is not None:
            print(f"  Index {i} (DSHOW): WORKS! Resolution: {frame.shape[1]}x{frame.shape[0]}")
        else:
            print(f"  Index {i} (DSHOW): Opens but cannot read frames")
        cap.release()
    else:
        print(f"  Index {i} (DSHOW): Cannot open")
