// Pure game-feel logic for DEAD AIR: movement dynamics, time-scale easing, gun bloom/recoil,
// knockback, hitstop, reload timing and the sim -> renderer/audio event queue.
// Nothing here touches the DOM, Three.js or Rapier, so it is all unit tested (feel.test.js).

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ------------------------------------------------------------------ movement */

// Frame-rate independent exponential approach (rate is 1/seconds).
export function approach(current, target, rate, dt) {
  return target + (current - target) * Math.exp(-Math.max(0, rate) * Math.max(0, dt));
}

export const MOVE_TUNING = {
  accel: 24,       // 1/s toward wish velocity (~90% in 0.1s: snappy)
  friction: 17,    // 1/s toward rest when no input (short, weighty coast)
  turnBoost: 1.6,  // extra accel when reversing so direction changes bite
  sprintAccelMul: 0.8, // sprinting winds up a touch slower
};

// How much the carried rig slows the player. load = weight / capacity.
export function loadoutMobility(weight, capacity) {
  const cap = capacity > 0 ? capacity : 7;
  const load = clamp((Number.isFinite(weight) ? weight : 0) / cap, 0, 1.25);
  return { load, speedMul: 1 - 0.07 * load, accelMul: 1 - 0.22 * load, frictionMul: 1 - 0.12 * load };
}

// One velocity integration step. wish is a unit-or-zero direction. Returns new {x,y}.
export function stepVelocity(vel, wish, { topSpeed, accelMul = 1, frictionMul = 1, sprint = false }, dt, tune = MOVE_TUNING) {
  const wl = Math.hypot(wish.x, wish.y);
  if (wl < 1e-6) {
    const k = Math.exp(-tune.friction * frictionMul * dt);
    return { x: vel.x * k, y: vel.y * k };
  }
  const wx = wish.x / wl, wy = wish.y / wl; // diagonal normalisation
  const tx = wx * topSpeed, ty = wy * topSpeed;
  const reversing = vel.x * wx + vel.y * wy < 0;
  const rate = tune.accel * accelMul * (sprint ? tune.sprintAccelMul : 1) * (reversing ? tune.turnBoost : 1);
  const k = 1 - Math.exp(-rate * dt);
  return { x: vel.x + (tx - vel.x) * k, y: vel.y + (ty - vel.y) * k };
}

// The physics body moved less than commanded (wall/crate): drop that much velocity so we do not
// "wind up" against a wall and then shoot off on release. expected/moved are displacements.
export function clipBlockedVelocity(vel, moved, expected, step) {
  if (!(step > 1e-5)) return vel;
  const fix = (v, m, e) => {
    if (Math.abs(e) < 1e-4) return v;
    const ratio = m / e; // 1 = unobstructed, 0 = fully blocked, <0 pushed back
    return ratio >= 0.85 ? v : v * Math.max(0, ratio) ;
  };
  return { x: fix(vel.x, moved.x, expected.x), y: fix(vel.y, moved.y, expected.y) };
}

// Pressing exactly diagonally into a convex corner pins a circle on the vertex (the contact normal is
// parallel to the wish, so nothing slides). When almost fully blocked on a diagonal, nudge sideways so the
// circle rolls off the corner. sign (+1/-1) picks the side; flip it if it stays stuck.
export function cornerNudge(wish, blockedRatio, topSpeed, sign = 1) {
  if (!(blockedRatio < 0.35)) return { x: 0, y: 0 };
  if (Math.abs(wish.x) < 0.35 || Math.abs(wish.y) < 0.35) return { x: 0, y: 0 };
  const power = topSpeed * 0.3 * sign;
  return { x: -wish.y * power, y: wish.x * power };
}

// Knockback impulse velocity (px/s) the player takes from a hit, decays via approach().
export function playerHitKnock(dx, dy, healthDamage) {
  const len = Math.hypot(dx, dy) || 1;
  const power = healthDamage > 0 ? 190 : 110;
  return { x: dx / len * power, y: dy / len * power };
}
export const KNOCK_DECAY = 11; // 1/s

/* ----------------------------------------------------------------- time scale */

export const TIME_EASE = { up: 34, down: 20 }; // 1/s. up: toward faster, down: toward slower (~0.12s to settle)

