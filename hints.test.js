import test from 'node:test';
import assert from 'node:assert/strict';
import {pickHint, HINT_DEFS} from './hints.js';

const keys = {reload: 'R', throwableCycle: 'Q', throwableUse: 'G', loadout: 'TAB', moveKeys: ['W', 'A', 'S', 'D']};
const base = {blocked: false, seen: new Set(), runTime: 3, moved: false, moving: false, stillFor: 3, magEmpty: false, reserve: 10, otherHasAmmo: true, hostilesNear: 0, grenades: 0, hasMod: false, scrap: 0};

test('nothing the Signal Check teaches is a hint any more', () => {
  const ids = HINT_DEFS.map(h => h.id);
  for (const taught of ['basics', 'still', 'move', 'beat']) assert.ok(!ids.includes(taught), `${taught} lives in the Signal Check and the manual`);
  assert.equal(pickHint({...base, runTime: 3, moved: true, shots: 1}, keys), null, 'a fresh run shows no tutorial text');
});

test('contextual hints still fire when the situation calls for them', () => {
  assert.equal(pickHint({...base, magEmpty: true}, keys).id, 'reload');
  assert.equal(pickHint({...base, magEmpty: true, reserve: 0}, keys).id, 'swap');
  assert.equal(pickHint({...base, hostilesNear: 2, runTime: 25, grenades: 2}, keys).id, 'grenade');
  assert.equal(pickHint({...base, hasMod: true, runTime: 13}, keys).id, 'loadout');
  assert.equal(pickHint({...base, scrap: 30, runTime: 40}, keys).id, 'scrap');
});

test('a hint is never repeated and blocked contexts show nothing', () => {
  assert.equal(pickHint({...base, magEmpty: true, seen: new Set(['reload'])}, keys), null);
  assert.equal(pickHint({...base, blocked: true, magEmpty: true}, keys), null);
});

test('a hint is skipped once the player has done the action it teaches', () => {
  const seen = new Set(['basics', 'still', 'move', 'beat']);
  const ctx = {...base, seen, runTime: 40, moved: true, hostilesNear: 1, grenades: 1, hasMod: true};
  assert.equal(pickHint({...ctx, done: new Set()}, keys).id, 'grenade');
  assert.equal(pickHint({...ctx, done: new Set(['threw'])}, keys).id, 'loadout');
  assert.equal(pickHint({...ctx, done: new Set(['threw', 'loadout'])}, keys), null);
});

test('non-urgent hints queue during combat; urgent ones still show', () => {
  const seen = new Set(['basics', 'still', 'move', 'beat']);
  const calm = {...base, seen, runTime: 40, moved: true, hostilesNear: 1, grenades: 1};
  assert.equal(pickHint({...calm, inCombat: true}, keys), null);
  assert.equal(pickHint({...calm, inCombat: true, magEmpty: true}, keys).id, 'reload');
});
