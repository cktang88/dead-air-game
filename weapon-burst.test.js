import test from 'node:test';
import assert from 'node:assert/strict';
import {GUNS} from './catalog.js';
import {advanceWeaponBurst,beginWeaponBurst} from './weapon-burst.js';

test('KITE BURST has a timed profile without changing shotgun pellet semantics',()=>{
  const kite=GUNS.find(gun=>gun.id==='smg_burst'),shotgun=GUNS.find(gun=>gun.id==='shotgun');
  assert.deepEqual(kite.burst,{shots:3,interval:.075});
  assert.equal(kite.count,undefined);
  assert.equal(shotgun.count,5);
});

test('a three-round burst emits one round at each committed interval and respects trigger ammo',()=>{
  let burst=beginWeaponBurst({weaponIndex:4,shots:3,interval:.08,firstShotAt:1,remainingAmmo:5});
  assert.deepEqual(burst,{weaponIndex:4,shotsRemaining:2,interval:.08,nextShotAt:1.08});
  let step=advanceWeaponBurst(burst,{weaponIndex:4,now:1.079,ammo:5});
  assert.equal(step.shots,0);
  step=advanceWeaponBurst(step.burst,{weaponIndex:4,now:1.08,ammo:5});
  assert.equal(step.shots,1);
  assert.equal(step.burst.shotsRemaining,1);
  step=advanceWeaponBurst(step.burst,{weaponIndex:4,now:1.16,ammo:4});
  assert.deepEqual(step,{burst:null,shots:1});
});

test('a burst clips to rounds actually available after the first shot',()=>{
  const burst=beginWeaponBurst({weaponIndex:4,shots:3,interval:.08,firstShotAt:0,remainingAmmo:1});
  assert.equal(burst.shotsRemaining,1);
  assert.deepEqual(advanceWeaponBurst(burst,{weaponIndex:4,now:.08,ammo:1}),{burst:null,shots:1});
  assert.equal(beginWeaponBurst({weaponIndex:4,shots:3,interval:.08,firstShotAt:0,remainingAmmo:0}),null);
});

test('switching weapons cancels queued rounds and delayed updates cannot spend empty ammo',()=>{
  const burst=beginWeaponBurst({weaponIndex:4,shots:3,interval:.08,firstShotAt:0,remainingAmmo:2});
  assert.deepEqual(advanceWeaponBurst(burst,{weaponIndex:2,now:.2,ammo:12}),{burst:null,shots:0});
  assert.deepEqual(advanceWeaponBurst(burst,{weaponIndex:4,now:.2,ammo:0}),{burst:null,shots:0});
  assert.deepEqual(advanceWeaponBurst(burst,{weaponIndex:4,now:.2,ammo:1}),{burst:null,shots:1});
});
