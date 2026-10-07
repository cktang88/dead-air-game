// Pure helpers for the title scene (title-scene.js): the "tick" envelope, the camera drift and the bullet field.

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export const TICK_PERIOD = 7;   // seconds between ticks
export const TICK_LEN = 0.9;    // seconds a tick lasts

/**
 * The tick envelope at time t: `lurch` is the accumulated forward lurch (0..n, monotonic so the world creeps
 * forward tick by tick), `lurchRate` is 0..1 and peaks mid-tick (drives streak length and the colour pulse).
 */
export function tickPhase(t) {
  const n = Math.floor(t / TICK_PERIOD), u = clamp((t - n * TICK_PERIOD) / TICK_LEN);
  const e = u * u * (3 - 2 * u);
  return {lurch: (n + e) * 5, lurchRate: Math.sin(u * Math.PI) * (u > 0 && u < 1 ? 1 : 0)};
}

/** Slow camera drift around the scene centre (world units). Bounded, never still. */
export function driftCamera(t) {
  return {x: 26 * Math.sin(t * 0.047) + 6 * Math.sin(t * 0.13), y: 12 * Math.sin(t * 0.061 + 1) + 3 * Math.cos(t * 0.17)};
}

/** Deterministic field of hanging rounds, brass and glass around the firefight. Positions in world units. */
export function sceneBullets() {
  const out = [];
  let s = 7;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  // player tracers flying right toward the lunging chaser and the gunners
  for (let i = 0; i < 7; i++) out.push({kind: 'bullet', col: '#ffd27a', x: -80 + i * 17 + rnd() * 6, y: 22 + (rnd() - 0.5) * 22 - i * 1.2, ang: -0.12 + (rnd() - 0.5) * 0.12, len: 26 + rnd() * 30, drift: 1.1, lurch: 3});
  // enemy rounds flying left toward the player
  for (let i = 0; i < 6; i++) out.push({kind: 'bullet', col: '#ff6a64', x: 110 - i * 22 + rnd() * 8, y: -30 + i * 9 + (rnd() - 0.5) * 8, ang: Math.PI + 0.3 - i * 0.02, len: 20 + rnd() * 22, drift: 1.1, lurch: 3});
  for (let i = 0; i < 4; i++) out.push({kind: 'bullet', col: '#ff6a64', x: 80 - i * 24, y: 78 - i * 6, ang: Math.PI - 0.5, len: 22 + rnd() * 16, drift: 1.1, lurch: 3});
  // brass and glass: slower, spinning, spread wide
  for (let i = 0; i < 22; i++) out.push({kind: i % 3 ? 'brass' : 'glass', col: '#fff', x: -110 + rnd() * 270, y: -90 + rnd() * 200, ang: rnd() * 6.28, len: 3 + rnd() * 4, spin: rnd() * 6.28, drift: 0.5, lurch: 1.2});
  return out;
}

/** Where a hanging round is drawn at time t (world units), given the tick phase `ph` from tickPhase(t). Matches title-scene.js. */
export function bulletPos(b, t, ph) {
  const adv = b.drift * 9 * Math.sin(t * 0.11) + ph.lurch * b.lurch;
  return {x: b.x + Math.cos(b.ang) * adv, y: b.y + Math.sin(b.ang) * adv};
}
/** Index of the hanging round (kind 'bullet', not in `popped`) nearest to point `pt` within `radius`, or -1. Easter egg: shoot them. */
export function hitBullet(bullets, t, ph, pt, popped = new Map(), radius = 11) {
  let best = -1, bd = radius;
  bullets.forEach((b, i) => {
    if (b.kind !== 'bullet' || popped.has(i)) return;
    const q = bulletPos(b, t, ph), d = Math.hypot(q.x - pt.x, q.y - pt.y);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
export const countBullets = (bullets) => bullets.filter((b) => b.kind === 'bullet').length;
