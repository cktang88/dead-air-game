import test from 'node:test';
import assert from 'node:assert/strict';
import {FLOOR_LOOKS, applyFloorLook, floorLook, mixHex} from './floor-palette.js';

const mk = () => [
  {role: 'entry', theme: {floor: 'concrete', tint: '#2b2a33', accent: '#62e1ad', lights: {color: '#62e1ad'}, decor: [{kind: 'light', color: '#62e1ad'}]}},
  {role: 'hazard', theme: {floor: 'hazard', tint: '#2b2226', accent: '#ff5367', decor: []}},
  {role: 'combat', theme: {floor: 'carpet', tint: '#272a35', accent: '#6fa8dc', decor: []}},
];

test('every floor has a distinct palette', () => {
  const ids = new Set(), accents = new Set();
  for (const n of [1, 2, 3, 4]) { ids.add(floorLook(n).id); accents.add(floorLook(n).accent); }
  assert.equal(ids.size, 4); assert.equal(accents.size, 4);
  assert.equal(floorLook(99), FLOOR_LOOKS[4]); assert.equal(floorLook(0), FLOOR_LOOKS[1]);
});

test('entry rooms take the floor accent fully, gameplay colours only lean', () => {
  const entries = [1, 2, 3, 4].map(n => applyFloorLook(mk(), n)[0].theme);
  assert.equal(new Set(entries.map(t => t.accent)).size, 4);
  for (const [i, t] of entries.entries()) assert.equal(t.accent, floorLook(i + 1).accent);
  const hazard = applyFloorLook(mk(), 2)[1].theme;
  assert.notEqual(hazard.accent, floorLook(2).accent, 'a killbox stays recognisably red-ish');
});

test('materials and lamps are remapped per floor', () => {
  const f3 = applyFloorLook(mk(), 3);
  assert.equal(f3[0].theme.floor, 'vault');
  assert.equal(f3[0].theme.lights.color, f3[0].theme.accent);
  assert.equal(f3[0].theme.decor[0].color, f3[0].theme.accent);
  assert.equal(applyFloorLook(mk(), 2)[2].theme.floor, 'grate');
  assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080');
});
