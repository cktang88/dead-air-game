// Pure ammo / heal / objective rules for the in-run economy. No DOM, no game state: game.js feeds numbers in.

/** 'dry' (nothing left anywhere on this gun), 'last' (reserve at most one magazine), or 'ok'. */
export function ammoStatus({mag, reserve, magSize}) {
  if (mag <= 0 && reserve <= 0) return 'dry';
  if (reserve <= Math.max(1, magSize)) return 'last';
  return 'ok';
}

/** Nearest other slot (cycling forward) whose gun still has any ammo, or -1. */
export function nextLoadedSlot(slots, activeSlot, ammo, reserve) {
  for (let step = 1; step < slots.length; step++) {
    const slot = (activeSlot + step) % slots.length, gun = slots[slot];
    if ((ammo[gun] || 0) + (reserve[gun] || 0) > 0) return slot;
  }
  return -1;
}

/** Rounds a universal ammo pickup adds to the active gun's reserve: a % of its reserve cap, never fewer than 4. */
export function ammoPickupRounds(maxReserve, pct) {
  return Math.max(4, Math.ceil(maxReserve * pct));
}

/**
 * Drop table for a kill or a broken crate. `roll` is a uniform [0,1) number.
 * @returns {'ammo'|'heal'|'armor'|null}
 */
export function supplyDrop(roll, source, {health, maxHealth, ammoLow, armorUseful}) {
  const crate = source === 'crate', hurt = maxHealth > 0 && health / maxHealth <= 0.5;
  const ammo = (crate ? 0.34 : 0.18) * (ammoLow ? 2.5 : 1); // tuned up for 3-HP lethality: fewer kills per mag, more drops when you are low
  const heal = health >= maxHealth ? 0 : (crate ? 0.12 : 0.04) * (hurt ? 2.2 : 1);
  const armor = armorUseful ? (crate ? 0.07 : 0.025) : 0;
  if (roll < ammo) return 'ammo';
  if (roll < ammo + heal) return 'heal';
  if (roll < ammo + heal + armor) return 'armor';
  return null;
}

/** Guaranteed medkit when a room clears while the player is at or below half health. Returns HP to give (0 = none). */
export function clearHealAmount({health, maxHealth}) {
  if (maxHealth <= 0 || health >= maxHealth || health / maxHealth > 0.5) return 0;
  return health <= 1 ? 2 : 1;
}

/** There is no passive regeneration: healing is the room-clear medkit above plus rare drops (`supplyDrop`) and SUPPLY DROPs. */

/** A cleared room pays a guaranteed ammo pickup when any carried gun is running dry (the old locker, minus the shop). */
export function clearAmmoDrop({ammoLow}) { return Boolean(ammoLow); }

/** Dedupe helper: returns true (and records the time) when `key` has not fired within `gap` seconds. */
export function cooldownReady(map, key, now, gap) {
  if (map[key] !== undefined && now - map[key] < gap) return false;
  map[key] = now;
  return true;
}

/**
 * One-line "what do I do next" text for the HUD. Extraction opens once the exit room is clear and nobody on the route is
 * aware of you (see room-roles.js `extractionStatus`): sleepers and unaware guards may be left behind.
 * @param {{routeRoomsLeft:number, routeHostiles:number, here:number, exitReady:boolean, exitMeters:number|null, awareLeft?:number, exitRoomHostiles?:number, unawareLeft?:number}} s
 */
export function objectiveText({routeRoomsLeft, routeHostiles, here = 0, exitReady, exitMeters = null, awareLeft = 0, exitRoomHostiles = 0, unawareLeft = 0}) {
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 'S'}`;
  if (exitReady) {
    const base = exitMeters == null ? 'REACH EXTRACTION' : `REACH EXTRACTION · ${Math.max(1, Math.round(exitMeters))} M`;
    return {tone: 'go', text: unawareLeft > 0 ? `${base} · ${unawareLeft} UNAWARE LEFT BEHIND` : base};
  }
  const rooms = `${routeRoomsLeft} ROOM${routeRoomsLeft === 1 ? '' : 'S'} LEFT`;
  if (awareLeft > 0) return {tone: 'fight', text: `${awareLeft} HOSTILE${awareLeft === 1 ? '' : 'S'} HUNTING YOU · KILL OR LOSE THEM`};
  if (here > 0 && exitRoomHostiles === 0) return {tone: 'fight', text: `CLEAR THIS ROOM · ${plural(here, 'HOSTILE')} · ${rooms}`};
  if (exitRoomHostiles > 0) return {tone: 'seek', text: `CLEAR THE EXTRACTION ROOM · ${plural(exitRoomHostiles, 'HOSTILE')}`};
  if (routeHostiles > 0) return {tone: 'seek', text: `CLEAR THE ROUTE · ${rooms}`};
  return {tone: 'go', text: 'REACH EXTRACTION'};
}

// ---------------------------------------------------------------------------------------------- scrap (one in-run currency)
// Income is deliberately small so every pickup matters; prices (supply.js, GATE_COST) are set so a run affords roughly half of what it wants.
export const SCRAP = {
  kill: [1, 3],          // per kill (inclusive range)
  crate: [3, 6],         // from a broken crate that rolls a drop
  dropMin: 6, dropMax: 10, // enemy scrap/mod drop (20% of kills)
  rewardPile: [15, 25],  // a scrap-role room's pile
  roomPile: [4, 8],     // loose pile in every other room
  rewardDoor: 4 * 5,     // "scrap" door reward: four piles
  clearPile: 1,          // six small piles after a clear
  gateCost: 40,          // vault gate
  cashRate: 5,           // scrap per coin when you EXTRACT (death loses it all)
};
/** Inclusive integer in [lo, hi] from one uniform roll. */
export const scrapRange = ([lo, hi], roll) => lo + Math.min(hi - lo, Math.floor((Number.isFinite(roll) ? Math.max(0, Math.min(.9999, roll)) : 0) * (hi - lo + 1)));
/** Coins leftover scrap pays when a run is extracted or won. Always a bad rate on purpose: spending beats banking. */
export const scrapToCoins = scrap => Math.floor(Math.max(0, scrap) / SCRAP.cashRate);
