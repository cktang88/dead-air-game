import test from 'node:test';
import assert from 'node:assert/strict';
import {BEATS_PER_BAR,TRACKS,TRACK_NAMES,FALLBACKS,LOAD_ORDER,advancePosition,ambienceThemeFor,beatFromPosition,chatterPlan,createSceneMachine,crossfadeSeconds,introPhaseAt,INTRO_TOTAL,isLowHealth,makeRng,musicCutoff,musicLevel,musicRate,nextBoundary,nextMachineryEvent,rateToCents,resolveTrack,seedFor,stateFromGame,stepDuration,stepRate,trackDuration} from './music-core.js';
import {DEFAULT_MUSIC_VOLUME,parseMusicSettings,serializeMusicSettings} from './music.js';
import {existsSync,statSync} from 'node:fs';

test('stepDuration: a 16th at 120 bpm is 125 ms and scales by 1/rate', () => {
  assert.equal(stepDuration(120, 1), .125);
  assert.ok(Math.abs(stepDuration(120, .5) - .25) < 1e-9);
  assert.ok(stepDuration(120, .46) > stepDuration(120, 1) * 2);
  assert.ok(Number.isFinite(stepDuration(120, 0)) && Number.isFinite(stepDuration(NaN, NaN)));
});

test('musicRate: monotonic, 1 at full speed, deep but bounded when slow', () => {
  assert.equal(musicRate(1), 1);
  assert.ok(musicRate(.18) > .5 && musicRate(.18) < .75);
  let last = 0;
  for (let s = 0; s <= 1; s += .05) { const r = musicRate(s); assert.ok(r >= last - 1e-12); assert.ok(r >= .5 && r <= 1); last = r; }
  assert.equal(musicRate(NaN), 1);
  assert.equal(musicRate(-3), .5);
});

test('tempo and pitch move together: cents track log2(rate), tempo ratio is 1/rate', () => {
  const slow = musicRate(.18);
  assert.ok(Math.abs(rateToCents(slow) - 1200 * Math.log2(slow)) < 1e-9);
  assert.ok(rateToCents(slow) < -500);
  assert.equal(rateToCents(1), 0);
  assert.ok(Math.abs(stepDuration(100, slow) / stepDuration(100, 1) - 1 / slow) < 1e-9);
});

test('musicCutoff: dull when slow, choked at low health and paused, never silent', () => {
  assert.ok(musicCutoff(1) > 15000);
  assert.ok(musicCutoff(.55) < 4500);
  assert.ok(musicCutoff(1, {lowHealth: true}) < musicCutoff(1));
  assert.ok(musicCutoff(1, {paused: true}) <= 700);
  assert.ok(musicCutoff(.05) >= 260);
});

test('makeRng / seedFor are deterministic and spread', () => {
  const a = makeRng(42), b = makeRng(42);
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
  assert.notEqual(makeRng(1)(), makeRng(2)());
  assert.notEqual(seedFor(5, 'floor'), seedFor(5, 'boss'));
  for (let i = 0; i < 200; i++) { const v = makeRng(i)(); assert.ok(v >= 0 && v < 1); }
});

test('ambience helpers: theme map, chatter plans, machinery cadence', () => {
  assert.equal(ambienceThemeFor('grate'), 'furnace');
  assert.equal(ambienceThemeFor('tile'), 'cold');
  assert.equal(ambienceThemeFor('metal'), 'server');
  assert.equal(ambienceThemeFor(undefined), 'server');
  assert.deepEqual(chatterPlan(makeRng(3)), chatterPlan(makeRng(3)));
  for (let s = 1; s <= 100; s++) {
    const p = chatterPlan(makeRng(s));
    assert.ok(p.syllables.length >= 1 && p.total <= 2.6 && p.pitch >= 95 && p.pitch <= 185);
    let end = 0;
    for (const sy of p.syllables) { assert.ok(sy.t >= end - 1e-9 && sy.dur > 0 && sy.f1 < sy.f2 + 1500 && sy.vol > 0 && sy.vol <= 1); end = sy.t + sy.dur; }
    const ev = nextMachineryEvent(makeRng(s));
    assert.ok(ev.delay >= 5 && ev.delay <= 15 && ['thud', 'clank', 'pipe'].includes(ev.type));
  }
});

test('title intro timeline stays under 3 s and phases advance in order', () => {
  assert.ok(INTRO_TOTAL < 3);
  const order = ['bars', 'glitch', 'static', 'title', 'done'];
  let last = 0;
  for (let t = 0; t < 3; t += .01) { const i = order.indexOf(introPhaseAt(t)); assert.ok(i >= last); last = i; }
  assert.equal(introPhaseAt(0), 'bars'); assert.equal(introPhaseAt(INTRO_TOTAL + .1), 'done');
});

