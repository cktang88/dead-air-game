// DEAD AIR enemy brain. Pure logic: plain data in, a plain steering/firing decision out.
// No DOM, no Rapier, no THREE, no wall-clock timers: every duration is in *scaled* seconds, so
// when the world slows to 0.18x while the player stands still, enemies think and telegraph 0.18x as fast.
//
//   const nav = createNav(tileMap, solidMap);
//   const out = stepEnemyBrain(enemy, world, scaledDt, Math.random);
//
// Enemy (mutated: `enemy.ai` is created on first step):
//   {id, type, x, y, radius, hp, maxHp, alive, stun, reloadTimer, ammo, mag, roomIndex?,
//    def: {brain: 'rush'|'shoot'|'guard', speed, range, minRange?, projectileSpeed?}}
// World (read only):
//   {nav, player: {x, y, vx, vy, radius}, los(ax, ay, bx, by) -> true when the line is clear of
//    walls/crates/cover (smoke is separate), enemies: [...all enemies incl. this one],
//    covers?: [{x, y, radius}], smoke?: [{x, y, radius}], projectiles?: [{x, y, vx, vy, radius}] (player shots),
//    playerAim?: {x, y} unit vector the player is aiming along (the fire lane enemies sidestep out of),
//    playerReloading?: bool, playerHpFrac?: 0..1 (openings the squad pushes into),
//    hazards?: [{x, y, radius, fuse?}] lit grenades / burning patches enemies leave,
//    noises?: [{x, y, radius}] (gunfire this frame), fireAllowed?(enemy) -> bool, aimMul?: number}
// Output:
//   {moveX, moveY, speed, aimX, aimY, fire, intent, stance, windup, windupTotal, aiming, aware, sees, role, goal}
//   `stance` is the readable verb the renderer may show: suppress | flank | fallback | push | flee | sidestep | hold | enrage | wary.
//   Velocity = (moveX, moveY) * def.speed, where the vector length already includes `speed` (sprint/dash > 1).
//   `fire` is true on the single step where the telegraph ends; the caller spawns the bullet and handles
//   ammo/reload. `windup` is seconds of telegraph left (0 when not aiming) so the caller can draw the aim line.

import {createNav} from './enemy-nav.js';
import {incomingThreats} from './enemy-tactics.js';
import {DODGERS, SUSPICION, hearingReach, inCone, shouldDodge, stepSuspicion, turnFacing, visionFor} from './stealth.js';
import {INSTINCT, hazardEscape, inAimLine, laneAvoidCircles, lineSidestep, moraleReaction, pincerAngle, playerOpening, rallyPoint, shouldWaitForPack, wantsRetreat, wrapAngle} from './enemy-instinct.js';

export {createNav};

const TAU = Math.PI * 2;
import {clamp, dist} from './util.js';
const between = (rng, lo, hi) => lo + rng() * (hi - lo);
const gaussian = rng => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(TAU * rng());
const norm = (x, y) => { const l = Math.hypot(x, y); return l > 1e-9 ? {x: x / l, y: y / l} : {x: 0, y: 0}; };
const bodyRadius = e => Math.min(e.radius ?? 8, 13) + 1;

// Per-type tuning. Times are scaled seconds.
export const PROFILES = {
  chaser: {dodge: 0.55, react: [0.18, 0.34], alertRadius: 240},
  gunner: {dodge: 0.5, react: [0.28, 0.5], windup: 0.48, fireGap: [1.0, 2.0], duck: [0.8, 1.7], burst: [1, 2], aimMul: 1, alertRadius: 280},
  guard: {dodge: 0.3, react: [0.35, 0.6], windup: 0.62, fireGap: [1.6, 2.6], duck: [1.2, 2.4], burst: [1, 1], aimMul: 0.85, alertRadius: 280},
  sniper: {dodge: 0.35, react: [0.4, 0.7], windup: 1.6, lockTime: 0.5, trackRate: 1.15, fireGap: [2.4, 3.6], duck: [1.4, 2.6], burst: [1, 1], aimMul: 0.5, alertRadius: 320},
  riot: {dodge: 0.02, react: [0.3, 0.5], alertRadius: 240},
  brute: {dodge: 0.08, react: [0.3, 0.55], alertRadius: 220, chargeWindup: 0.55, chargeTime: 0.7, chargeSpeed: 2.3, chargeCooldown: [2.2, 3.4], recover: 0.9},
};
const SIGHT_RANGE = 440;   // aware enemies see 360 degrees out to this range; UNAWARE ones only see their cone (stealth.js)
const FORGET_AFTER = 14;
const ENGAGED_MEMORY = 5;

export function segmentHitsCircle(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  const t = len2 < 1e-9 ? 0 : clamp(((cx - ax) * dx + (cy - ay) * dy) / len2, 0, 1);
  return Math.hypot(ax + dx * t - cx, ay + dy * t - cy) <= r;
}

// Intercept point for a projectile of `speed` fired from `from` at a target moving with constant velocity.
// `frac` (0..1) is how much of the true lead the shooter applies: humans under-lead.
export function leadAim(from, target, vx, vy, speed, frac = 1) {
  const rx = target.x - from.x, ry = target.y - from.y;
  const a = vx * vx + vy * vy - speed * speed, b = 2 * (rx * vx + ry * vy), c = rx * rx + ry * ry;
  let t;
  if (Math.abs(a) < 1e-6) t = Math.abs(b) < 1e-9 ? Math.hypot(rx, ry) / speed : -c / b;
  else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) t = Math.hypot(rx, ry) / speed;
    else {
      const s = Math.sqrt(disc), t1 = (-b - s) / (2 * a), t2 = (-b + s) / (2 * a);
      const lo = Math.min(t1, t2), hi = Math.max(t1, t2);
      t = lo > 0 ? lo : hi;
    }
  }
  if (!(t > 0) || t > 3) t = Math.hypot(rx, ry) / speed;
  return {x: target.x + vx * t * frac, y: target.y + vy * t * frac, t};
}

export function brainState(e, rng = Math.random) {
  if (e.ai) return e.ai;
  const prof = PROFILES[e.type] ?? PROFILES.chaser;
  e.ai = {
    clock: 0, aware: false, sees: false, lockTime: 0, lost: 0, reaction: 0, last: null, pending: null, hpPrev: e.hp,
    role: 'engage', roleT: 0, flankPref: rng() < 0.55,
    phase: 'duck', phaseT: between(rng, 0.1, 0.7), cover: null, coverT: 0, peekMiss: 0,
    windup: 0, windupTotal: 0, aim: {x: 1, y: 0}, cd: between(rng, 0.4, 1.4), sinceFire: 9, sinceStart: 9, shotsLeft: 0,
    strafeDir: rng() < 0.5 ? -1 : 1, strafeT: 0, dodgeT: 0, dodgeCd: 0, dodge: null, dodgeSeen: new WeakSet(),
    path: null, pathT: 0, pathGoal: null, pathVer: -1, stuck: 0, nudge: null, prevX: e.x, prevY: e.y,
    face: {x: e.face?.x ?? 1, y: e.face?.y ?? 0}, search: null, flank: null, flankT: 0,
    zigT: 0, zigDir: rng() < 0.5 ? -1 : 1, zigPhase: rng() * TAU, circleDir: rng() < 0.5 ? -1 : 1, circleT: 0,
    ambush: 0, ambushUsed: false, brute: {phase: 'advance', t: 0, cd: between(rng, 0.5, 1.5), dir: null},
    suspicion: 0, inView: false, spotted: false, pat: null, dodging: false,
    lineT: 0, lineCd: 0, sideT: 0, retreating: false, pushT: 0, pushKick: false, shaken: 0, enrage: 0, mates: null, packT: 0, packSpent: 0, stance: null, peekHold: 0, openT: 0, recheckT: 0, breakGoal: null, breakT: 0, coverRetry: 0, retreatT: 0,
    prof,
  };
  return e.ai;
}

function smokeCuts(world, ax, ay, bx, by) {
  const smoke = world.smoke;
  if (!smoke) return false;
  for (const s of smoke) if (segmentHitsCircle(ax, ay, bx, by, s.x, s.y, s.radius)) return true;
  return false;
}
const clearLine = (world, a, b) => world.los(a.x, a.y, b.x, b.y) && !smokeCuts(world, a.x, a.y, b.x, b.y);

