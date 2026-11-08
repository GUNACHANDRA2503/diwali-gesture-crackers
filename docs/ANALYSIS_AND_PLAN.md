# Diwali Gesture Crackers — Reference Analysis & Implementation Plan

Reference: `WhatsApp Video 2026-11-08 at 07.13.05.mp4` — 14.7 s, 30 fps, 480×854 portrait.
It is a phone recording of a laptop screen running the app in Chrome (on-screen caption:
"POV: Bursting crackers that don't pollute air but tokens"). Analysed at 0.5 s steps plus
0.2–0.3 s steps around every gesture change, with crops of the screen region.

Because the screen is filmed at an angle and blurred, **small UI text is not legible**. Every
place where I had to read through blur is marked **(uncertain)**.

---

## Phase 1 — Reference video analysis

### 1. UI and visual design

| Element | Observation |
|---|---|
| Layout | Single full-screen view. The **mirrored webcam feed fills the whole page** (selfie view); everything else is overlaid. |
| Background | The camera image itself; no separate backdrop. Slight dark **vignette** at the edges. |
| Top-right | Two small pill buttons: a dark one with a speaker icon (**"Sound"**) and a red/pink one (**"Record"**). (labels uncertain, shapes clear) |
| Bottom centre | A **gesture legend bar**: one rounded dark maroon/plum translucent capsule containing **6 pills**. Each pill = yellow emoji-style hand icon + bold white title + small grey sub-label (the gesture). |
| Bottom-right | Tiny yellow text, reads like **"✨ Happy Diwali"** (uncertain). |
| Palette | Effects are dominantly **gold / warm yellow** sparks; aerial bursts also appear in **white, cyan-white, pink/magenta, green**. Additive glow (bright cores blow out to white). |

Legend pills, left → right (titles blurred; best reading + matched against behaviour):

| # | Icon | Title (best reading) | Gesture | Confidence |
|---|---|---|---|---|
| 1 | ☝️ | Rocket | Index finger | High (behaviour clearly matches) |
| 2 | ✊ | Anar | Fist | High |
| 3 | 👌 | Sparkler (Phuljhadi) | Pinch | High |
| 4 | 🖐️ | "…Candle" (Roman Candle?) | Open palm | Medium — gesture certain, name uncertain |
| 5 | ✌️? | unreadable (two short words) | not demonstrated clearly | **Low** |
| 6 | 🙏 | Finale | Namaste (two hands) | High |

### 2. Animations

| Animation | Start | Look | End |
|---|---|---|---|
| **Sparkler** (0.0–1.0 s, 6.0–9.6 s) | Instantly when thumb+index pinch | Bright white-gold core at the pinch point, short radial gold streak-sparks with gravity; as the hand moves it leaves a **glitter trail** of tiny gold dots that drift down and fade over ~1–1.5 s. Works on **both hands at once** (7.0 s: two sparklers, trail strung between them). | Emission stops on release; remaining glitter fades. |
| **Palm burst** (1.3–2.0 s, 9.6–10.2 s) | Open palm facing camera | A **spherical burst of gold radial sparks centred on the palm** (~1 palm-width radius) with a glowing core; at 9.6 s the core is a **coloured glowing orb** (green on one hand, white on the other). Both palms → two bursts. | Fades when palm closes. |
| **Rocket** (2.2–4.9 s) | Index finger pointed up | A thin gold **streak rises from the fingertip** (~0.6–0.8 s flight), then a **chrysanthemum burst** (~150–250 radial spark streaks, gold; later white/cyan) high in the frame, near the finger's x. Bursts expand ~0.5 s, droop under gravity, sparkle and fade ~1.5 s. Several rockets launched in a row while the finger stays/re-points; multiple bursts overlap on screen. | Burst fades out. |
| **Anar** (4.9–5.8 s) | Closed fist | A **flame-like fountain** of gold sparks spraying upward from the top of the fist (cone ~30°, height ≈ 1–1.5 fists), bright warm glow at the base, sparks fall back. | Stops when fist opens. |
| **Finale** (10.4–14.7 s) | Two-hand namaste (palms together) | Sequence: (a) 10.5 s two **bright white orbs** flash at the joined hands with an orange screen glow; (b) 10.7 s two multicolour **bursts at the hands** (pink + gold); (c) 10.9 s a **row of ground fountains** (vertical gold spark columns) rises along the bottom edge across the whole width; (d) 11.5 s+ continuous **aerial bursts all over** in gold, white, pink, green, cyan; whole picture gets a **warm orange/pink tint**; (e) ~12.2 s a centred **"HAPPY DIWALI" banner** fades in: row of **5 diyas** on top, small spaced caps line above the title (reads like "✦ SHUBH DEEPAVALI ✦", uncertain), big gold-gradient serif **HAPPY DIWALI** with glow, small white subtitle "May your world bloom with light, joy & prosperity" (mostly legible). | Still running at video end (≥ 4.3 s). End not shown → **uncertain**; I'll run ~8 s then fade. |
| **Ambient dust** (always) | — | A few tiny white/gold specks drifting slowly across the frame. | Never. |