// Smooth the discrete rule output (rules.js timeScale) so slow-mo breathes. A 0 target (paused,
// menus, not playing) snaps immediately so UI never feels laggy.
export function easeTimeScale(current, target, dt) {
  if (!Number.isFinite(current)) return target;
  if (target <= 0) return 0;
  if (Math.abs(current - target) < 1e-3) return target;
  return approach(current, target, target > current ? TIME_EASE.up : TIME_EASE.down, dt);
}

/* ------------------------------------------------------------------- gun feel */

// Per-category feel, informed by Skirmish GUN_RULES (bloom, moving spread, first-shot accuracy).
// bloom 0..1 grows by perShot, holds for settle (game seconds), then recovers at recover per second.
// spread = base * (1 + bloom*(bloomMul-1)) + bloom*bloomAdd, then moving factor, then first-shot factor.
const FEEL = {
  PISTOL:          { perShot: .30, settle: .22, recover: 2.6, bloomMul: 2.2, bloomAdd: .010, moveMul: 1.15, moveAdd: .006, firstMul: .45, kick: .55, shake: 2.0, nudge: 14 },
  SMG:             { perShot: .13, settle: .12, recover: 2.0, bloomMul: 2.6, bloomAdd: .022, moveMul: 1.2,  moveAdd: .010, firstMul: .6,  kick: .45, shake: 1.8, nudge: 10 },
  'ASSAULT RIFLE': { perShot: .16, settle: .18, recover: 2.2, bloomMul: 2.0, bloomAdd: .018, moveMul: 1.3,  moveAdd: .012, firstMul: .35, kick: .7,  shake: 2.4, nudge: 20 },
  SHOTGUN:         { perShot: .45, settle: .30, recover: 2.0, bloomMul: 1.25, bloomAdd: .020, moveMul: 1.1, moveAdd: .0,   firstMul: 1,   kick: 1.0, shake: 4.0, nudge: 70 },
  SNIPER:          { perShot: .8,  settle: .35, recover: 1.4, bloomMul: 1.0, bloomAdd: .035, moveMul: 1.0,  moveAdd: .045, firstMul: .3,  kick: 1.0, shake: 3.2, nudge: 55 },
  LAUNCHER:        { perShot: .9,  settle: .4,  recover: 1.3, bloomMul: 1.0, bloomAdd: .02,  moveMul: 1.0,  moveAdd: .03,  firstMul: .5,  kick: 1.1, shake: 3.4, nudge: 60 },
  'ANTI-MATERIEL': { perShot: 1,   settle: .45, recover: 1.1, bloomMul: 1.0, bloomAdd: .045, moveMul: 1.0,  moveAdd: .06,  firstMul: .3,  kick: 1.4, shake: 5.0, nudge: 110 },
};
const DEFAULT_FEEL = FEEL.PISTOL;

export function gunFeel(gun) {
  const base = { ...(FEEL[gun?.category] || DEFAULT_FEEL), ...(gun?.feel || {}) }; // per-gun overrides (catalog `feel`)
  // Heavier hitters kick harder: scale kick a little with damage/rate (cheap proxy for "caliber").
  const power = clamp(((gun?.damage ?? 25) * (gun?.count || 1)) / 45, .6, 1.8);
  const kick = base.kick * (0.75 + 0.25 * power);
  // Settle never undercuts the gun's own cadence, so sustained fire keeps blooming between shots.
  return { ...base, kick, shake: base.shake * (0.85 + 0.15 * power), settle: Math.max(base.settle, (gun?.rate || 0) * 1.25) };
}

export function newBloom() { return { value: 0, sinceShot: 99 }; }

// Advance the recovery timers by dt (game seconds). Mutates and returns b.
export function stepBloom(b, dt, feel) {
  b.sinceShot += dt;
  if (b.sinceShot > feel.settle) b.value = Math.max(0, b.value - feel.recover * dt);
  return b;
}

// Record a shot: returns true if it was a "first shot" (settled gun) and grows the bloom.
export function registerShot(b, feel) {
  const first = b.value < 0.02 && b.sinceShot > feel.settle;
  b.value = Math.min(1, b.value + feel.perShot);
  b.sinceShot = 0;
  return first;
}

