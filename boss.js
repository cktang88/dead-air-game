// THE CONDUCTOR: pure boss brain. No DOM, physics or rendering. stepBoss() advances a plain state object in
// *simulation* seconds (so standing still, which slows the sim, stretches every telegraph and lets the player read
// and weave through it) and returns the actions the game should apply: bullets, summons, phase changes.
//
// Phases by remaining health: 1 (100-66%) fans, rings, sweeps  ->  2 (66-33%) adds a spiral and summons
// ->  3 (<33%) adds the charge and denser patterns. A charge leaves the boss exposed (vulnerability window).

export const BOSS = {
  name: 'THE CONDUCTOR',
  maxHp: 1100,
  radius: 20,
  phaseThresholds: [.66, .33],
  contactDamage: 2,
  speed: 38,
  chargeSpeed: 300,
  chargeTime: .85,
  exposedTime: 1.5,
  exposedDamageMult: 1.5,
  maxAdds: 4,
};

export const BOSS_PATTERNS = {
  1: ['fan', 'ring', 'sweep', 'fan', 'ring'],
  2: ['spiral', 'summon', 'fan', 'ring', 'sweep'],
  3: ['charge', 'spiral', 'ring', 'charge', 'fan', 'summon'],
};

// telegraph: seconds of visible warning. active: seconds the attack keeps emitting. recover: pause after.
export const PATTERN_SPECS = {
  fan: {telegraph: .95, active: 0, recover: .7},
  ring: {telegraph: 1.15, active: 0, recover: .9},
  sweep: {telegraph: .85, active: 1.05, recover: .8},
  spiral: {telegraph: .9, active: 2.4, recover: .8},
  summon: {telegraph: 1.2, active: 0, recover: .9},
  charge: {telegraph: 1.15, active: 0, recover: .2},
};

export function bossPhaseFor(hpFraction) {
  if (hpFraction <= BOSS.phaseThresholds[1]) return 3;
  if (hpFraction <= BOSS.phaseThresholds[0]) return 2;
  return 1;
}

export function createBoss() {
  return {
    active: false, phase: 1, mode: 'dormant', t: 0, patternIndex: 0, pattern: null, total: 0,
    angle: 0, locked: false, emit: 0, spin: 0, sweepDir: 1, fired: false,
    invuln: false, exposed: 0, hitWall: false, intro: 0,
    telegraph: null, // {kind, progress 0..1, angle} for the renderer / HUD while winding up
  };
}

export function activateBoss(boss) {
  if (boss.active) return boss;
  boss.active = true; boss.mode = 'intro'; boss.t = 1.6; boss.intro = 1.6; boss.invuln = true;
  return boss;
}

export const bossDamageMult = boss => boss.exposed > 0 ? BOSS.exposedDamageMult : 1;
export const bossVulnerable = boss => boss.active && !boss.invuln;

function nextPattern(boss) {
  const list = BOSS_PATTERNS[boss.phase];
  const kind = list[boss.patternIndex % list.length];
  boss.patternIndex++;
  return kind;
}

const angleTo = (from, to) => Math.atan2(to.y - from.y, to.x - from.x);

function beginTelegraph(boss, kind, ctx) {
  const spec = PATTERN_SPECS[kind];
  boss.mode = 'telegraph'; boss.pattern = kind; boss.t = spec.telegraph; boss.total = spec.telegraph;
  boss.locked = false; boss.fired = false; boss.emit = 0;
  boss.angle = angleTo(ctx.boss, ctx.player);
  boss.gapSign = ctx.rng() < .5 ? -1 : 1;
}

export function ringLayout(boss) {
  const count = boss.phase === 3 ? 20 : 16, step = Math.PI * 2 / count, width = boss.phase === 3 ? 2 : 3;
  // The gap sits a couple of slots off the locked aim so the player must shuffle to use it, not just stand there.
  const index = Math.round(boss.angle / step) + (boss.gapSign || 1) * 2;
  return {count, step, width, index, speed: boss.phase === 3 ? 135 : 120};
}

function ringShots(boss) {
  const {count, step, width, index, speed} = ringLayout(boss), shots = [];
  for (let i = 0; i < count; i++) {
    const offset = ((i - index) % count + count) % count;
    if (offset < width) continue;
    shots.push({angle: i * step, speed, damage: 1});
  }
  return shots;
}

function fanShots(boss) {
  const count = boss.phase === 3 ? 7 : 5, arc = boss.phase === 3 ? 1.1 : .9, shots = [];
  for (let i = 0; i < count; i++) shots.push({angle: boss.angle - arc / 2 + arc * i / (count - 1), speed: boss.phase === 1 ? 165 : 185, damage: 1});
  return shots;
}

