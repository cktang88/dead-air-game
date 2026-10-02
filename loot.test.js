import test from 'node:test';
import assert from 'node:assert/strict';
import {lootTierForRoll} from './loot.js';

test('loot rolls span common, uncommon, rare, and prototype tiers at fixed thresholds',()=>{
  assert.equal(lootTierForRoll(0),'common');
  assert.equal(lootTierForRoll(.75),'uncommon');
  assert.equal(lootTierForRoll(.95),'rare');
  assert.equal(lootTierForRoll(.995),'prototype');
});

test('Lucky Find moves the same roll toward higher tiers without guaranteeing rarity',()=>{
  assert.equal(lootTierForRoll(.74,0),'common');
  assert.equal(lootTierForRoll(.74,1),'uncommon');
  assert.equal(lootTierForRoll(.97,0),'rare');
  assert.equal(lootTierForRoll(.97,3),'rare');
  assert.equal(lootTierForRoll(.999,3),'prototype');
});

test('loot tier rolls stay valid for malformed numbers and clamp upgrade levels',()=>{
  assert.equal(lootTierForRoll(NaN,NaN),'common');
  assert.equal(lootTierForRoll(2,99),'prototype');
  assert.equal(lootTierForRoll(-1,-1),'common');
});
