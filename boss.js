// THE CONDUCTOR: pure boss brain. No DOM, physics or rendering. stepBoss() advances a plain state object in
// *simulation* seconds (so standing still, which slows the sim, stretches every telegraph and lets the player read
// and weave through it) and returns the actions the game should apply: bullets, summons, phase changes.
//
// Phases by remaining health, each tied to the time rule so the fight teaches it:
//   I   (100-66%) fans, rings, sweeps: read the telegraph, step out of it (ordinary world time).
//   II  (66-33%)  TEMPO: he conducts YOUR time. Spiral, summons, fans and rings only advance while you MOVE (see
//                 tempoRate); stand still and the whole pattern nearly freezes. Moving is how you pay for his attacks.
//   III (<33%)    BEATDROP: locked to the music. On every second beat he MARKS a line at you, two beats later he fires
//                 along it. The off-beat between is the dodge window: step off the line on the beat. Charges and
//                 summons are mixed in. A charge leaves the boss exposed (vulnerability window).

export const BOSS = {
  name: 'THE CONDUCTOR',
  maxHp: 2400,
  radius: 20,
  phaseThresholds: [.66, .33],
  contactDamage: 2,
  speed: 38,
  chargeSpeed: 270,
  chargeTime: .95,
  chargeHitRadius: 28, // lane half-width: the drawn lane is exactly this wide
  chargeLockAt: .65, // sim seconds before the charge starts when the line locks (the dodge window)
  repositionSpeed: 120,
  exposedTime: 1.5,
  exposedDamageMult: 2,
  maxAdds: 2,
};

// LINE OF SIGHT: cover is for short breaks. After SIGHT_LOST_REPOSITION s (real time) without a clear line to you he walks
// a path round the cover until he has one; if that still has not worked after LOB_AFTER s he lobs a telegraphed burst onto
// your position (the shots radiate from the marked spot, so they reach round cover).
export const SIGHT_LOST_REPOSITION = 4, LOB_AFTER = 7;
export const sightAction = lostFor => lostFor >= LOB_AFTER ? 'lob' : lostFor >= SIGHT_LOST_REPOSITION ? 'reposition' : 'fight';

export const INTRO_TIME = .9, SHIFT_TIME = 1.2; // real seconds
export const BOSS_ROOM_NAME = 'THE BROADCAST ROOM';
export const BEATS_PER_BEAT_PATTERN = 8;
export const BEAT_FALLBACK_HZ = 2.3; // beats per world second when no music clock is supplied
export const BOSS_PATTERNS = {
  1: ['fan', 'ring', 'sweep', 'fan', 'ring'],
  2: ['spiral', 'summon', 'fan', 'ring', 'sweep'],
  3: ['beat', 'ring', 'charge', 'beat', 'fan', 'summon'],
};

// telegraph: seconds of visible warning. active: seconds the attack keeps emitting. recover: pause after.
export const PATTERN_SPECS = {
  fan: {telegraph: .95, active: 0, recover: .7},
  ring: {telegraph: 1.15, active: 0, recover: .9},
  sweep: {telegraph: .85, active: 1.05, recover: .8},
  spiral: {telegraph: .9, active: 2.4, recover: .8},
  summon: {telegraph: 1.2, active: 0, recover: .9},
  charge: {telegraph: 1.45, active: 0, recover: .2},
  lob: {telegraph: 1.3, active: 0, recover: .8},
  beat: {telegraph: .5, active: 0, recover: 1},
};

// TEMPO (phase II): how fast his pattern clock runs for a player speed ratio (0 still .. 1 walking .. 1.4 sprint).
// Standing still is slow (a quarter speed) so reading a telegraph is cheap, but never frozen, and FIRING FEEDS HIM: every
// shot you fire lifts the clock to SHOT_FEED for a moment, so camping behind a held trigger is the worst way to fight him.
export const TEMPO_FLOOR = .25;
export const SHOT_FEED = .85;
export const SHOT_FEED_TIME = .6; // real seconds a shot keeps the clock fed
export const tempoRate = (speedRatio, fed = false) => Math.min(1, Math.max(TEMPO_FLOOR, fed ? SHOT_FEED : 0, Number.isFinite(speedRatio) ? speedRatio : 0));