// Advance the boss. ctx: {boss:{x,y}, player:{x,y}, hpFraction, adds (living count), rng}. Returns {actions, move:{x,y}} where move is a desired velocity in px/s.
export function stepBoss(boss, dt, ctx) {
  const out = {actions: [], move: {x: 0, y: 0}};
  if (!boss.active) { boss.telegraph = null; return out; }
  const step = Math.max(0, dt);
  boss.exposed = Math.max(0, boss.exposed - step);

  // Phase change: invulnerable beat, bullet wipe, supplies, then adds.
  const phase = bossPhaseFor(ctx.hpFraction);
  if (phase > boss.phase && boss.mode !== 'intro') {
    boss.phase = phase; boss.mode = 'shift'; boss.t = 1.8; boss.invuln = true; boss.telegraph = null; boss.pattern = null; boss.patternIndex = 0;
    out.actions.push({type: 'phase', phase});
    return out;
  }

  boss.t -= step;
  switch (boss.mode) {
    case 'intro':
      boss.telegraph = null;
      if (boss.t <= 0) { boss.invuln = false; boss.mode = 'idle'; boss.t = .6; }
      break;
    case 'shift':
      if (boss.t <= 0) { boss.invuln = false; boss.mode = 'idle'; boss.t = .5; out.actions.push({type: 'summon', count: boss.phase === 3 ? 3 : 2, free: true}); }
      break;
    case 'idle': {
      // Drift to keep a readable mid distance and strafe around the player.
      const dx = ctx.player.x - ctx.boss.x, dy = ctx.player.y - ctx.boss.y, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
      const radial = d > 260 ? 1 : d < 160 ? -1 : 0, side = (boss.patternIndex % 2 ? 1 : -1) * .7;
      out.move.x = (nx * radial * .8 - ny * side) * BOSS.speed; out.move.y = (ny * radial * .8 + nx * side) * BOSS.speed;
      if (boss.t <= 0) beginTelegraph(boss, nextPattern(boss), ctx);
      break;
    }
    case 'telegraph': {
      const spec = PATTERN_SPECS[boss.pattern];
      if (!boss.locked) boss.angle = angleTo(ctx.boss, ctx.player);
      if (boss.t <= .3) boss.locked = true; // aim freezes for the last beat so the dodge is fair
      boss.telegraph = {kind: boss.pattern, progress: Math.min(1, 1 - boss.t / boss.total), angle: boss.angle, locked: boss.locked, ring: boss.pattern === 'ring' ? ringLayout(boss) : null};
      if (boss.t <= 0) fire(boss, spec, ctx, out);
      break;
    }
    case 'attack': {
      boss.telegraph = null;
      if (boss.pattern === 'spiral') {
        boss.emit -= step; boss.spin += step * 3.1;
        while (boss.emit <= 0) {
          boss.emit += .1;
          const arms = boss.phase === 3 ? 3 : 2, shots = [];
          for (let a = 0; a < arms; a++) shots.push({angle: boss.spin + a * Math.PI * 2 / arms, speed: 125, damage: 1});
          out.actions.push({type: 'bullets', shots});
        }
      } else if (boss.pattern === 'sweep') {
        boss.emit -= step;
        while (boss.emit <= 0) {
          boss.emit += .35; boss.angle += boss.sweepDir * .45;
          out.actions.push({type: 'bullets', shots: [-.16, 0, .16].map(o => ({angle: boss.angle + o, speed: 175, damage: 1}))});
        }
      }
      if (boss.t <= 0) { boss.mode = 'recover'; boss.t = PATTERN_SPECS[boss.pattern].recover; }
      break;
    }
    case 'charge': {
      boss.telegraph = null;
      out.move.x = Math.cos(boss.angle) * BOSS.chargeSpeed; out.move.y = Math.sin(boss.angle) * BOSS.chargeSpeed;
      if (boss.t <= 0 || boss.hitWall) { boss.hitWall = false; boss.mode = 'recover'; boss.t = BOSS.exposedTime; boss.exposed = BOSS.exposedTime; out.actions.push({type: 'exposed', duration: BOSS.exposedTime}); }
      break;
    }
    case 'recover':
      boss.telegraph = null;
      if (boss.t <= 0) { boss.mode = 'idle'; boss.t = boss.phase === 3 ? .35 : .6; }
      break;
    default: break;
  }
  return out;
}

function fire(boss, spec, ctx, out) {
  boss.telegraph = null;
  const kind = boss.pattern;
  if (kind === 'fan') { out.actions.push({type: 'bullets', shots: fanShots(boss)}); boss.mode = 'recover'; boss.t = spec.recover; }
  else if (kind === 'ring') { out.actions.push({type: 'bullets', shots: ringShots(boss)}); boss.mode = 'recover'; boss.t = spec.recover; }
  else if (kind === 'summon') {
    const room = Math.max(0, BOSS.maxAdds - (ctx.adds || 0)), count = Math.min(room, boss.phase === 3 ? 3 : 2);
    if (count > 0) out.actions.push({type: 'summon', count});
    boss.mode = 'recover'; boss.t = spec.recover;
  } else if (kind === 'charge') {
    boss.mode = 'charge'; boss.t = BOSS.chargeTime; boss.hitWall = false;
    out.actions.push({type: 'charge', angle: boss.angle});
  } else {
    boss.mode = 'attack'; boss.t = spec.active; boss.emit = 0; boss.sweepDir = ctx.rng() < .5 ? -1 : 1;
    boss.angle = boss.angle - boss.sweepDir * .45 * 2;
    if (kind === 'spiral') boss.spin = boss.angle;
  }
}
