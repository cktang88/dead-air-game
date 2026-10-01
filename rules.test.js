import test from 'node:test';
import assert from 'node:assert/strict';
import {BASE_CARRY_CAPACITY, GUNS} from './catalog.js';
import {canCarryWeapons, chooseEncounterTypes, damageDurability, reloadSeconds, timeScale, weaponLoadoutWeight, weaponStats} from './rules.js';

test('time is slow while waiting, fast during action, and held still in menus',()=>{
  const base={mode:'play',paused:false,loadoutOpen:false,moving:false,firing:false,now:10,lastAction:5};
  assert.equal(timeScale(base),0.18);
  assert.equal(timeScale({...base,moving:true}),1.32);
  assert.equal(timeScale({...base,firing:true}),1.32);
  assert.equal(timeScale({...base,lastAction:9.8}),1.32);
  assert.equal(timeScale({...base,lastAction:9.5}),0.18);
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
});
