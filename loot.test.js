import test from 'node:test';
import assert from 'node:assert/strict';
import {GUNS, MODS, modFits} from './catalog.js';
import {VARIANT_WEIGHT, gunDropWeight, pickGunIndex, pickModId} from './loot.js';
import {droppableGunIds, unlockedGunIds} from './unlocks.js';
import {emptyProgress} from './progression.js';
import {freqStats, pickFrequency} from './frequencies.js';

const indexOf = id => GUNS.findIndex(g => g.id === id);

test('variants are rare drops: base guns weigh 1, variants a fraction that LUCKY FIND raises', () => {
  const base = GUNS.find(g => !g.variantOf), variant = GUNS.find(g => g.variantOf);
  assert.equal(gunDropWeight(base), 1);
  assert.equal(gunDropWeight(variant), VARIANT_WEIGHT);
  assert.ok(gunDropWeight(variant, 3) > gunDropWeight(variant, 0));
  assert.ok(gunDropWeight(variant, 3) < 1, 'even a lucky variant stays rarer than a base gun');
  assert.equal(gunDropWeight(variant, NaN), VARIANT_WEIGHT);
});

test('pickGunIndex follows the weights and tolerates bad input', () => {
  const candidates = [indexOf('machine'), indexOf('smg_vector')];
  assert.equal(pickGunIndex(candidates, 0), candidates[0]);
  assert.equal(pickGunIndex(candidates, .99), candidates[1]);
  let variants = 0;
  for (let i = 0; i < 1000; i++) if (pickGunIndex(candidates, i / 1000) === candidates[1]) variants++;
  assert.ok(variants > 120 && variants < 260, `variant share ${variants}/1000 should be about ${Math.round(VARIANT_WEIGHT / (1 + VARIANT_WEIGHT) * 1000)}`);
  assert.equal(pickGunIndex([], .5), undefined);
  assert.equal(pickGunIndex(candidates, NaN), candidates[0]);
  assert.equal(pickGunIndex(candidates, 7), candidates[1]);
});

test('mod drops have no tiers: every mod is equally common and a gun filters the ones it cannot take', () => {
  const seen = new Set();
  for (let i = 0; i < MODS.length; i++) seen.add(pickModId((i + .5) / MODS.length));
  assert.deepEqual([...seen].sort(), MODS.map(m => m.id).sort());
  const launcher = GUNS.find(g => g.id === 'launcher');
  for (let i = 0; i < 40; i++) assert.ok(modFits(launcher, pickModId(i / 40, launcher)));
  assert.ok(pickModId(NaN));
});

test('the drop pool is the unlocked guns plus every run-only variant', () => {
  const progress = emptyProgress();
  const pool = droppableGunIds(progress);
  for (const id of unlockedGunIds(progress)) assert.ok(pool.has(id));
  for (const gun of GUNS.filter(g => g.variantOf)) assert.ok(pool.has(gun.id), `${gun.id} drops from the start`);
  assert.equal(pool.has('launcher'), false, 'locked base guns stay locked');
  assert.equal(unlockedGunIds(progress).has('smg_vector'), false, 'variants are never in the shop pool');
});

test('KINDLING is the frequency half of the old incendiary', () => {
  assert.equal(freqStats({}).burnKill, 0);
  assert.equal(freqStats(pickFrequency({}, 'kindle')).burnKill, 70);
});