function living(world, except) { return world.enemies.filter(o => o !== except && o.alive !== false); }

function alertMates(c, at, delay) {
  const {e, world, rng, ai} = c;
  for (const o of living(world, e)) {
    const near = dist(e, o) <= ai.prof.alertRadius || (o.roomIndex !== undefined && o.roomIndex === e.roomIndex);
    if (!near) continue;
    const oa = brainState(o, rng);
    if (oa.aware || oa.pending) continue;
    oa.pending = {x: at.x, y: at.y, t: delay + between(rng, 0.05, 0.3) + dist(e, o) / 900};
    world.alerts?.push({from: e, to: o});   // the renderer draws a radio pulse from the alerter to each mate it wakes
  }
}

function learn(ai, p, velocity = true) {
  ai.last = {x: p.x, y: p.y, vx: velocity ? p.vx ?? 0 : 0, vy: velocity ? p.vy ?? 0 : 0, age: 0};
}

function perceive(c) {
  const {e, ai, world, dt, rng, p} = c;
  const d = dist(e, p);
  const wasAware = ai.aware;
  const stealthy = e.posture !== undefined;   // enemies spawned without a posture (tests, boss adds) keep legacy 360 sight
  const asleep = stealthy && e.posture === 'sleep' && !ai.aware;
  let sees;
  if (ai.aware || !stealthy) sees = d <= (e.def.sightRange ?? SIGHT_RANGE) && clearLine(world, e, p);
  else {
    // UNAWARE: a vision cone, filled by suspicion instead of an instant spot. Sleepers only notice you underfoot.
    const vis = visionFor(e.type, e.def);
    const inView = asleep ? d < 26 : (d <= SUSPICION.close || inCone(e, ai.face, vis.half, vis.range, p, 6));
    sees = false;
    ai.inView = inView && d <= vis.range && clearLine(world, e, p);
    if (world.stillCloak && d > world.stillCloak && Math.hypot(p.vx ?? 0, p.vy ?? 0) < 24) ai.inView = false;   // BLACKOUT rank 3: stillness is cover
    ai.suspicion = stepSuspicion(ai.suspicion, {inView: ai.inView, d, range: vis.range, speed: Math.hypot(p.vx ?? 0, p.vy ?? 0), dt});
    if (ai.suspicion >= SUSPICION.alertAt) { sees = true; ai.spotted = true; }
  }
  ai.sees = sees;
  if (sees) {
    if (!ai.aware) { ai.aware = true; ai.suspicion = 1; ai.reaction = between(rng, ...ai.prof.react); alertMates(c, p, 0.2); if (e.posture === 'sleep') e.posture = 'guard'; }
    learn(ai, p);
    ai.lost = 0; ai.peekMiss = 0; ai.lockTime += dt;
  } else {
    ai.lockTime = Math.max(0, ai.lockTime - dt * 2);
    if (ai.aware) ai.lost += dt;
    if (ai.last) ai.last.age += dt;
  }
  for (const n of world.noises ?? []) {
    const reach = hearingReach({radius: n.radius, blocked: !world.los(e.x, e.y, n.x, n.y), asleep});
    if (dist(e, n) > reach) continue;
    const guess = {x: n.x + gaussian(rng) * 28, y: n.y + gaussian(rng) * 28};
    if (!ai.aware) { ai.aware = true; ai.suspicion = 1; ai.heard = true; ai.reaction = between(rng, 0.12, 0.3); learn(ai, guess, false); alertMates(c, guess, 0.15); if (e.posture === 'sleep') e.posture = 'guard'; }
    else if (!sees) { learn(ai, guess, false); ai.lost = Math.min(ai.lost, 2); }
  }
  if (e.hp < ai.hpPrev - 1e-9 && !sees) {
    const guess = {x: p.x + gaussian(rng) * 40, y: p.y + gaussian(rng) * 40};
    if (!ai.aware) { ai.aware = true; ai.suspicion = 1; ai.reaction = 0.12; if (e.posture === 'sleep') e.posture = 'guard'; }
    learn(ai, guess, false); ai.lost = Math.min(ai.lost, 1);
  }
  ai.hpPrev = e.hp;
  if (ai.pending) {
    ai.pending.t -= dt;
    if (ai.pending.t <= 0) {
      const pend = ai.pending; ai.pending = null;
      if (!ai.aware) { ai.aware = true; ai.suspicion = 1; ai.reaction = between(rng, ...ai.prof.react) * 0.6; learn(ai, pend, false); ai.lost = 1; if (e.posture === 'sleep') e.posture = 'guard'; }
    }
  }
  if (ai.aware && ai.lost > FORGET_AFTER) { ai.aware = false; ai.suspicion = 0.45; ai.spotted = false; ai.last = null; ai.search = null; ai.cover = null; }
  return wasAware;
}

// ---- movement helpers -----------------------------------------------------------------------

function steer(c, goal, arrive = 8, avoid) {
  const {e, ai, world, rng} = c;
  const nav = world.nav;
  c.out.goal = {x: goal.x, y: goal.y};
  if (dist(e, goal) <= arrive) return {arrived: true};
  if (!nav) { const d = norm(goal.x - e.x, goal.y - e.y); return {dir: d}; }
  if (!ai.path || ai.pathT <= 0 || ai.pathVer !== nav.version || !ai.pathGoal || dist(goal, ai.pathGoal) > 36) {
    ai.path = nav.findPath(e, goal, {radius: bodyRadius(e), avoid});
    ai.pathGoal = {x: goal.x, y: goal.y};
    ai.pathVer = nav.version;
    ai.pathT = 0.35 + rng() * 0.25;
  }
  const path = ai.path;
  if (!path || path.length === 0) return {blocked: true};
  while (path.length > 1 && dist(e, path[0]) < 9) path.shift();
  if (path.length === 1 && dist(e, path[0]) <= arrive) return {arrived: true};
  return {dir: norm(path[0].x - e.x, path[0].y - e.y)};
}

function go(c, goal, speed = 1, arrive = 8, avoid) {
  const r = steer(c, goal, arrive, avoid);
  if (r.dir) { c.out.moveX = r.dir.x * speed; c.out.moveY = r.dir.y * speed; c.out.speed = speed; }
  return r.arrived === true;
}

function slide(c, dir, speed) {
  const {e, world} = c;
  const nav = world.nav;
  let d = norm(dir.x, dir.y);
  if (nav && !nav.walkable(e, {x: e.x + d.x * 22, y: e.y + d.y * 22}, bodyRadius(e))) {
    // Try a 45 degree slide along the obstacle before giving up.
    const options = [{x: d.x - d.y, y: d.y + d.x}, {x: d.x + d.y, y: d.y - d.x}].map(v => norm(v.x, v.y));
    const free = options.find(v => nav.walkable(e, {x: e.x + v.x * 22, y: e.y + v.y * 22}, bodyRadius(e)));
    if (!free) return false;
    d = free;
  }
  c.out.moveX = d.x * speed; c.out.moveY = d.y * speed; c.out.speed = speed;
  return true;
}

// ---- cover ----------------------------------------------------------------------------------

