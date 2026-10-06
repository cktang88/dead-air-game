import test from 'node:test';
import assert from 'node:assert/strict';
import {SCALES,ambienceThemeFor,chatterPlan,chordForBar,createCombatTracker,createLayerMachine,generateTrack,introPhaseAt,INTRO_TOTAL,isLowHealth,layersForScene,makeRng,midiToHz,musicCutoff,musicRate,nextMachineryEvent,rateToCents,sceneFromGame,seedFor,stepDuration,beatAt} from './music-core.js';
import {DEFAULT_MUSIC_VOLUME,parseMusicSettings,serializeMusicSettings} from './music.js';

test('stepDuration: a 16th at 120 bpm is 125 ms and scales by 1/rate', () => {
  assert.equal(stepDuration(120, 1), .125);
  assert.ok(Math.abs(stepDuration(120, .5) - .25) < 1e-9);
  assert.ok(stepDuration(120, .46) > stepDuration(120, 1) * 2);
  assert.ok(Number.isFinite(stepDuration(120, 0)) && Number.isFinite(stepDuration(NaN, NaN)));
});

test('musicRate: monotonic, 1 at full speed, deep but bounded when slow', () => {
  assert.equal(musicRate(1), 1);
  assert.ok(musicRate(.18) > .4 && musicRate(.18) < .55);
  let last = 0;
  for (let s = 0; s <= 1; s += .05) { const r = musicRate(s); assert.ok(r >= last - 1e-12); assert.ok(r >= .4 && r <= 1); last = r; }
  assert.equal(musicRate(NaN), 1);
  assert.equal(musicRate(-3), .4);
});

test('tempo and pitch move together: cents track log2(rate), tempo ratio is 1/rate', () => {
  const slow = musicRate(.18);
  assert.ok(Math.abs(rateToCents(slow) - 1200 * Math.log2(slow)) < 1e-9);
  assert.ok(rateToCents(slow) < -900);
  assert.equal(rateToCents(1), 0);
  assert.ok(Math.abs(stepDuration(100, slow) / stepDuration(100, 1) - 1 / slow) < 1e-9);
});

