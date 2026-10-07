const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const direction = (from, to) => {
  const length = distance(from, to) || 1;
  return {x: (to.x - from.x) / length, y: (to.y - from.y) / length};
};

export function incomingThreats(actor, projectiles) {
  return projectiles.map(shot => {
    const speedSquared = shot.vx * shot.vx + shot.vy * shot.vy;
    if (!Number.isFinite(speedSquared) || speedSquared < 1) return null;
    const time = ((actor.x - shot.x) * shot.vx + (actor.y - shot.y) * shot.vy) / speedSquared;
    if (time <= 0 || time > 0.45) return null;
    const closest = {x: shot.x + shot.vx * time, y: shot.y + shot.vy * time};
    if (distance(actor, closest) > (actor.radius || 8) + (shot.radius || 2) + 4) return null;
    return {shot, time};
  }).filter(Boolean).sort((a, b) => a.time - b.time || a.shot.x - b.shot.x || a.shot.y - b.shot.y);
}

export function hasIncomingProjectile(actor, projectiles = []) {
  return incomingThreats(actor, projectiles).length > 0;
}

// Positions, speeds and radii use the same world units as game.js.
// Navigation owns getting to the goal; this module owns why an enemy chooses it.
export function chooseEnemyTactic({actor, target, canSee, projectiles = [], covers = [], canMoveTo = () => true}) {
  const forward = direction(actor, target);
  const side = actor.side < 0 ? -1 : 1;
  const perpendicular = {x: -forward.y * side, y: forward.x * side};
  const offset = (origin, vector, amount) => ({x: origin.x + vector.x * amount, y: origin.y + vector.y * amount});
  const hold = intent => ({intent, goal: null});

  // React only to an incoming trajectory that will actually cross the actor.
  // The earliest threat wins so projectile-array order cannot change the dodge.
  const threats = incomingThreats(actor, projectiles);
  for (const {shot} of threats) {
    const speed = Math.hypot(shot.vx, shot.vy);
    const escape = {x: -shot.vy / speed * side, y: shot.vx / speed * side};
    for (const sign of [1, -1]) {
      const goal = offset(actor, escape, 42 * sign);
      if (canMoveTo(goal)) return {intent: 'dodge', goal};
    }
  }

  const ranged = actor.brain === 'shoot' || actor.brain === 'guard';
  const reloading = actor.reloadTimer > 0;
  const hurt = actor.hp / actor.maxHp < 0.45;
  if (hurt || (ranged && reloading)) {
    const cover = covers.filter(point => point.protected && distance(actor, point) <= 200 && canMoveTo(point))
      .sort((a, b) => distance(actor, a) - distance(actor, b))[0];
    if (cover) return distance(actor, cover) < 12 ? hold(reloading ? 'reload' : 'cover') : {intent: 'cover', goal: {x: cover.x, y: cover.y}};
    if (ranged && reloading && !canSee) return hold('reload');
    const goal = offset(actor, forward, -55);
    if (canMoveTo(goal)) return {intent: reloading ? 'reload' : 'retreat', goal};
    if (ranged && reloading) return hold('reload');
  }

  const separation = distance(actor, target);
  if (!ranged) return separation <= actor.range ? hold('attack') : {intent: 'approach', goal: {x: target.x, y: target.y}};
  const minRange = actor.minRange ?? actor.range * 0.42;
  if (separation < minRange) {
    const retreat = offset(actor, forward, -(minRange - separation + 40));
    if (canMoveTo(retreat)) return {intent: 'retreat', goal: retreat};
    for (const sign of [1, -1]) {
      const sidestep = offset(actor, perpendicular, sign * 48);
      if (canMoveTo(sidestep)) return {intent: 'retreat', goal: sidestep};
    }
    return hold('hold');
  }
  if (!canSee) {
    const flank = offset(offset(target, forward, -actor.range * 0.6), perpendicular, 75);
    return {intent: 'flank', goal: canMoveTo(flank) ? flank : {x: target.x, y: target.y}};
  }
  if (separation > actor.range * 0.82) return {intent: 'approach', goal: offset(target, forward, -actor.range * 0.65)};
  for (const sign of [1, -1]) {
    const flank = offset(actor, perpendicular, 42 * sign);
    if (canMoveTo(flank)) return {intent: 'strafe', goal: flank};
  }
  return hold('hold');
}
