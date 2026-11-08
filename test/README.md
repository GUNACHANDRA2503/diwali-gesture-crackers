# Test pages

| Page | What it does |
|---|---|
| `../gestures.test.mjs` | Unit tests for the gesture rules (`node gestures.test.mjs` from the project root). Synthetic hands: clear, sloppy and "must not trigger" cases. |
| `index.html` | Runs the real MediaPipe hand tracker + gesture rules on still frames and reports which gesture each frame was read as. |
| `fakecam.html` | Runs the full app with a fake webcam that plays still frames, e.g. `fakecam.html?debug&f=02.2,07.0` (cycles every 3 s). `?debug` adds `window.diwaliDebug` to fire effects by hand and labels above each hand. `&src=<url>/` runs a deployed copy of the app instead of the local one. |

## Frames

`frames/` is **not in the repository**: the frames came from a personal reference video. To use the two
frame-based pages, put your own JPGs in `test/frames/` named by timestamp (`02.2.jpg`, `07.0.jpg`, ...) and
adjust the expected gestures in `index.html`. `extract_frames.py` pulls frames out of any video:

```bash
pip install opencv-python-headless
python test/extract_frames.py my-video.mp4 test/frames 0.6,2.2,5.0,7.0
```
