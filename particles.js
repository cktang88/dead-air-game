export const MAX_ACTIVE_PARTICLES=240;

export function particleBurstBudget(activeCount, requestedCount, limit=MAX_ACTIVE_PARTICLES) {
  const active=Math.max(0,Number.isFinite(activeCount)?Math.floor(activeCount):0);
  const requested=Math.max(0,Number.isFinite(requestedCount)?Math.floor(requestedCount):0);
  const capacity=Math.max(0,Number.isFinite(limit)?Math.floor(limit):0);
  const spawn=Math.min(requested,capacity);
  return {spawn,evict:Math.min(active,Math.max(0,active+spawn-capacity))};
}