// A cover is {hide, peek}: `hide` is a point the target cannot see (checked for the body edges too),
// `peek` is a nearby open point from which the target is visible inside the firing band.
const MAX_COVER_SPOTS = 24;
export function findCover(e, target, world, o = {}) {
  const nav = world.nav;
  if (!nav) return null;
  const tile = nav.tile, R = o.tiles ?? 6;
  const relaxed = !!o.relaxed;   // second pass: accept a wider firing band rather than no cover at all
  const minR = (o.minRange ?? 0) * (relaxed ? 0.85 : 1), maxR = (o.maxRange ?? 300) * (relaxed ? 1.25 : 1), mid = (minR + maxR) / 2;
  const radius = bodyRadius(e);
  const others = living(world, e);
  const claimed = pt => others.some(x => x.ai?.cover && dist(x.ai.cover.hide, pt) < tile * 0.9);
  const crowded = pt => others.some(x => dist(x, pt) < 18);
  const hidden = pt => {
    const n = norm(pt.x - target.x, pt.y - target.y), px = -n.y * radius, py = n.x * radius;
    return !world.los(target.x, target.y, pt.x, pt.y) &&
      !world.los(target.x, target.y, pt.x + px, pt.y + py) && !world.los(target.x, target.y, pt.x - px, pt.y - py);
  };
  // Candidate budget: every candidate costs three line-of-sight rays, so a 13x13 tile window is thinned to
  // an even sample of the tiles (nearest-first order) and the explicit cover props go first.
  const maxSpots = o.maxCandidates ?? MAX_COVER_SPOTS;
  const spots = [];
  const et = nav.tileOf(e.x, e.y);
  for (const cv of world.covers ?? []) {
    const n = norm(cv.x - target.x, cv.y - target.y), off = (cv.radius ?? 17) + radius + 4;
    const pt = {x: cv.x + n.x * off, y: cv.y + n.y * off};
    if (nav.isOpenAt(pt.x, pt.y)) spots.push(pt);
  }
  if (spots.length > maxSpots / 2) { spots.sort((a, b) => dist(a, e) - dist(b, e)); spots.length = Math.floor(maxSpots / 2); }
  // Tiles hugging an obstacle are the likely hiding places: take those first (nearest-first), then fill with the rest.
  const edge = [], open = [];
  for (let ty = et.y - R; ty <= et.y + R; ty++) for (let tx = et.x - R; tx <= et.x + R; tx++) {
    if (!nav.isOpen(tx, ty)) continue;
    const c = nav.centerOf(tx, ty);
    (!nav.isOpen(tx + 1, ty) || !nav.isOpen(tx - 1, ty) || !nav.isOpen(tx, ty + 1) || !nav.isOpen(tx, ty - 1) ? edge : open).push(c);
  }
  const byNear = (a, b) => dist(a, e) - dist(b, e);
  let room = Math.max(0, maxSpots - spots.length);
  edge.sort(byNear);
  for (let i = 0; i < edge.length && room > 0; i++, room--) spots.push(edge[i]);
  if (room > 0 && open.length) {
    open.sort(byNear);
    const stride = Math.max(1, open.length / room);
    for (let i = 0; i < room && Math.floor(i * stride) < open.length; i++) spots.push(open[Math.floor(i * stride)]);
  }
  const scored = [];
  for (const hide of spots) {
    const d0 = dist(e, hide);
    if (d0 > R * tile || dist(hide, target) < minR * 0.7) continue;
    if (o.exclude?.some(x => dist(x, hide) < (o.excludeRadius ?? tile * 1.5))) continue;   // a marksman never re-uses the nest it just fired from
    if (!hidden(hide)) continue;
    const ht = nav.tileOf(hide.x, hide.y);
    let peek = null, peekD = Infinity;
    for (let ty = ht.y - 2; ty <= ht.y + 2; ty++) for (let tx = ht.x - 2; tx <= ht.x + 2; tx++) {
      if (!nav.isOpen(tx, ty)) continue;
      const q = nav.centerOf(tx, ty), dq = dist(q, target);
      if (dq < minR * 1.05 || dq > maxR * 0.95 || !world.los(target.x, target.y, q.x, q.y)) continue;
      const dh = dist(q, hide);
      if (dh < peekD) { peekD = dh; peek = q; }
    }
    if (!peek) continue;
    // Hurt enemies prefer cover that sits nearer a healthy ally (fall back toward the group, not into a corner alone).
    const rally = o.rally ? Math.max(0, 160 - dist(hide, o.rally)) * 0.45 : 0;
    scored.push({hide, peek, score: d0 + peekD * 0.5 + Math.abs(dist(peek, target) - mid) * 0.25 + (claimed(hide) ? 140 : 0) + (crowded(hide) ? 60 : 0) - rally});
  }
  scored.sort((a, b) => a.score - b.score);
  for (const cand of scored.slice(0, 3)) {
    const path = nav.findPath(e, cand.hide, {radius});
    if (path && nav.pathLength(e, path) <= R * tile * 2.4) return {hide: cand.hide, peek: cand.peek, score: cand.score, tx: target.x, ty: target.y};
  }
  return null;
}

// ---- squad coordination -----------------------------------------------------------------------

function updateRole(c) {
  const {e, ai, world} = c;
  const mates = living(world, e).filter(o => o.ai?.aware);
  const suppressor = mates.find(o => o.ai.role === 'suppress' && o.ai.sees);
  const ranged = c.ranged;
  if (ranged && ai.sees && (!suppressor || ai.role === 'suppress')) ai.role = 'suppress';
  else if (suppressor && (ranged || ai.flankPref) && e.type !== 'brute') ai.role = 'flank';
  else ai.role = 'engage';
  c.suppressor = suppressor ?? (ai.role === 'suppress' ? e : null);
}

// Pick an approach point that is reached by a different route from the suppressor's bearing.
function chooseFlank(c, radius, needSight) {
  const {e, ai, world, rng} = c;
  const nav = world.nav, target = ai.sees ? c.p : ai.last;
  if (!nav || !target) return null;
  const sup = c.suppressor && c.suppressor !== e ? c.suppressor : null;
  const supAngle = sup ? Math.atan2(sup.y - target.y, sup.x - target.x) : Math.atan2(e.y - target.y, e.x - target.x);
  const others = living(world, e).filter(o => o.ai?.flank);
  const base = rng() * TAU;
  let best = null;
  for (let i = 0; i < 12; i++) {
    const ang = base + (i / 12) * TAU;
    let delta = Math.abs(((ang - supAngle + Math.PI * 3) % TAU) - Math.PI);
    delta = Math.PI - delta;
    if (sup && delta < 0.9) continue;
    const pt = {x: target.x + Math.cos(ang) * radius, y: target.y + Math.sin(ang) * radius};
    if (!nav.isOpenAt(pt.x, pt.y)) continue;
    if (needSight && !world.los(target.x, target.y, pt.x, pt.y)) continue;
    const path = nav.findPath(e, pt, {radius: bodyRadius(e), maxExpand: 2500, avoid: sup ? [{x: sup.x, y: sup.y, r: 70, cost: 4}] : undefined});
    if (!path) continue;
    const len = nav.pathLength(e, path);
    // PINCER: a second flanker takes the opposite side of the target from the first, so the player is squeezed from two angles.
    const mySide = Math.sign(wrapAngle(ang - supAngle)) || 1;
    const sameSide = others.reduce((s, o) => {
      const oa = Math.atan2(o.ai.flank.y - target.y, o.ai.flank.x - target.x);
      return s + (Math.sign(wrapAngle(oa - supAngle)) === mySide ? 220 : 0);
    }, 0);
    const score = len + (sup ? Math.max(0, 1.6 - delta) * 120 : 0) + others.reduce((s, o) => s + (dist(o.ai.flank, pt) < 60 ? 150 : 0), 0) + sameSide + Math.abs(wrapAngle(ang - pincerAngle(supAngle, others.length, others.length + 1))) * 35;
    if (!best || score < best.score) best = {x: pt.x, y: pt.y, score};
  }
  return best;
}

// ---- instincts (self-preservation) -----------------------------------------------------------
// enemy-instinct.js holds the math. These wrappers read the world and write the brain state.

// Nav-cost circles along the player's fire lane, built once per enemy per frame.
function lane(c) {
  if (c.lane !== undefined) return c.lane;
  const w = c.world;
  c.lane = w.playerAim && c.ai.sees ? laneAvoidCircles(c.p, w.playerAim) : null;
  if (c.lane && !c.lane.length) c.lane = null;
  return c.lane ?? undefined;
}

// The player reloading or limping is the window the squad pushes into (peek sooner, shoot sooner, close the gap).
function senseOpening(c) {
  const {ai, world} = c;
  const opening = playerOpening({reloading: world.playerReloading, hpFrac: world.playerHpFrac});
  ai.opening = opening;
  if (opening && ai.sees && c.d < 420) { if (ai.pushT <= 0) ai.pushKick = true; ai.pushT = INSTINCT.pushWindow; }
}

