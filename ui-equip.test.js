import test from 'node:test';
import assert from 'node:assert/strict';
import {EMBLEMS, emblemFor, sampleWave, WAVES, flapHtml, gaugeHtml, vuHtml} from './ui-art.js';
import {dialPos, springStep, STATION_ORDER, dialFreq} from './tuner-ui.js';
import {flapValue} from './panel-ui.js';
import {UPGRADES, STATIONS, offerFrequencies} from './frequencies.js';
import {freqOfferHtml, decisionHtml} from './meta-ui.js';

test('every frequency upgrade has its own drawn emblem', () => {
  for (const u of UPGRADES) assert.ok(EMBLEMS[u.effect], `missing emblem for ${u.effect}`);
});
test('emblemFor falls back to the station emblem', () => {
  assert.match(emblemFor('nope', 'carrier'), /<svg/);
});
test('every station has a distinct waveform within -1..1', () => {
  const seen = new Set();
  for (const s of STATIONS) {
    const w = sampleWave(s.id, 1.3, 64);
    assert.ok(w.every(y => y >= -1 && y <= 1), s.id);
    seen.add(w.map(v => v.toFixed(2)).join());
  }
  assert.equal(seen.size, STATIONS.length);
  assert.ok(Math.max(...sampleWave('nightshift', 1, 64).map(Math.abs)) < 0.35, 'night shift is a whisper');
  assert.ok(sampleWave('feedback', 1, 96).some(y => Math.abs(y) === 0.82), 'feedback clips');
  assert.equal(typeof WAVES.static(0.3, 0.2), 'number');
});
test('dial positions are ordered and inside the band', () => {
  const pos = STATION_ORDER.map(dialPos);
  assert.deepEqual([...pos].sort((a, b) => a - b), pos);
  assert.ok(pos[0] > 0.05 && pos.at(-1) < 0.95);
  assert.match(dialFreq(0.5), /^\d+\.\d$/);
});
test('needle spring converges and overshoots', () => {
  let x = 0, v = 0, peak = 0;
  for (let i = 0; i < 240; i++) { ({x, v} = springStep(x, v, 1, 1 / 60)); peak = Math.max(peak, x); }
  assert.ok(Math.abs(x - 1) < 0.01);
  assert.ok(peak > 1.01, 'under-damped: overshoots the station');
});
test('flap drums count up and land exactly on the value', () => {
  assert.equal(flapValue(240, 0), 0);
  assert.ok(flapValue(240, 0.5) > 120 && flapValue(240, 0.5) < 240);
  assert.equal(flapValue(240, 1), 240);
  assert.match(flapHtml(7, {pad: 3}), /data-flap="7"/);
  assert.equal((flapHtml(7, {pad: 3}).match(/class="flap"/g) || []).length, 3);
});
test('gauge and VU markup', () => {
  assert.match(gaugeHtml(0.6), /--to:16\.0deg/);
  assert.equal((vuHtml(2).match(/class="on/g) || []).length, 2);
});
test('tuner markup keeps the ids and attributes game.js relies on', () => {
  const offers = offerFrequencies({unlockedIds: [], owned: {}, rng: () => 0.3});
  const html = freqOfferHtml({offers, owned: {}});
  assert.equal((html.match(/data-freq="/g) || []).length, offers.length);
  assert.match(html, /class="tuner-dial"/);
  assert.equal((html.match(/class="scope"/g) || []).length, offers.length);
});
test('decision markup keeps data-act extract / descend levers', () => {
  const html = decisionHtml({floor: 1, gross: 50, kept: 60, deathKeep: 0.4, nextClear: 20, hp: 3, maxHp: 3});
  assert.match(html, /data-act="extract"/);
  assert.match(html, /data-act="descend"/);
  assert.match(html, /class="cover"/);
});