Simultaneity: yes — sparklers on both hands, two palm bursts, rockets overlapping bursts,
and the finale on top of everything.

### 3. Gestures → animation mapping

| Gesture | Hands | Detection rule | Hold | Repeat |
|---|---|---|---|---|
| Index point ☝️ | 1 (each hand independent) | index extended; middle, ring, pinky curled | launches on onset | another rocket every ~0.9 s while held |
| Fist ✊ | each hand | index–pinky all curled, thumb not touching index tip | continuous fountain | — |
| Pinch 👌 | each hand | thumb tip ↔ index tip distance < ~30 % of hand size | continuous sparkler following the pinch point | — |
| Open palm 🖐️ | each hand | all 4 fingers + thumb extended | continuous palm burst on palm centre | — |
| ✌️ (pill 5) | each hand | index + middle extended, ring + pinky curled | **Not shown in video** — assigned to a **Chakri** (spinning ground wheel), the classic cracker not otherwise covered. Flagged as an assumption. | continuous |
| Namaste 🙏 | 2 | both hands open & fingertips/palms within ~0.6 hand-size of each other | triggers finale once | cooldown until finale ends |

Distinguishing: rules are mutually exclusive by finger state; pinch is checked first
(an OK-sign has fingers extended but the pinch wins, matching the video where 👌 = sparkler).
A gesture must be seen on **3 consecutive frames** before it's accepted (stops flicker
between e.g. fist and point during transitions).

### 4. Application behaviour / user journey
The video starts mid-session, so **start-up is not shown (uncertain)**. Planned flow:
page opens → camera permission requested immediately → mirrored feed fills the screen →
hand model loads (small status text until ready) → gestures work immediately. No clicks are
needed for any effect. Sound and Record are optional toggles (present in reference UI).
If the camera is denied/missing, a clear full-screen message explains how to fix it.

---

## Phase 2 — Technical plan

**Stack (chosen for the actual complexity):** plain HTML + ES modules, no build step.
- **MediaPipe Tasks Vision `HandLandmarker`** (GPU delegate, 2 hands, VIDEO mode) from jsDelivr — current replacement of "MediaPipe Hands".
- **Canvas 2D with additive (`lighter`) compositing** for all effects. Everything in the
  reference is 2D sparks/glow; Three.js and React would add weight with no visual gain.
- **Web Audio** synthesized sounds (no audio files). **MediaRecorder** on `canvas.captureStream()` for Record.

**Files**
- `index.html` — layout, legend bar, buttons, banner, styles.
- `gestures.js` — pure landmark → gesture classifier + namaste check (unit-tested).
- `app.js` — camera, tracker loop, gesture debouncing, particle engine, effects, finale, sound, record.
- `gestures.test.mjs` — node self-check of the classifier with synthetic hands.
- `test.html` — runs the real tracker + classifier on frames taken from the reference video.

