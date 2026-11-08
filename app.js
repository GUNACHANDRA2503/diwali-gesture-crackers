import { FilesetResolver, HandLandmarker, FaceDetector } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
import { classify, isNamaste, isPrayerBlade, anchor, handSize, TIPS } from './gestures.js';

const video = document.getElementById('cam');
const cv = document.getElementById('fx');
const ctx = cv.getContext('2d');
const msg = document.getElementById('msg');
const banner = document.getElementById('banner');
const hintEl = document.getElementById('hint');
const helpEl = document.getElementById('help');
const pills = [...document.querySelectorAll('.pill')];
const DEBUG = location.search.includes('debug');

// ---------- canvas / camera geometry ----------
let W = 0, H = 0, U = 1, DPR = 1; // U = size unit for effects
function resize() {
  DPR = 1; // shortcut: CSS-pixel canvas; additive streaks at 1.5x DPR halved fps in the finale
  W = cv.width = Math.round(innerWidth * DPR);
  H = cv.height = Math.round(innerHeight * DPR);
  // scale by the short side so a portrait phone doesn't get desktop-sized bursts
  U = (Math.min(W, H) / 720) * 1.45;
  coverCache = null;
  vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  vignette.addColorStop(0, 'rgba(0,0,0,0.08)'); vignette.addColorStop(1, 'rgba(0,0,0,0.6)');
  tint = ctx.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, Math.max(W, H) * 0.7);
  tint.addColorStop(0, 'rgba(255,120,40,1)'); tint.addColorStop(1, 'rgba(200,60,140,0.6)');
}
let coverCache = null, vignette = null, tint = null;
addEventListener('resize', resize);
resize();

// object-fit: cover mapping of the mirrored camera into the canvas (recomputed only when sizes change)
function cover() {
  const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
  if (coverCache && coverCache.vw === vw && coverCache.vh === vh) return coverCache;
  const s = Math.max(W / vw, H / vh);
  return (coverCache = { s, vw, vh, dx: (W - vw * s) / 2, dy: (H - vh * s) / 2 });
}
function toScreen(p) {
  const c = cover();
  return { x: W - (p.x * c.vw * c.s + c.dx), y: p.y * c.vh * c.s + c.dy };
}

// ---------- particles ----------
const PALETTE = [
  [255, 190, 30],  // 0 gold
  [255, 240, 200], // 1 warm white
  [255, 110, 20],  // 2 orange
  [255, 50, 180],  // 3 pink
  [40, 210, 255],  // 4 cyan
  [60, 255, 90],   // 5 green
  [255, 40, 40],   // 6 red
  [170, 80, 255],  // 7 violet
];
const CSS = PALETTE.map(([r, g, b]) => `rgb(${r},${g},${b})`);
const ALPHA_STEPS = 4, WIDTHS = [1.5, 2.6];

// glow sprite per colour, drawn additively for cores / flashes / heads
const SPRITES = PALETTE.map(([r, g, b]) => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.08, `rgba(${r},${g},${b},1)`);
  gr.addColorStop(0.4, `rgba(${r},${g},${b},.35)`);
  gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  return c;
});

const MAX = innerWidth < 700 ? 4000 : 7000; // phones get a smaller pool
const P = Array.from({ length: MAX }, () => ({ alive: false }));
let pCount = 0, pCursor = 0;
// o: g (gravity), drag, w (0 streak / 1 dot), flick, trail, c2 (colour after half life), split (children at half life)
function spawn(x, y, vx, vy, life, color, o = {}) {
  // pool full -> recycle the slot at the cursor instead of scanning all MAX slots for every spawn
  for (let n = 0; n < MAX; n++) {
    const p = P[pCursor]; pCursor = (pCursor + 1) % MAX;
    if (p.alive && pCount < MAX && n < MAX - 1) continue;
    if (!p.alive) pCount++;
    p.alive = true; p.x = p.px = x; p.y = p.py = y; p.vx = vx; p.vy = vy;
    p.life = p.max = life; p.c = color;
    p.g = o.g ?? 300 * U; p.drag = o.drag ?? 1.5; p.w = o.w ?? 0; p.flick = o.flick ?? false; p.trail = o.trail ?? 1;
    p.c2 = o.c2 ?? -1; p.split = o.split ?? 0;
    return p;
  }
}
const glows = []; // {x,y,r,c,life,max,a}
function glow(x, y, r, c, life = 0.05, a = 1) { glows.push({ x, y, r, c, life, max: life, a }); }

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];

function stepParticles(dt) {
  for (let i = 0; i < MAX; i++) {
    const p = P[i]; if (!p.alive) continue;
    p.life -= dt;
    if (p.life <= 0) { p.alive = false; pCount--; continue; }
    p.px = p.x; p.py = p.y;
    const k = Math.exp(-p.drag * dt);
    p.vx *= k; p.vy = p.vy * k + p.g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.c2 >= 0 && p.life < p.max * 0.5) { p.c = p.c2; p.c2 = -1; } // sparks cool down: gold -> orange/red
    if (p.split && p.life < p.max * 0.55) {
      // crackle: the spark forks into tiny branches (classic sparkler / crossette look)
      const n = p.split, a0 = Math.atan2(p.vy, p.vx), sp = Math.hypot(p.vx, p.vy);
      p.split = 0;
      for (let j = 0; j < n; j++) {
        const a = a0 + rnd(-1.3, 1.3), s = Math.max(60 * U, sp * rnd(0.35, 0.7));
        spawn(p.x, p.y, Math.cos(a) * s, Math.sin(a) * s, rnd(0.07, 0.2), p.c, { drag: 5, g: p.g, w: 0 });
      }
    }
  }
  for (let i = glows.length - 1; i >= 0; i--) if ((glows[i].life -= dt) <= 0) glows.splice(i, 1);
}

