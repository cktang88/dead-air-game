// SHOVE: the melee fallback. Pure rules (no DOM, no clocks); game.js applies the outcome.
//
// Both guns at 0/0 with awake enemies must never be a dead end. A shove is a short, wide shoulder-barge in front of you:
// it knocks the enemy back, staggers it (a staggered enemy cannot shoot), and does small damage, so it finishes enemies
// that are already weakened. From behind an enemy who has not noticed you (or a sleeper) it is a SILENT TAKEDOWN: a kill with
// no noise at all, which makes stealth playable without a gun. Heavy enemies shrug it off (riots block it from the front),
// and the boss ignores it.
import {strikeFromBehind} from './stealth.js';

export const SHOVE = {
  reach: 30,            // px from the player's centre to the enemy's edge
  halfArc: 62 * Math.PI / 180,
  cooldown: 0.7,        // real seconds
  damage: 14,
  stagger: 0.7,         // seconds of stun (world time)
  knock: 260,           // px/s impulse handed to the enemy's knock velocity
  lunge: 70,            // forward nudge on the player so the shove closes distance
  noise: 70,            // px radius of the thud when a shove is not a takedown
  beat: 0.05,           // world-time beat a shove lets through
  maxTargets: 3,
};

const HEAVY = new Set(['brute', 'riot', 'boss']);

// Enemies inside the shove wedge, nearest first. `hitRadius(enemy)` defaults to 11.
export function shoveTargets(player, aim, enemies, {hitRadius = () => 11} = {}) {
  const al = Math.hypot(aim.x, aim.y) || 1, ax = aim.x / al, ay = aim.y / al, out = [];
  for (const e of enemies) {
    if (!e.alive) continue;
    const dx = e.x - player.x, dy = e.y - player.y, d = Math.hypot(dx, dy), r = hitRadius(e);
    if (d > SHOVE.reach + r + 8) continue;
    if (d > r + 4) {
      const cos = (dx * ax + dy * ay) / d, slack = Math.asin(Math.min(1, r / d));
      if (Math.acos(Math.max(-1, Math.min(1, cos))) > SHOVE.halfArc + slack) continue;
    }
    out.push({enemy: e, d, dir: d > 1e-6 ? {x: dx / d, y: dy / d} : {x: ax, y: ay}});
  }
  return out.sort((a, b) => a.d - b.d).slice(0, SHOVE.maxTargets);
}

// What a shove does to one enemy. `dir` = unit vector player -> enemy.
// Returns {kind: 'takedown'|'hit'|'blocked'|'ignored', damage, stagger, knock, label}.
export function shoveOutcome({type, hp, aware, asleep = false, elite = false, facing, dir, shieldFacing = null}) {
  if (type === 'boss') return {kind: 'ignored', damage: 0, stagger: 0, knock: 0, label: ''};
  const unawareBehind = !aware && (asleep || (facing && strikeFromBehind(facing, dir)));
  if (unawareBehind && !HEAVY.has(type) && !elite) return {kind: 'takedown', damage: Math.max(hp, 1), stagger: 0, knock: SHOVE.knock * 0.4, label: 'SILENT TAKEDOWN'};
  if (type === 'riot') {
    const front = shieldFacing ? -(shieldFacing.x * dir.x + shieldFacing.y * dir.y) > 0.3 : !strikeFromBehind(facing || {x: 0, y: 0}, dir);
    if (front) return {kind: 'blocked', damage: 0, stagger: 0.25, knock: SHOVE.knock * 0.8, label: 'BLOCKED'};
    return {kind: 'hit', damage: SHOVE.damage * 2, stagger: SHOVE.stagger, knock: SHOVE.knock, label: 'FLANK'};
  }
  if (type === 'brute') return {kind: 'hit', damage: SHOVE.damage * 0.5, stagger: 0.35, knock: SHOVE.knock * 0.45, label: ''};
  const damage = SHOVE.damage;
  return {kind: 'hit', damage, stagger: SHOVE.stagger, knock: SHOVE.knock, label: hp <= damage ? 'FINISHED' : ''};
}

// Cooldown gate on the real clock.
export const shoveReady = (now, readyAt) => now >= readyAt;

// ---- ammo fallback ---------------------------------------------------------------------------------------------
// Dry = every carried gun has an empty magazine AND an empty reserve.
export function isAllDry(slots, mags, reserves) {
  return slots.length > 0 && slots.every(i => (mags[i] || 0) <= 0 && (reserves[i] || 0) <= 0);
}
// The kill that follows running dry always drops an AMMO pickup (value = fraction of the reserve, see ammoPickupRounds).
export const DRY_DROP_VALUE = 0.5;
export const dryKillDropsAmmo = dry => Boolean(dry);
