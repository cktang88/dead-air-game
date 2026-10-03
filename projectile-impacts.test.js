import test from 'node:test';
import assert from 'node:assert/strict';
import {GUNS} from './catalog.js';
import {weaponPenetration} from './rules.js';
import {resolveProjectileImpacts} from './projectile-impacts.js';

const targets = (kind, count) => Array.from({length: count}, (_, index) => ({
  t: (index + 1) / (count + 1), kind, target: `${kind}-${index + 1}`,
}));

test('a sniper hits four enemies in sequence and the fifth hit stops the round', () => {
  const gun = GUNS.find(item => item.id === 'sniper_lynx');
  const result = resolveProjectileImpacts(targets('enemy', 5), weaponPenetration(gun, new Map()));

  assert.deepEqual(result.impacts.map(hit => hit.target), ['enemy-1', 'enemy-2', 'enemy-3', 'enemy-4', 'enemy-5']);
  assert.deepEqual(result.penetration, {...gun.penetration, enemies: 0});
  assert.equal(result.stopped, true);
});

test('sniper and anti-materiel rounds apply separate enemy and crate budgets', () => {
  const sniper = GUNS.find(item => item.id === 'sniper_quill');
  const mule = GUNS.find(item => item.id === 'sniper_mule');
  const mixedTargets = [
    {t: .1, kind: 'crate', target: 'crate-near'},
    {t: .2, kind: 'enemy', target: 'enemy-near'},
    {t: .3, kind: 'wall', target: 'wall'},
    {t: .4, kind: 'crate', target: 'crate-far'},
    {t: .5, kind: 'enemy', target: 'enemy-far'},
  ];

  const sniperResult = resolveProjectileImpacts(mixedTargets, weaponPenetration(sniper, new Map()));
  assert.deepEqual(sniperResult.impacts.map(hit => hit.target), ['crate-near', 'enemy-near', 'wall']);
  assert.equal(sniperResult.stopped, true, 'a standard sniper round stops at a wall');

  const muleResult = resolveProjectileImpacts(mixedTargets, weaponPenetration(mule, new Map()));
  assert.deepEqual(muleResult.impacts.map(hit => hit.target), mixedTargets.map(hit => hit.target));
  assert.equal(muleResult.stopped, false);
});

test('ordinary hits damage the first target then stop; cover and player contacts always stop', () => {
  const noPenetration = {enemies: 0, crates: 0, walls: 0};
  const ordinary = resolveProjectileImpacts([
    {t: .1, kind: 'enemy', target: 'near'},
    {t: .2, kind: 'enemy', target: 'far'},
  ], noPenetration);
  assert.deepEqual(ordinary.impacts.map(hit => hit.target), ['near']);
  assert.equal(ordinary.stopped, true);

  for (const kind of ['cover', 'player']) {
    const contact = resolveProjectileImpacts([
      {t: .1, kind, target: 'blocker'},
      {t: .2, kind: 'enemy', target: 'behind'},
    ], {enemies: 5, crates: 5, walls: 5});
    assert.deepEqual(contact.impacts.map(hit => hit.target), ['blocker']);
    assert.equal(contact.stopped, true);
  }
});

test('impact order uses the earliest swept contact without mutating candidates', () => {
  const near = {t: .1, kind: 'enemy', target: 'near'};
  const middle = {t: .6, kind: 'enemy', target: 'middle'};
  const far = {t: .9, kind: 'enemy', target: 'far'};
  const candidates = [far, middle, near];
  const result = resolveProjectileImpacts(candidates, {enemies: 1, crates: 0, walls: 0});

  assert.deepEqual(result.impacts, [near, middle]);
  assert.equal(result.stopped, true);
  assert.deepEqual(candidates, [far, middle, near]);
});