// Phase floors for the clock in world rate: phase I and III never run slower than this fraction of real time.
export const PHASE_CLOCK_FLOOR = {1: .5, 3: .5};
// His bullets never crawl: world-rate floor for boss-pattern bullets (real-time fraction), so the dodge always matters.
export const BOSS_BULLET_FLOOR = .35;

// The boss's own clock step (seconds) from the world step `dt` and the real frame step. Intro and phase shifts run on real
// time (they are staging, not gameplay), the rest on the faster of the world rate and the phase rule.
export function bossClockDt({phase, mode, dt, frameDt, speedRatio = 1, fed = false}) {
  if (!(dt > 0)) return 0; // hit-stop / pause: frozen
  const real = frameDt > 0 ? frameDt : dt;
  if (mode === 'intro' || mode === 'shift') return real;
  const rate = phase === 2 ? tempoRate(speedRatio, fed) : Math.max(PHASE_CLOCK_FLOOR[phase] ?? 0, fed ? SHOT_FEED : 0);
  return Math.max(dt, real * rate);
}

// Ammo drops that keep the arena from becoming a dead end: every ~12% of his health (so 75% and 50% are always among them), and when the player runs low (cooldown).
export const AMMO_DROP_FRACTIONS = [.88, .75, .62, .5, .38, .25, .12];
export const DRY_AMMO_COOLDOWN = 9; // real seconds
export const bossAmmoDropsDue = (hpFraction, given = []) => AMMO_DROP_FRACTIONS.filter(f => hpFraction <= f && !given.includes(f));
export const dryAmmoDropDue = (dry, now, lastAt) => Boolean(dry) && now - lastAt >= DRY_AMMO_COOLDOWN;

export function bossPhaseFor(hpFraction) {
  if (hpFraction <= BOSS.phaseThresholds[1]) return 3;
  if (hpFraction <= BOSS.phaseThresholds[0]) return 2;
  return 1;
}

export function createBoss() {
  return {
    active: false, phase: 1, mode: 'dormant', t: 0, patternIndex: 0, pattern: null, total: 0,
    angle: 0, locked: false, emit: 0, spin: 0, sweepDir: 1, fired: false, tempo: 1, beatCount: 0, beatSeen: null, beatClock: 0,
    sightLost: 0, seek: false, lobAt: null, invuln: false, exposed: 0, hitWall: false, intro: 0,
    telegraph: null, // {kind, progress 0..1, angle} for the renderer / HUD while winding up
  };
}

export function activateBoss(boss) {
  if (boss.active) return boss;
  boss.active = true; boss.mode = 'intro'; boss.t = INTRO_TIME; boss.intro = INTRO_TIME; boss.invuln = true;
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
  if (kind === 'beat') { boss.pattern = kind; boss.angle = angleTo(ctx.boss, ctx.player); fire(boss, PATTERN_SPECS.beat, ctx, {actions: []}); return; }
  const spec = PATTERN_SPECS[kind];
  boss.mode = 'telegraph'; boss.pattern = kind; boss.t = spec.telegraph; boss.total = spec.telegraph;
  boss.locked = false; boss.fired = false; boss.emit = 0;
  boss.angle = angleTo(ctx.boss, ctx.player);
  boss.gapSign = ctx.rng() < .5 ? -1 : 1;
  if (kind === 'lob') boss.lobAt = {x: ctx.player.x, y: ctx.player.y};
  if (kind === 'charge') boss.chargeTarget = {x: ctx.player.x, y: ctx.player.y};
}

// Where the charge lane ends: the locked aim, one full charge long.
export const chargeLane = boss => ({length: BOSS.chargeSpeed * BOSS.chargeTime, halfWidth: BOSS.chargeHitRadius, angle: boss.angle});

