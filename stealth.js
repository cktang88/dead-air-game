// DEAD AIR stealth + fair-lethality rules. Pure: plain data in, plain data out. No DOM, no Rapier, no clocks.
// Every rule here is something the player can SEE (cones, suspicion meters, noise rings, damage labels); the
// renderer for them lives in stealth2d.js. Times are scaled seconds (they slow with the world).

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------------------- vision cones
// Unaware enemies only see inside a cone (half-angle in radians, range in px). Aware enemies keep 360 degree
// sight at `range` (they already know where you are). Sleepers have no cone.
export const VISION = {
  default: {half: 50 * DEG, range: 420},
  sniper: {half: 24 * DEG, range: 560},   // narrower and longer: a lane, not a wedge
  guard: {half: 46 * DEG, range: 400},
  riot: {half: 56 * DEG, range: 340},
  chaser: {half: 62 * DEG, range: 340},   // rushers are twitchy: wide but short
  brute: {half: 56 * DEG, range: 360},
};
// BLACKOUT (frequencies.js) shrinks every cone. The scale lives here so the brain that senses and the renderer that draws
// the cone read the same numbers (what you see is what they see).
export const CONE_SCALE = {range: 1, half: 1};
export const setConeScale = ({range = 1, half = 1} = {}) => { CONE_SCALE.range = range; CONE_SCALE.half = half; };
export const visionFor = (type, def = {}) => {
  const base = VISION[type] ?? VISION.default;
  return {half: base.half * CONE_SCALE.half, range: (def.sightRange ?? base.range) * CONE_SCALE.range};
};

const angleOf = v => Math.atan2(v.y, v.x);
export function angleDiff(a, b) { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }

// True when `target` is inside the cone at `from` facing `facing` (unit vector), ignoring walls.
export function inCone(from, facing, half, range, target, targetRadius = 0) {
  const dx = target.x - from.x, dy = target.y - from.y, d = Math.hypot(dx, dy);
  if (d > range + targetRadius) return false;
  if (d <= targetRadius + 1) return true;
  const len = Math.hypot(facing.x, facing.y);
  if (!(len > 1e-9)) return false;
  const cos = (dx * facing.x + dy * facing.y) / (d * len);
  // widen slightly by the target body so grazing the edge counts
  const slack = Math.asin(clamp(targetRadius / d, 0, 1));
  return cos >= Math.cos(clamp(half + slack, 0, Math.PI));
}

// Turn a facing vector toward a goal at a capped angular rate (rad / scaled second). Returns a unit vector.
export function turnFacing(cur, goal, rate, dt) {
  const a = angleOf(cur), b = angleOf(goal), diff = angleDiff(a, b), step = rate * dt;
  const next = Math.abs(diff) <= step ? b : a + Math.sign(diff) * step;
  return {x: Math.cos(next), y: Math.sin(next)};
}

// ---------------------------------------------------------------------------------------- suspicion
export const SUSPICION = {
  baseRate: 1.1,       // per scaled second at mid range, walking: about 0.9 s to be spotted
  close: 48,           // inside this you are noticed in any facing (peripheral / bumping)
  decay: 0.55,         // per scaled second while out of sight
  questionAt: 0.12,    // '?' appears above the head
  alertAt: 1,
};

// How fast suspicion fills this step. `speed` = player speed px/s (world units, real); `inView` = inside cone with LOS.
export function suspicionRate({inView, d, range, speed = 0}) {
  if (!inView) return 0;
  if (d <= SUSPICION.close) return 6;
  const near = 1 + 1.6 * clamp(1 - d / Math.max(1, range), 0, 1);
  const pace = speed > 95 ? 1.45 : speed > 24 ? 1 : 0.55;   // sprinting is conspicuous, holding still is not
  return SUSPICION.baseRate * near * pace;
}

export function stepSuspicion(value, {inView, d, range, speed, dt}) {
  const rate = suspicionRate({inView, d, range, speed});
  const next = rate > 0 ? value + rate * dt : value - SUSPICION.decay * dt;
  return clamp(next, 0, 1);
}

export const suspicionStage = s => s >= SUSPICION.alertAt ? 'alert' : s >= SUSPICION.questionAt ? 'question' : 'calm';

// ---------------------------------------------------------------------------------------- noise
export const NOISE = {shot: 380, suppressed: 190, sprint: 120, throughWall: 0.55, sleeperHearing: 0.7};
export const shotNoiseRadius = ({suppressed = false, mult = 1, silent = false} = {}) =>
  silent ? 0 : (suppressed ? NOISE.suppressed : NOISE.shot) * mult;

// Radius at which an enemy hears a noise. Walls cut it to 55 %; sleepers hear 30 % less.
export function hearingReach({radius, blocked = false, asleep = false}) {
  return radius * (blocked ? NOISE.throughWall : 1) * (asleep ? NOISE.sleeperHearing : 1);
}
// Shape of the drawn ring: reach per angle given the free distance `wallDist` along that ray.
export function noiseRingRadius(radius, wallDist) {
  if (!(wallDist < radius)) return radius;
  return Math.max(wallDist, radius * NOISE.throughWall);
}

// ---------------------------------------------------------------------------------------- postures
export const POSTURES = ['patrol', 'guard', 'sleep', 'gather'];

