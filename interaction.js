// Single source of truth for "what can the player interact with right now?".
// Both the in-world prompt renderer (affordances2d.js) and game.js interact() read this list so the
// prompt shown on screen and the thing that happens when E is pressed can never disagree.
import {roomHasLivingEnemies} from './room-roles.js';

export const TILE_PX = 32;
/** Distances (px) at which each interactable becomes usable. Mirrors the legacy interact() thresholds. */
export const RANGE = Object.freeze({gate: 38, cache: 36, market: 90, gun: 36, station: 110, exit: 70});
/** Within this distance an out-of-range interactable shows a small name tag so you know what it is. */
export const LABEL_RANGE = 300;
/** Lower number wins when several targets are in range at once (same order interact() always used). */
export const PRIORITY = Object.freeze({gate: 0, cache: 1, market: 2, gun: 3, station: 4, exit: 5, pickup: 6});
const prio = k => PRIORITY[k] ?? 9;

import {dist} from './util.js';
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 'S'}`;

/** "3 HOSTILES" style helper. */
export const hostilesText = n => plural(n, 'HOSTILE');
export const needScrapText = (cost, have) => `NEED ${cost} SCRAP · HAVE ${Math.max(0, Math.floor(have))}`;

function livingIn(roomIndex, enemies) { return enemies.filter(e => e.alive && e.roomIndex === roomIndex).length; }
function livingOnRoute(rooms, enemies) { return enemies.filter(e => e.alive && rooms[e.roomIndex]?.branch !== true).length; }

const GUN_ICON = {'PISTOL': 'gun-pistol', 'SMG': 'gun-smg', 'SHOTGUN': 'gun-shotgun', 'ASSAULT RIFLE': 'gun-rifle', 'SNIPER': 'gun-sniper', 'ANTI-MATERIEL': 'gun-antimateriel'};
export const gunIconId = gun => GUN_ICON[gun?.category] || 'gun-rifle';
export const pickupIconId = pk => ({scrap: 'pickup-scrap', heal: 'pickup-heal', mod: 'pickup-mod', ammo: 'pickup-ammo'}[pk.kind] || 'pickup-crate');
export function pickupName(pk) {
  if (pk.kind === 'scrap') return `${pk.value || 12} SCRAP`;
  if (pk.kind === 'heal') return 'MEDKIT';
  if (pk.kind === 'mod') return `${(pk.rarity || 'common').toUpperCase()} MOD`;
  return String(pk.kind || 'ITEM').toUpperCase();
}

/**
 * Build every nearby interactable with its distance, affordability and reason.
 * @param {object} s {player, scrap, gates, pickups, rooms, enemies, workbench?, guns?, tile?}
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
  for (const pk of s.pickups || []) {
    if (!pk.available) continue;
    const at = {x: pk.x, y: pk.y};
    if (pk.kind === 'cache') {
      const n = livingIn(pk.roomIndex, enemies), ok = n === 0;
      add({id: `cache:${Math.round(pk.x)},${Math.round(pk.y)}`, kind: 'cache', ref: pk, ...at, range: RANGE.cache, keyed: true, icon: 'station-cache',
        verb: 'OPEN', subject: 'CACHE', enabled: ok, reason: ok ? '' : `CLEAR ROOM FIRST (${hostilesText(n)})`, color: '#f4c66d'});
    } else if (pk.kind === 'gun') {
      const gun = s.guns?.[pk.gunIndex];
      add({id: `gun:${Math.round(pk.x)},${Math.round(pk.y)}`, kind: 'gun', ref: pk, ...at, range: RANGE.gun, keyed: true, icon: gunIconId(gun),
        verb: 'TAKE', subject: gun?.name || 'WEAPON', enabled: true, reason: '', color: pk.color || '#74c9ed'});
    } else if (pk.kind === 'exit') {
      const n = livingOnRoute(rooms, enemies), ok = n === 0;
      add({id: 'exit', kind: 'exit', ref: pk, ...at, range: RANGE.exit, keyed: false, icon: 'exit-extraction', verb: 'EXTRACT', subject: '',
        enabled: ok, reason: ok ? 'WALK IN TO LEAVE' : `LOCKED · ${hostilesText(n)} LEFT ON THE ROUTE`, color: ok ? '#6dffb0' : '#ff5969', hostiles: n});
    } else {
      add({id: `${pk.kind}:${Math.round(pk.x)},${Math.round(pk.y)}`, kind: 'pickup', pickupKind: pk.kind, ref: pk, ...at, range: 0, keyed: false,
        icon: pickupIconId(pk), verb: 'AUTO', subject: pickupName(pk), enabled: true, reason: '', color: pk.color || '#f4c66d', rarity: pk.rarity || null});
    }
  }
  for (const r of rooms) {
    if (r.role !== 'merchant') continue;
    add({id: `market:${r.cx},${r.cy}`, kind: 'market', ref: r, x: (r.cx + .5) * T, y: (r.cy + .5) * T, range: RANGE.market, keyed: true, icon: 'station-merchant',
      verb: 'TRADE', subject: 'BLACK MARKET', enabled: true, reason: '', color: '#ffd27a'});
  }
  if (rooms[0]) {
    const anchor = {x: rooms[0].cx * T, y: rooms[0].cy * T}, wb = s.workbench || anchor;
    add({id: 'station', kind: 'station', ref: rooms[0], x: wb.x, y: wb.y, anchor, range: RANGE.station, keyed: true, icon: 'station-workbench',
      verb: 'OPEN', subject: 'WORKBENCH', enabled: true, reason: '', color: '#8fe0ff', note: 'LOADOUT & ATTACHMENTS'});
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
