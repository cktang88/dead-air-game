import test from 'node:test';
import assert from 'node:assert/strict';
import {propSpec, propLive, PROP_H} from './prop-stack2d.js';
import {spawnPiece, stepDebris, spawnCrateDebris, debrisState} from './item-stack2d.js';

const J = (s = '') => ({n: s.includes('n'), s: s.includes('s'), e: s.includes('e'), w: s.includes('w')});
const tile = (style, extra = {}) => ({tx: 5, ty: 6, kind: style === 'concrete' ? 'pillar' : 'wall', style, accent: '#5ad0e6', room: {cx: 40}, seed: 7, run: 0, j: J(), ...extra});

test('every cover style has a prop spec; unknown styles fall back to the painter', () => {
  for (const s of ['concrete', 'hazard', 'beacon', 'vault', 'sandbag', 'jersey', 'jersey-hazard', 'partition', 'rack', 'server', 'desk']) assert.ok(propSpec(tile(s, {j: J('we')})), s);
  assert.ok(propSpec(tile('bed', {j: J('s')})));
  assert.equal(propSpec(tile('nothing')), null);
});

test('2-tile props are drawn from their first tile only and a lone bed tile keeps the painter', () => {
  assert.equal(propSpec(tile('desk', {run: 1, j: J('w')})).skip, true);
  assert.ok(!propSpec(tile('desk', {run: 0, j: J('e')})).skip);
  assert.equal(propSpec(tile('bed', {run: 1, j: J('n')})).skip, true);
  assert.equal(propSpec(tile('bed', {run: 0, j: J()})), null);
});

test('cache keys separate join masks but not unrelated tile positions of a run', () => {
  const a = propSpec(tile('sandbag', {j: J('we'), tx: 4})).key, b = propSpec(tile('sandbag', {j: J('we'), tx: 8})).key, c = propSpec(tile('sandbag', {j: J('e'), tx: 4})).key;
  assert.equal(a, b); assert.notEqual(a, c);
});

test('prop heights are sane (readable cover, never taller than a wall)', () => {
  for (const [k, h] of Object.entries(PROP_H)) assert.ok(h >= 5 && h <= 24, k);
});

test('animated parts exist for servers, desks and beds and sit above the footprint', () => {
  let any = 0;
  for (let tx = 0; tx < 12; tx++) { const l = propLive(tile('server', {tx, ty: 3, j: J('we')})); if (l) { any++; for (const it of l) assert.ok(it.y < 3 * 32 + 32 && it.x >= tx * 32 - 1 && it.x <= tx * 32 + 33); } }
  assert.ok(any > 0);
  assert.ok(propLive(tile('desk', {j: J('e')})).some((i) => i.type === 'crt'));
  assert.ok(propLive(tile('bed', {j: J('s')})).some((i) => i.type === 'beep'));
  assert.equal(propLive(tile('sandbag', {j: J('we')})), null);
});

test('crate debris falls, bounces, settles flat and then expires', () => {
  const p = spawnPiece('plank', 100, 100, 12, 80, 0, 120, () => 0.5);
  assert.ok(p.on);
  let airborne = true, t = 0;
  while (t < 3) { stepDebris(1 / 60); t += 1 / 60; if (p.z === 0 && p.rest) { airborne = false; break; } }
  assert.equal(airborne, false);
  assert.ok(p.x > 100);
  for (let i = 0; i < 60 * 12; i++) stepDebris(1 / 60);
  assert.equal(p.on, false);
});

test('a crate break spawns a bounded burst', () => {
  for (let i = 0; i < 200; i++) stepDebris(1 / 30);
  spawnCrateDebris(0, 0); spawnCrateDebris(10, 10); spawnCrateDebris(20, 20);
  assert.ok(debrisState.live === 0 || debrisState.live <= 72);
  stepDebris(1 / 60);
  assert.ok(debrisState.live > 10 && debrisState.live <= 72);
});
