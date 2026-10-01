// Throwable definitions and inventory rules. These stay independent of rendering
// and physics so the game can apply the effects in its own update loop.
const freezeItem = item => Object.freeze(item);

export const THROWABLES = Object.freeze([
  freezeItem({
    id: 'smoke', name: 'Smoke Grenade', stack: 3, cost: 18, range: 190,
    fuse: 0.65, radius: 92, duration: 5.5, damage: 0,
    effect: 'obscure', wallOccluded: false,
  }),
  freezeItem({
    id: 'flash', name: 'Flashbang', stack: 3, cost: 22, range: 175,
    fuse: 0.45, radius: 112, duration: 2.2, damage: 0,
    effect: 'stun', wallOccluded: true,
  }),
  freezeItem({
    id: 'frag', name: 'Frag Grenade', stack: 2, cost: 30, range: 165,
    fuse: 0.8, radius: 104, duration: 0.18, damage: 85,
    effect: 'blast', wallOccluded: true,
  }),
  freezeItem({
    id: 'incendiary', name: 'Incendiary', stack: 2, cost: 28, range: 155,
    fuse: 0.7, radius: 78, duration: 4.2, damage: 12,
    effect: 'burn', wallOccluded: true,
  }),
]);

const THROWABLE_BY_ID = new Map(THROWABLES.map(item => [item.id, item]));

export function throwableById(id) {
  return THROWABLE_BY_ID.get(id);
}

/**
 * Spend a stack count without mutating inventory. Invalid requests return the
 * original inventory object and a reason, making failed throws state-neutral.
 */
export function consumeThrowable(inventory, id, count = 1) {
  const item = throwableById(id);
  if (!item) return { consumed: false, reason: 'unknown-item', inventory };
  if (!Number.isInteger(count) || count < 1) {
    return { consumed: false, reason: 'invalid-count', inventory };
  }
  const owned = inventory?.[id];
  if (!Number.isInteger(owned) || owned < count) {
    return { consumed: false, reason: 'insufficient-count', inventory };
  }
  return {
    consumed: true,
    item,
    inventory: { ...inventory, [id]: owned - count },
  };
}

/** True when a target at `distance` is inside the throwable's effect radius. */
export function isWithinThrowableRadius(id, distance) {
  const item = throwableById(id);
  return !!item && Number.isFinite(distance) && distance >= 0 && distance <= item.radius;
}

/**
 * Whether a target receives a direct effect. Smoke occupies space regardless
 * of direct sight; flash, blast, and fire are stopped by intervening walls.
 */
export function throwableAffectsTarget(id, { distance, blockedByWall = false } = {}) {
  const item = throwableById(id);
  if (!item || !isWithinThrowableRadius(id, distance)) return false;
  return !(item.wallOccluded && blockedByWall);
}