// Morale: remember who stood near us; when one is gone (dead), react per type and call it out over the radio.
function senseAllies(c) {
  const {e, ai, world} = c;
  const map = ai.mates ??= new Map();
  for (const [id, m] of [...map]) {
    const o = world.enemies.find(x => x.id === id);
    if (o && o.alive !== false) continue;
    map.delete(id);
    const r = moraleReaction(e.type);
    if (r.kind === 'enrage') ai.enrage = r.for;
    else if (r.kind === 'shaken') { ai.shaken = r.for; ai.coverT = 0; ai.cover = null; }
    // only the nearest survivor shouts, so a death is one clear radio pulse, not a chorus
    const mates = living(world, e).filter(x => x.ai?.aware);
    if (mates.every(x => dist(x, m) >= dist(e, m))) for (const o2 of mates) if (dist(e, o2) < 300) world.alerts?.push({from: e, to: o2});
  }
  for (const o of living(world, e)) if (dist(e, o) <= 360) map.set(o.id, {x: o.x, y: o.y});
}

// A lit grenade or burning patch: leave. A telegraph in progress is abandoned (no shot is fired).
function fleeHazards(c) {
  const {e, ai, world, out} = c;
  if (!world.hazards?.length) return false;
  if (e.type === 'brute' && ai.brute.phase === 'dash') return false;
  const esc = hazardEscape(e, world.hazards, {canStep: dir => !world.nav || world.nav.walkable(e, {x: e.x + dir.x * 26, y: e.y + dir.y * 26}, bodyRadius(e))});
  if (!esc) return false;
  if (ai.windup > 0) { ai.windup = 0; ai.cd = Math.max(ai.cd, 0.6); }
  if (ai.brute.phase === 'windup') ai.brute.phase = 'advance';
  out.intent = 'flee'; out.stance = 'flee';
  out.moveX = esc.dir.x * 1.25; out.moveY = esc.dir.y * 1.25; out.speed = 1.25;
  return true;
}

// Standing in the player's crosshair: counts how long (ai.lineT). The caller reacts once the beat has passed.
function inFireLane(c) {
  const {e, ai, world, p, dt} = c;
  if (!world.playerAim || !ai.sees || ai.windup > 0) { ai.lineT = 0; return false; }
  if (!inAimLine(p, world.playerAim, e, {radius: e.radius ?? 8})) { ai.lineT = 0; return false; }
  ai.lineT += dt;
  return true;
}

// Step perpendicular out of the lane (stand-and-trade is for players). Returns true when it moved.
function sidestepLane(c, speed = 1.2) {
  const {e, ai, world, out, p} = c;
  const nav = world.nav;
  let dir = lineSidestep(p, world.playerAim, e, ai.strafeDir);
  const ok = d => !nav || nav.walkable(e, {x: e.x + d.x * 24, y: e.y + d.y * 24}, bodyRadius(e));
  if (!ok(dir)) { dir = {x: -dir.x, y: -dir.y}; if (!ok(dir)) return false; }
  const to = norm(p.x - e.x, p.y - e.y);
  ai.strafeDir = Math.sign(dir.x * -to.y + dir.y * to.x) || ai.strafeDir;   // keep strafing the way we stepped
  out.intent = 'sidestep'; out.stance = 'sidestep';
  out.moveX = dir.x * speed; out.moveY = dir.y * speed; out.speed = speed;
  return true;
}

// Hurt and nowhere to hide: run for a spot the player cannot see, preferring the direction of a healthy ally.
function breakLineOfSight(c) {
  const {e, ai, world, p, out} = c;
  const nav = world.nav;
  if (!nav) return false;
  if (ai.breakT <= 0 || !ai.breakGoal) {
    ai.breakT = 0.9;
    const rally = rallyPoint(e, living(world, e), p);
    let best = null;
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * TAU;
      for (const r of [90, 150]) {
        const pt = {x: e.x + Math.cos(ang) * r, y: e.y + Math.sin(ang) * r};
        if (!nav.isOpenAt(pt.x, pt.y) || world.los(p.x, p.y, pt.x, pt.y) || !nav.walkable(e, pt, bodyRadius(e))) continue;
        const score = r + (dist(pt, p) < dist(e, p) ? 120 : 0) - (rally ? Math.max(0, 200 - dist(pt, rally)) * 0.5 : 0);
        if (!best || score < best.score) best = {x: pt.x, y: pt.y, score};
      }
    }
    ai.breakGoal = best;
  }
  if (!ai.breakGoal) return false;
  out.intent = 'retreat'; out.stance = 'fallback';
  go(c, ai.breakGoal, 1.1, 10);
  return true;
}

// ---- shooting ---------------------------------------------------------------------------------

function shotClear(c, aim, length) {
  const {e, world} = c;
  const end = {x: e.x + aim.x * length, y: e.y + aim.y * length};
  if (!world.los(e.x, e.y, end.x, end.y)) return false;
  for (const o of living(world, e)) if (segmentHitsCircle(e.x, e.y, end.x, end.y, o.x, o.y, (o.radius ?? 8) + 2)) return false;
  return true;
}

function computeAim(c) {
  const {e, ai, world, rng, p, def} = c;
  const speed = def.projectileSpeed ?? 200;
  const frac = clamp(0.35 + ai.lockTime * 0.25, 0.35, 0.92);
  const vx = p.vx ?? 0, vy = p.vy ?? 0;
  const lead = leadAim(e, p, vx, vy, speed, frac);
  const rx = p.x - e.x, ry = p.y - e.y, d2 = Math.max(1, rx * rx + ry * ry);
  const crossing = Math.abs(rx * vy - ry * vx) / d2;
  const unsettled = 1 + 1.4 * Math.exp(-ai.lockTime / 0.9);
  const sigma = clamp((0.02 + 0.12 * crossing) * unsettled * (ai.prof.aimMul ?? 1) * (world.aimMul ?? 1), 0, 0.35);
  const err = clamp(gaussian(rng), -2.2, 2.2) * sigma;
  let aim = norm(lead.x - e.x, lead.y - e.y);
  const cos = Math.cos(err), sin = Math.sin(err);
  aim = {x: aim.x * cos - aim.y * sin, y: aim.x * sin + aim.y * cos};
  const length = Math.min(def.range, Math.max(40, Math.hypot(lead.x - e.x, lead.y - e.y)));
  if (!shotClear(c, aim, length)) {
    // The lead point is behind something: fall back to a direct aim, and give up if that is blocked too.
    const direct = norm(p.x - e.x, p.y - e.y);
    if (!shotClear(c, direct, Math.min(def.range, Math.hypot(rx, ry)))) return null;
    return direct;
  }
  return aim;
}

function fireReady(c) {
  const {e, ai, world, d, def} = c;
  if (!ai.sees || ai.reaction > 0 || ai.cd > 0 || e.stun > 0) return false;
  if (e.reloadTimer > 0 || (e.mag > 0 && e.ammo <= 0)) return false;
  if (d < (def.minRange ?? 0) || d >= def.range) return false;
  if (world.fireAllowed && !world.fireAllowed(e)) return false;
  // Token limit: only a few enemies may be winding up or have just fired; starts are staggered.
  const squad = living(world, e).filter(o => o.ai?.aware);
  const maxFiring = world.maxFiring ?? (squad.length >= 4 ? 3 : 2);
  const active = squad.filter(o => o.ai.windup > 0 || o.ai.sinceFire < 0.3).length;
  if (active >= maxFiring) return false;
  if (squad.some(o => o.ai.sinceStart < 0.3)) return false;
  return true;
}

function startWindup(c) {
  const {ai, out} = c;
  const aim = computeAim(c);
  if (!aim) { ai.cd = 0.25; return false; }
  ai.aim = aim;
  ai.windupTotal = ai.windup = ai.prof.windup;
  ai.sinceStart = 0;
  out.intent = 'aim'; out.aiming = true; out.windup = ai.windup; out.windupTotal = ai.windupTotal;
  return true;
}

// ---- behaviours ---------------------------------------------------------------------------------

function idle(c) { c.out.intent = 'idle'; }

