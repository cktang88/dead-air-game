// THE TIME RULE (pillar 1). Pure, DOM-free, unit tested (time-rule.test.js). All tunables live in TIME_RULE.
//
// World time follows the player's ACTUAL speed (not key-down): ~0.08x still, ~0.35x walking, 1.0x full sprint.
// The player stands outside time: movement, aim, fire rate, reload, i-frames and recoil run on the real clock.
// Everything else (enemies, bullets they fire, telegraphs, boss, thrown items, effects) runs on world time.
// Player-fired bullets run on the real clock too (they are the player's hands), so a lone shot while still is
// cheap and lands; its price is the beat below.

export const TIME_RULE = {
  stillScale: 0.08,      // world rate with the player stationary (STILL MIND lowers it, never below stillFloor)
  stillFloor: 0.03,
  walkScale: 0.35,       // world rate at a normal walk
  sprintScale: 1,        // world rate at full sprint
  sprintRatio: 1.45,     // sprint speed / walk speed (matches game.js SPRINT_MULTIPLIER)
  deadSpeed: 0.04,       // speed ratio below this counts as standing still (coast tail, wall pushing)
  // Each shot lets a "beat" of world time through (seconds of world time, delivered at 1x).
  beat: {base: 0.12, min: 0.03, max: 0.2, refDamage: 30, interval: {ref: 0.25, exp: 0.5}, reload: 0.1, cap: 0.45},
  // Sprinting is loud: a footstep noise ping (enemy-brain noises) every `every` real seconds.
  sprintNoise: {radius: 150, every: 0.34, minRatio: 1.15},
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Speed ratio: 0 = still, 1 = full walk speed, sprintRatio = full sprint. Returns the world time scale 0..1.
export function speedTimeScale(speedRatio, {stillScale = TIME_RULE.stillScale, rule = TIME_RULE} = {}) {
  const still = clamp(stillScale, 0, rule.walkScale);
  const r = Number.isFinite(speedRatio) ? Math.max(0, speedRatio) : 0;
  if (r <= rule.deadSpeed) return still;
  if (r <= 1) return still + (rule.walkScale - still) * ((r - rule.deadSpeed) / (1 - rule.deadSpeed));
  const k = clamp((r - 1) / (rule.sprintRatio - 1), 0, 1);
  return rule.walkScale + (rule.sprintScale - rule.walkScale) * k;
}

// The rule used by the game. speedRatio = |player velocity| / walk top speed (0 when blocked by a wall).
export function timeScale({mode, paused, loadoutOpen, speedRatio = 0, idleScale = TIME_RULE.stillScale}) {
  if (mode !== 'play' || paused || loadoutOpen) return 0;
  return speedTimeScale(speedRatio, {stillScale: idleScale});
}

// Named band for UI: still / walk / sprint.
export function timeBand(speedRatio) {
  const r = Number.isFinite(speedRatio) ? speedRatio : 0;
  if (r <= TIME_RULE.deadSpeed) return 'still';
  return r >= TIME_RULE.sprintRatio * 0.9 ? 'sprint' : 'walk';
}

// World-seconds of time one shot lets through. Proportional to damage (sqrt-softened) and fire interval so a
// heavy deliberate shot costs a full beat while a spraying SMG round costs a sliver; clamped.
export function shotBeat({damage = 30, fireInterval = 0.25, pellets = 1, rule = TIME_RULE} = {}) {
  const b = rule.beat;
  const dmg = Math.sqrt(clamp((damage * Math.min(3, Math.max(1, Math.sqrt(pellets)))) / b.refDamage, 0.2, 4));
  const rate = Math.pow(clamp(fireInterval / b.interval.ref, 0.2, 4), b.interval.exp);
  return clamp(b.base * dmg * rate, b.min, b.max);
}

// Bank of owed beat time (real seconds of 1x flow). Returns {bank, extra}: extra is the world time to ADD to this
// frame's step on top of dt*scale (never more than one frame of 1x flow).
export function drainBeat(bank, dt, scale, rule = TIME_RULE) {
  const b = clamp(bank, 0, rule.beat.cap);
  const take = Math.min(b, Math.max(0, dt));
  return {bank: b - take, extra: take * Math.max(0, 1 - scale)};
}

export function addBeat(bank, beat, rule = TIME_RULE) {
  return clamp(bank + beat, 0, rule.beat.cap);
}

// Footstep noise while sprinting. Returns {timer, noise|null}; timer counts down in real seconds.
export function sprintNoiseStep(timer, dt, speedRatio, rule = TIME_RULE) {
  const n = rule.sprintNoise;
  if (!(speedRatio >= n.minRatio)) return {timer: Math.min(timer, n.every * 0.5), noise: null};
  const t = timer - dt;
  if (t > 0) return {timer: t, noise: null};
  return {timer: n.every, noise: {radius: n.radius}};
}

// Display helper: label for the small HUD rate chip.
export function rateLabel(rate) {
  const r = Number.isFinite(rate) ? Math.max(0, rate) : 0;
  return `${r.toFixed(2)}×`;
}
