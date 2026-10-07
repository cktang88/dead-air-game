// SUPPLY DROP: the one place that replaced the merchant, the supply locker and the cache.
// A drop shows three visible cards, every one with a scrap price on it, and you may buy any you can afford:
//   SUSTAIN  ammo for every carried gun, or a medkit (whichever you need more)
//   ARMS     a named mod or gun, shown before you buy it (a mod replaces the one on your gun; a gun swaps the one in hand)
//   SIGNAL   a frequency pick
// Scrap income is small (economy.js SCRAP), so a run affords roughly half of what it wants: that is the decision.
// RESHUFFLE re-rolls the ARMS card for a price that climbs each time.
// Pure: game.js feeds the situation in and applies the result.
import {pickGunIndex, pickModId} from './loot.js';
import {MOD_BY_ID, GUNS} from './catalog.js';

export const PRICES = {ammo: 20, heal: 30, mod: 40, gun: 60, freq: 45};
export const SIGNAL_COST = PRICES.freq;
export const RESHUFFLE_BASE = 15, RESHUFFLE_STEP = 10;
/** Price of the next ARMS reshuffle after `n` have been bought at this drop. */
export const reshuffleCost = n => RESHUFFLE_BASE + RESHUFFLE_STEP * Math.max(0, n | 0);
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
  const sustain = hurt && (badlyHurt || !ammoNeed) ? {slot: 'sustain', kind: 'heal', cost: PRICES.heal} : {slot: 'sustain', kind: 'ammo', cost: PRICES.ammo};

  const arms = armsOffer({rng, gunCandidates, activeGun, activeModId, luckyFindLevel});
  return [sustain, arms, {slot: 'signal', kind: 'freq', cost: SIGNAL_COST}];
}

/** A fresh ARMS card (a named gun some of the time, a named mod otherwise). `avoid` is the offer being replaced. */
export function armsOffer({rng = Math.random, gunCandidates = [], activeGun = null, activeModId = null, luckyFindLevel = 0, avoid = null}) {
  const same = o => avoid && o.kind === avoid.kind && o.modId === avoid.modId && o.gunIndex === avoid.gunIndex;
  let arms;
  for (let tries = 0; tries < 8; tries++) {
    if (gunCandidates.length && rng() < ARMS_GUN_CHANCE) {
      arms = {slot: 'arms', kind: 'gun', cost: PRICES.gun, gunIndex: pickGunIndex(gunCandidates, rng(), luckyFindLevel)};
    } else {
      let modId = pickModId(rng(), activeGun);
      // Offering the mod you already wear is a wasted card: nudge to the next mod when there is one.
      for (let t = 0; t < 6 && modId === activeModId; t++) modId = pickModId(rng(), activeGun);
      arms = {slot: 'arms', kind: 'mod', cost: PRICES.mod, modId};
    }
    if (!same(arms)) break;
  }
  return arms;
}

/** Can this offer be taken right now, and if not, why (shown on the card). */
export function offerStatus(offer, {scrap = 0, ammoNeed = false, health = 1, maxHealth = 1, activeModId = null, hasGunInHand = true, carried = []} = {}) {
  if (offer.sold) return {ok: false, reason: 'BOUGHT'};
  const base = offerUsable(offer, {ammoNeed, health, maxHealth, activeModId, hasGunInHand, carried});
  if (!base.ok) return base;
  const cost = offer.cost || 0;
  return scrap >= cost ? base : {ok: false, reason: `NEED ${cost - Math.floor(scrap)} MORE SCRAP`};
}

function offerUsable(offer, {ammoNeed, health, maxHealth, activeModId, hasGunInHand, carried = []}) {
  if (offer.kind === 'ammo') return ammoNeed ? {ok: true, reason: ''} : {ok: false, reason: 'AMMO ALREADY FULL'};
  if (offer.kind === 'heal') return health < maxHealth ? {ok: true, reason: ''} : {ok: false, reason: 'HEALTH ALREADY FULL'};
  if (offer.kind === 'mod') {
    if (!hasGunInHand) return {ok: false, reason: 'NO GUN IN HAND'};
    return offer.modId === activeModId ? {ok: false, reason: 'ALREADY FITTED'} : {ok: true, reason: ''};
  }
  if (offer.kind === 'gun') return carried.includes(offer.gunIndex) ? {ok: false, reason: 'ALREADY CARRIED'} : {ok: true, reason: ''};
  if (offer.kind === 'freq') return {ok: true, reason: ''};
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
