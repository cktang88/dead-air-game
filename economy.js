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
 * One-line "what do I do next" text for the HUD.
 * @param {{routeRoomsLeft:number, routeHostiles:number, here:number, exitReady:boolean, exitMeters:number|null}} s
 */
export function objectiveText({routeRoomsLeft, routeHostiles, here = 0, exitReady, exitMeters = null}) {
  if (exitReady) return {tone: 'go', text: exitMeters == null ? 'REACH EXTRACTION' : `REACH EXTRACTION · ${Math.max(1, Math.round(exitMeters))} M`};
  const rooms = `${routeRoomsLeft} ROOM${routeRoomsLeft === 1 ? '' : 'S'} LEFT`;
  if (here > 0) return {tone: 'fight', text: `CLEAR THIS ROOM · ${here} HOSTILE${here === 1 ? '' : 'S'} · ${rooms}`};
  if (routeHostiles > 0) return {tone: 'seek', text: `CLEAR THE ROUTE · ${rooms}`};
  return {tone: 'go', text: 'REACH EXTRACTION'};
}
