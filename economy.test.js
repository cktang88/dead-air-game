import test from 'node:test';
import assert from 'node:assert/strict';
import {ammoStatus, nextLoadedSlot, ammoPickupRounds, supplyDrop, clearHealAmount, clearAmmoDrop, cooldownReady, objectiveText} from './economy.js';

test('ammoStatus flags dry, last mag and ok', () => {
  assert.equal(ammoStatus({mag: 0, reserve: 0, magSize: 6}), 'dry');
  assert.equal(ammoStatus({mag: 3, reserve: 0, magSize: 6}), 'last');
  assert.equal(ammoStatus({mag: 0, reserve: 6, magSize: 6}), 'last');
  assert.equal(ammoStatus({mag: 6, reserve: 30, magSize: 6}), 'ok');
});
test('nextLoadedSlot skips dry guns and wraps', () => {
  const ammo = {0: 0, 1: 4, 2: 0}, reserve = {0: 0, 1: 0, 2: 0};
  assert.equal(nextLoadedSlot([0, 1], 0, ammo, reserve), 1);
  assert.equal(nextLoadedSlot([0, 1, 2], 2, ammo, reserve), 1);
  assert.equal(nextLoadedSlot([0, 2], 0, ammo, reserve), -1);
  assert.equal(nextLoadedSlot([0], 0, ammo, reserve), -1);
});
test('ammoPickupRounds is a percent with a floor', () => {
  assert.equal(ammoPickupRounds(30, 0.35), 11);
  assert.equal(ammoPickupRounds(8, 0.1), 4);
});
test('supplyDrop respects need and source', () => {
  const calm = {health: 5, maxHealth: 5, ammoLow: false, armorUseful: false};
  assert.equal(supplyDrop(0.99, 'kill', calm), null);
  assert.equal(supplyDrop(0.05, 'kill', calm), 'ammo');
  assert.equal(supplyDrop(0.2, 'kill', calm), null);
  assert.equal(supplyDrop(0.15, 'crate', calm), 'ammo');
  const hurt = {health: 1, maxHealth: 5, ammoLow: true, armorUseful: true};
  assert.equal(supplyDrop(0.27, 'kill', hurt), 'ammo', 'low on ammo, kills drop ammo about 45% of the time');
  assert.equal(supplyDrop(0.5, 'kill', hurt), 'heal');
  assert.equal(supplyDrop(0.5, 'crate', hurt), 'ammo');
  assert.equal(supplyDrop(0.99, 'crate', calm), null);
  assert.equal(supplyDrop(0.21, 'kill', {...calm, armorUseful: true}), null);
  assert.equal(supplyDrop(0.19, 'kill', {...calm, armorUseful: true}), 'armor');
});
test('clearHealAmount only helps at half health or below', () => {
  assert.equal(clearHealAmount({health: 5, maxHealth: 5}), 0);
  assert.equal(clearHealAmount({health: 4, maxHealth: 5}), 0);
  assert.equal(clearHealAmount({health: 2, maxHealth: 5}), 1);
  assert.equal(clearHealAmount({health: 1, maxHealth: 5}), 2);
});
test('a cleared room pays ammo only when a gun is running dry', () => {
  assert.equal(clearAmmoDrop({ammoLow: true}), true);
  assert.equal(clearAmmoDrop({ammoLow: false}), false);
});
test('there is no regeneration export: one healing system', async () => {
  const economy = await import('./economy.js');
  assert.equal(economy.shouldRegen, undefined);
  assert.equal(economy.regenCap, undefined);
});
test('cooldownReady dedupes by key', () => {
  const m = {};
  assert.equal(cooldownReady(m, 'a', 0, 2), true);
  assert.equal(cooldownReady(m, 'a', 1, 2), false);
  assert.equal(cooldownReady(m, 'b', 1, 2), true);
  assert.equal(cooldownReady(m, 'a', 2.5, 2), true);
});
test('objectiveText walks from clearing to extraction', () => {
  assert.equal(objectiveText({routeRoomsLeft: 3, routeHostiles: 7, here: 0, exitReady: false}).text, 'CLEAR THE ROUTE · 3 ROOMS LEFT');
  assert.equal(objectiveText({routeRoomsLeft: 1, routeHostiles: 2, here: 2, exitReady: false}).text, 'CLEAR THIS ROOM · 2 HOSTILES · 1 ROOM LEFT');
  assert.deepEqual(objectiveText({routeRoomsLeft: 0, routeHostiles: 0, exitReady: true, exitMeters: 41.6}), {tone: 'go', text: 'REACH EXTRACTION · 42 M'});
});
test('objectiveText explains the stealth-friendly exit rule', () => {
  assert.equal(objectiveText({routeRoomsLeft: 2, routeHostiles: 2, here: 0, exitReady: true, exitMeters: 10, unawareLeft: 2}).text, 'REACH EXTRACTION · 10 M · 2 UNAWARE LEFT BEHIND');
  assert.equal(objectiveText({routeRoomsLeft: 1, routeHostiles: 3, here: 0, exitReady: false, awareLeft: 2}).text, '2 HOSTILES HUNTING YOU · KILL OR LOSE THEM');
  assert.equal(objectiveText({routeRoomsLeft: 1, routeHostiles: 1, here: 0, exitReady: false, exitRoomHostiles: 1}).text, 'CLEAR THE EXTRACTION ROOM · 1 HOSTILE');
});
