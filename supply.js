// SUPPLY DROP: the one place that replaced the merchant, the supply locker and the cache.
// A drop shows three visible options and you take ONE:
//   SUSTAIN  ammo for every carried gun, or a medkit (whichever you need more)
//   ARMS     a named mod or gun, shown before you take it (a mod replaces the one on your gun; a gun swaps the one in hand)
//   SIGNAL   a frequency pick, paid for in scrap
// Pure: game.js feeds the situation in and applies the result.
import {pickGunIndex, pickModId} from './loot.js';
import {MOD_BY_ID, GUNS} from './catalog.js';

export const SIGNAL_COST = 30;
export const SUPPLY_MEDKIT_HP = 2;
/** Chance that ARMS offers a gun instead of a mod, when a gun is available. */
export const ARMS_GUN_CHANCE = .4;

/**
 * @param {{rng:()=>number, ammoNeed:boolean, health:number, maxHealth:number, gunCandidates:number[], activeGun:object|null, activeModId:string|null, luckyFindLevel?:number}} s
 * @returns {Array<{slot:string,kind:string,cost:number,modId?:string,gunIndex?:number}>} always three offers, in slot order
 */
export function supplyOffers({rng = Math.random, ammoNeed, health, maxHealth, gunCandidates = [], activeGun = null, activeModId = null, luckyFindLevel = 0}) {
  const hurt = maxHealth > 0 && health < maxHealth;
  const badlyHurt = hurt && health / maxHealth <= .5;
  const sustain = hurt && (badlyHurt || !ammoNeed) ? {slot: 'sustain', kind: 'heal', cost: 0} : {slot: 'sustain', kind: 'ammo', cost: 0};

  let arms;
  if (gunCandidates.length && rng() < ARMS_GUN_CHANCE) {
    arms = {slot: 'arms', kind: 'gun', cost: 0, gunIndex: pickGunIndex(gunCandidates, rng(), luckyFindLevel)};
  } else {
    let modId = pickModId(rng(), activeGun);
    // Offering the mod you already wear is a wasted card: nudge to the next mod when there is one.
    if (modId === activeModId) {
      for (let tries = 0; tries < 6 && modId === activeModId; tries++) modId = pickModId(rng(), activeGun);
    }
    arms = {slot: 'arms', kind: 'mod', cost: 0, modId};
  }
  return [sustain, arms, {slot: 'signal', kind: 'freq', cost: SIGNAL_COST}];
}

/** Can this offer be taken right now, and if not, why (shown on the card). */
export function offerStatus(offer, {scrap = 0, ammoNeed = false, health = 1, maxHealth = 1, activeModId = null, hasGunInHand = true} = {}) {
  if (offer.kind === 'ammo') return ammoNeed ? {ok: true, reason: ''} : {ok: false, reason: 'AMMO ALREADY FULL'};
  if (offer.kind === 'heal') return health < maxHealth ? {ok: true, reason: ''} : {ok: false, reason: 'HEALTH ALREADY FULL'};
  if (offer.kind === 'mod') {
    if (!hasGunInHand) return {ok: false, reason: 'NO GUN IN HAND'};
    return offer.modId === activeModId ? {ok: false, reason: 'ALREADY FITTED'} : {ok: true, reason: ''};
  }
  if (offer.kind === 'gun') return {ok: true, reason: ''};
  if (offer.kind === 'freq') return scrap >= offer.cost ? {ok: true, reason: ''} : {ok: false, reason: `NEED ${offer.cost - Math.floor(scrap)} MORE SCRAP`};
  return {ok: false, reason: ''};
}

/** Card copy for an offer: {title, text, icon} using only names the code really applies. */
export function offerCard(offer, {activeGun = null, activeModId = null, handGun = null} = {}) {
  if (offer.kind === 'ammo') return {title: 'RESTOCK', text: 'Refill every carried gun · magazines and reserves', icon: 'ammo'};
  if (offer.kind === 'heal') return {title: 'MEDKIT', text: `+${SUPPLY_MEDKIT_HP} health`, icon: 'health'};
  if (offer.kind === 'freq') return {title: 'TUNE A SIGNAL', text: 'Pick one of three frequencies', icon: 'upgrade'};
  if (offer.kind === 'mod') {
    const mod = MOD_BY_ID.get(offer.modId), worn = activeModId ? MOD_BY_ID.get(activeModId) : null;
    return {title: mod.name, text: `${mod.info} · fits ${activeGun?.name || 'your gun'}${worn ? ` · REPLACES ${worn.name}` : ''}`, icon: offer.modId};
  }
  const gun = GUNS[offer.gunIndex];
  return {title: gun.name, text: `${gun.short}${handGun ? ` · SWAPS ${handGun.name}` : ''}`, icon: gun.category};
}