// moveRatio 0..1 (speed / run speed). Returns the effective spread (radians, total width).
export function effectiveSpread(base, b, feel, moveRatio = 0, first = false) {
  let s = base * (1 + b.value * (feel.bloomMul - 1)) + b.value * feel.bloomAdd;
  s = s * (1 + (feel.moveMul - 1) * moveRatio) + feel.moveAdd * moveRatio;
  if (first) s *= feel.firstMul;
  return s;
}

// Even fan of `count` pellets centred on aim with total width `spread`; `jitter` (radians) shifts
// the whole fan (the shot's aim error). count 1 -> single angle. Matches Skirmish's pelletOffset.
export function fanAngles(aim, count, spread, jitter = 0) {
  if (count <= 1) return [aim + jitter];
  const out = [];
  for (let i = 0; i < count; i++) out.push(aim + jitter + (i / (count - 1) - 0.5) * spread);
  return out;
}

// Where the round actually leaves the barrel. Bullets and tracers start here.
export function muzzleDistance(gun) {
  return (gun?.visual?.art === 'PISTOL' ? 11 : 5) + 0.7 * (gun?.visual?.length ?? 20);   // = sprites2d gunMuzzle(gun)
}
export function muzzlePoint(x, y, dx, dy, gun) {
  const d = muzzleDistance(gun);
  return { x: x + dx * d, y: y + dy * d };
}

// Fire cadence that keeps the true gun rate even though shots land on frame boundaries.
export function nextFireTime(now, prevNext, rate, step) {
  return (now - prevNext < step && prevNext > 0 ? prevNext : now) + rate;
}

// Click pressed slightly before the cooldown ends still fires (game seconds).
export const PRESS_BUFFER = 0.1;

// Recoil: kick magnitude decays on the real clock. Returns a new recoil object.
export function stepRecoil(recoil, dt) {
  const k = Math.exp(-16 * dt);
  return { x: recoil.x * k, y: recoil.y * k, amount: recoil.amount * k };
}
export function addRecoil(recoil, aimX, aimY, kick) {
  const amount = Math.min(2, recoil.amount + kick);
  return { x: -aimX * kick * 4 + recoil.x * .5, y: -aimY * kick * 4 + recoil.y * .5, amount };
}

/* ---------------------------------------------------------------------- hits */

// Enemy knockback velocity magnitude from a bullet's damage. Brutes shrug it off.
export function enemyKnockback(damage, type) {
  const mass = type === 'brute' ? 0.4 : type === 'riot' ? 0.35 : type === 'guard' ? 0.8 : 1;
  return clamp(40 + damage * 2.2, 40, 260) * mass;
}
export const ENEMY_KNOCK_DECAY = 7; // 1/s

// Freeze-frame length (seconds, real time). Tiny on ordinary hits, longer on kills / heavy rounds.
export function hitstopFor({ kill = false, damage = 0 } = {}) {
  const weight = clamp(damage / 80, 0, 1);
  return kill ? 0.065 + 0.045 * weight : 0.012 + 0.014 * weight;
}

/* -------------------------------------------------------------------- reload */

// Tactical reload (rounds left in the mag) is quicker than an empty-chamber reload.
export function reloadTime(base, ammoLeft) {
  return base * (ammoLeft > 0 ? 0.85 : 1);
}

/* -------------------------------------------------------------------- events */

// state.events is the sim -> renderer/audio queue. Consumers read it and set `length = 0`.
export const EVENT_CAP = 256;
export function pushEvent(events, event, cap = EVENT_CAP) {
  events.push(event);
  if (events.length > cap) events.splice(0, events.length - cap);
  return event;
}

// Time follows ACTUAL displacement: pushing into a wall keeps the key down and the commanded velocity up, but the
// body goes nowhere, so the world must stay slow. `actual` is the smoothed measured speed (px/s) or undefined/NaN
// before the first measurement (then the commanded speed stands).
export function effectiveSpeedRatio(cmdSpeed, actual, walkTop) {
  const top = Math.max(1, walkTop || 112);
  const cmd = Math.max(0, cmdSpeed || 0);
  const a = Number.isFinite(actual) ? Math.max(0, actual) : cmd;
  return Math.min(cmd, a) / top;
}
export function smoothActualSpeed(prev, raw, dt) {
  if (!Number.isFinite(raw)) return prev;
  if (!Number.isFinite(prev)) return raw;
  const k = raw > prev ? 40 : 25;
  return prev + (raw - prev) * (1 - Math.exp(-k * Math.max(0, dt)));
}
