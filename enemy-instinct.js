// DEAD AIR enemy instincts. Pure: plain data in, plain data out. No DOM, no clocks, no Rapier.
//
// Ported in spirit from Skirmish's bot brain (cover.ts / intent.ts / awareness.ts): enemies that read the
// fight instead of only chasing the player. Everything here answers one question the player can SEE the
// answer to ("why did that one step aside / back off / wait?"):
//   - aim line      : the player's crosshair is a fire lane. Standing in it is a decision, not an accident.
//   - hazards       : a lit frag or a burning patch is a place to leave.
//   - openings      : the player is reloading or hurt = the window to push.
//   - morale        : an ally dropping next to you changes what you do next (brutes enrage, shooters duck).
//   - rally         : when hurt, fall back toward a healthy ally rather than into a corner alone.
//
// enemy-brain.js owns WHEN these run; this file owns the math. Distances are px, durations scaled seconds.

const TAU = Math.PI * 2;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const norm = (x, y) => { const l = Math.hypot(x, y); return l > 1e-9 ? {x: x / l, y: y / l} : {x: 0, y: 0}; };

// ---- tuning --------------------------------------------------------------------------------------
export const INSTINCT = {
  retreatHp: 0.4,        // at or below this fraction a shooter stops trading shots and breaks line of sight
  recoverHp: 0.55,       // ...and only comes back out once it is above this (hysteresis: no flicker)
  lineWidth: 20,         // px either side of the aim ray that counts as "in the line" (plus the body radius)
  lineReach: 560,        // the crosshair only worries an enemy within this range
  lineReact: 0.22,       // scaled seconds standing in the line before the sidestep starts (a human beat)
  lineCooldown: 1.4,     // after sidestepping, the same enemy will not be spooked again for this long
  hazardMargin: 34,      // leave a hazard when closer than radius + this
  fuseWarn: 1.4,         // flee a lit grenade when it has at most this long left (frag lands, they are gone)
  pushWindow: 1.6,       // seconds an opening (player reload / low HP) stays exploitable after it is seen
  playerHurtHp: 0.34,    // player at or below this fraction counts as "hurt" (a push window)
  shakenFor: 2.6,        // seconds a shooter stays rattled after an ally goes down next to it
  enrageFor: 5,          // seconds a brute stays enraged after an ally goes down
  packGap: 150,          // rushers wait for a mate farther back than this before crossing open ground
  packWait: 1.8,         // ...but never longer than this
};

// ---- aim line ------------------------------------------------------------------------------------
// Where `pt` sits relative to the ray from `from` along unit vector `aim`: `along` is distance down the ray,
// `across` is the signed perpendicular offset (positive = to the right of the aim when y points down).
export function aimLineOffset(from, aim, pt) {
  const rx = pt.x - from.x, ry = pt.y - from.y;
  return {along: rx * aim.x + ry * aim.y, across: rx * -aim.y + ry * aim.x};
}

// Is `pt` standing in the fire lane of a shooter at `from` aiming along `aim`?
export function inAimLine(from, aim, pt, {radius = 8, width = INSTINCT.lineWidth, reach = INSTINCT.lineReach} = {}) {
  if (!aim || (!aim.x && !aim.y)) return false;
  const o = aimLineOffset(from, aim, pt);
  return o.along > 12 && o.along <= reach && Math.abs(o.across) <= width + radius;
}

// The unit step that leaves the lane fastest: perpendicular to the aim, toward whichever side the enemy is
// already on. `prefer` (+1/-1) breaks a dead-centre tie (and keeps a strafing enemy strafing the same way).
export function lineSidestep(from, aim, pt, prefer = 1) {
  const o = aimLineOffset(from, aim, pt);
  const side = Math.abs(o.across) < 1.5 ? (prefer < 0 ? -1 : 1) : Math.sign(o.across);
  return norm(-aim.y * side, aim.x * side);
}

// Circles for nav.findPath({avoid}) that make the player's fire lane expensive to walk along: enemies route
// around the crosshair instead of marching down it. Capped at 5 circles so the path cost stays cheap.
export function laneAvoidCircles(from, aim, {length = 340, step = 70, r = 30, cost = 3} = {}) {
  if (!aim || (!aim.x && !aim.y)) return [];
  const out = [];
  for (let d = 60; d <= length && out.length < 5; d += step) out.push({x: from.x + aim.x * d, y: from.y + aim.y * d, r, cost});
  return out;
}