test('music settings parse and serialize safely', () => {
  assert.equal(parseMusicSettings(undefined).volume, DEFAULT_MUSIC_VOLUME);
  assert.equal(parseMusicSettings('not json').volume, DEFAULT_MUSIC_VOLUME);
  assert.equal(parseMusicSettings(serializeMusicSettings(.25)).volume, .25);
  assert.equal(parseMusicSettings(serializeMusicSettings(4)).volume, 1);
  assert.equal(parseMusicSettings(JSON.stringify({version: 9, volume: .2})).volume, DEFAULT_MUSIC_VOLUME);
});

test('track table: every state has a file on disk, whole bars, sane tempo, and total size stays small', () => {
  let bytes = 0;
  for (const name of TRACK_NAMES) {
    const t = TRACKS[name];
    assert.ok(Number.isInteger(t.bars) && t.bars >= 8 && t.bpm > 70 && t.bpm < 180 && t.gain > 0 && t.gain <= 1.2, name);
    const path = new URL(`./assets/music/${t.file}`, import.meta.url);
    assert.ok(existsSync(path), `${t.file} exists`);
    bytes += statSync(path).size;
  }
  assert.ok(bytes < 12 * 1024 * 1024, `music is ${bytes} bytes`);
  for (const s of ['title', 'explore', 'tension', 'combat', 'boss', 'win']) assert.ok(TRACKS[s], s);
  assert.deepEqual([...LOAD_ORDER].sort(), [...TRACK_NAMES].sort());
  assert.ok(Math.abs(trackDuration('combat') - 24 * 4 * 60 / TRACKS.combat.bpm) < 1e-9);
  assert.equal(TRACKS.win.loop, false); assert.equal(TRACKS.win.next, 'title');
});

test('resolveTrack: own track when loaded, else the nearest fallback, else silence', () => {
  assert.equal(resolveTrack('combat', new Set(['combat', 'explore'])), 'combat');
  assert.equal(resolveTrack('combat', new Set(['explore'])), 'explore');
  assert.equal(resolveTrack('boss', new Set(['tension', 'explore'])), 'tension');
  assert.equal(resolveTrack('win', new Set(['explore'])), 'explore');
  assert.equal(resolveTrack('combat', new Set()), null);
  assert.equal(resolveTrack('nope', new Set(['explore'])), null);
  for (const [k, list] of Object.entries(FALLBACKS)) { assert.ok(TRACKS[k]); for (const a of list) assert.ok(TRACKS[a] && a !== k); }
});

test('scene machine: instant up, held down (combat >= 6 s after the last trigger), no flip-flop', () => {
  const m = createSceneMachine();
  assert.equal(m.update(.016, {}), 'explore');
  assert.equal(m.update(.016, {suspicious: true}), 'tension');
  assert.equal(m.update(.016, {aware: true}), 'tension');
  assert.equal(m.update(.016, {engaged: true}), 'combat');
  // last shot at t=0; stays combat for 6 s with nothing else going on
  assert.equal(m.update(.016, {shot: true, aware: true}), 'combat');
  for (let t = 0; t < 5.9; t += .1) assert.equal(m.update(.1, {}), 'combat', `still combat at ${t.toFixed(1)}`);
  let after = 'combat'; for (let t = 0; t < 1; t += .1) after = m.update(.1, {});
  assert.notEqual(after, 'combat', 'drops after the hold');
  assert.equal(after, 'tension', 'steps down through tension, not straight to explore');
  for (let t = 0; t < 4.2; t += .1) after = m.update(.1, {});
  assert.equal(after, 'explore');
  // a lone shot with no enemy about does not start a fight
  assert.equal(m.update(.016, {shot: true}), 'explore');
  // shooting while an enemy is aware does
  assert.equal(m.update(.016, {shot: true, aware: true}), 'combat');
});

test('scene machine: flicker in the trigger never flips the scene more than once per dwell', () => {
  const m = createSceneMachine(); let flips = 0, last = m.scene;
  for (let i = 0; i < 600; i++) { // 10 s of an enemy popping aware / unaware every 0.25 s
    const s = m.update(1 / 60, {engaged: Math.floor(i / 15) % 2 === 0}); if (s !== last) { flips++; last = s; }
  }
  assert.ok(flips <= 1, `flips ${flips}`);
  const b = createSceneMachine();
  assert.equal(b.update(.1, {engaged: true, boss: true}), 'boss');
  for (let i = 0; i < 90; i++) b.update(.1, {engaged: true}); // boss hold (8 s) lapses while still fighting
  assert.equal(b.scene, 'combat');
  assert.equal(b.reset(), 'explore'); assert.equal(b.update(.1, {}), 'explore');
});

test('stateFromGame: modes map to title / dead / win, play uses the scene', () => {
  assert.equal(stateFromGame({mode: 'title'}), 'title');
  assert.equal(stateFromGame({mode: 'menu', scene: 'combat'}), 'title');
  assert.equal(stateFromGame({mode: 'dead', scene: 'combat'}), 'dead');
  assert.equal(stateFromGame({mode: 'won', scene: 'explore'}), 'win');
  for (const sc of ['explore', 'tension', 'combat', 'boss']) assert.equal(stateFromGame({mode: 'play', scene: sc}), sc);
  assert.equal(isLowHealth(1, 6), true); assert.equal(isLowHealth(2, 6), true); assert.equal(isLowHealth(4, 6), false);
  assert.equal(isLowHealth(0, 6), false); assert.equal(isLowHealth(NaN, 6), false);
});