// Choose a starting posture for every enemy in a room. `types` is the list of enemy types (in spawn order).
// Floors teach: floor 1 leans on sleepers and guards; deeper floors add patrols and awake rooms.
export function choosePostures(types, {floor = 1, role = 'combat', rng = Math.random} = {}) {
  const n = types.length;
  const out = types.map(() => 'guard');
  const gatherOk = n >= 2 && role !== 'elite' && rng() < 0.3;
  const sleepP = clamp(0.3 - 0.06 * (floor - 1), 0.1, 0.3);
  const patrolP = clamp(0.2 + 0.07 * (floor - 1), 0.2, 0.45);
  types.forEach((type, i) => {
    if (type === 'sniper') { out[i] = 'guard'; return; }
    if (type === 'riot') { out[i] = rng() < 0.5 ? 'patrol' : 'guard'; return; }
    if (type === 'boss') { out[i] = 'guard'; return; }
    const r = rng();
    out[i] = r < sleepP && role !== 'elite' ? 'sleep' : r < sleepP + patrolP ? 'patrol' : 'guard';
  });
  if (gatherOk) {
    // two or more non-sniper enemies stand around a table facing each other
    const idx = types.map((t, i) => i).filter(i => types[i] !== 'sniper' && types[i] !== 'riot');
    if (idx.length >= 2) for (const i of idx.slice(0, 3)) out[i] = 'gather';
  }
  // a room never opens entirely asleep: someone is on watch
  if (n > 1 && out.every(p => p === 'sleep')) out[0] = 'guard';
  return out;
}

// ---------------------------------------------------------------------------------------- damage rules
// Returns {mult, label}. `facing` is the enemy's facing (unit), `bulletDir` the bullet's travel direction.
// A bullet travelling the same way the enemy faces strikes it from behind (dot > 0).
export function strikeFromBehind(facing, bulletDir, threshold = 0.25) {
  const fl = Math.hypot(facing.x, facing.y), bl = Math.hypot(bulletDir.x, bulletDir.y);
  if (!(fl > 1e-9) || !(bl > 1e-9)) return false;
  return (facing.x * bulletDir.x + facing.y * bulletDir.y) / (fl * bl) > threshold;
}

export const SILENT_MULT = 2;
export const WEAK_MULT = 2;

export function damageModifier({type, aware, asleep = false, facing, bulletDir, shielded = false, bruteRecovering = false, stunned = false}) {
  if (type === 'boss') return {mult: 1, label: ''};
  const behind = facing && bulletDir ? strikeFromBehind(facing, bulletDir) : false;
  if (!aware && (asleep || behind)) return {mult: SILENT_MULT, label: 'SILENT'};
  if (type === 'riot' && !shielded && behind) return {mult: WEAK_MULT, label: 'FLANK'};
  if (type === 'brute' && bruteRecovering) return {mult: WEAK_MULT, label: 'OPENING'};
  if (stunned && !aware) return {mult: 1, label: ''};
  return {mult: 1, label: ''};
}

// ---------------------------------------------------------------------------------------- lethality table
// Hit points are tuned so a fitting gun kills in the stated number of good hits. See stealth.test.js.
export const LETHALITY = {
  chaser: {hp: 30, hits: [1, 2]},
  gunner: {hp: 40, hits: [1, 2]},
  sniper: {hp: 30, hits: [1, 2]},
  guard: {hp: 60, hits: [2, 3]},
  riot: {hp: 70, hits: [3, 4], weak: 'flank / back x2'},
  brute: {hp: 100, hits: [4, 5], weak: 'recovery x2'},
  elite: {hp: 140, hits: [3, 6]},
};
export const hitsToKill = (hp, dmg, mult = 1) => Math.max(1, Math.ceil(hp / Math.max(1, dmg * mult)));

// Player lethality: three hits. Armor is one extra hit, shown as a shield pip.
export const PLAYER = {baseHealth: 3, armorHits: 1, invulnSeconds: 0.9};

// ---------------------------------------------------------------------------------------- deterministic dodge
// An enemy sidesteps only when it could have seen the shot coming. No dice: the same shot gets the same answer.
export const DODGERS = {chaser: {cooldown: 1.6}, gunner: {cooldown: 2.0}};
export function shouldDodge({type, aware, sees, facing, shotDir, windup = 0, stun = 0, reaction = 0, cooldown = 0, timeToImpact = 0, minWarning = 0.06}) {
  if (!DODGERS[type] || !aware || !sees) return false;
  if (windup > 0 || stun > 0 || reaction > 0 || cooldown > 0) return false;
  if (timeToImpact < minWarning) return false;   // too late to react: it gets hit
  if (!facing || !shotDir) return false;
  const fl = Math.hypot(facing.x, facing.y), sl = Math.hypot(shotDir.x, shotDir.y);
  if (!(fl > 1e-9) || !(sl > 1e-9)) return false;
  // the shot must be coming from in front of the enemy (it is facing the muzzle)
  return -(facing.x * shotDir.x + facing.y * shotDir.y) / (fl * sl) > 0.3;
}

// ---------------------------------------------------------------------------------------- death cause
// Reason line for the death screen: 'KILLED BY MARKSMAN · STOOD IN A LANE'.
export function deathCause({name = '', kind = 'shot', type = '', spotted = false} = {}) {
  const who = String(name || '').toUpperCase();
  let why = '';
  if (kind === 'blast') why = 'CAUGHT IN BLAST';
  else if (type === 'sniper') why = 'STOOD IN A LANE';
  else if (kind === 'melee') why = type === 'brute' ? 'DID NOT CLEAR THE SWING' : 'TOOK THE LUNGE';
  else if (kind === 'boss') why = 'READ THE PATTERN LATE';
  else if (spotted) why = `SEEN BY ${(who || 'ENEMY').replace(/^THE /, '')}`;
  else why = 'TOOK A STRAIGHT SHOT';
  if (kind === 'blast') return `KILLED BY FRAG · ${why}`;
  if (!who) return why;
  return `KILLED BY ${who} · ${why}`;
}
