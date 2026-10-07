// THE SIGNAL CHECK WARDEN: a fixed turret that teaches the dodge (DESIGN_DIRECTION 5c, room 3).
// It does NOT use the general enemy brain, whose cadence rides world time (a still player slows it ~12x, so the
// first shot took ~14 s). The warden runs on a "teaching clock": world time with a floor, so it telegraphs and
// fires every few real seconds whether you stand still or walk the lane, but its BULLET still rides world time:
// stand still and you watch it crawl, step aside; walk and it closes faster; sprint and you must read the line.
//
//   idle -> windup (aim tracks the player, red line grows) -> lock (aim frozen for the last `lock` seconds) ->
//   fire -> cooldown -> idle. Losing sight (cover) during windup resets the telegraph: the pillar really is cover.
//
// Pure: no DOM, no physics. Unit tested in warden.test.js.

export const WARDEN = {windup: 1.5, lock: 0.45, cooldown: 2.6, firstDelay: 0.5, clockFloor: 0.75};

export const wardenState = () => ({phase: 'idle', t: 0, aim: {x: -1, y: 0}, shots: 0});

/** World dt lifted to the teaching clock: never slower than `clockFloor` x real time. */
export const wardenClock = (worldDt, realDt, cfg = WARDEN) => Math.max(worldDt, realDt * cfg.clockFloor);

/**
 * Advance one tick. `dt` is on the teaching clock. `toPlayer` is the unit vector warden -> player (or null),
 * `sees` is true when the player is inside range with a clear line. Returns {aiming, windup (seconds left), locked,
 * aimX, aimY, fire}. `w` is mutated.
 */
export function stepWarden(w, {dt, sees, toPlayer}, cfg = WARDEN) {
  let fire = false;
  if (w.phase === 'cooldown') {
    w.t -= dt;
    if (w.t <= 0) { w.phase = 'idle'; w.t = 0; }
  } else if (w.phase === 'idle') {
    if (sees && toPlayer) { w.phase = 'windup'; w.t = cfg.windup + (w.shots === 0 ? cfg.firstDelay : 0); w.aim = {...toPlayer}; }
  } else if (w.phase === 'windup') {
    if (!sees || !toPlayer) { w.phase = 'idle'; w.t = 0; }
    else {
      if (w.t > cfg.lock) w.aim = {...toPlayer};
      w.t -= dt;
      if (w.t <= 0) { fire = true; w.shots++; w.phase = 'cooldown'; w.t = cfg.cooldown; }
    }
  }
  const aiming = w.phase === 'windup';
  return {aiming, windup: aiming ? Math.max(0, w.t) : 0, locked: aiming && w.t <= cfg.lock, aimX: w.aim.x, aimY: w.aim.y, fire};
}
