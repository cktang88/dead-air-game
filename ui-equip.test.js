import test from 'node:test';
import assert from 'node:assert/strict';
import {EMBLEMS, emblemFor, sampleWave, WAVES, flapHtml, gaugeHtml, vuHtml} from './ui-art.js';
import {browseIndex} from './pick-ui.js';
import {flapValue} from './panel-ui.js';
import {UPGRADES, STATIONS, offerFrequencies} from './frequencies.js';
import {freqOfferHtml, decisionHtml, buildStripHtml} from './meta-ui.js';

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
test('arrow keys browse the three cards and wrap', () => {
  assert.equal(browseIndex(0, 3, 'ArrowRight'), 1);
  assert.equal(browseIndex(2, 3, 'ArrowRight'), 0);
  assert.equal(browseIndex(0, 3, 'ArrowLeft'), 2);
  assert.equal(browseIndex(1, 3, 'x'), 1);
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
test('upgrade pick markup keeps the attributes game.js relies on and reads in plain language', () => {
  const offers = offerFrequencies({unlockedIds: [], owned: {}, rng: () => 0.3});
  const html = freqOfferHtml({offers, owned: {}});
  assert.equal((html.match(/data-freq="/g) || []).length, offers.length);
  assert.equal((html.match(/class="plate-effect"/g) || []).length, offers.length);
  assert.match(html, /class="pbadge new">NEW</);
  assert.doesNotMatch(html.replace(/<[^>]*>/g, ' '), /MHz|TUNE|FREQUENC|CROSSFADE|STATION|SIGNAL/i);
  assert.doesNotMatch(html, /tuner-dial|class="scope"/);
  const lvl = offerFrequencies({unlockedIds: [], owned: {arc: 1}, rng: () => 0.01});
  const up = freqOfferHtml({offers: lvl, owned: {arc: 1}});
  assert.match(up, /LEVEL UP 1→2/);
  assert.match(up, /LEVEL 2\/3/);
  assert.match(up, /Combos with|COMBO UNLOCKED/);
});
test('build strip chips are plain: name, level numeral, family, effect in the tooltip', () => {
  const html = buildStripHtml({arc: 2, through: 2, rage: 1});
  assert.match(html, /CHAIN LIGHTNING <b>II<\/b>/);
  assert.match(html, /Level 2\/3: Lightning chains to 2 enemies/);
  assert.match(html, /COMBO · STORM RICOCHET/);
});
test('decision markup keeps data-act extract / descend levers', () => {
  const html = decisionHtml({floor: 1, gross: 50, kept: 60, deathKeep: 0.4, nextClear: 20, hp: 3, maxHp: 3});
  assert.match(html, /data-act="extract"/);
  assert.match(html, /data-act="descend"/);
  assert.match(html, /class="cover"/);
});
