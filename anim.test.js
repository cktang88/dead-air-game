import test from 'node:test';
import assert from 'node:assert/strict';
import {
  angDiff, cameraZoom, clamp, damp, dampAngle, inCubic, inOutCubic, inOutQuad, inOutSine, inQuad, lerp, newSpring, outBack, outBounce,
  outCubic, outElastic, outQuad, pulse, reloadPose, settled, smoothstep, springDamping, stepSpring, swapPose, unlerp, walkPhase, walkPose,
} from './anim.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('easings hit their endpoints', () => {
  for (const f of [inQuad, outQuad, inOutQuad, inCubic, outCubic, inOutCubic, inOutSine, smoothstep, outBack, outBounce, outElastic]) {
    near(f(0), 0, 1e-6); near(f(1), 1, 1e-6);
  }
});

test('easings stay monotonic where they should and overshoot where they should', () => {
  for (const f of [inQuad, outQuad, inCubic, outCubic, inOutCubic, smoothstep]) {
    let last = -1;
    for (let i = 0; i <= 20; i++) { const v = f(i / 20); assert.ok(v >= last - 1e-12); last = v; }
  }
  assert.ok(Math.max(...Array.from({length: 41}, (_, i) => outBack(i / 40))) > 1.05);
  assert.ok(Math.max(...Array.from({length: 41}, (_, i) => outElastic(i / 40))) > 1.05);
  assert.ok(Array.from({length: 41}, (_, i) => outBounce(i / 40)).every((v) => v >= 0 && v <= 1.0001));
  near(pulse(0.5), 1); near(pulse(0), 0); near(pulse(1), 0);
});

test('clamp, lerp and unlerp', () => {
  assert.equal(clamp(5), 1); assert.equal(clamp(-1), 0); assert.equal(clamp(7, 2, 5), 5);
  near(lerp(2, 4, 0.25), 2.5); near(unlerp(2, 4, 3), 0.5); assert.equal(unlerp(1, 1, 5), 0);
});

test('damp approaches independent of how the time is sliced', () => {
  let a = 0; for (let i = 0; i < 60; i++) a = damp(a, 1, 8, 1 / 60);
  const b = damp(0, 1, 8, 1);
  near(a, b, 1e-9);
  assert.ok(b > 0.99);
});

test('angDiff and dampAngle take the short way round the circle', () => {
  near(angDiff(3.0, -3.0), 2 * Math.PI - 6.0, 1e-9);
  near(angDiff(-3.0, 3.0), -(2 * Math.PI - 6.0), 1e-9);
  const a = dampAngle(3.1, -3.1, 20, 0.05);
  assert.ok(a > 3.1, 'turns forward across the seam, not backward through zero');
});

test('spring converges, overshoots when underdamped and stays stable with huge dt', () => {
  const k = 200, s = newSpring(0); s.x = 1;
  let peak = 0;
  for (let i = 0; i < 240; i++) { stepSpring(s, 0, k, springDamping(k, 0.3), 1 / 60); peak = Math.min(peak, s.x); }
  assert.ok(peak < -0.05, 'underdamped swings past the target');
  assert.ok(settled(s, 0, 0.01));
  const big = newSpring(1);
  for (let i = 0; i < 20; i++) stepSpring(big, 0, 300, springDamping(300, 0.7), 1.5);
  assert.ok(Number.isFinite(big.x) && Math.abs(big.x) < 2);
  const crit = newSpring(1);
  let under = 1;
  for (let i = 0; i < 300; i++) { stepSpring(crit, 0, k, springDamping(k, 1), 1 / 60); under = Math.min(under, crit.x); }
  assert.ok(under > -0.01, 'critically damped does not overshoot');
});

test('walk phase advances with distance, wraps, and cadence scales with speed', () => {
  near(walkPhase(0, 60, 30, 0.5), 0 + 1 - 1 + (60 * 0.5) / 30 - 1, 1e-9); // 1 cycle -> wraps to 0
  const slow = walkPhase(0, 30, 60, 0.5), fast = walkPhase(0, 60, 60, 0.5);
  near(fast, slow * 2);
  assert.equal(walkPhase(0.3, 0, 30, 1), 0.3);
  assert.equal(walkPhase(0.3, 50, 0, 1), 0.3);
  // slowing the world (smaller dt for the same real speed) slows the cadence proportionally
  near(walkPhase(0, 80, 80, 0.18 / 10), 0.018);
  for (let i = 0; i < 1000; i++) { const p = walkPhase(i / 1000, 90, 40, 0.0166); assert.ok(p >= 0 && p < 1); }
});

test('walkPose alternates the feet and bobs twice per cycle', () => {
  const o = {};
  walkPose(0.25, o); near(o.a, 1); near(o.b, -1);
  walkPose(0.75, o); near(o.a, -1); near(o.b, 1);
  walkPose(0, o); near(o.bob, 0); walkPose(0.25, o); near(o.bob, 1); walkPose(0.5, o); near(o.bob, 0);
  walkPose(0, o); assert.ok(o.liftA > 0.99 && o.liftB === 0);
});

test('reload choreography is continuous at phase boundaries and hands the mag over', () => {
  const a = {}, b = {};
  for (const edge of [0.2, 0.62, 0.82]) {
    reloadPose(edge - 1e-6, a); reloadPose(edge + 1e-6, b);
    near(a.tilt, b.tilt, 0.02); near(a.hx, b.hx, 0.5); near(a.hy, b.hy, 0.5);
  }
  reloadPose(0, a); near(a.tilt, 0); reloadPose(1, a); near(a.tilt, 0, 1e-6);
  reloadPose(0.5, a); assert.ok(a.mag > 0.3, 'fresh mag in the hand mid-reload');
  reloadPose(0.97, a); assert.ok(a.rack >= 0);
  let seen = 0; for (let f = 0.6; f <= 0.84; f += 0.005) { reloadPose(f, a); seen = Math.max(seen, a.seat); }
  assert.ok(seen > 0.5, 'mag seat click happens');
});

test('swap pose holsters then draws', () => {
  const o = {};
  swapPose(0.1, o); assert.equal(o.which, 0);
  swapPose(0.44, o); assert.ok(o.k < 0.7);
  swapPose(0.9, o); assert.equal(o.which, 1);
  swapPose(1, o); near(o.rot, 0, 1e-6); near(o.k, 1, 1e-6);
});

test('camera zoom: sprint pulls out, slow time pushes in, reduced motion disables both and punches', () => {
  assert.ok(cameraZoom({sprint: 1}) < 1);
  assert.ok(cameraZoom({slow: 1}) > 1);
  assert.ok(cameraZoom({punch: 0.04}) > 1);
  assert.equal(cameraZoom({sprint: 1, slow: 1, punch: 0.05, motion: 0}), 1);
  assert.equal(cameraZoom(), 1);
});
