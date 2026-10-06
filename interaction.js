// Single source of truth for "what can the player interact with right now?".
// Both the in-world prompt renderer (affordances2d.js) and game.js interact() read this list so the
// prompt shown on screen and the thing that happens when E is pressed can never disagree.
import {roomHasLivingEnemies} from './room-roles.js';
import {GUNS, MOD_BY_ID, modFits} from './catalog.js';
import {gunPickupPlan} from './rules.js';
import {DOOR_RANGE, isClosed} from './doors.js';

export const TILE_PX = 32;
/** Distances (px) at which each interactable becomes usable. Mirrors the legacy interact() thresholds. */
export const RANGE = Object.freeze({gate: 38, supply: 40, gun: 36, mod: 34, exit: 70, door: DOOR_RANGE});
/** Within this distance an out-of-range interactable shows a small name tag so you know what it is. */
export const LABEL_RANGE = 300;
/** Lower number wins when several targets are in range at once (same order interact() always used). */
export const PRIORITY = Object.freeze({gate: 0, door: 0.5, supply: 1, gun: 3, mod: 3, exit: 5, pickup: 6});
const prio = k => PRIORITY[k] ?? 9;

import {dist} from './util.js';
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 'S'}`;

/** "3 HOSTILES" style helper. */
export const hostilesText = n => plural(n, 'HOSTILE');
export const needScrapText = (cost, have) => `NEED ${cost} SCRAP · HAVE ${Math.max(0, Math.floor(have))}`;

function livingIn(roomIndex, enemies) { return enemies.filter(e => e.alive && e.roomIndex === roomIndex).length; }
function livingOnRoute(rooms, enemies) { return enemies.filter(e => e.alive && rooms[e.roomIndex]?.branch !== true).length; }

const GUN_ICON = {'PISTOL': 'gun-pistol', 'SMG': 'gun-smg', 'SHOTGUN': 'gun-shotgun', 'ASSAULT RIFLE': 'gun-rifle', 'SNIPER': 'gun-sniper', 'ANTI-MATERIEL': 'gun-antimateriel', 'LAUNCHER': 'gun-launcher'};
export const gunIconId = gun => GUN_ICON[gun?.category] || 'gun-rifle';
const MOD_ICON_ID = {suppressor: 'mod-suppressor', ricochet: 'mod-ricochet', incendiary: 'mod-incendiary', extended: 'mod-extended', quickdraw: 'mod-quickdraw', longbarrel: 'mod-longbarrel'};
export const pickupIconId = pk => ({scrap: 'pickup-scrap', heal: 'pickup-heal', mod: (pk.modId && MOD_ICON_ID[pk.modId]) || 'pickup-mod', ammo: 'pickup-ammo', armor: 'pickup-armor'}[pk.kind] || 'pickup-crate');
export function pickupName(pk) {
  if (pk.kind === 'scrap') return `${pk.value || 12} SCRAP`;
  if (pk.kind === 'heal') return 'MEDKIT';
  if (pk.kind === 'ammo') return 'AMMO';
  if (pk.kind === 'armor') return 'ARMOR PLATE';
  if (pk.kind === 'mod') return MOD_BY_ID.get(pk.modId)?.name || 'MOD';
  return String(pk.kind || 'ITEM').toUpperCase();
}

/**
 * Build every nearby interactable with its distance, affordability and reason.
 * @param {object} s {player, scrap, gates, pickups, rooms, enemies, guns?, hand?: {gun, modId, weapons, maxSlots, activeSlot}, tile?}
 * @returns {Array} targets sorted by priority then distance; `inRange` marks the usable ones.
 */
export function collectInteractables(s) {
  const T = s.tile || TILE_PX, p = s.player, out = [];
  if (!p) return out;
  const rooms = s.rooms || [], enemies = s.enemies || [], scrap = s.scrap || 0;
  const add = t => { t.distance = dist(p, t.anchor || t); t.inRange = t.distance < t.range; if (t.distance < LABEL_RANGE || t.inRange) out.push(t); };

  for (const g of s.gates || []) {
    if (g.opened) continue;
    const ok = scrap >= g.cost;
    add({id: `gate:${g.x},${g.y}`, kind: 'gate', ref: g, x: (g.x + .5) * T, y: (g.y + .5) * T, range: RANGE.gate, keyed: true, icon: 'lock-locked',
      verb: 'UNLOCK', subject: 'GATE', cost: g.cost, enabled: ok, reason: ok ? '' : needScrapText(g.cost, scrap), color: '#ffb04a'});
  }
  // Closable doors (doors.js): tap E opens, hold E peeks. Scripted gates and open doors are not interactable.
  for (const d of s.doorProps || []) {
    if (d.gate || !isClosed(d)) continue;
    const peeking = !!s.peeking;
    add({id: d.id, kind: 'door', ref: d, x: d.x * T, y: d.y * T, range: RANGE.door, keyed: true, icon: 'door',
      verb: peeking ? 'PEEKING' : 'OPEN', subject: peeking ? '' : 'DOOR', enabled: true, reason: '', note: peeking ? 'RELEASE · BACK' : 'HOLD · PEEK', color: '#cfd8e8'});
  }
  for (const pk of s.pickups || []) {
    if (!pk.available) continue;
    const at = {x: pk.x, y: pk.y};
    if (pk.kind === 'supply' && pk.claimed) {
      add({id: `claimed:${Math.round(pk.x)},${Math.round(pk.y)}`, kind: 'claimed', ref: pk, ...at, range: 0, keyed: false, icon: 'station-cache-open', verb: '', subject: 'SUPPLY DROP · TAKEN', enabled: false, reason: '', color: '#8d8a96'});
    } else if (pk.kind === 'supply') {
      const n = livingIn(pk.roomIndex, enemies), ok = n === 0;
      add({id: `supply:${Math.round(pk.x)},${Math.round(pk.y)}`, kind: 'supply', ref: pk, ...at, range: RANGE.supply, keyed: true, icon: 'station-cache',
        verb: 'OPEN', subject: 'SUPPLY DROP', enabled: ok, reason: ok ? 'PICK ONE OF THREE' : `CLEAR ROOM FIRST (${hostilesText(n)})`, color: '#f4c66d'});
    } else if (pk.kind === 'mod') {
      const mod = MOD_BY_ID.get(pk.modId), hand = s.hand || {}, worn = hand.modId ? MOD_BY_ID.get(hand.modId) : null, same = hand.modId === pk.modId;
      add({id: `mod:${Math.round(pk.x)},${Math.round(pk.y)}`, kind: 'mod', ref: pk, ...at, range: RANGE.mod, keyed: true, icon: pickupIconId(pk),
        verb: 'FIT', subject: mod?.name || 'MOD', enabled: !same && !!hand.gun && modFits(hand.gun, pk.modId), note: mod?.info,
        reason: same ? 'ALREADY FITTED' : !hand.gun || !modFits(hand.gun, pk.modId) ? `DOES NOT FIT ${hand.gun?.name || 'YOUR GUN'}` : `ON ${hand.gun?.name || 'YOUR GUN'}${worn ? ` · REPLACES ${worn.name}` : ''}`, color: pk.color || '#d38ff5'});
    } else if (pk.kind === 'gun') {
      const gun = s.guns?.[pk.gunIndex] || GUNS[pk.gunIndex], hand = s.hand || {}, plan = hand.weapons ? gunPickupPlan(hand.weapons, pk.gunIndex, hand.maxSlots || 2, hand.activeSlot || 0) : null;
      const swaps = plan?.replaces != null ? (s.guns || GUNS)[plan.replaces] : null;
      add({id: `gun:${Math.round(pk.x)},${Math.round(pk.y)}`, kind: 'gun', ref: pk, ...at, range: RANGE.gun, keyed: true, icon: gunIconId(gun),
        verb: swaps ? 'SWAP' : 'TAKE', subject: gun?.name || 'WEAPON', enabled: plan !== null || !hand.weapons, note: gun?.short,
        reason: swaps ? `${gun?.verb || ''} · REPLACES ${swaps.name}`.replace(/^ · /, '') : gun?.verb || '', color: pk.color || '#74c9ed'});
    } else if (pk.kind === 'exit') {
      const n = livingOnRoute(rooms, enemies), ok = n === 0;
      add({id: 'exit', kind: 'exit', ref: pk, ...at, range: RANGE.exit, keyed: ok, icon: 'exit-extraction', verb: 'EXTRACT', subject: '',
        enabled: ok, reason: ok ? 'PRESS E OR WALK IN' : `LOCKED · ${hostilesText(n)} LEFT ON THE ROUTE`, color: ok ? '#6dffb0' : '#ff5969', hostiles: n});
    } else {
      add({id: `${pk.kind}:${Math.round(pk.x)},${Math.round(pk.y)}`, kind: 'pickup', pickupKind: pk.kind, ref: pk, ...at, range: 0, keyed: false,
        icon: pickupIconId(pk), verb: 'AUTO', subject: pickupName(pk), enabled: true, reason: '', color: pk.color || '#f4c66d', rarity: pk.rarity || null});
    }
  }
  out.sort((a, b) => prio(a.kind) - prio(b.kind) || a.distance - b.distance);
  return out;
}

/** The thing E acts on: the highest-priority keyed target in range (nearest breaks ties). */
export function activeInteraction(targets) {
  let best = null;
  for (const t of targets) {
    if (!t.keyed || !t.inRange) continue;
    if (!best || prio(t.kind) < prio(best.kind) || (prio(t.kind) === prio(best.kind) && t.distance < best.distance)) best = t;
  }
  return best;
}

/** Non-keyed but important prompt (the exit): shown while the player is close. */
export const ambientPrompt = targets => targets.find(t => t.kind === 'exit' && t.inRange) || null;

/** Text pieces a renderer needs for a target. */
export function promptParts(t, keyName = 'E') {
  const head = t.kind === 'exit' ? (t.enabled ? 'EXTRACT' : 'EXIT LOCKED') : `${t.verb} ${t.subject}`.trim();
  return {key: t.keyed ? keyName : '', head, cost: t.cost != null ? `${t.cost} SCRAP` : '', reason: t.reason || '', enabled: t.enabled};
}

/** Popup text for a collected pickup. */
export function collectPopup(kind, amount) {
  if (kind === 'scrap') return `+${amount} SCRAP`;
  if (kind === 'ammo') return `+${amount} AMMO`;
  if (kind === 'heal') return `+${amount} ♥`;
  return amount ? `+${amount} ${String(kind).toUpperCase()}` : String(kind).toUpperCase();
}

/** Nearest main-route room that still has living enemies, for the "go clear this" arrow. */
export function nearestHostileRoom(s) {
  const p = s.player, T = s.tile || TILE_PX;
  if (!p) return null;
  let best = null;
  for (const [i, r] of (s.rooms || []).entries()) {
    if (r.branch === true || !roomHasLivingEnemies(i, s.enemies || [])) continue;
    const x = (r.cx + .5) * T, y = (r.cy + .5) * T, d = Math.hypot(p.x - x, p.y - y);
    if (!best || d < best.distance) best = {index: i, x, y, distance: d, hostiles: livingIn(i, s.enemies)};
  }
  return best;
}