const buckets = Array.from({ length: PALETTE.length * ALPHA_STEPS * WIDTHS.length }, () => []);
function drawParticles() {
  for (const b of buckets) b.length = 0;
  for (let i = 0; i < MAX; i++) {
    const p = P[i]; if (!p.alive) continue;
    let a = p.life / p.max;
    if (p.flick) a *= Math.random() < 0.35 ? 0.15 : 1;
    const ai = Math.min(ALPHA_STEPS - 1, (a * ALPHA_STEPS) | 0);
    buckets[(p.c * ALPHA_STEPS + ai) * WIDTHS.length + p.w].push(p);
  }
  ctx.globalCompositeOperation = 'lighter';
  for (let bi = 0; bi < buckets.length; bi++) {
    const list = buckets[bi]; if (!list.length) continue;
    const w = bi % WIDTHS.length, ai = ((bi / WIDTHS.length) | 0) % ALPHA_STEPS, c = (bi / WIDTHS.length / ALPHA_STEPS) | 0;
    ctx.strokeStyle = CSS[c];
    ctx.lineCap = w ? 'round' : 'butt'; // round caps only for glitter dots; they're costly on thousands of streaks
    ctx.globalAlpha = (ai + 1) / ALPHA_STEPS;
    ctx.lineWidth = WIDTHS[w] * U * DPR * 0.9;
    ctx.beginPath();
    for (const p of list) {
      // streak = segment from previous position, stretched for a motion-blur spark look
      ctx.moveTo(p.x - (p.x - p.px) * p.trail * 2.2, p.y - (p.y - p.py) * p.trail * 2.2);
      ctx.lineTo(p.x + 0.01, p.y);
    }
    ctx.stroke();
  }
  drawRibbons();
  drawWaves();
  drawLanterns();
  for (const g of glows) {
    ctx.globalAlpha = Math.min(1, g.life / g.max + 0.15) * g.a;
    ctx.drawImage(SPRITES[g.c], g.x - g.r, g.y - g.r, g.r * 2, g.r * 2);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// light-painting ribbons left by the phooljhadi tip (long-exposure look)
const RIBBON_LIFE = 0.55;
const ribbons = new Map(); // key -> [{x,y,age}]
function ribbonPush(key, x, y) {
  let r = ribbons.get(key); if (!r) ribbons.set(key, (r = []));
  r.push({ x, y, age: 0 });
}
function stepRibbons(dt) {
  for (const [k, r] of ribbons) {
    for (const p of r) p.age += dt;
    while (r.length && r[0].age > RIBBON_LIFE) r.shift();
    if (!r.length) ribbons.delete(k);
  }
}
function drawRibbons() {
  ctx.lineCap = 'round';
  for (const r of ribbons.values()) {
    for (let i = 1; i < r.length; i++) {
      const f = 1 - r[i].age / RIBBON_LIFE;
      ctx.globalAlpha = f * 0.35; ctx.strokeStyle = CSS[2]; ctx.lineWidth = (6 + 10 * f) * U;
      ctx.beginPath(); ctx.moveTo(r[i - 1].x, r[i - 1].y); ctx.lineTo(r[i].x, r[i].y); ctx.stroke();
      ctx.globalAlpha = f * 0.9; ctx.strokeStyle = CSS[1]; ctx.lineWidth = (1.5 + 3 * f) * U;
      ctx.beginPath(); ctx.moveTo(r[i - 1].x, r[i - 1].y); ctx.lineTo(r[i].x, r[i].y); ctx.stroke();
    }
  }
}

// ---------- effects ----------
// Effects take a hand slot `s` ({key, x, y, px, py, size, dir, power, ...}) so they can follow and aim with the hand.

// 👌 Phooljhadi: a sputtering white-hot tip that throws branching crackle sparks, paints a light trail
// as you move it, sheds twinkling embers, and throws warm light on the scene.
function phooljhadi(s, onset) {
  const { x, y } = s;
  if (onset) { // ignition fizz
    sound.ignite();
    glow(x, y, 140 * U, 1, 0.35);
    for (let i = 0; i < 80; i++) {
      const a = rnd(0, Math.PI * 2), v = rnd(300, 850) * U;
      spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, rnd(0.2, 0.45), pick([0, 1, 2]), { drag: 3, g: 200 * U, split: Math.random() < 0.5 ? 3 : 0 });
    }
  }
  glow(x, y, rnd(170, 210) * U, 2, 0.05, 0.28); // warm light on the surroundings
  glow(x, y, rnd(24, 40) * U, 1);               // flickering hot core
  glow(x, y, rnd(10, 16) * U, 1);
  for (let i = 0; i < 30; i++) {
    const a = rnd(0, Math.PI * 2), v = rnd(250, 720) * U;
    spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, rnd(0.12, 0.32), pick([0, 0, 1, 1, 2]),
      { drag: 3.5, g: 220 * U, c2: 2, split: Math.random() < 0.45 ? 3 : 0 });
  }
  for (let i = 0; i < 5; i++) { // embers shed along the path, twinkling as they fall
    const t = Math.random();
    spawn(s.px + (x - s.px) * t + rnd(-5, 5) * U, s.py + (y - s.py) * t + rnd(-5, 5) * U, rnd(-25, 25) * U, rnd(-20, 15) * U,
      rnd(0.9, 1.8), pick([0, 0, 3, 4, 5, 7]), { drag: 2.5, g: 60 * U, w: 1, flick: true, trail: 0 });
  }
  ribbonPush(s.key, x, y);
  sound.loop('fizz', 1);
}

// ✊ Anar: an ignition build-up into a layered flower-pot fountain: a white-hot central jet, a wide gold
// bloom whose sparks cool to orange/red as they arc down, and coloured crackling stars popping at the top.
function anar(s, dt, onset) {
  if (onset) s.power = 0;
  s.power = Math.min(1, s.power + dt / 0.9);
  const P = 0.3 + 0.7 * s.power, x = s.x, y = s.y - s.size * 0.15;
  glow(x, y, rnd(55, 85) * U * P, 2);
  glow(x, y, 210 * U * P, 2, 0.05, 0.3);
  glow(x, y - 6 * U, 24 * U, 1);
  for (let i = 0, n = Math.round(18 * P); i < n; i++) { // core jet
    const a = -Math.PI / 2 + rnd(-0.1, 0.1), v = rnd(520, 880) * U * P;
    spawn(x + rnd(-4, 4) * U, y, Math.cos(a) * v, Math.sin(a) * v, rnd(0.35, 0.6), 1, { drag: 1, g: 520 * U, c2: 0 });
  }
  for (let i = 0, n = Math.round(30 * P); i < n; i++) { // flower bloom
    const a = -Math.PI / 2 + rnd(-0.6, 0.6), v = rnd(260, 540) * U * Math.sqrt(P);
    spawn(x + rnd(-6, 6) * U, y, Math.cos(a) * v, Math.sin(a) * v, rnd(0.7, 1.3), 0, { drag: 1.1, g: 650 * U, c2: pick([2, 2, 6, 3]) });
  }
  if (Math.random() < 0.14 * P) { // crackling star
    const a = -Math.PI / 2 + rnd(-0.25, 0.25), v = rnd(560, 820) * U * P;
    spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, rnd(0.5, 0.65), pick([5, 4, 3, 7]), { drag: 1.2, g: 500 * U, split: 7 });
  }
  sound.loop('roar', P); sound.loop('rumble', P * 0.6); sound.loop('fizz', 0.3);
}