// ---- hazards -------------------------------------------------------------------------------------
// Hazards are {x, y, radius, fuse?}. `fuse` (scaled seconds left) is present for a lit grenade; burning patches
// and bursts have none and are always avoided. Returns {dir, urgency, hazard} or null.
// `canStep(dir)` lets the caller veto a direction that runs into a wall; we then try the rotated alternatives.
export function hazardEscape(pos, hazards, {margin = INSTINCT.hazardMargin, canStep = () => true} = {}) {
  let worst = null, worstDepth = 0;
  for (const h of hazards ?? []) {
    if (h.fuse !== undefined && h.fuse > INSTINCT.fuseWarn) continue;
    const reach = h.radius + margin, d = dist(pos, h);
    if (d >= reach) continue;
    const depth = (reach - d) / reach;
    if (depth > worstDepth) { worst = h; worstDepth = depth; }
  }
  if (!worst) return null;
  const away = norm(pos.x - worst.x, pos.y - worst.y);
  const base = away.x || away.y ? away : {x: 1, y: 0};
  for (const turn of [0, 0.7, -0.7, 1.4, -1.4]) {
    const c = Math.cos(turn), s = Math.sin(turn);
    const dir = {x: base.x * c - base.y * s, y: base.x * s + base.y * c};
    if (canStep(dir)) return {dir, urgency: worstDepth, hazard: worst};
  }
  return {dir: base, urgency: worstDepth, hazard: worst};
}

// ---- openings ------------------------------------------------------------------------------------
// What the player is giving away right now. `reload` beats `hurt`: a reload is a hard 1-2 s gap in their fire.
export function playerOpening({reloading = false, hpFrac = 1} = {}) {
  if (reloading) return 'reload';
  if (hpFrac <= INSTINCT.playerHurtHp) return 'hurt';
  return null;
}

// ---- self-preservation ---------------------------------------------------------------------------
// Hysteresis: start retreating at retreatHp, keep retreating until recoverHp.
export function wantsRetreat(hpFrac, wasRetreating = false) {
  return wasRetreating ? hpFrac < INSTINCT.recoverHp : hpFrac <= INSTINCT.retreatHp;
}

// The healthy ally a hurt enemy should fall back toward: the nearest one that is not closer to the threat than
// we are (never "retreat" into the player's arms) and not itself hurt. Returns {x, y} or null.
export function rallyPoint(self, allies, threat) {
  let best = null, bestD = Infinity;
  const myThreatD = dist(self, threat);
  for (const a of allies) {
    if (a === self || a.alive === false) continue;
    if ((a.hp ?? 1) / (a.maxHp ?? 1) < 0.5) continue;
    const d = dist(self, a);
    if (d > 380 || d < 40) continue;
    if (dist(a, threat) < myThreatD - 10) continue;
    if (d < bestD) { best = a; bestD = d; }
  }
  return best ? {x: best.x, y: best.y} : null;
}

// ---- morale --------------------------------------------------------------------------------------
// Ids present last frame that are gone now (died, or left the room). `prev` is a Set, `now` an iterable of ids.
export function fallenAllies(prev, now) {
  const here = new Set(now), out = [];
  for (const id of prev) if (!here.has(id)) out.push(id);
  return out;
}

// How an enemy takes an ally dropping nearby.
//   brute / riot : enrage, drop the caution and rush (they were the ones holding back)
//   rushers      : no change of mind (they were already coming)
//   shooters     : get low. Duck, re-pick cover, stop poking for a beat.
export function moraleReaction(type) {
  if (type === 'brute') return {kind: 'enrage', for: INSTINCT.enrageFor};
  if (type === 'chaser' || type === 'riot') return {kind: 'none', for: 0};
  return {kind: 'shaken', for: INSTINCT.shakenFor};
}

// ---- squads --------------------------------------------------------------------------------------
// Should a melee rusher hold at its corner and wait for the pack instead of crossing open ground alone?
// `mates` are the other aware rushers {x, y}. True when a mate is meaningfully farther from the target than we are.
export function shouldWaitForPack(self, mates, target, {gap = INSTINCT.packGap} = {}) {
  const mine = dist(self, target);
  if (mine < 130) return false;               // already committed
  for (const m of mates) {
    if (m === self) continue;
    const theirs = dist(m, target);
    if (theirs - mine > gap && dist(m, self) < 520) return true;
  }
  return false;
}

// Pincer: pick the two approach angles (radians around the target) that are farthest apart from each other,
// seeded by the suppressor's bearing so flankers come from the sides, not from behind the suppressor.
// Returns the angle for flanker number `index` (0-based) out of `count`.
export function pincerAngle(supBearing, index, count) {
  if (count <= 1) return supBearing + (index % 2 === 0 ? 1 : -1) * 1.45;
  const side = index % 2 === 0 ? 1 : -1, rank = Math.floor(index / 2);
  return supBearing + side * (1.35 + rank * 0.5);
}

export const wrapAngle = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
