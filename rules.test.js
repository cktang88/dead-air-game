import test from 'node:test';
import assert from 'node:assert/strict';
import {BASE_CARRY_CAPACITY, GUNS} from './catalog.js';
import {canCarryWeapons, chooseEncounterTypes, damageDurability, reloadSeconds, timeScale, weaponLoadoutWeight, weaponStats} from './rules.js';
import {META_UPGRADES, awardCoins, emptyProgress, parseProgress, progressionStats, purchaseUpgrade, runCoinPayout} from './progression.js';

test('time is slow while waiting, fast during action, and held still in menus',()=>{
  const base={mode:'play',paused:false,loadoutOpen:false,moving:false,firing:false,now:10,lastAction:5};
  assert.equal(timeScale(base),0.18);
  assert.equal(timeScale({...base,moving:true}),1.32);
  assert.equal(timeScale({...base,firing:true}),1.32);
  assert.equal(timeScale({...base,lastAction:9.8}),1.32);
  assert.equal(timeScale({...base,lastAction:9.5}),0.18);
  assert.equal(timeScale({...base,idleScale:0.15}),0.15);
  assert.equal(timeScale({...base,paused:true}),0);
  assert.equal(timeScale({...base,loadoutOpen:true}),0);
  assert.equal(timeScale({...base,mode:'dead'}),0);
});

test('gun mods change the weapon values consumed by combat',()=>{
  const base=weaponStats(GUNS[0],new Set());
  const mods=new Set(['extended','hollow','stabilizer','longbarrel','suppressor']);
  const upgraded=weaponStats(GUNS[0],mods);
  assert.equal(base.magazine,18);
  assert.equal(upgraded.magazine,27);
  assert.equal(upgraded.damage,29.700000000000003);
  assert.equal(upgraded.fireRate,0.1394);
  assert.equal(upgraded.projectileSpeed,745.2);
  assert.equal(upgraded.spread,0.0385);
  assert.equal(reloadSeconds(new Set()),1.65);
  assert.equal(reloadSeconds(new Set(['extended'])),1.85);
  assert.equal(reloadSeconds(new Set(['stabilizer'])),1.25);
});

test('room encounter rolls vary by seed and stay bounded by room capacity',()=>{
  const first=chooseEncounterTypes(4,301);
  assert.deepEqual(chooseEncounterTypes(4,301),first);
  assert.notDeepEqual(chooseEncounterTypes(4,302),first);
  assert.equal(first.length,4);
  assert.ok(first.every(type=>['chaser','gunner','guard','brute'].includes(type)));
});

test('crate durability loses health per hit and never drops below zero',()=>{
  let hp=60;
  hp=damageDurability(hp,18);
  assert.equal(hp,42);
  hp=damageDurability(hp,50);
  assert.equal(hp,0);
  assert.equal(damageDurability(60,-10),60);
});

test('weapon choices use a visible carry budget',()=>{
  assert.equal(weaponLoadoutWeight([0,1],GUNS),5.5);
  assert.equal(canCarryWeapons([0,1],GUNS,BASE_CARRY_CAPACITY),true);
  assert.equal(canCarryWeapons([1,2],GUNS,BASE_CARRY_CAPACITY),false);
  assert.equal(canCarryWeapons([0,1],GUNS,BASE_CARRY_CAPACITY-1.5),true);
  assert.equal(canCarryWeapons([0,2],GUNS,BASE_CARRY_CAPACITY-1.5),false);
});

test('run coins reward death and extraction while upgrades persist as capped levels',()=>{
  const deathPayout=runCoinPayout({won:false,roomsCleared:2,kills:4});
  const winPayout=runCoinPayout({won:true,roomsCleared:2,kills:4});
  assert.equal(deathPayout,29);
  assert.equal(winPayout,79);
  let progress=awardCoins(emptyProgress(),winPayout);
  const purchase=purchaseUpgrade(progress,'carryrig');
  assert.equal(purchase.purchased,true);
  progress=purchase.progress;
  assert.equal(progress.coins,44);
  assert.equal(progressionStats(progress).carryCapacity,8);
  const restored=parseProgress(JSON.stringify(progress));
  assert.deepEqual(restored,progress);
  assert.equal(parseProgress('{bad json').coins,0);
  assert.equal(META_UPGRADES.find(item=>item.id==='carryrig').costs.length,3);
});

test('an upgrade purchase cannot spend too few coins or go past its final tier',()=>{
  const poor=emptyProgress();
  assert.equal(purchaseUpgrade(poor,'runner').purchased,false);
  let progress={...poor,coins:1000,upgrades:{...poor.upgrades,runner:3}};
  const result=purchaseUpgrade(progress,'runner');
  assert.equal(result.purchased,false);
  assert.equal(result.progress.coins,1000);
});

test('permanent upgrades change only their run stats and save data is sanitized',()=>{
  const base=progressionStats(emptyProgress());
  assert.deepEqual(base,{moveSpeed:112,idleScale:.18,carryCapacity:BASE_CARRY_CAPACITY,crateDropChance:.35});
  const restored=parseProgress(JSON.stringify({version:1,coins:-4,upgrades:{runner:1,carryrig:99,unknown:3}}));
  assert.equal(restored.coins,0);
  assert.equal(restored.upgrades.carryrig,3);
  assert.equal(restored.upgrades.unknown,undefined);
  assert.deepEqual(progressionStats(restored),{moveSpeed:118.72,idleScale:.18,carryCapacity:BASE_CARRY_CAPACITY+3,crateDropChance:.35});
});