// ✋ Starburst: charge & release. While the open palm is held, sparks are pulled in from all around
// into a growing orb with a spinning ring; at full charge (1.1 s) it releases a star-shaped blast
// (long rays, a shockwave ring, drifting glitter), then starts charging again.
const TAU = Math.PI * 2;
const waves = []; // expanding shockwave rings {x,y,r,v,life,max,c}
function starburst(s, dt, onset) {
  if (onset) s.charge = 0;
  s.charge += dt / 1.1;
  const { x, y, size } = s, c = s.core, k = Math.min(1, s.charge), R = size * 2.2;
  for (let i = 0; i < 6; i++) { // suction: sparks fly in from a wide circle and die at the centre
    const a = rnd(0, TAU), v = rnd(500, 800) * U, r = R * rnd(0.8, 1.2);
    spawn(x + Math.cos(a) * r, y + Math.sin(a) * r, -Math.cos(a) * v, -Math.sin(a) * v, r / v, pick([c, c, 1, 0]), { drag: 0, g: 0 });
  }
  const ring = size * (0.75 - 0.35 * k), spin = (performance.now() / 1000) * (4 + 8 * k);
  for (let j = 0; j < 3; j++) { // spinning ring that tightens as it charges
    const a = spin + (j * TAU) / 3, ex = x + Math.cos(a) * ring, ey = y + Math.sin(a) * ring;
    spawn(ex, ey, -Math.sin(a) * 260 * U, Math.cos(a) * 260 * U, rnd(0.15, 0.3), pick([c, 1]), { drag: 3, g: 0 });
  }
  glow(x, y, size * (0.35 + 0.9 * k), c, 0.05, 0.8);
  glow(x, y, size * (0.15 + 0.25 * k), 1);
  if (s.charge >= 1) { starRelease(x, y, size, c); s.charge = 0; s.core = pick([0, 3, 4, 5, 7].filter((q) => q !== c)); }
  sound.loop('charge', k);
}
function starRelease(x, y, size, c) {
  const c2 = pick([0, 2, 3, 4, 5, 6, 7].filter((q) => q !== c));
  glow(x, y, size * 1.4, 1, 0.18, 0.7); glow(x, y, size * 3, c, 0.35, 0.4); // brief flash, not a white-out
  waves.push({ x, y, r: size * 0.4, v: size * 8, life: 0.55, max: 0.55, c });
  const rays = 10, rot = rnd(0, TAU);
  for (let i = 0; i < rays; i++) { // star rays: particles at graded speeds line up into long spikes
    const a = rot + (i * TAU) / rays;
    for (let k = 0; k < 16; k++) {
      const v = size * (1 + k * 0.27) * 1.6 * rnd(0.97, 1.03);
      spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, rnd(0.7, 1.0), i % 2 ? c : c2, { drag: 1.6, g: 50 * U });
    }
  }
  for (let i = 0; i < 110; i++) { // round shell
    const a = (i / 110) * TAU, v = size * 7.2 * rnd(0.96, 1.04);
    spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, rnd(0.5, 0.8), 1, { drag: 2.4, g: 40 * U, c2: c });
  }
  for (let i = 0; i < 50; i++) { // glitter that hangs and twinkles
    const a = rnd(0, TAU), v = rnd(60, 300) * U;
    spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, rnd(1, 2), pick([0, c, c2]), { drag: 2, g: 50 * U, w: 1, flick: true, trail: 0 });
  }
  sound.boom(0.8, 'star');
}
function stepWaves(dt) {
  for (let i = waves.length - 1; i >= 0; i--) {
    const w = waves[i]; w.r += w.v * dt; w.v *= Math.exp(-3 * dt);
    if ((w.life -= dt) <= 0) waves.splice(i, 1);
  }
}
function drawWaves() {
  for (const w of waves) {
    const a = w.life / w.max;
    ctx.globalAlpha = a * 0.8; ctx.strokeStyle = CSS[w.c]; ctx.lineWidth = (2 + 8 * a) * U;
    ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, TAU); ctx.stroke();
  }
}

// ✌️ Roman Candle: the V is the tube. The fuse sputters at the fingertips, and every ~0.45 s a coloured star
// is fired along the direction the V points (tilt to aim), trailing embers, then splits crossette-style
// into four sub-stars that each pop.
const STAR_COLORS = [3, 5, 4, 0, 7, 6];
function candleFuse(s) {
  const { x, y, dir } = s;
  glow(x, y, 22 * U, 2); glow(x, y, 10 * U, 1);
  const a0 = Math.atan2(dir.y, dir.x);
  for (let i = 0; i < 6; i++) {
    const a = a0 + rnd(-0.5, 0.5), v = rnd(150, 350) * U;
    spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, rnd(0.1, 0.25), pick([0, 2]), { drag: 3, g: 300 * U });
  }
  sound.loop('fizz', 0.5);
}
function fireStar(s) {
  const { x, y, dir } = s, color = STAR_COLORS[s.star++ % STAR_COLORS.length];
  const a0 = Math.atan2(dir.y, dir.x);
  glow(x, y, 70 * U, 1, 0.12); glow(x, y, 120 * U, color, 0.2, 0.6); // muzzle flash
  for (let i = 0; i < 24; i++) {
    const a = a0 + rnd(-0.35, 0.35), v = rnd(300, 700) * U;
    spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, rnd(0.15, 0.35), pick([1, 0, color]), { drag: 3, g: 250 * U });
  }
  const a = a0 + rnd(-0.06, 0.06), v = rnd(820, 980) * U;
  rockets.push({ type: 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 420 * U, color, life: rnd(0.8, 1.0) });
  sound.thump();
}