function investigate(c) {
  const {e, ai, world, rng, dt, out} = c;
  const last = ai.last;
  if (!last) { idle(c); return; }
  const s = ai.search ?? (ai.search = {stage: 'go', t: 0, probes: 0, target: null});
  if (s.stage === 'go') {
    out.intent = 'investigate';
    let guess = {x: last.x, y: last.y};
    const ahead = {x: last.x + (last.vx ?? 0) * 0.35, y: last.y + (last.vy ?? 0) * 0.35};
    if (world.nav?.isOpenAt(ahead.x, ahead.y) && world.nav.walkable(last, ahead, 6)) guess = ahead;
    if (go(c, guess, 0.9, 16)) { s.stage = 'look'; s.t = between(rng, 1.0, 1.8); s.spin = rng() < 0.5 ? -1 : 1; }
    else if (out.moveX === 0 && out.moveY === 0) { s.stage = 'look'; s.t = 1.2; s.spin = 1; }
  } else if (s.stage === 'look') {
    out.intent = 'search';
    s.t -= dt;
    const a = Math.atan2(ai.face.y, ai.face.x) + s.spin * dt * 2.2;
    out.faceOverride = {x: Math.cos(a), y: Math.sin(a)};
    if (s.t <= 0) {
      s.probes++;
      const dir = norm(last.vx ?? 0, last.vy ?? 0);
      let target = null;
      if (s.probes === 1 && (dir.x || dir.y)) {
        const t = {x: last.x + dir.x * 120, y: last.y + dir.y * 120};
        if (world.nav?.isOpenAt(t.x, t.y)) target = t;
      }
      if (!target && world.nav) {
        for (let i = 0; i < 8 && !target; i++) {
          const ang = rng() * TAU, r = between(rng, 60, 150), t = {x: e.x + Math.cos(ang) * r, y: e.y + Math.sin(ang) * r};
          if (world.nav.isOpenAt(t.x, t.y)) target = t;
        }
      }
      if (s.probes > 2 || !target) { s.stage = 'wait'; s.t = 99; } else { s.stage = 'probe'; s.target = target; }
    }
  } else if (s.stage === 'probe') {
    out.intent = 'search';
    if (go(c, s.target, 0.8, 14)) { s.stage = 'look'; s.t = between(rng, 0.8, 1.4); }
    else if (out.moveX === 0 && out.moveY === 0) { s.stage = 'look'; s.t = 0.8; }
  } else out.intent = 'search';
}

function flankOrAdvance(c, ranged) {
  const {e, ai, world, p, out, def, dt} = c;
  const target = ai.sees ? p : ai.last;
  if (!target) { investigate(c); return; }
  const wantFlank = ai.role === 'flank' && c.suppressor && c.suppressor !== e;
  if (wantFlank) {
    ai.flankT -= dt;
    if (!ai.flank || ai.flankT <= 0) {
      const radius = ranged ? clamp(((def.minRange ?? 60) + def.range * 0.7) / 2, 100, 230) : 90;
      const f = chooseFlank(c, radius, ranged);
      ai.flank = f ? {x: f.x, y: f.y} : null;
      ai.flankT = 2.2;
    }
    if (ai.flank) {
      out.intent = 'flank'; out.stance = 'flank';
      if (go(c, ai.flank, 1, 12, lane(c))) { ai.flank = null; ai.flankT = 0.5; }
      return;
    }
  }
  ai.flank = null;
  // Not flanking: close the distance to the last known position, then fall back to searching.
  if (ai.last && ai.lost > ENGAGED_MEMORY) { investigate(c); return; }
  out.intent = 'approach';
  const goal = {x: target.x, y: target.y};
  if (ranged) {
    const n = norm(e.x - goal.x, e.y - goal.y), stop = (def.minRange ?? 60) * 1.4 + 20;
    goal.x += n.x * stop * 0.5; goal.y += n.y * stop * 0.5;
    if (world.nav && !world.nav.isOpenAt(goal.x, goal.y)) { goal.x = target.x; goal.y = target.y; }
  }
  if (go(c, goal, 1, 14, lane(c))) investigate(c);
}