// The lob burst: LOB_COUNT spokes from the marked spot with a LOB_GAP-wide safe sector facing the boss (so the way out is toward him).
export const LOB_COUNT = 12, LOB_GAP = 4;
export function lobLayout(towardAngle) {
  const step = Math.PI * 2 / LOB_COUNT, start = Math.round((towardAngle - (LOB_GAP - 1) / 2 * step) / step);
  return {count: LOB_COUNT, step, gapStart: start, gap: LOB_GAP};
}
export function lobShots(towardAngle = 0) {
  const {count, step, gapStart, gap} = lobLayout(towardAngle), shots = [];
  for (let i = 0; i < count; i++) { const off = ((i - gapStart) % count + count) % count; if (off >= gap) shots.push({angle: i * step, speed: 130, damage: 1}); }
  return shots;
}

export function ringLayout(boss) {
  const count = boss.phase === 3 ? 20 : 16, step = Math.PI * 2 / count, width = boss.phase === 3 ? 3 : 4;
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
  for (let i = 0; i < count; i++) shots.push({angle: boss.angle - arc / 2 + arc * i / (count - 1), speed: boss.phase === 1 ? 150 : 175, damage: 1});
  return shots;
}

// Phase III beat cycle (counted in beats): 0 MARK the player's line, 1 MOVE (off-beat), 2 FIRE along the mark, 3 rest.
export const beatStage = count => ['mark', 'move', 'fire', 'rest'][((count % 4) + 4) % 4];
function beatShots(boss) {
  const shots = [];
  for (let i = -2; i <= 2; i++) shots.push({angle: boss.angle + i * .14, speed: 215, damage: 1});
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
    boss.phase = phase; boss.mode = 'shift'; boss.t = SHIFT_TIME; boss.invuln = true; boss.telegraph = null; boss.pattern = null; boss.patternIndex = 0;
    out.actions.push({type: 'phase', phase});
    return out;
  }

  boss.t -= step;
  // Time without a clear line (real seconds when supplied: standing still must not stretch the wait).
  if (step > 0) {
    if (ctx.los === false && (boss.mode === 'idle' || boss.mode === 'recover')) boss.sightLost += ctx.realDt ?? step;
    else if (ctx.los !== false) boss.sightLost = 0;
  }
  switch (boss.mode) {
    case 'intro':
      boss.telegraph = null;
      if (boss.t <= 0) { boss.invuln = false; boss.mode = 'idle'; boss.t = .6; }
      break;
    case 'shift':
      if (boss.t <= 0) { boss.invuln = false; boss.mode = 'idle'; boss.t = .5; out.actions.push({type: 'summon', count: boss.phase === 3 ? 2 : 1, free: true}); }
      break;
    case 'idle': {
      // Drift to keep a readable mid distance and strafe around the player.
      const dx = ctx.player.x - ctx.boss.x, dy = ctx.player.y - ctx.boss.y, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
      const radial = d > 260 ? 1 : d < 160 ? -1 : 0, side = (boss.patternIndex % 2 ? 1 : -1) * .7;
      out.move.x = (nx * radial * .8 - ny * side) * BOSS.speed; out.move.y = (ny * radial * .8 + nx * side) * BOSS.speed;
      const act = sightAction(boss.sightLost);
      boss.seek = act !== 'fight';
      if (boss.seek && ctx.seek) { // walk the path round the cover until he sees you again
        const sx = ctx.seek.x - ctx.boss.x, sy = ctx.seek.y - ctx.boss.y, sd = Math.hypot(sx, sy) || 1;
        out.move.x = sx / sd * BOSS.repositionSpeed; out.move.y = sy / sd * BOSS.repositionSpeed;
      }
      if (boss.t <= 0) {
        if (act === 'lob') { boss.sightLost = SIGHT_LOST_REPOSITION; beginTelegraph(boss, 'lob', ctx); }
        else if (act === 'fight') beginTelegraph(boss, nextPattern(boss), ctx);
      }
      break;
    }
    case 'telegraph': {
      const spec = PATTERN_SPECS[boss.pattern];
      if (!boss.locked) boss.angle = angleTo(ctx.boss, ctx.player);
      if (boss.pattern === 'lob') { boss.angle = angleTo(ctx.boss, boss.lobAt); if (boss.t > .55) boss.lobAt = {x: ctx.player.x, y: ctx.player.y}; }
      if (boss.t <= (boss.pattern === 'charge' ? BOSS.chargeLockAt : boss.pattern === 'lob' ? .55 : .45)) boss.locked = true; // aim freezes for the last beat(s) so the dodge is fair
      boss.telegraph = {kind: boss.pattern, progress: Math.min(1, 1 - boss.t / boss.total), angle: boss.angle, locked: boss.locked, ring: boss.pattern === 'ring' ? ringLayout(boss) : null,
        target: boss.pattern === 'lob' ? {x: boss.lobAt.x, y: boss.lobAt.y, ...lobLayout(Math.atan2(ctx.boss.y - boss.lobAt.y, ctx.boss.x - boss.lobAt.x))} : boss.pattern === 'charge' ? {x: ctx.boss.x + Math.cos(boss.angle) * chargeLane(boss).length, y: ctx.boss.y + Math.sin(boss.angle) * chargeLane(boss).length} : null};
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
          out.actions.push({type: 'bullets', shots: [-.16, 0, .16].map(o => ({angle: boss.angle + o, speed: 155, damage: 1}))});
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
    case 'beat': {
      // Locked to the music: ctx.beat = {index, phase} from the audible clock; without music a world-time clock stands in.
      let index, phase;
      if (ctx.beat) { index = ctx.beat.index; phase = ctx.beat.phase ?? 0; }
      else { boss.beatClock += step * BEAT_FALLBACK_HZ; index = Math.floor(boss.beatClock); phase = boss.beatClock - index; }
      boss.t = Infinity;
      if (boss.beatSeen === null) boss.beatSeen = index - 1; // the first beat we see starts the cycle
      if (index !== boss.beatSeen) {
        boss.beatSeen = index;
        const stage = beatStage(boss.beatCount);
        if (stage === 'mark') { boss.angle = angleTo(ctx.boss, ctx.player); boss.locked = true; }
        else if (stage === 'fire') out.actions.push({type: 'bullets', shots: beatShots(boss), beat: true});
        boss.stage = stage; boss.beatCount++;
        if (boss.beatCount >= BEATS_PER_BEAT_PATTERN) { boss.mode = 'recover'; boss.t = PATTERN_SPECS.beat.recover; boss.telegraph = null; boss.locked = false; break; }
      }
      const marking = boss.stage === 'mark' || boss.stage === 'move';
      boss.telegraph = marking ? {kind: 'beat', stage: boss.stage, progress: boss.stage === 'mark' ? phase * .5 : .5 + phase * .5, angle: boss.angle, locked: true, ring: null} : null;
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
    const room = Math.max(0, BOSS.maxAdds - (ctx.adds || 0)), count = Math.min(room, boss.phase === 3 ? 2 : 1);
    if (count > 0) out.actions.push({type: 'summon', count});
    boss.mode = 'recover'; boss.t = spec.recover;
  } else if (kind === 'lob') {
    out.actions.push({type: 'bullets', shots: lobShots(Math.atan2(ctx.boss.y - boss.lobAt.y, ctx.boss.x - boss.lobAt.x)), from: {x: boss.lobAt.x, y: boss.lobAt.y}});
    boss.mode = 'recover'; boss.t = spec.recover;
  } else if (kind === 'beat') {
    boss.mode = 'beat'; boss.t = Infinity; boss.beatCount = 0; boss.beatSeen = null; boss.stage = 'rest';
  } else if (kind === 'charge') {
    boss.mode = 'charge'; boss.t = BOSS.chargeTime; boss.hitWall = false;
    out.actions.push({type: 'charge', angle: boss.angle});
  } else {
    boss.mode = 'attack'; boss.t = spec.active; boss.emit = 0; boss.sweepDir = ctx.rng() < .5 ? -1 : 1;
    boss.angle = boss.angle - boss.sweepDir * .45 * 2;
    if (kind === 'spiral') boss.spin = boss.angle;
  }
}