const rockets = []; // rockets, roman-candle stars and crossette sub-stars
const SHELLS = ['peony', 'crackle', 'willow', 'ring', 'crossette'];
// ☝️ Rocket: aim with your finger (clamped to 35 deg from vertical). Ignition flash and exhaust at the
// fingertip, a wobbling climb with a glittering trail that lingers, then one of five shell types.
function launchRocket(x, y, dir = { x: 0, y: -1 }, shell = pick(SHELLS), color = pick([0, 2, 3, 4, 5, 6, 7])) {
  const up = -Math.PI / 2;
  const a = up + Math.max(-0.6, Math.min(0.6, Math.atan2(dir.y, dir.x) - up));
  const g = 520 * U, h = Math.max(150 * U, y - rnd(0.1, 0.3) * H);
  const vy = -Math.sqrt(2 * g * h), vx = (-vy * Math.cos(a)) / -Math.sin(a);
  glow(x, y, 60 * U, 2, 0.15); glow(x, y, 26 * U, 1, 0.1);
  for (let i = 0; i < 26; i++) { // exhaust blast downward
    const b = Math.PI / 2 + rnd(-0.6, 0.6), v = rnd(150, 420) * U;
    spawn(x, y, Math.cos(b) * v, Math.sin(b) * v, rnd(0.15, 0.4), pick([0, 2, 1]), { drag: 3, g: 200 * U });
  }
  rockets.push({ type: 'rocket', x, y, vx, vy, g, color, shell, t: 0 });
  sound.launch();
}
function pop(x, y, c, n, speed) {
  for (let k = 0; k < n; k++) {
    const a = rnd(0, Math.PI * 2), v = rnd(0.4, 1) * speed;
    spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, rnd(0.4, 0.8), c, { drag: 2, g: 150 * U, flick: true });
  }
}
function stepRockets(dt) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    r.vy += r.g * dt; r.x += r.vx * dt; r.y += r.vy * dt;
    if (r.type === 'rocket') {
      r.t += dt; r.x += Math.sin(r.t * 22) * 40 * U * dt; // slight wobble as it climbs
      glow(r.x, r.y, 18 * U, 1); glow(r.x, r.y, 34 * U, 0, 0.05, 0.6);
      for (let k = 0; k < 3; k++) spawn(r.x + rnd(-2, 2), r.y, rnd(-25, 25) * U, rnd(40, 120) * U, rnd(0.2, 0.45), pick([0, 2]), { drag: 2, g: 150 * U });
      for (let k = 0; k < 2; k++) spawn(r.x + rnd(-3, 3) * U, r.y, rnd(-10, 10) * U, rnd(-5, 15) * U, rnd(0.5, 1.1), pick([0, 0, 1]), { drag: 3, g: 40 * U, w: 1, flick: true, trail: 0 });
      if (r.vy > -40 * U) { burst(r.x, r.y, r.color, 1, r.shell); rockets.splice(i, 1); }
      continue;
    }
    r.life -= dt;
    const big = r.type === 'star';
    glow(r.x, r.y, (big ? 34 : 16) * U, r.color); glow(r.x, r.y, (big ? 12 : 6) * U, 1);
    for (let k = 0; k < (big ? 4 : 2); k++) { // ember tail
      spawn(r.x + rnd(-3, 3) * U, r.y + rnd(-3, 3) * U, rnd(-20, 20) * U, rnd(-10, 30) * U, rnd(0.3, 0.7), pick([r.color, r.color, 0]),
        { drag: 2.5, g: 90 * U, w: 1, flick: true, trail: 0 });
    }
    if (r.life <= 0) {
      if (big) { // crossette: split into four sub-stars in a cross
        glow(r.x, r.y, 90 * U, r.color, 0.2);
        const a0 = rnd(0, Math.PI / 2), c2 = pick(STAR_COLORS);
        for (let k = 0; k < 4; k++) {
          const a = a0 + (k * Math.PI) / 2, v = rnd(330, 420) * U;
          rockets.push({ type: 'cross', x: r.x, y: r.y, vx: r.vx * 0.2 + Math.cos(a) * v, vy: r.vy * 0.2 + Math.sin(a) * v, g: 160 * U, color: k % 2 ? c2 : r.color, life: rnd(0.35, 0.45) });
        }
        pop(r.x, r.y, 1, 24, 220 * U);
        sound.pops(4);
      } else pop(r.x, r.y, r.color, 12, 160 * U);
      rockets.splice(i, 1);
    }
  }
}
function burst(x, y, c, scale = 1, type = 'peony') {
  const S = rnd(380, 500) * U * scale;
  const others = [0, 2, 3, 4, 5, 6, 7].filter((k) => k !== c);
  const c2 = pick(others), c3 = pick(others);
  glow(x, y, 160 * U * scale, c, 0.3); glow(x, y, 60 * U * scale, 1, 0.14);
  if (type === 'willow') { // gold willow: long, heavy, drooping trails
    for (let i = 0; i < 110; i++) {
      const a = rnd(0, TAU), v = S * 0.75 * Math.sqrt(Math.random());
      spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, rnd(2.0, 2.8), 0, { drag: 1.4, g: 170 * U, c2: 2, trail: 2.5, flick: Math.random() < 0.3 });
    }
  } else if (type === 'ring') { // tilted ring with a coloured centre
    const tilt = rnd(0.3, 1), rot = rnd(0, Math.PI);
    for (let i = 0; i < 150; i++) {
      const a = (i / 150) * TAU, ux = Math.cos(a), uy = Math.sin(a) * tilt, v = S * 0.9;
      spawn(x, y, (ux * Math.cos(rot) - uy * Math.sin(rot)) * v, (ux * Math.sin(rot) + uy * Math.cos(rot)) * v, rnd(1.0, 1.5), c, { drag: 1.9, g: 90 * U });
    }
    for (let i = 0; i < 60; i++) {
      const a = rnd(0, TAU), v = S * rnd(0.15, 0.35);
      spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, rnd(0.8, 1.2), c2, { drag: 1.9, g: 90 * U });
    }
  } else if (type === 'crossette') { // six sub-stars that each fly out and pop
    for (let k = 0; k < 6; k++) {
      const a = (k * TAU) / 6 + rnd(-0.1, 0.1), v = rnd(380, 460) * U * scale;
      rockets.push({ type: 'cross', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 160 * U, color: k % 2 ? c2 : c, life: rnd(0.4, 0.5) });
    }
    pop(x, y, 1, 30, 200 * U);
  } else { // peony (multi-colour rings) or crackle (sparks that fork)
    const crackle = type === 'crackle', n = (crackle ? 200 : 240) + ((Math.random() * 80) | 0);
    for (let i = 0; i < n; i++) {
      const outer = Math.random() < 0.7, a = (i / n) * TAU + rnd(-0.03, 0.03), v = S * (outer ? rnd(0.85, 1) : rnd(0.35, 0.6));
      spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, rnd(1.1, 1.8), crackle ? pick([0, 1, 1]) : outer ? (i % 7 ? c : c3) : c2,
        { drag: 1.9, g: 110 * U, flick: Math.random() < 0.4, split: crackle && Math.random() < 0.6 ? 4 : 0 });
    }
  }
  sound.boom(scale, type);
}

// ambient drifting dust
function ambient() {
  if (Math.random() < 0.25) spawn(rnd(0, W), rnd(0, H), rnd(-12, 12) * U, rnd(-12, 6) * U, rnd(3, 6), pick([1, 1, 0]), { drag: 0, g: 0, w: 1, flick: true, trail: 0 });
}

