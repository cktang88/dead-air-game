import test from 'node:test';
import assert from 'node:assert/strict';
import {cacheRewardAvailable} from './cache-rewards.js';

test('cache options appear only when their reward can help the current run',()=>{
  const state={health:3,maxHealth:5,ammo:0,magazine:18,reserve:20,maxReserve:72,hasUpgrade:true};
  for(const choice of ['ammo','health','upgrade','prototype','scrap'])assert.equal(cacheRewardAvailable(choice,state),true);
  assert.equal(cacheRewardAvailable('health',{...state,health:5}),false);
  assert.equal(cacheRewardAvailable('upgrade',{...state,hasUpgrade:false}),false);
  assert.equal(cacheRewardAvailable('prototype',{...state,health:1}),false);
});

test('a scrap fallback stays usable when every other cache reward is exhausted',()=>{
  const full={health:5,maxHealth:5,ammo:18,magazine:18,reserve:72,maxReserve:72,hasUpgrade:false};
  assert.deepEqual(['ammo','health','upgrade','prototype'].map(choice=>cacheRewardAvailable(choice,full)),[false,false,false,false]);
  assert.equal(cacheRewardAvailable('scrap',full),true);
});
