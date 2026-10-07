import test from 'node:test';
import assert from 'node:assert/strict';
import {UPGRADES, STATIONS, CROSSFADES, MAX_RANK, STAT_DEFAULTS, freqStats, pickFrequency, offerFrequencies, activeCrossfades, stationLevel, availableUpgrades} from './frequencies.js';

const seq = (seed = .3) => { let v = seed; return () => (v = (v * 9301 + .49297) % 1); };
const everything = UPGRADES.map(u => `freq:${u.id}`);

test('every rank only sets known stats, and ranks 2 and 3 change behavior (a new stat or different text), not just one number', () => {
  for (const u of UPGRADES) {
    for (const [i, r] of u.ranks.entries()) {
      for (const k of Object.keys(r.fx)) assert.ok(k in STAT_DEFAULTS, `${u.id} rank ${i + 1} sets unknown stat ${k}`);
      assert.ok(r.desc.length > 10 && r.desc.length < 130, `${u.id} rank ${i + 1} desc is one plain line`);
    }
    for (const i of [1, 2]) {
      const prev = Object.keys(u.ranks[i - 1].fx), now = Object.keys(u.ranks[i].fx);
      const addsStat = now.some(k => !prev.includes(k));
      const changesNumber = now.some(k => u.ranks[i].fx[k] !== u.ranks[i - 1].fx[k]);
      assert.ok(changesNumber || addsStat, `${u.id} rank ${i + 1} must change something`);
    }
    const twistRanks = u.ranks.slice(1).filter(r => /^(Twist|Flourish)/.test(r.desc));
    assert.equal(twistRanks.length, 2, `${u.id}: ranks 2 and 3 are labelled twist and flourish`);
  }
});

test('the description is generated from the same values freqStats hands to the game', () => {
  const s = freqStats({arc: 1});
  assert.equal(s.chain, .5);
  assert.match(UPGRADES.find(u => u.id === 'arc').ranks[0].desc, /50%/);
  assert.match(UPGRADES.find(u => u.id === 'bounce').ranks[2].desc, new RegExp(`${freqStats({bounce: 3}).ricochet} times`));
  assert.match(UPGRADES.find(u => u.id === 'distortion').ranks[0].desc, /45%/);
  assert.match(UPGRADES.find(u => u.id === 'silent').ranks[2].desc, /75%/);
  assert.equal(freqStats({silent: 3}).noiseMult, .25);
  assert.match(UPGRADES.find(u => u.id === 'borrowed').ranks[1].desc, /1\.5 s/);
  assert.equal(freqStats({borrowed: 2}).hitCredit, 1.5);
  assert.equal(freqStats({freeze: 2}).hangUntilMove, 1);
  assert.match(UPGRADES.find(u => u.id === 'freeze').ranks[1].desc, /until you move/);
  assert.equal(freqStats({}).bubbleSlow, 1);
  assert.equal(freqStats({}).coneRange, 1);
});

test('time-refund effects are one upgrade (BORROWED TIME), not four near-duplicates', () => {
  const ids = UPGRADES.map(u => u.id);
  for (const gone of ['adrenaline', 'last_stand', 'reload_kill', 'cold_cash']) assert.ok(!ids.includes(gone), gone);
  const refunders = UPGRADES.filter(u => u.ranks.some(r => 'creditPerKill' in r.fx || 'hitCredit' in r.fx || 'lastStand' in r.fx));
  assert.deepEqual(refunders.map(u => u.id), ['borrowed']);
});

test('each station has several upgrades, free ones to start, and the effects each hold are distinct', () => {
  for (const s of STATIONS) {
    const own = UPGRADES.filter(u => u.station === s.id);
    assert.ok(own.length >= 3, s.id);
    assert.ok(own.filter(u => u.unlockCost === null).length >= 2, `${s.id} starts with two choices`);
  }
  assert.equal(new Set(UPGRADES.map(u => u.effect)).size, UPGRADES.length);
  assert.equal(new Set(UPGRADES.map(u => u.name)).size, UPGRADES.length);
});

test('no frequency pays plain ammo or plain scrap: every one is a behavior with a visible trigger', () => {
  for (const u of UPGRADES) for (const r of u.ranks) assert.ok(!/scrap|refill/i.test(r.desc), u.id);
});

test('offers lean toward held stations: a held-station card whenever one exists, never more than two per station', () => {
  const rng = seq(.37);
  for (let n = 0; n < 200; n++) {
    const offer = offerFrequencies({owned: {arc: 1, through: 1}, unlockedIds: everything, rng});
    assert.equal(offer.length, 3);
    assert.ok(offer.some(o => o.station === 'static' || o.station === 'carrier'), 'a held-station card is on the table');
    const by = {}; for (const o of offer) by[o.station] = (by[o.station] || 0) + 1;
    assert.ok(Object.values(by).every(c => c <= 2));
    assert.equal(new Set(offer.map(o => o.id)).size, 3);
  }
});

test('a fresh build is offered three different stations', () => {
  const rng = seq(.52);
  for (let n = 0; n < 50; n++) assert.equal(new Set(offerFrequencies({unlockedIds: everything, rng}).map(o => o.station)).size, 3);
});

test('crossfades actually come up: a build one card away is offered the completer most of the time', () => {
  const rng = seq(.21); let hits = 0;
  for (let n = 0; n < 100; n++) if (offerFrequencies({owned: {arc: 2, through: 1}, unlockedIds: everything, rng}).some(o => o.crossfades.length)) hits++;
  assert.ok(hits >= 55, `crossfade completer offered ${hits}/100`);
});

test('every crossfade is reachable and has a one-line description', () => {
  for (const c of CROSSFADES) {
    assert.ok(c.desc.length < 120);
    const owned = {};
    for (const s of c.stations) { const u = UPGRADES.find(x => x.station === s && x.unlockCost === null); owned[u.id] = 2; }
    assert.ok(activeCrossfades(owned).some(x => x.id === c.id), c.id);
  }
});

test('RED LINE and ECHO expose the stats the game reads at the moment of the shot', () => {
  assert.equal(freqStats({rage: 3}).rageBlast, 48);
  assert.equal(freqStats({rage: 1}).rageBlast, 0);
  assert.equal(freqStats({loop: 3}).echoCount, 2);
  assert.equal(stationLevel({rage: 2, loop: 1}, 'feedback'), 3);
  assert.ok(availableUpgrades([], {}).length >= 9);
  assert.equal(MAX_RANK, 3);
  assert.equal(pickFrequency({}, 'backlash').backlash, 1);
});
