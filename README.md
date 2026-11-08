# 🪔 Diwali Crackers: light fireworks with your hands

**▶ Live: https://gunachandra2503.github.io/diwali-gesture-crackers/** (allow the camera, then show a gesture)

Crackers that pollute neither the air nor your ears: show a hand gesture to your webcam and Diwali
fireworks burst from your fingers in real time. Everything runs in your browser, with no sign-up, no
upload and no server.

**By Gunachandra Devasani:** [Instagram @guna_71810](https://www.instagram.com/guna_71810/) ·
[LinkedIn](https://www.linkedin.com/in/gunachandra-d-855611206/)

## Gestures

| Gesture | Cracker | What happens |
|---|---|---|
| ☝️ Point up | **Rocket** | Launches from your fingertip (tilt to aim). Five shell types take turns: peony, crackle, willow, ring, crossette |
| ✊ Fist | **Anar** | A flower-pot fountain that builds up, with a white-hot jet, a gold bloom and crackling stars |
| ✋ Open palm | **Starburst** | Sparks are pulled into your palm, then it releases a star-shaped blast with a shockwave |
| ✌️ Peace | **Roman Candle** | Fires coloured stars where your V points; each splits four ways and pops |
| 👌 Pinch | **Phooljhadi** | A sparkler that follows your fingers and paints light trails |
| 🙏 Namaste | **Grand Finale** | A rising flame, ground fountains, rocket volleys, sky lanterns and the HAPPY DIWALI banner |

Both hands work at once. Recognition ignores everyday movements like rubbing your nose, scratching
your head or adjusting your glasses. Sound is synthesized live and modelled on a real recording.

## Tech

- **Plain HTML + ES modules, no build step and no npm dependencies.** The whole app is `index.html`, `app.js` and `gestures.js` (~70 KB).
- [MediaPipe Tasks Vision](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker) `0.10.14` (hand landmarker + face detector), loaded from jsDelivr with the models from Google's model CDN.
- Canvas 2D with additive blending for every effect, plus a pooled particle system (one fixed pool, no per-frame allocation).
- Web Audio API for all sound (no audio files), through a compressor with a voice limit.

```
index.html          page, layout, gesture bar, guide, about card, banner (CSS inline)
app.js              camera, tracking loop, gesture state machine, effects, finale, sound, recording
gestures.js         pure landmark -> gesture rules (unit-tested)
gestures.test.mjs   node tests for the gesture rules
serve-https.py      local HTTPS server for testing on a phone over Wi-Fi
test/               tracker / fake-camera test pages (see test/README.md)
docs/               reference-video analysis, design decisions, test log
```

## Run locally

The camera only works on `https://` or `http://localhost`, so serve the folder (opening `index.html`
as a file won't work).

```bash
python -m http.server 5173
```
Then open http://localhost:5173 and allow the camera. Any static server works, e.g. `npx serve .`.

**Debug view:** add `?debug` to the URL to see what the recogniser sees above each hand.

**Tests:**
```bash
node gestures.test.mjs
```

### On your phone (same Wi-Fi)
```bash
python serve-https.py
```
It prints `https://<your-pc-ip>:8443`. Open that on the phone and accept the one-time certificate
warning ("Advanced" → "Proceed"). On first run it creates a self-signed certificate in `.cert/` (git-ignored).
Set `HTTPS_PORT` to change the port (see `.env.example`). If the phone can't connect, allow Python
through Windows Firewall for private networks.

## Build

There is nothing to build. The files in the repository root are the production site.

## Deploy

Hosted on **GitHub Pages** from the `main` branch root. Pages serves over HTTPS, which the camera needs.
There are no environment variables or secrets: `.env.example` only documents the optional local port.

To deploy your own copy: fork → *Settings → Pages → Deploy from a branch → `main` / root*.
Any static host works the same way (Netlify, Vercel or Cloudflare Pages with no build command and the
project root as the output directory). No SPA fallback is needed because it's a single page.

## Privacy

Video never leaves your device. Frames go straight from the camera to the in-browser hand tracker.
The camera is released when you switch tabs or leave the page.

## Browser support

Recent Chrome, Edge, Firefox and Safari on desktop and mobile (needs WebAssembly, WebGL and
`getUserMedia`). Sound starts after your first tap or click on the page (a browser rule).