// ---------- finale (namaste) ----------
// A staged show: a flame rises from your joined hands and bursts into a giant gold willow; ground
// fountains ignite one by one across the bottom; mirrored rocket volleys from both corners; sky
// lanterns drift up; the HAPPY DIWALI banner appears; then a crescendo and a willow curtain.
let finale = null;
const FINALE_LEN = 10;
const lanterns = [];
function startFinale(hands) {
  const cx = (hands[0].x + hands[1].x) / 2, cy = (hands[0].y + hands[1].y) / 2;
  finale = { t: 0, cx, cy, fx: cx, fy: cy, nextBurst: 2.6, nextVolley: 1.6, nextLantern: 2.0, nextSalvo: 6.6, curtain: false, popped: false };
  for (const h of hands) { glow(h.x, h.y, 120 * U, 1, 0.7); glow(h.x, h.y, 60 * U, 1, 0.9); }
  sound.rise(1.1); sound.chimed = false;
}
const ease = (t) => 1 - (1 - t) ** 3;
function stepFinale(dt) {
  if (!finale) return;
  const f = finale; f.t += dt;
  const t = f.t;
  if (t < 1.1) { // the rising flame
    f.fy = f.cy + (H * 0.22 - f.cy) * ease(t / 1.1); f.fx = f.cx + Math.sin(t * 9) * 8 * U;
    glow(f.fx, f.fy, 44 * U, 2); glow(f.fx, f.fy, 18 * U, 1);
    for (let k = 0; k < 4; k++) spawn(f.fx + rnd(-4, 4) * U, f.fy, rnd(-30, 30) * U, rnd(40, 140) * U, rnd(0.3, 0.7), pick([0, 2, 1]), { drag: 2, g: 120 * U, w: k % 2, flick: true });
  } else if (!f.popped) {
    f.popped = true;
    burst(f.fx, f.fy, 0, 1.9, 'willow'); burst(f.fx, f.fy, 1, 1.2, 'peony');
    glow(f.fx, f.fy, Math.max(W, H) * 0.6, 0, 0.6, 0.45);
  }
  if (t > 1.2 && t < FINALE_LEN - 1) { // fountains light up left -> right
    const cols = Math.max(5, Math.round(W / (150 * U))), lit = Math.min(cols, Math.floor((t - 1.2) / 0.08) + 1);
    for (let i = 0; i < lit; i++) {
      const x = ((i + 0.5) / cols) * W, v = rnd(500, 900) * U * (0.75 + 0.25 * Math.sin(t * 3 + i));
      const tint = i % 3 === 1 ? [3, 4, 5][((t * 0.5) | 0) % 3] : 0;
      for (let k = 0; k < 3; k++) spawn(x + rnd(-3, 3) * U, H, rnd(-18, 18) * U, -v, rnd(0.5, 1), pick([0, 1, tint, tint]), { drag: 0.6, g: 600 * U });
      glow(x, H - 8 * U, 26 * U, 2);
    }
  }
  if (t > f.nextVolley && t < 6.4) { // mirrored volley from both bottom corners
    f.nextVolley = t + 0.75;
    const shell = pick(SHELLS), c = pick([0, 3, 4, 5, 7]), aim = { x: 0.45, y: -1 };
    launchRocket(W * 0.08, H, aim, shell, c);
    launchRocket(W * 0.92, H, { x: -aim.x, y: aim.y }, shell, c);
  }
  if (t > f.nextBurst && t < 6.5) {
    f.nextBurst = t + rnd(0.2, 0.4);
    burst(rnd(0.1, 0.9) * W, rnd(0.08, 0.5) * H, pick([0, 2, 3, 4, 5, 6, 7]), rnd(0.6, 1.0), pick(SHELLS));
  }
  if (t > f.nextLantern && t < 6) { // sky lanterns (akash kandil)
    f.nextLantern = t + rnd(0.3, 0.6);
    lanterns.push({ x: rnd(0.05, 0.95) * W, y: H + 20 * U, ph: rnd(0, TAU), v: rnd(40, 70) * U, life: 7 });
  }
  if (t > f.nextSalvo && t < 7.6) { // crescendo
    f.nextSalvo = t + 0.12;
    burst(rnd(0.05, 0.95) * W, rnd(0.05, 0.45) * H, pick([0, 3, 4, 5, 7]), rnd(0.5, 0.8), Math.random() < 0.3 ? 'crackle' : 'peony');
  }
  if (t > 7.6 && !f.curtain) { // gold willow curtain across the top
    f.curtain = true;
    for (let i = 0; i < 5; i++) burst(((i + 0.5) / 5) * W, H * rnd(0.1, 0.18), 0, 1.1, 'willow');
  }
  if (t > 1.1 && t < FINALE_LEN - 1) { sound.loop('rumble', 0.8); sound.loop('fizz', 0.35); } // finale bed
  if (t > 2.2) { banner.classList.add('show'); if (!sound.chimed) { sound.chimed = true; sound.chime(); } }
  if (t > FINALE_LEN) { banner.classList.remove('show'); finale = null; }
}
function stepLanterns(dt) {
  for (let i = lanterns.length - 1; i >= 0; i--) {
    const l = lanterns[i];
    l.life -= dt; l.ph += dt * 1.5; l.y -= l.v * dt; l.x += Math.sin(l.ph) * 18 * U * dt;
    if (l.life <= 0 || l.y < -40 * U) lanterns.splice(i, 1);
  }
}
function drawLanterns() {
  for (const l of lanterns) {
    const a = Math.min(1, l.life / 1.5), w = 16 * U, h = 22 * U, fl = rnd(0.85, 1);
    ctx.globalAlpha = a * 0.55 * fl; ctx.drawImage(SPRITES[2], l.x - 50 * U, l.y - 50 * U, 100 * U, 100 * U);
    ctx.globalAlpha = a * 0.85; ctx.fillStyle = 'rgb(255,120,30)';
    ctx.beginPath(); ctx.roundRect(l.x - w / 2, l.y - h / 2, w, h, 5 * U); ctx.fill();
    ctx.globalAlpha = a * fl; ctx.drawImage(SPRITES[1], l.x - 9 * U, l.y - 4 * U, 18 * U, 18 * U);
  }
}
function drawFinaleTint() {
  if (!finale) return;
  ctx.globalAlpha = Math.min(1, finale.t / 0.6, (FINALE_LEN - finale.t) / 1.5) * 0.22;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = tint; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
}