function rangedStep(c) {
  const {e, ai, world, dt, rng, out, p, d, def} = c;
  const prof = ai.prof;
  const reloading = e.reloadTimer > 0 || (e.mag > 0 && e.ammo <= 0);
  ai.retreating = wantsRetreat(e.hp / e.maxHp, ai.retreating);
  // SELF-PRESERVATION: at ~40% HP stop trading shots and break line of sight. It is a breather, not a hideout:
  // after retreatMax scaled seconds the enemy has caught its breath and fights on (hiding must never stall a room).
  ai.retreatT = ai.retreating ? ai.retreatT + dt : 0;
  const hurt = ai.retreating && ai.retreatT < INSTINCT.retreatMax;
  const shaken = ai.shaken > 0;                     // an ally just dropped next to us: get low
  const pushing = ai.pushT > 0 && !hurt && !shaken; // the player is reloading or limping: this is the window
  const minRange = def.minRange ?? def.range * 0.42;
  const band = {min: minRange, max: def.range * 0.88};
  const engaged = ai.sees || ai.lost < ENGAGED_MEMORY;
  const target = ai.sees ? p : ai.last;
  if (!engaged || !target) { flankOrAdvance(c, true); return; }

  // Cover bookkeeping: re-pick when missing, stale, or the target moved far from where it was computed.
  ai.coverT -= dt;
  const drifted = ai.cover && Math.hypot(target.x - ai.cover.tx, target.y - ai.cover.ty) > 70;
  const exposedAtHide = ai.cover && ai.sees && ai.phase === 'duck' && dist(e, ai.cover.hide) < 16 && ai.sinceFire > 0.5;
  // A flanker changes the angle: if the player can now see our hiding spot, it is no longer cover.
  let compromised = false;
  if (ai.cover && ai.sees && ai.recheckT <= 0 && ai.phase === 'duck') {
    ai.recheckT = 0.25;
    compromised = world.los(p.x, p.y, ai.cover.hide.x, ai.cover.hide.y);
  }
  // A failed search is not repeated every frame: wait a beat before looking again (cover searches are the expensive query).
  const wantsCover = (!ai.cover ? ai.coverRetry <= 0 : (ai.coverT <= 0 || drifted || exposedAtHide || compromised));
  if (wantsCover && world.coverBudget !== undefined && world.coverBudget <= 0) {
    ai.coverT = Math.min(ai.coverT, 0) + 0.05; // another enemy used this frame's cover searches: retry next frames
  } else if (wantsCover) {
    const rally = hurt ? rallyPoint(e, living(world, e), target) : null;
    const opts = {minRange: band.min, maxRange: band.max, tiles: 6, rally, exclude: ai.nest ? [ai.nest] : undefined, excludeRadius: world.nav ? world.nav.tile * 3 : undefined};
    if (world.coverBudget !== undefined) world.coverBudget--;
    let found = findCover(e, target, world, opts);
    // No cover with a perfect firing band: take any cover with a workable one before standing in the open.
    if (!found && (world.coverBudget === undefined || world.coverBudget > 0)) {
      if (world.coverBudget !== undefined) world.coverBudget--;
      found = findCover(e, target, world, {...opts, relaxed: true});
    }
    // A marksman with nowhere new to go re-uses its old nest rather than standing in the open.
    if (!found && opts.exclude && (world.coverBudget === undefined || world.coverBudget > 0)) {
      if (world.coverBudget !== undefined) world.coverBudget--;
      found = findCover(e, target, world, {...opts, exclude: undefined});
    }
    ai.cover = found;
    ai.coverRetry = found ? 0 : 0.45;
    ai.nest = null;
    ai.coverT = between(rng, 1.4, 2.4);
    if (compromised && found) ai.phase = 'duck';
  }

  // Openings: the player reloading / hurt is when to peek and shoot NOW instead of waiting out the duck.
  if (ai.pushKick) {
    ai.pushKick = false;
    if (ai.phase === 'duck') ai.phaseT = Math.min(ai.phaseT, 0.12);
    ai.cd = Math.min(ai.cd, 0.3);
  }

  // Too close: back off first (cannot fire inside minRange anyway).
  if (ai.sees && d < band.min * 0.92) {
    out.intent = 'retreat'; out.stance = 'fallback';
    const away = norm(e.x - p.x, e.y - p.y);
    if (ai.cover && !hurt && dist(e, ai.cover.hide) > 16 && dist(ai.cover.hide, p) > d) go(c, ai.cover.hide, 1, 12);
    else if (!slide(c, away, 1)) slide(c, {x: -away.y * ai.strafeDir, y: away.x * ai.strafeDir}, 1);
    return;
  }

  // Hurt with no cover in reach: run for somewhere out of sight (toward an ally) rather than trade shots in the open.
  if (hurt && !ai.cover && breakLineOfSight(c)) return;

  // The crosshair is on us. Do not stand in it: duck back into cover if we are peeking, otherwise step out of the lane.
  const lined = inFireLane(c);
  const spooked = lined && ai.lineT >= INSTINCT.lineReact && ai.lineCd <= 0 && !pushing;
  if (spooked) {
    if (ai.cover && ai.phase === 'peek') { ai.phase = 'duck'; ai.phaseT = between(rng, 0.7, 1.3); ai.lineCd = INSTINCT.lineCooldown; ai.lineT = 0; }
    else if (!ai.cover || dist(e, ai.cover.hide) > 20) {
      ai.sideT = Math.max(ai.sideT, 0.45);
    }
  }
  if (ai.sideT > 0 && lined) { if (sidestepLane(c)) return; }
  else if (ai.sideT > 0) { ai.sideT = 0; ai.lineCd = INSTINCT.lineCooldown; }

  // Fire whenever allowed; the telegraph is mandatory. Enemies do not stop to shoot while running for cover.
  const atCover = ai.cover && dist(e, ai.cover.hide) <= 16;
  const canShootNow = !ai.cover || ai.phase === 'peek' || atCover;
  const holdFire = shaken || (lined && ai.lineCd <= 0 && !ai.cover && !pushing && ai.lineT < 0.9);   // sidestep first, shoot from the new spot
  if (!holdFire && canShootNow && (!hurt || ai.phase === 'peek' || !ai.cover) && fireReady(c) && startWindup(c)) {
    if (e.type === 'sniper') ai.nest = ai.cover ? {...ai.cover.hide} : {x: e.x, y: e.y};   // marksman: relocate after every shot
    return;
  }
  // A marksman that just fired does not stay put: take the next nest.
  if (e.type === 'sniper' && ai.nest && ai.sinceFire < 0.4) { ai.cover = null; ai.coverT = 0; ai.phase = 'duck'; ai.phaseT = between(rng, 0.2, 0.6); }

  if (ai.cover) {
    ai.phaseT -= dt;
    const atHide = dist(e, ai.cover.hide) <= 16;
    if (ai.phase === 'duck') {
      out.intent = reloading ? 'reload' : 'cover';
      out.stance = shaken ? 'wary' : hurt ? 'fallback' : !ai.sees && ai.lost > 0.8 ? 'hold' : null;
      if (!atHide) go(c, ai.cover.hide, 1, 12);
      const suppress = ai.role === 'suppress' ? 0.5 : 1;
      // Do not lean out into a crosshair that is already parked on the corner: hold the duck a moment.
      const corner = !pushing && ai.phaseT <= 0 && ai.peekHold <= 0 && world.playerAim && ai.cover.peek && inAimLine(p, world.playerAim, ai.cover.peek, {radius: 8});
      if (corner) ai.peekHold = 1.1;
      const cornerHeld = ai.peekHold > 0 && world.playerAim && ai.cover.peek && inAimLine(p, world.playerAim, ai.cover.peek, {radius: 8});
      if (shaken) ai.phaseT = Math.max(ai.phaseT, 0.3);
      if (ai.phaseT <= 0 && !cornerHeld && !reloading && !(hurt && rng() < 0.75) && ai.cd < 0.6) {
        ai.phase = 'peek'; ai.phaseT = 2.4; ai.peekHold = 0; ai.shotsLeft = Math.round(between(rng, prof.burst[0], prof.burst[1] + 0.99)) + (ai.role === 'suppress' ? 1 : 0);
      } else if (ai.phaseT <= 0 && (reloading || hurt)) ai.phaseT = between(rng, 0.5, 1.0) * suppress;
      else if (ai.phaseT <= 0 && cornerHeld) ai.phaseT = 0.15;
    } else {
      out.intent = 'peek'; out.stance = ai.role === 'suppress' ? 'suppress' : null;
      const reached = go(c, ai.cover.peek, 1, 8);
      if (reached && !ai.sees) {
        if (++ai.peekMiss >= 2) ai.lost = Math.max(ai.lost, ENGAGED_MEMORY + 0.1);
        ai.phaseT = Math.min(ai.phaseT, 0.2);
      }
      if (ai.phaseT <= 0 || ai.shotsLeft <= 0) {
        ai.phase = 'duck';
        ai.phaseT = between(rng, ...prof.duck) * (ai.role === 'suppress' ? 0.5 : 1) * (hurt ? 1.6 : 1) * (pushing ? 0.45 : 1);
      }
    }
    return;
  }

  // No cover available (and not hurt, or cornered): hold the band and keep moving.
  if (!ai.sees) { flankOrAdvance(c, true); return; }
  if (d > band.max) { out.intent = 'approach'; out.stance = pushing ? 'push' : null; go(c, {x: p.x - (p.x - e.x) / d * (band.max * 0.8), y: p.y - (p.y - e.y) / d * (band.max * 0.8)}, 1, 12, lane(c)); return; }
  // In the open: strafe, but never down the crosshair. Standing here trading shots is the player's job, not ours.
  out.intent = 'strafe';
  ai.strafeT -= dt;
  if (ai.strafeT <= 0) { ai.strafeDir = -ai.strafeDir; ai.strafeT = between(rng, 0.7, 1.5); }
  const to = norm(p.x - e.x, p.y - e.y), radial = d < band.min * 1.25 ? -0.5 : 0;
  const side = {x: -to.y * ai.strafeDir + to.x * radial, y: to.x * ai.strafeDir + to.y * radial};
  if (!slide(c, side, 0.85)) { ai.strafeDir = -ai.strafeDir; ai.strafeT = between(rng, 0.7, 1.5); }
}

// A rusher in the player's crosshair weaves out of it: pick the weave direction that leaves the lane.
function leaveLane(c, dirKey, timerKey, to) {
  const {e, ai, world, p} = c;
  if (!world.playerAim || !inAimLine(p, world.playerAim, e, {radius: e.radius ?? 8}) || ai[timerKey] > 0.35 || ai.lineCd > 0) return;
  const s = lineSidestep(p, world.playerAim, e, ai[dirKey]);
  ai[dirKey] = Math.sign(s.x * -to.y + s.y * to.x) || ai[dirKey];
  ai[timerKey] = Math.max(ai[timerKey], 0.55);
}

