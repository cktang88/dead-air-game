// THE TIME RULE (pillar 1). Pure, DOM-free, unit tested (time-rule.test.js). All tunables live in TIME_RULE.
//
// World time follows the player's ACTUAL speed (not key-down): ~0.08x still, ~0.35x walking, 1.0x full sprint.
// The player stands outside time: movement, aim, fire rate, reload, i-frames and recoil run on the real clock.
// Everything else (enemies, bullets they fire, telegraphs, boss, thrown items, effects) runs on world time.
// Player-fired bullets ride WORLD time with a floor (PLAYER_BULLET_CLOCK below): you watch your shot travel and it
// arrives as the shot's beat advances time, SUPERHOT-style. See GAME_SPEC.md "Player bullet clock" for the decision.

export const TIME_RULE = {
  stillScale: 0.08,      // world rate with the player stationary (STILL MIND lowers it, never below stillFloor)
  stillFloor: 0.03,
  walkScale: 0.35,       // world rate at a normal walk
  sprintScale: 1,        // world rate at full sprint
  sprintRatio: 1.4,      // speed ratio at which the world reaches full rate (sprint is 1.45x walk; velocity eases up to ~1.43x)
  creditMult: 0.5,       // BORROWED TIME: world rate multiplier while time credit lasts (floored at stillFloor)
  deadSpeed: 0.04,       // speed ratio below this counts as standing still (coast tail, wall pushing)
  // Each shot lets a "beat" of world time through (seconds of world time, delivered at 1x).
  beat: {base: 0.12, min: 0.03, max: 0.2, refDamage: 30, interval: {ref: 0.25, exp: 0.5}, reload: 0.1, cap: 0.45},
  // Sprinting is loud: a footstep noise ping (enemy-brain noises) every `every` real seconds.
  sprintNoise: {radius: 150, every: 0.34, minRatio: 1.15},
};

// PRESSURE (the stand-still-duel fix). Stillness is for READING, not a free win: while an aware, armed enemy has line of
// sight to you inside its reach, the world never runs slower than `floor` x real time. A 0.3 s windup then takes ~1.4 s
// to play out (readable, but you must act); a squad that sees you keeps shooting. Breaking line of sight (cover, doors,
// smoke), stunning or killing the watchers lets time freeze again. The floor feeds the same rate the edge meter shows.
// attackFloor: an enemy that pins the world also THINKS (windup, aim lock, fire gap, duck) at no less than this x real time,
// and every hostile bullet flies at no less than bulletFloor x real time, so a frozen-looking world still has a clock you can hear tick.
export const PRESSURE = {floor: 0.22, attackFloor: 0.4, bulletFloor: 0.35, minReach: 300, meleeReach: 240, maxReach: 560};

// True when this enemy pins the world rate. `dist` is its distance to the player.
export function pressuring(e, dist, rule = PRESSURE) {
  if (!e || !e.alive || e.type === 'boss' || e.fixed) return false;
  if (!e.aware || !e.los || (e.stun || 0) > 0) return false;
  const reach = e.def?.melee ? rule.meleeReach : Math.min(rule.maxReach, Math.max(rule.minReach, (e.def?.range || 0) * 1.1));
  return dist <= reach;
}
export function pressureThreat(enemies, player, rule = PRESSURE) {
  if (!player || !enemies) return false;
  for (const e of enemies) if (e.alive && pressuring(e, Math.hypot(e.x - player.x, e.y - player.y), rule)) return true;
  return false;
}
// The clock an enemy's brain runs on this frame. k scales the floor (1 normal, 0 during freeze frames, creditMult under BORROWED TIME).
export function attackClock(worldDt, realDt, pressured, k = 1, rule = PRESSURE) {
  if (!(worldDt > 0) || !pressured || !(realDt > 0)) return worldDt;
  return Math.max(worldDt, realDt * rule.attackFloor * k);
}
export function enemyBulletDt(worldDt, realDt, k = 1, rule = PRESSURE) {
  if (!(worldDt > 0) || !(realDt > 0)) return worldDt;
  return Math.max(worldDt, realDt * rule.bulletFloor * k);
}
// Raise a world rate to the pressure floor (only when threatened and the world is actually running).
export function pressureScale(scale, threat, rule = PRESSURE) {
  return threat && scale > 0 ? Math.max(scale, rule.floor) : scale;
}

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

// Which clock player bullets fly on. 'world' = world time, but never slower than `minRate` x real time so a shot fired
// while the world is near-frozen still visibly travels (and the 0.12 s shot beat makes it arrive). 'real' = the old rule
// (bullets ignore time dilation and land instantly). Mutable on purpose: the debug page and the A/B harness flip it.
export const PLAYER_BULLET_CLOCK = {mode: 'world', minRate: 0.45};
export function playerBulletDt(worldDt, realDt, clock = PLAYER_BULLET_CLOCK) {
  if (clock.mode === 'real') return realDt;
  return Math.max(worldDt, realDt * clock.minRate);
}

// BORROWED TIME / last stand: the world runs at creditMult of whatever rate the player's speed asked for (never below
// the still floor, never above the base). Walking 0.35x -> 0.175x, sprinting 1x -> 0.5x.
export function creditScale(base, rule = TIME_RULE) {
  if (!(base > 0)) return 0;
  return Math.min(base, Math.max(rule.stillFloor, base * rule.creditMult));
}