**Loop:** `requestAnimationFrame` → if the video has a new frame, `detectForVideo` →
classify each hand → debounce → update per-hand emitters → step particles (dt-based) →
draw mirrored video (object-fit cover) + vignette → draw particles additively.

**Particles:** one pooled array (cap ≈ 7000) of `{x,y,vx,vy,life,max,color,size,drag,g,trail}`;
sparks drawn as short streaks from previous position (motion-blur look), cores as a
pre-rendered radial-gradient glow sprite. Gravity, drag and flicker per type.

**Performance:** tracker runs once per video frame (not per rAF), GPU delegate; particle
cap; canvas at device pixel ratio capped at 1.5; no allocations in the hot loop beyond the pool.

**Testing:** (1) node classifier test; (2) run tracker on reference-video frames and check
each frame's detected gesture matches the table above; (3) load app in browser, check
console and that the model loads; (4) live-webcam check by the user (I can't wave at a camera).

---

## Phase 3–5 — Build, test, compare

**Run:** `python -m http.server 5173` in this folder, open http://localhost:5173 in Chrome/Edge, allow the camera.
(The camera needs `localhost` or `https`; opening `index.html` as a file won't work.)

**Tests run**
| Check | Result |
|---|---|
| `node gestures.test.mjs` (synthetic palm/fist/point/peace/pinch/null/namaste) | pass |
| `test/index.html`: real MediaPipe tracker on 17 reference frames | the tracker found hands in 9 frames; the classifier matched the reference gesture in 8 of those 9. The other frames had no hand detected: the input is a blurry phone photo of a screen with sparks drawn over the hands, not a webcam feed. **Namaste could not be checked this way**, because no frame produced two hands. |
| `test/fakecam.html`: the full app driven by a fake webcam playing reference frames | the real pipeline works end to end: index finger → Rocket pill lights → rocket rises from the fingertip → burst |
| Finale / anar / palm / chakri / sparkler visuals (`?debug` hook) | all render; the finale sequence matches the reference order (orbs → hand bursts → ground fountains → sky bursts → banner) |
| Frame time during the finale | p50 33 ms at 1.5× DPR → **p50 16.7 ms (60 fps)** after switching to a CSS-pixel canvas and butt-capped streaks |
| Camera blocked | clear "Camera access blocked" message is shown |

**Differences from the reference that remain / are unverified**
- Not tested with a live webcam yet: the browser pane here blocks the camera.
- Namaste detection has not been checked on real input. Pressed palms block each other from the camera, so the rule is deliberately loose.
- The names on legend pills 4 and 5 and the small line above the title can't be read in the video, so these are best guesses. ✌️ → Chakri is an assumption.
- How the reference starts up and how its finale ends aren't shown in the video. Here the finale lasts 9 s and then fades.

---

## Correction: legend from the user's close-up screenshots

Close-up shots of the gesture bar make the labels readable. They replace my earlier guesses in the Phase 1 tables:

| # | Icon | Title | Gesture | Effect in the app |
|---|---|---|---|---|
| 1 | ☝️ | Rocket | Point Up | rocket from the fingertip that bursts in the sky |
| 2 | ✊ | Anar | Fist | fountain of sparks above the fist |
| 3 | ✋ | **Starburst** | Palm | radial spark burst on the palm (was wrongly named "Roman Candle") |
| 4 | ✌️ | **Roman Candle** | Peace | flash at the fingertips + a coloured glowing ball fired upward every 0.35 s that pops at the top (this replaces my invented "Chakri") |
| 5 | 👌 | **Phooljhadi** | Pinch | sparkler with a glitter trail |
| 6 | 🙏 | Finale | Namaste | finale sequence |

Bar styling also updated to match: a near-black maroon capsule with an orange-brown outline, and darker maroon pills inside.

---

## Round 3: strict gestures, hints, redesigned effects, mobile

### Strict recognition (avoid false positives)
A gesture **starts** only when all of these hold:
1. **Finger states from joint angles + reach** (`gestures.js`). Each finger must be clearly straight (≥150°, tip ≥1.15× as far from the wrist as the middle joint) or clearly curled (<140°, <0.9×). Anything in between is "unclear" → no gesture. The thresholds come from MediaPipe measurements on the reference frames.
2. **Gesture geometry.** The hand must be upright (wrist below knuckles). Point: the finger aims up. Peace: a real V (tips apart) pointing up. Palm: fingers spread and thumb out. Fist: thumb tucked. Pinch: tip gap < 0.33 hand-widths, index not folded into a fist, and the rest of the hand not half-closed.
3. **Tracker confidence:** handedness score ≥ 0.8.
4. **Not on the face:** a MediaPipe face detector gives a face box, and a gesture whose "business end" (fingertips, pinch point) is inside it is ignored. This covers nose rubbing, adjusting glasses and scratching the face.
5. **Held for 280 ms while fairly still** (moves < 0.6 hand-widths).
6. **Cooldown:** the same gesture can't restart within 450 ms of ending.

Once started, a gesture stays on while a **looser** rule still agrees (so moving a sparkler doesn't flicker it off). It ends after 220 ms of disagreement. Switching gestures requires the new one to pass every strict check again. Namaste must be held 380 ms.

Unit tests (`node gestures.test.mjs`) cover a half-bent scratching hand, a sideways finger at the nose, an upside-down palm, a pinch with a half-closed hand, three fingers, a palm missing a finger and two fists together, all → no gesture.
On the reference frames, strict mode accepts the clear point / fist / pinch frames. It rejects relaxed ones, which the loose rule keeps alive once a gesture is running.

### Friendly hints
- Shown above the gesture bar for about 4 s, never while a gesture, the finale or the guide is showing.
- After 2.5 s of hands visible with nothing recognisable (at most every 12 s): "Hmm, I didn't catch that 🤔 Try a Pinch 👌, Fist ✊ or Peace ✌️", and two other variants.
- After 7 s with no hands (at most every 20 s): "I'm waiting for your magic gesture! ✨", and two other variants.

### Redesigned effects (inspired by sparkler branching sparks, crossette fireworks, flower-pot fountains)
- **👌 Phooljhadi:** an ignition fizz when it lights, a flickering white-hot tip, **sparks that fork into branches mid-flight**, gold sparks that cool to orange, a **light-painting ribbon** that follows your hand, twinkling embers left along the path, and warm light on your face.
- **✊ Anar:** an **ignition build-up** over 0.9 s, then three layers: a white-hot central jet, a wide gold bloom whose sparks **cool to orange/red** as they arc down, and coloured **crackling stars** that pop at the top.
- **✌️ Roman Candle:** the fuse sputters at the fingertips. A coloured star fires every 0.45 s **in the direction your V points (tilt to aim)**, with a "thump", trailing embers, and then **splits into four crossette sub-stars** that each pop.

### Mobile / understanding
- The gesture bar becomes a 3×2 grid of large tiles on phones and wraps on tablets.
- Respects the phone's safe areas (notch, home bar). Effect size scales by the screen's short side, and phones get a smaller particle pool.
- **"❓ How to play" guide:** big emoji plus a plain-language instruction for each gesture, and tips. It opens automatically on the first visit and from any gesture tile. Close it with Esc or by tapping outside.

---

## Round 5: sound from the reference, balanced recognition

### Reference audio analysis (from the video's own audio track)
| Moment | What the audio shows | Recreated as |
|---|---|---|
| Phooljhadi (0–1 s, 6–9.4 s) | Quiet broadband fizz, about 14 dB below the fireworks, with ~50 tiny clicks/s | `fizz` noise layer (high-pass + 6 kHz presence) and random crackle clicks at the same rate. A flare-up when it lights |
| Bursts (1.0, 2.6, 3.6, 4.4 s) | A low thump with a long rumble that doesn't fade within 0.7 s, then a crackle tail | Sine thump (72→36 Hz) + 1.6 s low-passed rumble + crackle tail. Crackle shells crackle densely, willows hiss softly, crossettes pop |
| Busy moments / finale | Falling whistle chirps, ~4.4 → 3 kHz, ~0.2 s apart | `chirps()`: after peony/ring bursts, starburst release and each Roman Candle shot |
| Finale (9.5 s →) | Dense, sustained crackle + rumble | A continuous rumble/fizz bed with crackle for the whole show, a rising whistle for the flame, and a soft three-note temple-bell chord when the banner appears |
| Anar | (fountain) | Roaring band-passed noise + low rumble that ramps with the fountain's ignition build-up |
| Starburst | (charge & release) | A rising tone tracking the charge, then boom + 4 chirps on release |
| Rocket | (launch) | Whoosh + a soft rising whistle |

Everything goes through a compressor. When many bursts land at once, later ones are layered quieter and skip the thump, so it never clips or gets harsh. Pitches and levels vary slightly on every play so nothing repeats exactly. Sound turns on when you tap **Let's go!** (browsers need one tap before audio can play), unless you've switched it off yourself.

### What made gestures fail, and the fixes
| Problem | Fix |
|---|---|
| Every finger had to be in an exact state, so a lazy ring/pinky killed point, V and fist | Fingers are read as up / down / unclear. A gesture tolerates one unclear finger (pinch: two) but never a raised finger where it should be folded |
| Pinch gap 0.33 hand-widths was too tight | 0.38 to start, 0.5 to keep |
| The face box (whole face + 15 %) blocked any gesture made at face height | Only the inner face (eyes to chin), and only for point & pinch (the nose-rub / glasses / lip-pinch gestures) |
| Hands were tracked by their left/right label, which can flip between frames and reset the hold | Hands are matched to their previous position, so left, right and both-at-once stay stable |
| A single noisy frame restarted the hold timer | Up to 3 noisy frames are ignored |
| Hold 280 ms, max movement 0.6 hand-widths, confidence 0.8 | Hold 170 ms, movement 1.2, confidence 0.6. Release after 320 ms of disagreement. Cooldown 250 ms |
| Tilt limit ~63° | ~72° to start. To keep a gesture going, anything short of pointing down |

Still rejected (unit tests): a half-bent scratching hand, a sideways finger at the nose, an upside-down palm, a pinch with a half-closed hand, two half-bent fingers, three fingers, a palm missing a finger, two fists together.
Reference frames: every frame where the tracker finds a hand making a clear gesture is now recognised (point ×2, fist, pinch ×4).
Live pipeline with a fake camera cycling point → pinch → fist: each gesture fired within ~0.1 s of the hand changing, and transitions were clean.

### Live webcam checklist (run with `?debug` to see what the recogniser sees above each hand)
Open `http://localhost:5173/?debug` (or `https://<pc-ip>:8443/?debug` on a phone). Above each hand you'll see `active (seeing: candidate)`.
1. Each gesture clearly: ☝️ ✊ ✋ ✌️ 👌 🙏. Each should fire within about a quarter of a second.
2. Sloppy versions: a lazy ring finger on ✌️, a loose index on ✊, a relaxed pinch.
3. Quick flashes: a gesture held only ~0.2 s should still fire.
4. Hold for 1 s / 5 s / 15 s: no dropouts or restarts.
5. Switch ✊ → ✌️ → 👌 → ✊ without lowering your hand.
6. Two hands: ✊ + 👌, ✌️ + ✌️, then 🙏.
7. Random waving and talking with your hands: nothing should fire.
8. Rub your nose, push your glasses up, scratch your head and chin: nothing should fire.
9. Sound on: each animation should have its own sound, starting with it.
10. Run the finale three times in a row and switch gestures quickly for a minute: no glitches, stuck sounds or slowdown.
