// Self-check for gestures.js with synthetic upright hands. Run: node gestures.test.mjs
import assert from 'node:assert/strict';
import { classify, isNamaste, isPrayerBlade } from './gestures.js';

// Build a hand with wrist at (cx, 0.8). ext = [thumb, index, middle, ring, pinky]:
// 1 = straight, 0 = curled, 0.5 = half bent (a scratching / relaxed finger).
function hand(ext, cx = 0.5, pinch = false) {
  const lm = Array.from({ length: 21 }, () => ({ x: cx, y: 0.8, z: 0 }));
  const bases = [0, -0.06, 0, 0.04, 0.08];
  for (let f = 1; f <= 4; f++) {
    const mx = cx + bases[f], my = 0.62, o = 1 + f * 4, e = ext[f];
    lm[o] = { x: mx, y: my, z: 0 };
    if (e === 1) [1, 2, 3].forEach((k) => (lm[o + k] = { x: mx + bases[f] * 0.4 * k, y: my - 0.05 * k, z: 0 }));
    else if (e === 0) { lm[o + 1] = { x: mx, y: my - 0.04, z: 0 }; lm[o + 2] = { x: mx, y: my - 0.01, z: 0 }; lm[o + 3] = { x: mx, y: my + 0.03, z: 0 }; }
    else { lm[o + 1] = { x: mx, y: my - 0.05, z: 0 }; lm[o + 2] = { x: mx, y: my - 0.08, z: -0.04 }; lm[o + 3] = { x: mx, y: my - 0.08, z: -0.09 }; }
  }
  const tx = ext[0] ? cx - 0.14 : cx - 0.03;
  [1, 2, 3, 4].forEach((k) => (lm[k] = { x: cx - 0.035 * Math.min(k, 3) + (k === 4 ? tx - cx + 0.1 : 0), y: 0.75 - 0.03 * k, z: 0 }));
  if (pinch) lm[4] = { ...lm[8], x: lm[8].x + 0.01 };
  return lm;
}
// rotate a hand around its wrist (radians), e.g. a finger pointing sideways at the face
const rotate = (lm, a) => lm.map((p) => {
  const dx = p.x - lm[0].x, dy = p.y - lm[0].y;
  return { x: lm[0].x + dx * Math.cos(a) - dy * Math.sin(a), y: lm[0].y + dx * Math.sin(a) + dy * Math.cos(a), z: p.z };
});

// clear gestures
assert.equal(classify(hand([1, 1, 1, 1, 1])), 'palm');
assert.equal(classify(hand([0, 0, 0, 0, 0])), 'fist');
assert.equal(classify(hand([0, 1, 0, 0, 0])), 'point');
assert.equal(classify(hand([0, 1, 1, 0, 0])), 'peace');
assert.equal(classify(hand([1, 1, 1, 1, 1], 0.5, true)), 'pinch');

// things that must NOT trigger
assert.equal(classify(hand([0, 1, 1, 1, 0])), null, 'three fingers is no gesture');
assert.equal(classify(hand([0, 0.5, 0.5, 0.5, 0.5])), null, 'half-bent scratching hand');
assert.equal(classify(hand([0, 1, 0.5, 0.5, 0])), null, 'point with two half-bent fingers (relaxed hand)');

// balanced: imperfect-but-clear gestures still count
assert.equal(classify(hand([0, 1, 0.5, 0, 0])), 'point', 'point with one lazy finger');
assert.equal(classify(hand([0, 1, 1, 0.5, 0])), 'peace', 'V with a lazy ring finger');
assert.equal(classify(hand([0, 0.5, 0, 0, 0])), 'fist', 'fist with a loose index');
assert.equal(classify(rotate(hand([0, 1, 1, 0, 0]), 0.8)), 'peace', 'tilted V (~45 deg)');
assert.equal(classify(rotate(hand([0, 0, 0, 0, 0]), -0.8)), 'fist', 'tilted fist');
assert.equal(classify(hand([1, 1, 0.5, 1, 1], 0.5, true)), 'pinch', 'OK sign with a lazy middle finger');
assert.equal(classify(rotate(hand([0, 1, 0, 0, 0]), Math.PI / 2)), null, 'finger pointing sideways (nose rub)');
assert.equal(classify(rotate(hand([1, 1, 1, 1, 1]), Math.PI)), null, 'upside-down palm');
assert.equal(classify(hand([1, 1, 0.5, 0.5, 0.5], 0.5, true)), null, 'pinch with a half-closed hand');
assert.equal(classify(hand([1, 1, 1, 1, 0])), null, 'palm missing the pinky');

// loose mode keeps an active gesture alive through a moderate tilt
assert.equal(classify(rotate(hand([0, 1, 1, 0, 0]), 1.4), 1, 'strict'), null);
assert.equal(classify(rotate(hand([0, 1, 1, 0, 0]), 1.4), 1, 'loose'), 'peace');

assert.equal(isNamaste(hand([1, 1, 1, 1, 1], 0.5), hand([1, 1, 1, 1, 1], 0.51)), true);
assert.equal(isNamaste(hand([1, 1, 1, 1, 1], 0.3), hand([1, 1, 1, 1, 1], 0.7)), false);
assert.equal(isNamaste(hand([0, 0, 0, 0, 0], 0.5), hand([0, 0, 0, 0, 0], 0.51)), false, 'two fists together');
assert.equal(isNamaste(hand([1, 1, 1, 1, 1], 0.5), hand([1, 1, 1, 1, 1], 0.58)), true, 'palms slightly apart (noisy tracking)');
assert.equal(isNamaste(rotate(hand([1, 1, 1, 1, 1], 0.42), 0.4), rotate(hand([1, 1, 1, 1, 1], 0.58), -0.4)), true, 'prayer hands leaning in');

// pressed palms merged by the tracker into one edge-on hand
const blade = hand([1, 1, 1, 1, 1]).map((pt, i) => (i >= 5 ? { ...pt, x: 0.5 + (pt.x - 0.5) * 0.15 } : pt));
assert.equal(isPrayerBlade(blade), true);
assert.equal(isPrayerBlade(hand([1, 1, 1, 1, 1])), false, 'spread palm is not a blade');
assert.equal(isPrayerBlade(hand([0, 0, 0, 0, 0])), false, 'fist is not a blade');
assert.equal(isPrayerBlade(rotate(blade, Math.PI / 2)), false, 'sideways flat hand');

// rocket: pointing up with a ~60 deg lean still counts, pointing sideways doesn't
assert.equal(classify(rotate(hand([0, 1, 0, 0, 0]), 1.0)), 'point');
console.log('gestures ok');
