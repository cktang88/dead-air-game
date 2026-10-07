// Small, allocation-free animation helpers for the Canvas 2D renderer: easings, springs, walk phase,
// angle smoothing and a few keyframed poses. Everything is a pure function of its arguments (or mutates
// a caller-owned object), so the renderer can run them every frame without garbage and tests can pin them.
export const TAU = Math.PI * 2;

export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const unlerp = (a, b, v) => (a === b ? 0 : clamp((v - a) / (b - a)));

// ------------------------------------------------------------------ easings (t in 0..1 -> 0..1, outBack/elastic overshoot)
export const linear = (t) => t;
export const inQuad = (t) => t * t;
export const outQuad = (t) => 1 - (1 - t) * (1 - t);
export const inOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
export const inCubic = (t) => t * t * t;
export const outCubic = (t) => 1 - (1 - t) ** 3;
export const inOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - 4 * (1 - t) ** 3);
export const inOutSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);
export const smoothstep = (t) => t * t * (3 - 2 * t);
export function outBack(t, s = 1.70158) { const u = t - 1; return 1 + u * u * ((s + 1) * u + s); }
export function outElastic(t, period = 0.4) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 2 ** (-10 * t) * Math.sin(((t - period / 4) * TAU) / period) + 1;
}
export function outBounce(t) {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) { t -= 1.5 / d; return n * t * t + 0.75; }
  if (t < 2.5 / d) { t -= 2.25 / d; return n * t * t + 0.9375; }
  t -= 2.625 / d; return n * t * t + 0.984375;
}
// Rises 0 -> 1 -> 0 over t in 0..1 (a single smooth hump).
export const pulse = (t) => (t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t));

// ------------------------------------------------------------------ smoothing
// Frame-rate independent exponential approach. rate is "per second".
export const damp = (cur, target, rate, dt) => target + (cur - target) * Math.exp(-rate * dt);
export function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; }
export const dampAngle = (cur, target, rate, dt) => cur + angDiff(cur, target) * (1 - Math.exp(-rate * dt));

// ------------------------------------------------------------------ springs
// A spring is a plain {x, v} object. stepSpring integrates toward `target` with stiffness k and damping c using
// fixed sub-steps so large frame times (slow GPUs, hitstop recovery) cannot blow it up.
export const newSpring = (x = 0) => ({x, v: 0});
export function stepSpring(s, target, k, c, dt) {
  if (dt <= 0) return s;
  const n = Math.min(8, Math.ceil(dt / 0.008)), h = Math.min(dt, 0.064) / n;
  for (let i = 0; i < n; i++) {
    s.v += ((target - s.x) * k - s.v * c) * h;
    s.x += s.v * h;
  }
  return s;
}
// Damping for a given stiffness and damping ratio (1 = critically damped, <1 overshoots).
export const springDamping = (k, ratio = 0.5) => 2 * ratio * Math.sqrt(k);
export const settled = (s, target = 0, eps = 0.01) => Math.abs(s.x - target) < eps && Math.abs(s.v) < eps * 4;

// ------------------------------------------------------------------ walking
// Phase counts full gait cycles (two steps) and is driven by distance travelled, so feet never slide at any
// speed and a slowed world slows the cadence by itself (distance per world-second falls with the time scale).
export function walkPhase(phase, speed, stride, dt) {
  if (!(speed > 0) || !(stride > 0) || !(dt > 0)) return phase;
  const next = phase + (speed * dt) / stride;
  return next - Math.floor(next);
}
// Fills out.a / out.b (forward foot offsets, -1..1), out.lift (0..1 foot raise of each foot) and out.bob (0..1, twice per cycle).
export function walkPose(phase, out) {
  const s = Math.sin(phase * TAU), c = Math.cos(phase * TAU);
  out.a = s; out.b = -s;
  out.liftA = c > 0 ? c : 0; out.liftB = c < 0 ? -c : 0;
  out.bob = 0.5 - 0.5 * Math.cos(phase * TAU * 2);
  return out;
}
// 0..1 amount of "moving" from a speed against a reference run speed.
export const moveAmount = (speed, ref = 70) => clamp(speed / ref);

// ------------------------------------------------------------------ keyframed poses
// Reload choreography for the player's off-hand and gun. frac runs 0..1 over the whole reload.
//   tilt   gun roll in radians (positive = muzzle dips toward the actor's right)
//   hx,hy  front-hand offset from its on-gun home (gun space, px)
//   mag    0 = mag in gun, 1 = hand holds fresh mag away from the gun
//   seat   0..1 pulse when the new mag clicks home
//   rack   0..1 charging-handle pull (hand slides back along the gun, then returns)
export function reloadPose(frac, out) {
  const f = clamp(frac);
  let tilt = 0, hx = 0, hy = 0, mag = 0, seat = 0, rack = 0;
  if (f < 0.2) { // tilt up and hit the mag release, hand drops away
    const u = outCubic(f / 0.2);
    tilt = 0.95 * u; hx = -2 * u; hy = 2 * u;
  } else if (f < 0.62) { // hand fetches a fresh mag from the hip
    const u = (f - 0.2) / 0.42;
    tilt = 0.95 - 0.12 * pulse(u); hx = -2 - 6 * outQuad(Math.min(1, u * 1.4)); hy = 2 + 5 * pulse(Math.min(1, u * 1.2) * 0.5 + 0.0) + 3 * u;
    mag = unlerp(0.25, 0.7, u);
  } else if (f < 0.82) { // bring the mag up and seat it
    const u = (f - 0.62) / 0.2, e = inOutCubic(u);
    tilt = 0.95 * (1 - e) + 0.18 * e; hx = -8 * (1 - e); hy = 9 * (1 - e) + 1; mag = 1;
    if (u > 0.82) seat = pulse((u - 0.82) / 0.18);
  } else { // rack the action
    const u = (f - 0.82) / 0.18;
    tilt = 0.18 * (1 - outCubic(u)); hx = -7 * pulse(u); hy = 1 - 1 * u; mag = 0; rack = pulse(u);
  }
  out.tilt = tilt; out.hx = hx; out.hy = hy; out.mag = mag; out.seat = seat; out.rack = rack;
  return out;
}

// Weapon swap: p runs 0..1. First half holsters the old gun, second half draws the new one.
//   which 0 = old gun is showing, 1 = new gun; rot roll in radians, dx pull-in, k scale 0..1 (how "out" the gun is)
export function swapPose(p, out) {
  const t = clamp(p);
  if (t < 0.45) {
    const u = inQuad(t / 0.45);
    out.which = 0; out.rot = 1.35 * u; out.dx = -4 * u; out.k = 1 - 0.45 * u;
  } else {
    const u = (t - 0.45) / 0.55, e = outBack(u, 2.2);
    out.which = 1; out.rot = -1.2 * (1 - e); out.dx = -4 * (1 - e); out.k = 0.55 + 0.45 * Math.min(1, e);
  }
  return out;
}

// Zoom the camera wants this frame: out when sprinting, a little in when time is slow, plus a decaying punch.
export function cameraZoom({sprint = 0, slow = 0, punch = 0, motion = 1} = {}) {
  const m = clamp(motion);
  return 1 - 0.045 * sprint * m + 0.01 * slow * m + punch * m;
}