// ---------- sound (Web Audio, synthesized; modelled on the reference recording) ----------
// Reference audio (analysed from the video's own track): a quiet broadband fizz under the phooljhadi
// (~14 dB below the fireworks) with fine crackle (~50 clicks/s); bursts = a low thump plus a long rumble
// that doesn't fade within 0.7 s, then a crackle tail; falling whistle chirps ~4.4 -> 3 kHz about 0.2 s
// apart; and a dense crackle + rumble bed through the finale. Everything below is synthesized and runs
// through a compressor so layered effects never clip or turn harsh.
const poisson = (l) => { let n = 0, p = Math.random(); const L = Math.exp(-l); while (p > L) { n++; p *= Math.random(); } return n; };
const sound = {
  ac: null, out: null, dest: null, on: false, loops: {}, want: {}, lastBoom: -1, chimed: false, voices: 0, MAX_VOICES: 72,
  init() {
    const ac = (this.ac = new AudioContext());
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.25;
    this.out = ac.createGain(); this.out.gain.value = 0.45; // default volume: half
    this.out.connect(comp); comp.connect(ac.destination);
    this.dest = ac.createMediaStreamDestination(); comp.connect(this.dest); // recordings get the same mix
    const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // continuous layers, faded every frame by what is on screen
    this.loops.fizz = this.noiseLoop([['highpass', 2500, 0.7], ['peaking', 6000, 1, 6]]); // phooljhadi, candle fuse
    this.loops.roar = this.noiseLoop([['bandpass', 700, 0.6]]);                            // anar fountain
    this.loops.rumble = this.noiseLoop([['lowpass', 180, 0.7]]);                           // anar base, finale bed
    const o = ac.createOscillator(), o2 = ac.createOscillator(), cg = ac.createGain();
    o.type = 'triangle'; o2.type = 'sine'; cg.gain.value = 0;
    o.connect(cg); o2.connect(cg); cg.connect(this.out); o.start(); o2.start();
    this.loops.charge = { gain: cg, osc: [o, o2] };                                        // starburst charge-up
  },
  noiseLoop(filters) {
    const ac = this.ac, src = ac.createBufferSource(); src.buffer = this.noise; src.loop = true;
    let node = src;
    for (const [type, f, q, g] of filters) {
      const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; if (g) b.gain.value = g;
      node.connect(b); node = b;
    }
    const gain = this.ac.createGain(); gain.gain.value = 0; node.connect(gain).connect(this.out);
    src.start(0, Math.random() * 1.9);
    return { gain };
  },
  // effects call loop() every frame they're active; tick() fades each layer to the loudest request
  loop(name, level) { this.want[name] = Math.max(this.want[name] || 0, level); },
  tick(dt) {
    const w = this.want; this.want = {};
    if (!this.on) return;
    const t = this.ac.currentTime, LEVEL = { fizz: 0.05, roar: 0.09, rumble: 0.13, charge: 0.035 };
    for (const k in LEVEL) this.loops[k].gain.gain.setTargetAtTime((w[k] || 0) * LEVEL[k], t, 0.06);
    if (w.charge) {
      const f = 180 + 520 * w.charge;
      this.loops.charge.osc[0].frequency.setTargetAtTime(f, t, 0.05);
      this.loops.charge.osc[1].frequency.setTargetAtTime(f * 1.5, t, 0.05);
    }
    // fine crackle riding on the fizz / roar / bed
    const crack = Math.max(w.fizz || 0, w.roar || 0, (w.rumble || 0) * 0.8);
    if (crack) for (let i = poisson(crack * 45 * dt); i > 0; i--) this.click(t + Math.random() * dt, (0.04 + 0.1 * Math.random()) * crack);
  },
  // ---- building blocks ----
  noiseShot(t, dur, filters, peak, attack = 0.005) {
    if (this.voices >= this.MAX_VOICES) return; // over budget: drop the extra crackle rather than stutter
    const ac = this.ac, s = ac.createBufferSource(); s.buffer = this.noise;
    this.voices++; s.onended = () => this.voices--;
    let node = s;
    for (const [type, f0, f1, q] of filters) {
      const b = ac.createBiquadFilter(); b.type = type; b.Q.value = q ?? 0.7;
      b.frequency.setValueAtTime(f0, t); if (f1) b.frequency.exponentialRampToValueAtTime(f1, t + dur);
      node.connect(b); node = b;
    }
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g).connect(this.out); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  },
  tone(t, f0, f1, dur, peak, type = 'sine', attack = 0.01) {
    if (this.voices >= this.MAX_VOICES) return;
    const ac = this.ac, o = ac.createOscillator(), g = ac.createGain(); o.type = type;
    this.voices++; o.onended = () => this.voices--;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + dur + 0.05);
  },
  click(t, amp) { this.noiseShot(t, rnd(0.004, 0.012), [['highpass', rnd(1800, 4000)]], amp, 0.001); },
  crackle(t, count, spread, amp = 0.12) { for (let i = 0; i < count; i++) this.click(t + Math.random() ** 1.5 * spread, amp * rnd(0.3, 1)); },
  chirps(n, t0 = 0, gap = 0.2, amp = 0.035) { // the falling whistles heard in the reference
    const t = this.ac.currentTime + t0;
    for (let i = 0; i < n; i++) { const k = rnd(0.92, 1.08); this.tone(t + i * gap * rnd(0.85, 1.15), 4400 * k, 3000 * k, 0.18, amp); }
  },
  // ---- per-animation sounds ----
  ignite() { // phooljhadi lights: a fizzing flare-up
    if (!this.on) return;
    const t = this.ac.currentTime;
    this.noiseShot(t, 0.55, [['highpass', 2500], ['peaking', 6000, 0, 1]], 0.12, 0.04);
    this.crackle(t, 10, 0.4, 0.1);
  },
  launch() { // rocket: whoosh + rising whistle
    if (!this.on) return;
    const t = this.ac.currentTime;
    this.noiseShot(t, 0.6, [['bandpass', 500, 2500, 1.2]], 0.09, 0.03);
    this.tone(t + 0.05, 1200 * rnd(0.9, 1.1), 2800, 0.7, 0.02, 'sine', 0.08);
  },
  thump() { // roman candle shot: soft "pomf" + one falling whistle
    if (!this.on) return;
    const t = this.ac.currentTime;
    this.tone(t, 170, 50, 0.18, 0.3);
    this.noiseShot(t, 0.08, [['bandpass', 1200]], 0.12, 0.002);
    this.chirps(1, 0.03, 0, 0.025);
  },
  pops(n) { // crossette sub-stars popping
    if (!this.on) return;
    const t = this.ac.currentTime;
    for (let i = 0; i < n; i++) this.noiseShot(t + i * rnd(0.03, 0.08), 0.07, [['bandpass', rnd(900, 1600)]], 0.1, 0.002);
  },
  boom(scale = 1, type = 'peony') {
    if (!this.on) return;
    const t = this.ac.currentTime + 0.01, s = Math.min(scale, 1.6);
    const crowded = t - this.lastBoom < 0.08; // many bursts at once: layer quieter and skip the thump
    this.lastBoom = t;
    const v = crowded ? 0.45 : 1;
    if (!crowded) this.tone(t, 72 * rnd(0.9, 1.1), 36, 0.6, 0.45 * s);
    this.noiseShot(t, 1.6 * Math.sqrt(s), [['lowpass', 1500, 150]], 0.32 * s * v, 0.004); // long rumble
    if (type === 'crackle') this.crackle(t + 0.35, 70, 1.2, 0.14 * v);
    else if (type === 'willow') { this.noiseShot(t + 0.2, 2.5, [['highpass', 4000]], 0.03 * v, 0.4); this.crackle(t + 0.4, 10, 2, 0.06 * v); }
    else if (type === 'crossette') { this.crackle(t + 0.3, 12, 0.6, 0.1 * v); setTimeout(() => this.pops(6), 420); }
    else { this.crackle(t + 0.3, 25, 1.1, 0.1 * v); if (type === 'star' || Math.random() < 0.5) this.chirps(type === 'star' ? 4 : 3, 0.15, 0.2, 0.03 * v); }
  },
  rise(dur) { // finale: the flame climbing from your hands
    if (!this.on) return;
    const t = this.ac.currentTime;
    this.tone(t, 500, 2400, dur, 0.035, 'sine', 0.15);
    this.noiseShot(t, dur, [['bandpass', 800, 3000, 1]], 0.05, 0.2);
  },
  chime() { // soft temple-bell chord when the HAPPY DIWALI banner appears
    if (!this.on) return;
    const t = this.ac.currentTime;
    [[660, 0], [990, 0.22], [1320, 0.44]].forEach(([f, d]) =>
      [1, 2.76, 5.4].forEach((p, i) => this.tone(t + d, f * p, f * p * 0.995, 2.6 - i * 0.6, 0.045 / (i + 1), 'sine', 0.005)));
  },
};
const soundBtn = document.getElementById('sound');
function setSound(on) {
  if (on && !sound.ac) sound.init();
  sound.on = on;
  if (sound.ac) { if (on) sound.ac.resume(); else for (const k in sound.loops) sound.loops[k].gain.gain.value = 0; }
  soundBtn.classList.toggle('on', on);
  soundBtn.setAttribute('aria-pressed', on);
  soundBtn.textContent = on ? '🔊 Sound' : '🔈 Sound';
}
soundBtn.onclick = () => {
  setSound(!sound.on);
  try { localStorage.setItem('diwali-sound', sound.on ? 'on' : 'off'); } catch {}
};
// Sound is ON by default (remembers if you switch it off). Browsers only let audio actually start after
// the first tap / click / key press on the page, so the audio engine resumes on that first interaction.
let soundPref = true;
try { soundPref = localStorage.getItem('diwali-sound') !== 'off'; } catch {}
setSound(soundPref);
const unlockAudio = () => { if (sound.on && sound.ac && sound.ac.state !== 'running') sound.ac.resume(); };
for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, unlockAudio, { capture: true });