function rusherStep(c) {
  const {e, ai, world, dt, rng, out, p, d} = c;
  const nav = world.nav;
  const target = ai.sees ? p : ai.last;
  if (!target) { idle(c); return; }
  if (!ai.sees && ai.lost > ENGAGED_MEMORY && ai.lost > 8) { investigate(c); return; }
  const rad = bodyRadius(e);
  const direct = ai.sees && (!nav || nav.walkable(e, p, rad));
  if (ai.role === 'flank' && c.suppressor && d > 150) { flankOrAdvance(c, false); return; }
  if (direct) {
    const to = norm(p.x - e.x, p.y - e.y);
    if (c.def.shield) {
      // RIOT: a slow, straight, shield-first advance. No circling or zig-zag: the player has to out-flank it.
      out.intent = d <= 40 ? 'attack' : 'approach';
      if (!slide(c, to, 1)) go(c, p, 1, 12);
      ai.ambush = 0;
      return;
    }
    if (d <= 58) {
      out.intent = 'attack';
      slide(c, to, 1.15);
    } else if (d <= 150) {
      // Circle in: tangential strafe plus inward drift, flipping direction now and then.
      out.intent = 'circle';
      leaveLane(c, 'circleDir', 'circleT', to);
      ai.circleT -= dt;
      if (ai.circleT <= 0) { ai.circleDir = -ai.circleDir; ai.circleT = between(rng, 0.7, 1.4); }
      const v = {x: to.x * 0.75 - to.y * ai.circleDir * 0.85, y: to.y * 0.75 + to.x * ai.circleDir * 0.85};
      if (!slide(c, v, 1)) { ai.circleDir = -ai.circleDir; slide(c, to, 1); }
    } else {
      // Zig-zag so a single aimed shot is unlikely to land.
      out.intent = 'zigzag';
      leaveLane(c, 'zigDir', 'zigT', to);
      ai.zigT -= dt;
      if (ai.zigT <= 0) { ai.zigDir = -ai.zigDir; ai.zigT = between(rng, 0.45, 0.9); }
      const amount = 0.55 * ai.zigDir * Math.min(1, (d - 150) / 120);
      if (!slide(c, {x: to.x - to.y * amount, y: to.y + to.x * amount}, 1)) ai.zigDir = -ai.zigDir;
    }
    ai.ambush = 0;
    if (d < 130) ai.packSpent = 0;
    return;
  }
  // No clean line: follow the shared flow field around walls and crates. Hold at a corner
  // for a beat when the player is close, then burst around it.
  const field = nav?.flowField(target);
  if (ai.ambush > 0) { ai.ambush -= dt; out.intent = 'ambush'; out.stance = 'hold'; return; }
  // PACK: a rusher at a corner waits for the mate trailing behind it, so they cross the open together rather than one by one.
  if (field && ai.enrage <= 0 && ai.packSpent < INSTINCT.packWait && field.distAt(e.x, e.y) < 280 &&
      shouldWaitForPack(e, living(world, e).filter(o => o.ai?.aware && o.def?.brain === 'rush'), target)) {
    ai.packSpent += dt; out.intent = 'ambush'; out.stance = 'hold'; return;
  }
  if (!ai.ambushUsed && field && field.distAt(e.x, e.y) < 190 && ai.sees === false && ai.lost < 1.2 && rng() < dt * 3) {
    ai.ambushUsed = true; ai.ambush = between(rng, 0.35, 0.8); out.intent = 'ambush'; return;
  }
  if (!field) { out.intent = 'approach'; go(c, target, 1, 12); return; }
  const dir = field.dirAt(e.x, e.y);
  if (ai.sees) ai.ambushUsed = false;
  if (!ai.sees && dist(e, target) < 24) { investigate(c); return; }
  out.intent = 'approach';
  if (dir) { out.moveX = dir.x; out.moveY = dir.y; out.speed = 1; out.goal = {x: target.x, y: target.y}; }
  else go(c, target, 1, 12);
}

function bruteStep(c) {
  const {e, ai, world, dt, rng, out, p, d, prof} = c;
  const b = ai.brute, nav = world.nav;
  const target = ai.sees ? p : ai.last;
  if (!target) { idle(c); return; }
  if (e.meleeWindup > 0) { out.intent = 'attack'; b.phase = b.phase === 'dash' ? 'recover' : b.phase; b.t = prof.recover * 0.4; return; }
  b.cd -= dt * (ai.enrage > 0 ? 2.5 : 1);   // an enraged brute (an ally just fell) comes back for the next charge sooner
  if (ai.enrage > 0) out.stance = 'enrage';
  if (b.phase === 'windup') {
    b.t -= dt;
    out.intent = 'charge'; out.windup = Math.max(0, b.t); out.windupTotal = prof.chargeWindup; out.aiming = true;
    const to = norm(p.x - e.x, p.y - e.y);
    out.faceOverride = to;
    if (b.t <= 0) { b.phase = 'dash'; b.t = prof.chargeTime; b.dir = to; out.windup = 0; }
    return;
  }
  if (b.phase === 'dash') {
    b.t -= dt;
    out.intent = 'charge';
    const ahead = {x: e.x + b.dir.x * 26, y: e.y + b.dir.y * 26};
    if (b.t <= 0 || d < 20 || (nav && !nav.walkable(e, ahead, bodyRadius(e)))) { b.phase = 'recover'; b.t = prof.recover; return; }
    out.moveX = b.dir.x * prof.chargeSpeed; out.moveY = b.dir.y * prof.chargeSpeed; out.speed = prof.chargeSpeed;
    return;
  }
  if (b.phase === 'recover') {
    b.t -= dt;
    out.intent = 'hold';
    if (b.t <= 0) { b.phase = 'advance'; b.cd = between(rng, ...prof.chargeCooldown); }
    return;
  }
  // advance
  if (ai.sees && ai.reaction <= 0 && b.cd <= 0 && d < 170 && d > 52 && (!nav || nav.walkable(e, p, bodyRadius(e)))) {
    b.phase = 'windup'; b.t = prof.chargeWindup; out.intent = 'charge'; out.windup = b.t; out.windupTotal = b.t; out.aiming = true; return;
  }
  rusherStep(c);
  if (out.intent === 'zigzag' || out.intent === 'circle') out.intent = 'approach';
}

// ---- reactions --------------------------------------------------------------------------------

// Deterministic sidestep (stealth.js shouldDodge): only an aware enemy that is facing the shot, is not winding up,
// stunned or still reacting, and had time to see it coming. Same shot, same answer; every dodge has a cooldown
// the player can bait. The sidestep is fast and visible (see stealth2d.js afterimage).
function tryDodge(c) {
  const {e, ai, world, out} = c;
  if (ai.dodgeT > 0) {
    out.intent = 'dodge'; ai.dodging = true;
    out.moveX = ai.dodge.x * 2; out.moveY = ai.dodge.y * 2; out.speed = 2;
    return true;
  }
  ai.dodging = false;
  if (ai.dodgeCd > 0 || !world.projectiles?.length || !DODGERS[e.type]) return false;
  const actor = {x: e.x, y: e.y, radius: e.radius};
  const threats = incomingThreats(actor, world.projectiles);
  for (const {shot, time} of threats) {
    if (!shouldDodge({type: e.type, aware: ai.aware, sees: ai.sees, facing: ai.face, shotDir: {x: shot.vx, y: shot.vy},
      windup: ai.windup, stun: e.stun ?? 0, reaction: ai.reaction, cooldown: ai.dodgeCd, timeToImpact: time})) continue;
    const speed = Math.hypot(shot.vx, shot.vy) || 1;
    // step to the side the enemy is already leaning toward (strafe direction), else the open one
    const sign = ai.strafeDir;
    for (const s of [sign, -sign]) {
      const dir = {x: -shot.vy / speed * s, y: shot.vx / speed * s};
      if (!world.nav || world.nav.walkable(e, {x: e.x + dir.x * 40, y: e.y + dir.y * 40}, bodyRadius(e))) {
        ai.dodge = dir; ai.dodgeT = 0.3; ai.dodgeCd = DODGERS[e.type].cooldown; ai.dodging = true;
        out.intent = 'dodge'; out.moveX = dir.x * 2; out.moveY = dir.y * 2; out.speed = 2;
        return true;
      }
    }
  }
  return false;
}

// ---- unaware postures ---------------------------------------------------------------------------
// Unaware enemies stand in one of four readable postures (stealth.js POSTURES), set at spawn by game.js:
//   patrol  walks a loop of waypoints (e.post.route), pausing to look around
//   guard   holds e.post.home facing e.post.base, sweeping its cone slowly
//   gather  like guard but facing its group's focus point (faces mates, cones overlap the table)
//   sleep   no cone, no movement; wakes on noise, damage or being stepped on
function unawareStep(c) {
  const {e, ai, dt, out} = c;
  const post = e.post ??= {home: {x: e.x, y: e.y}, base: {x: ai.face.x, y: ai.face.y}};
  const kind = e.posture ?? 'guard';
  out.intent = 'idle';
  if (kind === 'sleep') { out.faceOverride = ai.face; return; }
  const turnTo = (dir, rate = 2.4) => { out.faceOverride = turnFacing(ai.face, dir, rate, dt); };
  if (kind === 'patrol' && post.route?.length > 1) {
    const pat = ai.pat ??= {i: 0, wait: 0, look: 0};
    if (pat.wait > 0) {
      pat.wait -= dt; out.intent = 'idle';
      const base = Math.atan2(ai.face.y, ai.face.x), a = base + Math.sin(ai.clock * 1.4 + e.id * 5) * 0.9;
      turnTo({x: Math.cos(a), y: Math.sin(a)}, 1.6);
      return;
    }
    const goal = post.route[pat.i % post.route.length];
    out.intent = 'patrol';
    if (go(c, goal, 0.5, 10)) { pat.wait = 1.1 + (e.id * 7 % 1); pat.i++; }
    else if (out.moveX !== 0 || out.moveY !== 0) turnTo(norm(out.moveX, out.moveY), 3.2);
    else { pat.i++; }
    return;
  }
  if (dist(e, post.home) > 14) {
    out.intent = 'patrol';
    go(c, post.home, 0.6, 10);
    if (out.moveX !== 0 || out.moveY !== 0) turnTo(norm(out.moveX, out.moveY), 3);
    return;
  }
  const amp = kind === 'gather' ? 0.2 : 0.5, baseAng = Math.atan2(post.base.y, post.base.x);
  const a = baseAng + Math.sin(ai.clock * 0.55 + e.id * 9) * amp;
  turnTo({x: Math.cos(a), y: Math.sin(a)}, 1.8);
}

