// The safehouse unlock catalog: guns, starting kits, throwables and perks that change HOW you play.
// Ids are namespaced strings stored in progress.unlocked. Items with `cost` are bought with coins; items with
// `cost:null` are granted by a goal (goals.js). STARTER_GUNS / STARTER_THROWABLES / the STANDARD kit are free.
import {GUNS} from './catalog.js';
import {UPGRADES} from './frequencies.js';

export const STARTER_GUNS = ['machine', 'shotgun', 'pistol_9', 'ar_ash'];
export const STARTER_THROWABLES = ['smoke', 'flash'];

// Starting kits: the choice on the title screen. Each kit is two verbs. Incendiary is a mod now, so kits only
// carry smoke, flash and frag.
export const KITS = [
  {id:'standard', name:'STANDARD ISSUE', guns:['machine','shotgun'], throwables:{smoke:1,flash:1,frag:2}, cost:0, blurb:'Spray and sweep. Balanced.'},
  {id:'duelist', name:'DUELIST', guns:['pistol_45','pistol_9'], throwables:{smoke:2,flash:1}, cost:45, blurb:'Punch and a sidearm. Stagger them, then finish.'},
  {id:'scout', name:'SCOUT', guns:['ar_ash','pistol_9'], throwables:{smoke:1,flash:2}, cost:70, blurb:'Steady carbine you can walk and shoot with.'},
  {id:'breacher', name:'BREACHER', guns:['shotgun','launcher'], throwables:{flash:2,frag:1}, cost:95, blurb:'Sweep close, lob far. Loud.'},
  {id:'marksman', name:'MARKSMAN', guns:['sniper_lynx','pistol_9'], throwables:{smoke:2,flash:1}, cost:140, blurb:'Pierce a line of enemies from across the room.'},
  {id:'bruiser', name:'BRUISER', guns:['sniper_mule','pistol_9'], throwables:{frag:2,smoke:1}, cost:180, blurb:'Anti-materiel: one shot through a wall. Slow, loud, decisive.'},
];

// Only base-roster guns are sold. Variants (VECTOR 9, CINDER, HARDLINE, BASTION, QUILL) are run-only drops.
const GUN_COSTS = {smg_burst:50, pistol_45:60, launcher:110, sniper_lynx:150, sniper_mule:null};
const THROW_COSTS = {frag:45};
const gunName = id => GUNS.find(gun => gun.id === id)?.name || id;

/** Unlock ids that existed before the behavior rework, and what they cost: saves that own them are refunded. */
export const LEGACY_UNLOCK_COSTS = {'gun:smg_vector':40, 'gun:smg_heavy':80, 'gun:rifle':70, 'gun:sniper_quill':110, 'gun:ar_bastion':120, 'throw:incendiary':60};

export const UNLOCKS = [
  ...Object.entries(GUN_COSTS).map(([id, cost]) => ({id:`gun:${id}`, kind:'gun', ref:id, name:gunName(id), cost, desc:'Joins the loot, armory and supply drop pool.'})),
  ...KITS.filter(kit => kit.cost > 0).map(kit => ({id:`kit:${kit.id}`, kind:'kit', ref:kit.id, name:`${kit.name} KIT`, cost:kit.cost, desc:kit.blurb})),
  ...Object.entries(THROW_COSTS).map(([id, cost]) => ({id:`throw:${id}`, kind:'throw', ref:id, name:'FRAG GRENADE', cost, desc:'Start runs with frag grenades.'})),
  ...UPGRADES.filter(upgrade => upgrade.unlockCost !== null).map(upgrade => ({id:`freq:${upgrade.id}`, kind:'freq', ref:upgrade.id, name:upgrade.name, cost:upgrade.unlockCost, desc:`Frequency: ${upgrade.ranks[0].desc}`})),
  {id:'upg:highroller', kind:'upg', ref:'highroller', name:'HIGH ROLLER', cost:null, desc:'Safehouse upgrade with a tradeoff.'},
  {id:'upg:adrenal', kind:'upg', ref:'adrenal', name:'ADRENAL GLAND', cost:null, desc:'Safehouse upgrade with a tradeoff.'},
  {id:'upg:stockpile', kind:'upg', ref:'stockpile', name:'STOCKPILE', cost:null, desc:'Safehouse upgrade with a tradeoff.'},
];
export const UNLOCK_BY_ID = new Map(UNLOCKS.map(item => [item.id, item]));

export function isUnlocked(progress, id) {
  return Array.isArray(progress?.unlocked) && progress.unlocked.includes(id);
}

export function kitById(id) { return KITS.find(kit => kit.id === id); }
export function kitUnlocked(progress, id) {
  const kit = kitById(id);
  return Boolean(kit) && (kit.cost === 0 || isUnlocked(progress, `kit:${id}`));
}

// Gun ids the loot tables may roll: starters, bought guns, and the guns of any owned kit.
export function unlockedGunIds(progress) {
  const ids = new Set(STARTER_GUNS);
  for (const unlock of UNLOCKS) if (unlock.kind === 'gun' && isUnlocked(progress, unlock.id)) ids.add(unlock.ref);
  for (const kit of KITS) if (kitUnlocked(progress, kit.id)) kit.guns.forEach(id => ids.add(id));
  return ids;
}
// Guns the loot tables may roll: everything unlocked, plus every run-only VARIANT (rare, so the pool still surprises).
export function droppableGunIds(progress) {
  const ids = unlockedGunIds(progress);
  for (const gun of GUNS) if (gun.variantOf) ids.add(gun.id);
  return ids;
}
export function unlockedThrowableIds(progress) {
  const ids = new Set(STARTER_THROWABLES);
  for (const id of Object.keys(THROW_COSTS)) if (isUnlocked(progress, `throw:${id}`)) ids.add(id);
  return ids;
}
export function unlockedFreqIds(progress) {
  return (progress.unlocked || []).filter(id => id.startsWith('freq:'));
}

// Starting throwable counts for a kit, limited to throwables the player owns.
export function kitThrowables(progress, kitId) {
  const kit = kitById(kitId) || KITS[0], owned = unlockedThrowableIds(progress), result = {smoke:0, flash:0, frag:0};
  for (const [id, count] of Object.entries(kit.throwables)) if (owned.has(id)) result[id] = count;
  return result;
}

export function purchaseUnlock(progress, id) {
  const item = UNLOCK_BY_ID.get(id);
  if (!item || item.cost === null || isUnlocked(progress, id) || progress.coins < item.cost) return {progress, purchased:false};
  return {progress:{...progress, coins:progress.coins - item.cost, unlocked:[...progress.unlocked, id]}, purchased:true};
}

export function grantUnlock(progress, id) {
  if (!UNLOCK_BY_ID.has(id) || isUnlocked(progress, id)) return progress;
  return {...progress, unlocked:[...progress.unlocked, id]};
}

export function selectKit(progress, id) {
  return kitUnlocked(progress, id) ? {...progress, kit:id} : progress;
}
