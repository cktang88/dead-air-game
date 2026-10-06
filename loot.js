// What drops, and how often. There are no mod tiers: a mod is a behavior, so a mod pickup is just "which mod".
// Rarity lives in two places only: gun VARIANTS (rare run-only drops of a base gun's verb) and frequencies.
import {GUNS, MODS, modFits} from './catalog.js';

/** Relative drop weight of a gun. Base guns weigh 1; a variant weighs `VARIANT_WEIGHT` (up with LUCKY FIND). */
export const VARIANT_WEIGHT = .22;
export const gunDropWeight = (gun, luckyFindLevel = 0) => (gun.variantOf ? VARIANT_WEIGHT * (1 + .6 * clampLevel(luckyFindLevel)) : 1);
const clampLevel = level => (Number.isInteger(level) ? Math.max(0, Math.min(3, level)) : 0);
const safeRoll = roll => (Number.isFinite(roll) ? Math.max(0, Math.min(.999999999, roll)) : 0);

/**
 * Pick a gun index from `candidates` (indices into GUNS) with one uniform roll.
 * Returns undefined when there are no candidates.
 */
export function pickGunIndex(candidates, roll, luckyFindLevel = 0, guns = GUNS) {
  if (!candidates.length) return undefined;
  const weights = candidates.map(index => gunDropWeight(guns[index], luckyFindLevel));
  let left = safeRoll(roll) * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < candidates.length; i++) { left -= weights[i]; if (left < 0) return candidates[i]; }
  return candidates.at(-1);
}

/** Pick a mod id with one uniform roll. Every mod is equally common; `gun` (optional) filters out mods it cannot take. */
export function pickModId(roll, gun = null) {
  const pool = MODS.filter(mod => !gun || modFits(gun, mod.id));
  return pool[Math.min(pool.length - 1, Math.floor(safeRoll(roll) * pool.length))].id;
}
