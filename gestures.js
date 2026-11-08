// Pure landmark -> gesture classification. Landmarks: 21 MediaPipe hand points {x,y,z} (normalized).
// `aspect` = video width / height so x and y distances are comparable.
//
// Two modes:
//  strict (default) - used to START a gesture. Every finger must be clearly straight or clearly curled,
//                     the hand must be upright, and the gesture's own geometry must hold. Anything
//                     ambiguous (scratching, rubbing a nose, adjusting glasses) returns null.
//  loose            - used to KEEP an already-active gesture alive (hysteresis), so a sparkler
//                     doesn't flicker off when the hand tilts a little while moving.

const d = (a, b, k) => Math.hypot((a.x - b.x) * k, a.y - b.y, (a.z - b.z) * k);

export function handSize(lm, aspect = 1) {
  return d(lm[0], lm[9], aspect); // wrist -> middle knuckle
}

// angle at b (degrees) between b->a and b->c
function angle(a, b, c, k) {
  const ux = (a.x - b.x) * k, uy = a.y - b.y, uz = (a.z - b.z) * k;
  const vx = (c.x - b.x) * k, vy = c.y - b.y, vz = (c.z - b.z) * k;
  const cos = (ux * vx + uy * vy + uz * vz) / (Math.hypot(ux, uy, uz) * Math.hypot(vx, vy, vz) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

const FINGERS = { index: [5, 6, 7, 8], middle: [9, 10, 11, 12], ring: [13, 14, 15, 16], pinky: [17, 18, 19, 20] };
// Calibrated on MediaPipe output for the reference video: straight fingers measured 152-176 deg with
// reach 1.23-1.48; curled fingers 100-130 deg with reach 0.56-0.84. "reach" = wrist->tip / wrist->pip.
const T = {
  strict: { ext: 150, reach: 1.15, curlBend: 140, curlReach: 0.9 },
  loose: { ext: 135, reach: 1.05, curlBend: 155, curlReach: 1.0 },
};

// 'ext' | 'curl' | 'mid' for one finger
function fingerState(lm, [mcp, pip, dip, tip], k, t) {
  const bend = Math.min(angle(lm[mcp], lm[pip], lm[dip], k), angle(lm[pip], lm[dip], lm[tip], k));
  const reach = d(lm[0], lm[tip], k) / d(lm[0], lm[pip], k);
  if (bend > t.ext && reach > t.reach) return 'ext';
  if (bend < t.curlBend && reach < t.curlReach) return 'curl';
  return 'mid';
}

export function fingers(lm, aspect = 1, mode = 'strict') {
  const t = T[mode];
  const out = {};
  for (const [name, ids] of Object.entries(FINGERS)) out[name] = fingerState(lm, ids, aspect, t);
  return out;
}

// how "up" a finger points: -1 straight down .. 1 straight up (screen y grows downward)
function upness(lm, from, to, k) {
  const dx = (lm[to].x - lm[from].x) * k, dy = lm[to].y - lm[from].y;
  return -dy / (Math.hypot(dx, dy) || 1);
}

function thumbOut(lm, k, s) {
  return angle(lm[2], lm[3], lm[4], k) > 130 && d(lm[4], lm[9], k) > s * 0.5;
}

// Balanced finger reading. Each finger is 'up' (clearly raised), 'down' (folded) or '?' (in between).
// A gesture tolerates one '?' among the fingers that should be folded: real people don't fold a ring or
// pinky perfectly when they point or make a V. What it never accepts is a finger raised where it should
// be folded, or the gesture's own key fingers being unclear. A half-bent scratching hand gives several '?'.
function readFingers(lm, k, mode) {
  const t = T[mode], out = {};
  for (const [name, [mcp, pip, dip, tip]] of Object.entries(FINGERS)) {
    const bend = Math.min(angle(lm[mcp], lm[pip], lm[dip], k), angle(lm[pip], lm[dip], lm[tip], k));
    const reach = d(lm[0], lm[tip], k) / d(lm[0], lm[pip], k);
    out[name] = (bend > t.ext && reach > t.reach) || (bend > 140 && reach > 1.1) ? 'up'
      : (bend < t.curlBend && reach < t.curlReach) || reach < 0.95 ? 'down' : '?';
  }
  return out;
}
const folded = (list) => list.every((x) => x !== 'up') && list.filter((x) => x === '?').length <= 1;

// Returns 'pinch' | 'point' | 'peace' | 'palm' | 'fist' | null
export function classify(lm, aspect = 1, mode = 'strict') {
  const strict = mode === 'strict';
  const s = handSize(lm, aspect);
  const { index: i, middle: m, ring: r, pinky: p } = readFingers(lm, aspect, mode);
  // wrist below the knuckles; sideways or upside-down hands (rubbing a nose, scratching an ear) never count.
  // ~70 deg of tilt is allowed to start a gesture, almost anything short of upside-down to keep one.
  if (upness(lm, 0, 9, aspect) < (strict ? 0.3 : -0.1)) return null;

  // pinch: thumb tip touching index tip, index still out past its knuckle (not a fist with the thumb on top).
  // Reference pinches measured 0.20-0.30 hand-widths between the tips.
  const pinchGap = d(lm[4], lm[8], aspect);
  const indexOut = d(lm[0], lm[8], aspect) > d(lm[0], lm[5], aspect) * 1.05;
  if (pinchGap < s * (strict ? 0.38 : 0.5) && indexOut) {
    // a half-closed grooming hand has all three other fingers unclear; an OK sign or a relaxed pinch
    // (reference frame 9.0 s: middle up, ring + pinky loose) has at most two
    return !strict || [m, r, p].filter((x) => x === '?').length <= 2 ? 'pinch' : null;
  }

  if (i === 'up' && m === 'up' && r === 'up' && p === 'up') {
    if (!strict) return 'palm';
    const spread = d(lm[8], lm[20], aspect) > s * 0.5;
    return spread && thumbOut(lm, aspect, s) && upness(lm, 9, 12, aspect) > 0.3 ? 'palm' : null;
  }
  if (i !== 'up' && folded([i, m, r, p]) && [i, m, r, p].filter((x) => x === 'down').length >= 3) {
    // thumb tucked or across the fingers, not stuck out sideways (thumbs-up / random hand)
    return !strict || d(lm[4], lm[9], aspect) < s * 1.0 ? 'fist' : null;
  }
  if (i === 'up' && m !== 'up' && folded([m, r, p])) {
    return !strict || upness(lm, 5, 8, aspect) > 0.3 ? 'point' : null; // up to ~70 deg tilt (rockets aim with it)
  }
  if (i === 'up' && m === 'up' && folded([r, p])) {
    if (!strict) return 'peace';
    const v = d(lm[8], lm[12], aspect) > s * 0.18; // a V, not two fingers pressed together
    return v && upness(lm, 5, 8, aspect) > 0.3 && upness(lm, 9, 12, aspect) > 0.3 ? 'peace' : null;
  }
  return null;
}

// Two hands pressed together (prayer / namaste). Pressed palms hide each other from the camera, so the
// tracker's landmarks for them are noisy and often slightly apart: require "not a fist", roughly upright
// hands, and fingertips / knuckles / wrists close together, with generous distances.
const notFist = (lm, k) => Object.values(fingers(lm, k, 'loose')).filter((x) => x !== 'curl').length >= 2;
export function isNamaste(a, b, aspect = 1) {
  const s = (handSize(a, aspect) + handSize(b, aspect)) / 2;
  return notFist(a, aspect) && notFist(b, aspect)
    && upness(a, 0, 9, aspect) > 0.3 && upness(b, 0, 9, aspect) > 0.3
    && d(a[12], b[12], aspect) < s * 1.0 && d(a[9], b[9], aspect) < s * 1.0 && d(a[0], b[0], aspect) < s * 1.4;
}

// When palms are pressed flat together the tracker often merges them into ONE hand seen edge-on:
// upright, fingers pointing up and squeezed together. The app only accepts this right after it saw
// two hands come together, so a single flat hand on its own never starts the finale.
export function isPrayerBlade(lm, aspect = 1) {
  const s = handSize(lm, aspect);
  return notFist(lm, aspect) && upness(lm, 0, 9, aspect) > 0.4 && upness(lm, 9, 12, aspect) > 0.3
    && d(lm[8], lm[20], aspect) < s * 0.45; // fingertips squeezed together, not a spread palm
}

// Screen-space anchor (normalized) where a gesture's effect is emitted.
export function anchor(lm, gesture) {
  const avg = (...ids) => ({
    x: ids.reduce((t, i) => t + lm[i].x, 0) / ids.length,
    y: ids.reduce((t, i) => t + lm[i].y, 0) / ids.length,
  });
  switch (gesture) {
    case 'pinch': return avg(4, 8);
    case 'point': return avg(8);
    case 'peace': return avg(8, 12);
    case 'fist': return avg(6, 10, 14, 18); // top of the fist
    default: return avg(0, 5, 9, 17); // palm centre
  }
}

// Which landmark ids are the "business end" of a gesture (used to reject gestures made on the face).
export const TIPS = { pinch: [4, 8], point: [8], peace: [8, 12], fist: [6, 10, 14, 18], palm: [0, 5, 9, 17] };
