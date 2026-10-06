// The safehouse unlock catalog: guns, starting kits, throwables and perks that change HOW you play.
// Ids are namespaced strings stored in progress.unlocked. Items with `cost` are bought with coins; items with
// `cost:null` are granted by a goal (goals.js). STARTER_GUNS / STARTER_THROWABLES / the STANDARD kit are free.
import {GUNS} from './catalog.js';
import {UPGRADES} from './frequencies.js';

export const STARTER_GUNS = ['machine', 'shotgun', 'pistol_9', 'ar_ash'];
export const STARTER_THROWABLES = ['smoke', 'flash'];

// Starting kits: the choice on the title screen. Guns land in slots 1-2 (weight must fit the carry rig of 7).
export const KITS = [
  {id:'standard', name:'STANDARD ISSUE', guns:['machine','shotgun'], throwables:{smoke:1,flash:1,frag:2,incendiary:1}, cost:0, blurb:'Machine pistol and street sweeper. Balanced.'},
  {id:'duelist', name:'DUELIST', guns:['pistol_45','pistol_9'], throwables:{smoke:2,flash:1}, cost:45, blurb:'Two pistols, light and fast on your feet.'},
  {id:'scout', name:'SCOUT', guns:['ar_ash','pistol_9'], throwables:{smoke:1,flash:2}, cost:70, blurb:'Carbine for range, pistol for panic.'},
  {id:'breacher', name:'BREACHER', guns:['smg_heavy','shotgun'], throwables:{flash:2,frag:1}, cost:95, blurb:'Close-quarters hammer. Heavy rig.'},
  {id:'marksman', name:'MARKSMAN', guns:['sniper_quill','pistol_9'], throwables:{smoke:2,flash:1}, cost:140, blurb:'Pierce a line of enemies from across the room.'},
  {id:'bruiser', name:'BRUISER', guns:['ar_bastion','pistol_9'], throwables:{frag:2,smoke:1}, cost:180, blurb:'Heavy punching rifle. Slow, loud, decisive.'},
];

const GUN_COSTS = {smg_vector:40, smg_burst:50, pistol_45:60, rifle:70, smg_heavy:80, sniper_quill:110, ar_bastion:120, sniper_lynx:150, sniper_mule:null};
const THROW_COSTS = {frag:45, incendiary:60};
const gunName = id => GUNS.find(gun => gun.id === id)?.name || id;

export const UNLOCKS = [
  ...Object.entries(GUN_COSTS).map(([id, cost]) => ({id:`gun:${id}`, kind:'gun', ref:id, name:gunName(id), cost, desc:'Joins the loot, armory and black-market pool.'})),
  ...KITS.filter(kit => kit.cost > 0).map(kit => ({id:`kit:${kit.id}`, kind:'kit', ref:kit.id, name:`${kit.name} KIT`, cost:kit.cost, desc:kit.blurb})),
  ...Object.entries(THROW_COSTS).map(([id, cost]) => ({id:`throw:${id}`, kind:'throw', ref:id, name:id === 'frag' ? 'FRAG GRENADE' : 'INCENDIARY', cost, desc:'Start runs with it and find it at the Black Market.'})),
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
  const kit = kitById(kitId) || KITS[0], owned = unlockedThrowableIds(progress), result = {smoke:0, flash:0, frag:0, incendiary:0};
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