test('musicCutoff: dull when slow, choked at low health and paused, never silent', () => {
  assert.ok(musicCutoff(1) > 15000);
  assert.ok(musicCutoff(.46) < 2000);
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

test('generateTrack: deterministic per seed and kind, varied across seeds', () => {
  assert.deepEqual(generateTrack(123, 'floor'), generateTrack(123, 'floor'));
  assert.notDeepEqual(generateTrack(123, 'floor'), generateTrack(124, 'floor'));
  assert.notDeepEqual(generateTrack(123, 'floor'), generateTrack(123, 'boss'));
  const keys = new Set(), bpms = new Set();
  for (let s = 1; s <= 60; s++) { const t = generateTrack(s); keys.add(`${t.rootMidi}${t.mode}`); bpms.add(t.bpm); }
  assert.ok(keys.size > 12 && bpms.size > 8);
});

test('generateTrack: structurally valid patterns', () => {
  for (let s = 1; s <= 80; s++) for (const kind of ['floor', 'boss']) {
    const t = generateTrack(s, kind);
    assert.ok(t.rootMidi >= 31 && t.rootMidi <= 42);
    assert.ok(SCALES[t.mode]);
    assert.equal(t.kick.length, 16); assert.equal(t.snare.length, 16); assert.equal(t.hat.length, 16);
    assert.equal(t.bass.length, 16); assert.equal(t.arp.length, 16); assert.equal(t.lead.length, 32);
    assert.equal(t.kick[0], 1, 'downbeat kick');
    assert.ok(t.snare[4] && t.snare[12], 'backbeat snare');
    assert.ok(t.bass[0] && t.bass[0].iv === 0, 'ostinato starts on the root');
    assert.ok(t.arp.every(i => Number.isInteger(i) && i >= 0 && i < 6));
    assert.ok(t.lead.some(Boolean));
    assert.ok(t.progression.length === 4 && t.progression[0] === 0);
    if (kind === 'boss') { assert.ok(t.bpm >= 138); assert.equal(t.mode, 'phrygian'); } else assert.ok(t.bpm >= 104 && t.bpm < 128);
  }
});

test('chordForBar: root offset follows the scale and wraps around the progression', () => {
  const t = generateTrack(9);
  assert.equal(chordForBar(t, 0).rootSemi, 0);
  assert.deepEqual(chordForBar(t, 0), chordForBar(t, 4));
  for (let bar = 0; bar < 8; bar++) {
    const c = chordForBar(t, bar);
    assert.equal(c.tones.length, 3); assert.equal(c.tones[0], 0);
    assert.ok(c.tones[1] >= 3 && c.tones[1] <= 4 && c.tones[2] >= 6 && c.tones[2] <= 8);
  }
  assert.ok(Math.abs(midiToHz(69) - 440) < 1e-9);
});

test('layersForScene: exploring is sparse, combat adds drums/bass/arp, low health adds the heart', () => {
  const ex = layersForScene('explore'), co = layersForScene('combat'), boss = layersForScene('boss');
  assert.ok(ex.has('pad') && ex.has('pulse') && !ex.has('drums') && !ex.has('bass'));
  assert.ok(['pad', 'drums', 'bass', 'arp'].every(l => co.has(l)) && !co.has('lead'));
  assert.ok(layersForScene('combat', {intensity: .8}).has('lead'));
  assert.ok(['drums', 'bass', 'arp', 'lead'].every(l => boss.has(l)));
  const hurt = layersForScene('combat', {lowHealth: true, intensity: 1});
  assert.ok(hurt.has('heart') && !hurt.has('lead'));
  assert.equal(layersForScene('dead').size, 0);
  assert.ok(layersForScene('extract').has('riser'));
});

test('layer machine: layers enter on the beat and leave on the bar line', () => {
  const m = createLayerMachine();
  m.immediate(layersForScene('explore'));
  m.request(layersForScene('combat'));
  assert.ok(!m.step(1).has('drums'), 'mid-beat: nothing enters');
  assert.ok(!m.step(3).has('drums'));
  assert.ok(m.step(4).has('drums'), 'next beat: drums enter');
  assert.ok(m.step(5).has('pulse'), 'pulse lingers until the bar line');
  m.step(8);m.step(12);assert.ok(m.active.has('pulse'));
  assert.ok(!m.step(16).has('pulse'), 'bar line: removed');
  m.request(layersForScene('explore'));
  assert.ok(m.step(20).has('drums'), 'drums finish the bar');
  assert.ok(!m.step(32).has('drums'));
  assert.deepEqual([...m.immediate(new Set())], []);
});

test('combat tracker: instant in, held 3.5 s out, intensity scales with aware enemies', () => {
  const c = createCombatTracker();
  assert.equal(c.update(.016, 0).combat, false);
  assert.equal(c.update(.016, 1).combat, true);
  assert.equal(c.update(2, 0).combat, true);
  assert.equal(c.update(1.4, 0).combat, true);
  assert.equal(c.update(.2, 0).combat, false);
  assert.ok(c.update(.016, 4).intensity >= 1 - 1e-9);
  assert.equal(c.update(.016, 1, true).boss, true);
  c.reset(); assert.equal(c.update(.016, 0).combat, false);
});

test('sceneFromGame / isLowHealth', () => {
  assert.equal(sceneFromGame({mode: 'title'}), 'title');
  assert.equal(sceneFromGame({mode: 'won'}), 'title');
  assert.equal(sceneFromGame({mode: 'dead', combat: true}), 'dead');
  assert.equal(sceneFromGame({mode: 'play', combat: false}), 'explore');
  assert.equal(sceneFromGame({mode: 'play', combat: true}), 'combat');
  assert.equal(sceneFromGame({mode: 'play', combat: true, boss: true}), 'boss');
  assert.equal(sceneFromGame({mode: 'play', combat: false, extractionOpen: true}), 'extract');
  assert.equal(sceneFromGame({mode: 'play', combat: true, extractionOpen: true}), 'combat');
  assert.equal(isLowHealth(1, 6), true);
  assert.equal(isLowHealth(2, 6), true);
  assert.equal(isLowHealth(4, 6), false);
  assert.equal(isLowHealth(0, 6), false);
  assert.equal(isLowHealth(NaN, 6), false);
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
    assert.ok(ev.delay >= 5 && ev.delay <= 15 && ['thud', 'clank', 'pipe', 'whine'].includes(ev.type));
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

test('beatAt: the heard beat lags the scheduler by the lookahead and advances four steps at a time', () => {
  const dur = stepDuration(120, 1); // 125 ms
  const a = beatAt({step: 8, nextTime: 10, now: 10 - dur * 0, bpm: 120});
  assert.equal(a.index, 2); assert.equal(a.phase, 0);
  const lag = beatAt({step: 8, nextTime: 10.1, now: 10, bpm: 120}); // 100 ms ahead = 0.8 step
  assert.equal(lag.index, 1); assert.ok(lag.phase > 0.8 && lag.phase < 0.9);
  assert.equal(beatAt({step: 2, nextTime: 20, now: 0, bpm: 120}).index, 0, 'never negative');
  const slow = beatAt({step: 4, nextTime: 1, now: 0.5, bpm: 120, rate: 0.5}); // a step lasts 250 ms: 2 steps behind
  assert.equal(slow.index, 0); assert.ok(Math.abs(slow.phase - 0.5) < 1e-9);
});