// ---- main entry -------------------------------------------------------------------------------

export function stepEnemyBrain(e, world, dtIn, rng = Math.random) {
  const ai = brainState(e, rng);
  const dt = Number.isFinite(dtIn) ? Math.max(0, dtIn) : 0;
  const def = e.def ?? {};
  const p = world.player;
  const out = {
    moveX: 0, moveY: 0, speed: 1, aimX: ai.face.x, aimY: ai.face.y, fire: false, intent: 'idle',
    windup: 0, windupTotal: 0, aiming: false, locked: false, aware: ai.aware, sees: false, suspicion: ai.suspicion, inView: ai.inView, dodging: false, spotted: ai.spotted, role: ai.role, goal: null, faceOverride: null, stance: null,
  };
  for (const key of ['clock']) ai[key] += dt;
  for (const key of ['cd', 'dodgeT', 'dodgeCd', 'pathT', 'reaction', 'coverT', 'lineCd', 'sideT', 'pushT', 'shaken', 'enrage', 'packT', 'peekHold', 'recheckT', 'breakT', 'coverRetry']) ai[key] = Math.max(0, ai[key] - dt);
  ai.sinceFire += dt; ai.sinceStart += dt;
  const d = Math.hypot(p.x - e.x, p.y - e.y);
  const prof = ai.prof = PROFILES[e.type] ?? ai.prof;
  const c = {e, ai, world, dt, rng, out, p, d, def, prof, ranged: def.brain === 'shoot' || def.brain === 'guard' || def.brain === 'sniper', suppressor: null};

  if (e.stun > 0) {
    ai.windup = 0; ai.dodgeT = 0; if (ai.brute.phase === 'windup' || ai.brute.phase === 'dash') ai.brute.phase = 'recover';
    perceive(c); out.intent = 'stunned'; out.sees = ai.sees; return finish(c);
  }

  perceive(c);
  out.sees = ai.sees; out.aware = ai.aware;
  if (!ai.aware) { unawareStep(c); out.suspicion = ai.suspicion; return finish(c); }
  updateRole(c);
  out.role = ai.role;
  senseOpening(c);
  senseAllies(c);
  if (fleeHazards(c)) return finish(c);

  // A running telegraph owns the enemy: it stands still, then fires if the shot is still valid.
  if (ai.windup > 0) {
    ai.windup -= dt;
    out.intent = 'aim'; out.aiming = true; out.windupTotal = ai.windupTotal;
    if (def.brain === 'sniper') {
      // The laser tracks the player (rate-limited) until the lock point, then freezes: stand in the lane and you eat it.
      out.locked = ai.windup <= prof.lockTime;
      if (!out.locked && ai.sees) {
        const lead = leadAim(e, p, p.vx ?? 0, p.vy ?? 0, def.projectileSpeed ?? 300, 0.55);
        const want = Math.atan2(lead.y - e.y, lead.x - e.x), cur = Math.atan2(ai.aim.y, ai.aim.x);
        let diff = want - cur; while (diff > Math.PI) diff -= TAU; while (diff < -Math.PI) diff += TAU;
        const step = prof.trackRate * dt, a = Math.abs(diff) <= step ? want : cur + Math.sign(diff) * step;
        ai.aim = {x: Math.cos(a), y: Math.sin(a)};
      }
    }
    out.faceOverride = ai.aim;
    const lostSight = !ai.sees;
    if (ai.windup <= 0 || (lostSight && (ai.lost > 0.3))) {
      const finishing = ai.windup <= 0;
      ai.windup = 0;
      const ok = finishing && ai.sees && d >= (def.minRange ?? 0) && d < def.range && !(world.fireAllowed && !world.fireAllowed(e)) &&
        e.reloadTimer <= 0 && shotClear(c, ai.aim, Math.min(def.range, d));
      if (ok) {
        out.fire = true; ai.sinceFire = 0; ai.shotsLeft--;
        ai.cd = between(rng, ...prof.fireGap);
        if (ai.shotsLeft > 0) ai.cd = Math.min(ai.cd, 0.7);
      } else ai.cd = 0.6;
      out.aiming = false; out.windup = 0;
      out.intent = ok ? 'aim' : 'hold';
    } else out.windup = ai.windup;
    return finish(c);
  }

  if (ai.reaction > 0 && ai.sees) {
    tryDodge(c);
    if (out.intent !== 'dodge') out.intent = 'notice';
    return finish(c);
  }
  if (tryDodge(c)) return finish(c);

  if (e.type === 'brute') bruteStep(c);
  else if (c.ranged) rangedStep(c);
  else rusherStep(c);
  return finish(c);
}

function finish(c) {
  const {e, ai, world, dt, out} = c;
  // Facing: locked aim during a telegraph, otherwise toward the target / direction of travel.
  let face = out.faceOverride;
  if (!face) {
    const target = ai.sees ? c.p : (ai.last && ai.aware ? ai.last : null);
    if (out.aiming) face = ai.aim;
    else if (target && (ai.sees || Math.hypot(out.moveX, out.moveY) < 0.05)) face = norm(target.x - e.x, target.y - e.y);
    else if (Math.hypot(out.moveX, out.moveY) > 0.05) face = norm(out.moveX, out.moveY);
  }
  if (face && (face.x || face.y)) ai.face = face;
  out.aimX = ai.face.x; out.aimY = ai.face.y;

  const moving = Math.hypot(out.moveX, out.moveY) > 0.05;
  if (ai.windup > 0 || e.stun > 0 || ai.brute.phase === 'windup') { out.moveX = 0; out.moveY = 0; out.speed = 0; }
  else if (moving) {
    // Separation: lean away from squadmates standing too close so the group spreads out.
    let sx = 0, sy = 0;
    for (const o of world.enemies) {
      if (o === e || o.alive === false) continue;
      const d = Math.hypot(e.x - o.x, e.y - o.y), reach = (e.radius ?? 8) + (o.radius ?? 8) + 12;
      if (d > 0 && d < reach) { const w = (1 - d / reach) * 0.6; sx += (e.x - o.x) / d * w; sy += (e.y - o.y) / d * w; }
    }
    out.moveX += sx; out.moveY += sy;
    // Unstick: if we asked to move but barely did, repath and nudge sideways for a moment.
    const travelled = Math.hypot(e.x - ai.prevX, e.y - ai.prevY);
    const wanted = (e.def?.speed ?? 40) * out.speed * dt;
    if (dt > 0 && travelled < wanted * 0.15) ai.stuck += dt; else ai.stuck = 0;
    if (ai.stuck > 0.5) { ai.stuck = 0; ai.pathT = 0; ai.path = null; ai.nudge = {x: -out.moveY, y: out.moveX, t: 0.35}; }
  } else ai.stuck = 0;
  if (ai.nudge) {
    ai.nudge.t -= dt;
    if (ai.nudge.t <= 0) ai.nudge = null;
    else if (moving) { out.moveX += ai.nudge.x * 0.8; out.moveY += ai.nudge.y * 0.8; }
  }
  ai.prevX = e.x; ai.prevY = e.y;
  out.aware = ai.aware; out.role = ai.role; out.suspicion = ai.suspicion; out.inView = ai.inView; out.dodging = ai.dodging; out.spotted = ai.spotted;
  if (!out.stance && ai.role === 'suppress' && ai.sees && (out.aiming || out.intent === 'peek')) out.stance = 'suppress';
  if (!out.stance && ai.pushT > 0 && (out.intent === 'approach' || out.intent === 'peek' || out.intent === 'aim')) out.stance = 'push';
  out.tactic = out.intent;
  return out;
}
