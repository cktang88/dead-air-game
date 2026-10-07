import test from 'node:test';
import assert from 'node:assert/strict';
import {BOSS, BOSS_PATTERNS, BOSS_ROOM_NAME, TEMPO_FLOOR, activateBoss, beatStage, createBoss, stepBoss, tempoRate} from './boss.js';

const ctxAt = (player, extra = {}) => ({boss: {x: 0, y: 0}, player, hpFraction: .2, adds: 0, rng: () => .3, ...extra});

test('the arena is the BROADCAST ROOM, not EXTRACTION', () => {
  assert.equal(BOSS_ROOM_NAME, 'THE BROADCAST ROOM');
});

test('TEMPO: the pattern clock follows how much you move, never fully stopping', () => {
  assert.equal(tempoRate(0), TEMPO_FLOOR);
  assert.equal(tempoRate(1), 1);
  assert.equal(tempoRate(1.4), 1);
  assert.ok(tempoRate(.5) > TEMPO_FLOOR && tempoRate(.5) < 1);
  assert.equal(tempoRate(NaN), TEMPO_FLOOR);
  assert.ok(tempoRate(0) * 5 <= tempoRate(1) / 2, 'standing still is far slower than walking');
});

test('phase II patterns lean on tempo (spiral, sweep, fan, ring, summon) and phase III adds the beat pattern', () => {
  assert.ok(!BOSS_PATTERNS[1].includes('beat') && !BOSS_PATTERNS[2].includes('beat'));
  assert.ok(BOSS_PATTERNS[3].includes('beat'));
  assert.ok(BOSS_PATTERNS[3].includes('charge'));
});

test('beat stages cycle mark, move, fire, rest', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 6].map(beatStage), ['mark', 'move', 'fire', 'rest', 'mark', 'fire']);
});

// Run phase III until the boss enters the beat pattern, then feed beats.
function enterBeat(boss, ctx) {
  for (let i = 0; i < 4000 && boss.mode !== 'beat'; i++) {
    boss.phase = 3; boss.patternIndex = 0; // force the first phase III pattern: 'beat'
    stepBoss(boss, 1 / 60, ctx);
  }
  assert.equal(boss.mode, 'beat');
}

test('phase III beat pattern: marks your line on one beat, fires along it two beats later, off-beat is the dodge window', () => {
  const boss = createBoss(); activateBoss(boss); boss.phase = 3;
  const player = {x: 200, y: 0}, ctx = ctxAt(player);
  boss.t = 0; boss.mode = 'idle'; boss.invuln = false;
  boss.phase = 3; boss.patternIndex = 0;
  stepBoss(boss, 1 / 60, ctx); // idle -> beat pattern starts immediately
  assert.equal(boss.mode, 'beat');
  const log = [];
  for (let beat = 10; beat < 14; beat++) {
    if (beat === 11) player.y = 90; // you moved on the off-beat after the mark
    const out = stepBoss(boss, 1 / 60, ctxAt(player, {beat: {index: beat, phase: 0}}));
    log.push({stage: boss.stage, bullets: out.actions.filter(a => a.type === 'bullets'), tg: boss.telegraph});
  }
  assert.equal(log[0].stage, 'mark'); assert.equal(log[0].bullets.length, 0); assert.equal(log[0].tg.kind, 'beat');
  assert.equal(log[1].stage, 'move'); assert.equal(log[1].bullets.length, 0); assert.ok(log[1].tg.progress >= .5);
  assert.equal(log[2].stage, 'fire'); assert.equal(log[2].bullets.length, 1);
  const shots = log[2].bullets[0].shots;
  assert.equal(shots.length, 5);
  const mid = shots[2].angle;
  assert.ok(Math.abs(mid - 0) < 1e-9, 'fired along the line marked at the player\'s OLD position, so moving on the off-beat dodges it');
  assert.equal(log[3].stage, 'rest'); assert.equal(log[3].tg, null);
});

test('the beat pattern ends after eight beats and recovers; without a music clock a world-time clock stands in', () => {
  const boss = createBoss(); activateBoss(boss); boss.invuln = false; boss.mode = 'idle'; boss.t = 0; boss.phase = 3; boss.patternIndex = 0;
  const ctx = ctxAt({x: 200, y: 0});
  let fired = 0, steps = 0;
  while (steps++ < 2000) { const out = stepBoss(boss, 1 / 30, ctx); fired += out.actions.filter(a => a.type === 'bullets').length; if (boss.mode === 'recover') break; }
  assert.equal(boss.mode, 'recover');
  assert.equal(fired, 2, 'two fire beats in eight');
  assert.ok(steps < 600);
});

test('boss stats are unchanged by the redesign (this is a pacing change, not a health change)', () => {
  assert.equal(BOSS.maxHp, 700);
});

import {bossLights, bossCamShift} from './boss-fight.js';
test('the arena is lit and centred on the room, with a spotlight on the Conductor', () => {
  const room = {cx: 26, cy: 54, x1: 19, y1: 48, x2: 34, y2: 60};
  const lights = bossLights(room, {x: 800, y: 1700, alive: true});
  assert.equal(lights.length, 2);
  assert.ok(Math.abs(lights[0].x - 26.5 * 32) < 1e-9);
  assert.deepEqual([lights[1].x, lights[1].y], [800, 1700]);
  assert.ok(lights[1].a > lights[0].a, 'the boss spotlight is the brightest');
  assert.deepEqual(bossLights(room, {x: 0, y: 0, alive: false}), []);
});
test('the camera nudges toward the boss but never far enough to lose the player', () => {
  const near = bossCamShift({x: 0, y: 0}, {x: 100, y: 0, alive: true});
  assert.ok(near.x > 0 && near.x < 100);
  const far = bossCamShift({x: 0, y: 0}, {x: 2000, y: 0, alive: true});
  assert.ok(Math.hypot(far.x, far.y) <= 150 + 1e-9);
  assert.deepEqual(bossCamShift({x: 0, y: 0}, {x: 5, y: 5, alive: false}), {x: 0, y: 0});
});
