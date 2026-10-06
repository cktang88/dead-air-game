import test from 'node:test';
import assert from 'node:assert/strict';
import {pickHint} from './hints.js';

const keys = {reload: 'R', throwableCycle: 'Q', throwableUse: 'G', loadout: 'TAB', moveKeys: ['W', 'A', 'S', 'D']};
const base = {blocked: false, seen: new Set(), runTime: 3, moved: false, moving: false, stillFor: 3, magEmpty: false, reserve: 10, otherHasAmmo: true, hostilesNear: 0, grenades: 0, hasMod: false, scrap: 0};

test('the first hint teaches movement and firing', () => {
  const hint = pickHint({...base}, keys);
  assert.equal(hint.id, 'basics');
  assert.match(hint.text, /\[W\]\[A\]\[S\]\[D\] MOVE · \[CLICK\] FIRE/);
});

test('STAND STILL only appears after the player has moved', () => {
  const seen = new Set(['basics']);
  assert.equal(pickHint({...base, seen, moved: false}, keys), null);
  assert.equal(pickHint({...base, seen, moved: true}, keys).id, 'still');
});

test('blocked contexts show nothing', () => {
  assert.equal(pickHint({...base, blocked: true}, keys), null);
});

test('the beat hint teaches that shots let time through', () => {
  const seen = new Set(['basics', 'still', 'move']);
  assert.equal(pickHint({...base, seen, shots: 1, moved: true}, keys).id, 'beat');
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