// ---------- record ----------
const recBtn = document.getElementById('rec');
let recorder = null;
recBtn.onclick = () => {
  if (recorder) { recorder.stop(); return; }
  const stream = cv.captureStream(30);
  if (sound.dest) sound.dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  const type = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
  recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: recorder.mimeType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `diwali-${Date.now()}.${recorder.mimeType.includes('mp4') ? 'mp4' : 'webm'}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    recorder = null;
    recBtn.classList.remove('on'); recBtn.textContent = '● Record'; recBtn.setAttribute('aria-pressed', false);
  };
  recorder.start();
  recBtn.classList.add('on'); recBtn.textContent = '■ Stop'; recBtn.setAttribute('aria-pressed', true);
};

// ---------- dialogs: how-to-play guide + about the creator ----------
const helpBtn = document.getElementById('helpBtn');
const aboutEl = document.getElementById('about'), aboutBtn = document.getElementById('aboutBtn');
let opener = null;
function openDialog(el, from) { opener = from; el.hidden = false; el.querySelector('.go').focus(); }
function closeDialog(el) {
  el.hidden = true; opener?.focus();
  if (el === helpEl) try { localStorage.setItem('diwali-help-seen', '1'); } catch {}
}
helpBtn.onclick = () => openDialog(helpEl, helpBtn);
aboutBtn.onclick = () => openDialog(aboutEl, aboutBtn);
for (const el of [helpEl, aboutEl]) {
  el.querySelector('.go').onclick = () => closeDialog(el);
  el.addEventListener('click', (e) => { if (e.target === el) closeDialog(el); });
}
addEventListener('keydown', (e) => { if (e.key === 'Escape') for (const el of [helpEl, aboutEl]) if (!el.hidden) closeDialog(el); });
pills.forEach((p) => (p.onclick = () => openDialog(helpEl, p))); // tapping a gesture tile explains it
let seenHelp = false;
try { seenHelp = localStorage.getItem('diwali-help-seen') === '1'; } catch {}
if (!seenHelp) openDialog(helpEl, helpBtn);

// ---------- friendly hints (occasional, never over an active gesture) ----------
const HINTS_IDLE = [
  "I'm waiting for your magic gesture! ✨",
  'Show me a gesture to light up your Diwali! 🪔',
  'Raise a hand and point ☝️ up for a rocket 🚀',
];
const HINTS_UNCLEAR = [
  "Hmm, I didn't catch that 🤔 Try a Pinch 👌, Fist ✊ or Peace ✌️",
  'Hold your gesture steady for a moment ✋',
  'Almost! Keep your fingers clear and your hand upright ✨',
];
const hintState = { until: 0, last: -1e9, i: 0, j: 0 };
function showHint(text, now) {
  hintEl.textContent = text; hintEl.classList.add('show');
  hintState.until = now + 3800; hintState.last = now;
}
function updateHints(now, active) {
  if (active || finale || !helpEl.hidden || !aboutEl.hidden || !landmarker) { hintEl.classList.remove('show'); hintState.until = 0; return; }
  if (now > hintState.until) hintEl.classList.remove('show');
  const gap = now - hintState.last;
  if (track.handsVisible && now - track.unclearSince > 2500 && gap > 12000) showHint(HINTS_UNCLEAR[hintState.i++ % HINTS_UNCLEAR.length], now);
  else if (!track.handsVisible && now - track.noHandsSince > 7000 && gap > 20000) showHint(HINTS_IDLE[hintState.j++ % HINTS_IDLE.length], now);
}

// ---------- hand tracking + strict gesture state machine ----------
// A gesture only STARTS when the strict classifier sees it for HOLD_MS, the hand stays fairly still,
// the tracker is confident, and the gesture isn't being made on the face. It stays alive while the
// loose classifier still agrees, and ends after RELEASE_MS of disagreement. COOLDOWN_MS stops the
// same gesture re-triggering from a flicker.
const HOLD_MS = 170, RELEASE_MS = 320, COOLDOWN_MS = 250, MIN_SCORE = 0.6, MAX_MOVE = 1.2, LOST_FRAMES = 6, GAP_FRAMES = 3;
const ROCKET_EVERY = 900, STAR_EVERY = 450;
const slots = new Map();
const track = { handsVisible: false, unclearSince: 0, noHandsSince: 0, namasteSince: 0, namasteGap: 0, closeAt: -1e9 };
let face = null; // {x0,y0,x1,y1} inner face zone, normalized video coords
let nextId = 0;

function onFace(lm, g) {
  if (g !== 'pinch' || !face || performance.now() - face.t > 600) return false;
  return TIPS[g].some((i) => lm[i].x > face.x0 && lm[i].x < face.x1 && lm[i].y > face.y0 && lm[i].y < face.y1);
}

function updateHands(res, now) {
  const aspect = (video.videoWidth || 16) / (video.videoHeight || 9);
  const lms = res.landmarks || [];
  const seen = new Set();
  const c = cover();

  // two hands pressed together and held -> finale; suppress per-hand gestures meanwhile
  if (lms.length === 2) {
    const a = toScreen(anchor(lms[0], 'palm')), b = toScreen(anchor(lms[1], 'palm'));
    const sz = (handSize(lms[0], aspect) + handSize(lms[1], aspect)) / 2 * c.vh * c.s;
    if (Math.hypot(a.x - b.x, a.y - b.y) < sz * 2) track.closeAt = now; // hands coming together
  }
  const merged = lms.length === 1 && now - track.closeAt < 1200 && isPrayerBlade(lms[0], aspect);
  const namaste = (lms.length === 2 && isNamaste(lms[0], lms[1], aspect)) || merged;
  if (namaste) { track.namasteGap = 0; if (!track.namasteSince) track.namasteSince = now; }
  else if (track.namasteSince && ++track.namasteGap > GAP_FRAMES) track.namasteSince = 0;
  if (track.namasteSince && now - track.namasteSince > HOLD_MS + 80 && !finale) {
    const hands = lms.length === 2 ? lms.map((lm) => toScreen(anchor(lm, 'palm')))
      : (() => { const p = toScreen(anchor(lms[0], 'palm')), w = 40 * U; return [{ x: p.x - w, y: p.y }, { x: p.x + w, y: p.y }]; })();
    startFinale(hands);
  }

  let anyCandidate = false;
  const free = [...slots.values()];
  lms.forEach((lm, i) => {
    const score = res.handednesses?.[i]?.[0]?.score ?? 1;
    const palm = toScreen(anchor(lm, 'palm')), size = handSize(lm, aspect) * c.vh * c.s;
    let s = null, best = Infinity;
    for (const q of free) { const dd = Math.hypot(q.hx - palm.x, q.hy - palm.y); if (dd < best && dd < Math.max(q.size, size) * 2.5) { best = dd; s = q; } }
    if (s) free.splice(free.indexOf(s), 1);
    else slots.set(`h${nextId}`, (s = { key: `h${nextId++}`, active: null, cand: null, candSince: 0, cx: 0, cy: 0, move: 0, gap: 0, mismatch: 0, released: {}, miss: 0, lastFire: -1e9, core: 0, power: 0, star: 0, shell: 0, charge: 0, onset: false }));
    seen.add(s.key);
    s.miss = 0; s.hx = palm.x; s.hy = palm.y; s.size = size;

    let strict = namaste || score < MIN_SCORE ? null : classify(lm, aspect, 'strict');
    if (strict && onFace(lm, strict)) strict = null; // nose rub / glasses push / lip pinch
    const at = toScreen(anchor(lm, strict || s.active || 'palm'));

    // candidate tracking: same gesture for HOLD_MS without big jumps; 1-2 noisy frames don't restart it
    if (strict === null && s.cand && ++s.gap <= GAP_FRAMES) { /* keep the candidate through a blip */ }
    else if (strict !== s.cand) { s.cand = strict; s.candSince = now; s.cx = at.x; s.cy = at.y; s.move = 0; s.gap = 0; }
    else if (strict) { s.gap = 0; s.move = Math.max(s.move, Math.hypot(at.x - s.cx, at.y - s.cy) / (s.size || 1)); }
    if (s.cand) anyCandidate = true;

    if (s.cand && s.cand !== s.active && now - s.candSince >= HOLD_MS && s.move < MAX_MOVE
        && now - (s.released[s.cand] || -1e9) > COOLDOWN_MS) {
      if (s.active) s.released[s.active] = now;
      s.active = s.cand; s.onset = true; s.mismatch = 0;
      if (s.active === 'palm') s.core = pick([0, 5, 1, 4, 3]);
    } else if (s.active) {
      const keep = !namaste && classify(lm, aspect, 'loose') === s.active;
      if (keep) s.mismatch = 0;
      else if (!s.mismatch) s.mismatch = now;
      else if (now - s.mismatch > RELEASE_MS) { s.released[s.active] = now; s.active = null; }
    }

    const p = toScreen(anchor(lm, s.active || s.cand || 'palm'));
    if (s.x === undefined) { s.x = p.x; s.y = p.y; }
    s.px = s.x; s.py = s.y;
    s.x += (p.x - s.x) * 0.7; s.y += (p.y - s.y) * 0.7; // light smoothing against jitter
    const w = toScreen(lm[0]), dl = Math.hypot(p.x - w.x, p.y - w.y) || 1;
    s.dir = { x: (p.x - w.x) / dl, y: (p.y - w.y) / dl }; // wrist -> gesture point, used to aim the roman candle
  });
  for (const [k, s] of slots) if (!seen.has(k) && ++s.miss > LOST_FRAMES) slots.delete(k);

  const anyActive = [...slots.values()].some((s) => s.active);
  track.handsVisible = lms.length > 0;
  if (!lms.length) { if (!track.noHandsSince) track.noHandsSince = now; track.unclearSince = now; }
  else {
    track.noHandsSince = 0;
    if (anyActive || anyCandidate || namaste) track.unclearSince = now;
  }
}

function runEffects(now, dt) {
  const active = new Set();
  for (const s of slots.values()) {
    if (s.miss > 0 || !s.active) continue;
    active.add(s.active);
    switch (s.active) {
      case 'pinch': phooljhadi(s, s.onset); break;
      case 'fist': anar(s, dt, s.onset); break;
      case 'palm': starburst(s, dt, s.onset); break;
      case 'peace':
        candleFuse(s);
        if (s.onset || now - s.lastFire > STAR_EVERY) { fireStar(s); s.lastFire = now; }
        break;
      case 'point':
        if (s.onset || now - s.lastFire > ROCKET_EVERY) { launchRocket(s.x, s.y, s.dir, SHELLS[s.shell++ % SHELLS.length]); s.lastFire = now; }
        break;
    }
    s.onset = false;
  }
  if (finale) active.add('namaste');
  for (const el of pills) el.classList.toggle('on', active.has(el.dataset.g));
  updateHints(now, active.size > 0);
}

// ---------- main loop ----------
let landmarker = null, faceDetector = null, lastVideoTime = -1, last = performance.now(), frameNo = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;

  if (landmarker && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    if (faceDetector && frameNo++ % 3 === 0) {
      const det = faceDetector.detectForVideo(video, now).detections[0];
      if (det) {
        const b = det.boundingBox, vw = video.videoWidth, vh = video.videoHeight;
        // inner face zone: middle 70% of the width, eyes to chin
        face = { x0: (b.originX + b.width * 0.15) / vw, x1: (b.originX + b.width * 0.85) / vw, y0: (b.originY + b.height * 0.2) / vh, y1: (b.originY + b.height) / vh, t: performance.now() };
      }
    }
    updateHands(landmarker.detectForVideo(video, now), now);
  }
  runEffects(now, dt);
  ambient();
  stepRockets(dt);
  stepFinale(dt);
  stepParticles(dt);
  stepRibbons(dt);
  stepWaves(dt);
  stepLanterns(dt);
  sound.tick(dt);

  // camera, mirrored, cover-fit, slightly dimmed with a vignette so sparks pop
  ctx.globalAlpha = 1;
  if (video.readyState >= 2) {
    const c = cover();
    ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1);
    ctx.drawImage(video, c.dx, c.dy, c.vw * c.s, c.vh * c.s);
    ctx.restore();
  } else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
  drawFinaleTint();
  drawParticles();
  if (DEBUG) {
    ctx.font = `${Math.round(14 * U / 1.45)}px system-ui`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    for (const s of slots.values()) ctx.fillText(`${s.active || '-'}  (seeing: ${s.cand || 'nothing'})`, s.hx, s.hy - s.size * 1.4);
  }

  requestAnimationFrame(frame);
}

function fail(title, text) {
  msg.className = 'err';
  msg.innerHTML = `<div><h2>${title}</h2><p>${text}</p></div>`;
}

const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
async function loadModels() {
  const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: HAND_MODEL, delegate }, runningMode: 'VIDEO', numHands: 2,
    minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.45, minTrackingConfidence: 0.45, // pressed palms score low
  });
  const hands = await HandLandmarker.createFromOptions(files, opts('GPU')).catch(() => HandLandmarker.createFromOptions(files, opts('CPU')));
  // face box lets us ignore pinches made on the face; the app still works if this model fails to load
  const fopts = (delegate) => ({ baseOptions: { modelAssetPath: FACE_MODEL, delegate }, runningMode: 'VIDEO', minDetectionConfidence: 0.5 });
  FaceDetector.createFromOptions(files, fopts('GPU')).catch(() => FaceDetector.createFromOptions(files, fopts('CPU')))
    .then((f) => (faceDetector = f), () => {});
  return hands;
}

let cameraOn = false, looping = false;
async function openCamera() {
  video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
  await video.play();
  cameraOn = true; coverCache = null;
}
function stopCamera() {
  video.srcObject?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}
// hidden tab / leaving the page: release the camera (light off, battery) and pause audio; reopen on return
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopCamera(); sound.ac?.suspend(); return; }
  if (cameraOn) openCamera().catch(() => fail('Camera stopped', 'The camera could not be reopened. Reload the page.'));
  if (sound.on) sound.ac?.resume();
});
addEventListener('pagehide', stopCamera);
addEventListener('pageshow', (e) => { if (e.persisted && cameraOn) openCamera().catch(() => {}); });

async function start() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return fail('Camera not available', 'This browser cannot access a camera. Open the page in a recent Chrome, Edge, Safari or Firefox over <b>https</b> (or <b>http://localhost</b>).');
  }
  const models = loadModels(); // downloads while the camera permission prompt is showing
  models.catch(() => {});
  try {
    await openCamera();
  } catch (e) {
    const denied = e.name === 'NotAllowedError' || e.name === 'SecurityError';
    return fail(denied ? 'Camera access blocked' : 'No camera found',
      denied ? 'Allow camera access for this site (camera icon in the address bar, or your phone\'s browser settings), then reload.'
             : `Connect a camera and make sure no other app is using it, then reload. (${e.name})`);
  }
  if (!looping) { looping = true; requestAnimationFrame(frame); }
  msg.textContent = 'Loading hand tracker…';
  try {
    landmarker = await models;
    msg.textContent = '';
    track.noHandsSince = performance.now() - 6000; // first friendly prompt shortly after start
  } catch (e) {
    fail('Hand tracker failed to load', `Check your internet connection and reload. (${e.message || e})`);
  }
}
start();
// test hook: lets test pages trigger effects without a real hand (?debug only)
if (location.search.includes('debug')) window.diwaliDebug = { startFinale, burst, anar, starburst, phooljhadi, candleFuse, fireStar, launchRocket, showHint };