test('nextBoundary: lands on the bar line, scales with tape rate, falls back to a beat in deep slow-mo', () => {
  const bpm = 120, beat = .5, bar = 2; // 4 beats = 2 s
  assert.ok(Math.abs(nextBoundary({pos: 0.5, bpm, rate: 1}).wait - 1.5) < 1e-9);       // beat 1 of bar -> 3 beats left
  assert.equal(nextBoundary({pos: 0.5, bpm, rate: 1}).kind, 'bar');
  assert.ok(Math.abs(nextBoundary({pos: 0.5, bpm, rate: .5}).wait - 3) < 1e-9);          // half speed: twice as long
  const slow = nextBoundary({pos: .1, bpm: 85, rate: .46});                                // bar would be ~6 s away
  assert.equal(slow.kind, 'beat'); assert.ok(slow.wait <= 60 / 85 / .46 + 1e-9);
  const onLine = nextBoundary({pos: 0, bpm, rate: 1}); // exactly on a bar line: wait a whole bar, never 0
  assert.ok(onLine.wait > .06 && Math.abs(onLine.wait - bar) < 1e-9);
  const justPast = nextBoundary({pos: bar - .01, bpm, rate: 1}); assert.ok(justPast.wait > .06);
  for (let p = 0; p < 8; p += .137) { const nb = nextBoundary({pos: p, bpm: 143, rate: 1}); const beats = (p + nb.wait * 1) / (60 / 143); const frac = (nb.kind === 'bar' ? beats % 4 : beats % 1); assert.ok(Math.min(frac, (nb.kind === 'bar' ? 4 : 1) - frac) < 1e-6, `p=${p}`); }
  assert.equal(BEATS_PER_BAR, 4);
});

test('beat tracking: position advances with tape rate, loops wrap, beats stay monotonic', () => {
  const tr = {bpm: 120, bars: 2}, loopLen = 4; // 2 bars at 120 = 4 s
  let st = {pos: 0, loops: 0};
  for (let i = 0; i < 40; i++) st = advancePosition(st, .1, 1, loopLen, true);
  assert.ok(Math.abs(st.pos - 0) < 1e-6 && st.loops === 1, 'one 4 s loop after 4 s');
  let b = beatFromPosition({pos: 1.3, loops: 0}, tr); assert.equal(b.index, 2); assert.ok(Math.abs(b.phase - .6) < 1e-9); assert.equal(b.beatInBar, 2);
  b = beatFromPosition({pos: 0.1, loops: 1}, tr); assert.equal(b.index, 8 + 0); assert.equal(b.bar, 2);
  // half speed: half the beats in the same real time
  let slow = {pos: 0, loops: 0}; for (let i = 0; i < 20; i++) slow = advancePosition(slow, .1, .5, loopLen, true);
  assert.equal(beatFromPosition(slow, tr).index, 2);
  let last = -1, p = {pos: 0, loops: 0};
  for (let i = 0; i < 400; i++) { p = advancePosition(p, .037, .46 + (i % 7) * .08, loopLen, true); const idx = beatFromPosition(p, tr).index; assert.ok(idx >= last); last = idx; }
  const one = advancePosition({pos: 3.9, loops: 0}, .5, 1, 4, false); assert.equal(one.ended, true); assert.equal(one.pos, 4);
});

test('tape rate: glides down slowly, snaps back up, never overshoots', () => {
  let r = 1; const target = musicRate(.18);
  for (let i = 0; i < 6; i++) r = stepRate(r, target, .025);
  assert.ok(r < 1 && r > target + .1, 'still gliding after 150 ms');
  for (let i = 0; i < 200; i++) r = stepRate(r, target, .025);
  assert.ok(Math.abs(r - target) < .001);
  let up = target; for (let i = 0; i < 6; i++) up = stepRate(up, 1, .025);
  assert.ok(up > .85, 'snaps up fast');
  assert.ok(up <= 1 && stepRate(1, 1, .1) === 1);
});

test('mix: music sits under the SFX, ducks when paused, follows the slider and mute', () => {
  assert.ok(musicLevel(DEFAULT_MUSIC_VOLUME) < .3 && musicLevel(DEFAULT_MUSIC_VOLUME) > .1);
  assert.equal(musicLevel(0), 0);
  assert.ok(musicLevel(.55, {paused: true}) < musicLevel(.55));
  assert.ok(musicLevel(2) <= musicLevel(1) + 1e-12 && musicLevel(NaN) === 0);
  assert.equal(DEFAULT_MUSIC_VOLUME, .55);
  const xf = crossfadeSeconds(TRACKS.combat.bpm, 1); assert.ok(xf >= .5 && xf <= 2.4);
  assert.ok(crossfadeSeconds(85, .46) > crossfadeSeconds(85, 1));
});
