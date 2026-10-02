import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_ACTIVE_PARTICLES, particleBurstBudget} from './particles.js';

test('particle bursts evict the oldest overflow and keep the newest burst within budget',()=>{
  assert.deepEqual(particleBurstBudget(230,20),{spawn:20,evict:10});
  assert.deepEqual(particleBurstBudget(MAX_ACTIVE_PARTICLES,1),{spawn:1,evict:1});
  assert.deepEqual(particleBurstBudget(12,500,80),{spawn:80,evict:12});
  assert.deepEqual(particleBurstBudget(3,0,2),{spawn:0,evict:1});
});

test('particle burst budgeting safely clamps invalid and negative counts',()=>{
  assert.deepEqual(particleBurstBudget(-5,4,10),{spawn:4,evict:0});
  assert.deepEqual(particleBurstBudget(NaN,Infinity,NaN),{spawn:0,evict:0});
  assert.deepEqual(particleBurstBudget(4.9,2.8,5.7),{spawn:2,evict:1});
});
