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
