import {consumePenetration} from './rules.js';

const PENETRATION_KIND = {enemy: 'enemies', crate: 'crates', wall: 'walls'};

export function resolveProjectileImpacts(impacts, initialPenetration) {
  const resolved = [];
  let penetration = initialPenetration;
  let stopped = false;

  for (const impact of [...impacts].sort((a, b) => a.t - b.t)) {
    resolved.push(impact);
    if (impact.kind === 'cover' || impact.kind === 'player') {
      stopped = true;
      break;
    }

    const target = PENETRATION_KIND[impact.kind];
    const remaining = target ? consumePenetration(penetration, target) : null;
    if (!remaining) {
      stopped = true;
      break;
    }
    penetration = remaining;
  }

  return {impacts: resolved, penetration, stopped};
}
