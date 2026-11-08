# Save frames from a video at given timestamps (seconds) as <out>/<ss.s>.jpg for the test pages.
# Usage: python test/extract_frames.py video.mp4 test/frames 0.6,2.2,5.0
import os, sys
import cv2

video, out, times = sys.argv[1], sys.argv[2], [float(t) for t in sys.argv[3].split(",")]
os.makedirs(out, exist_ok=True)
cap = cv2.VideoCapture(video)
fps = cap.get(cv2.CAP_PROP_FPS) or 30
for t in times:
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
    ok, frame = cap.read()
    if not ok:
        print(f"no frame at {t}s"); continue
    cv2.imwrite(os.path.join(out, "%04.1f.jpg" % t), frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
    print(f"saved {t}s")
