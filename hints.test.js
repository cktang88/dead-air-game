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
