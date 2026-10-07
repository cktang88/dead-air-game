import test from 'node:test';
import assert from 'node:assert/strict';
import {VoxelGrid, bucketIndex, bucketYaw, layerShade, voxelColor, normalizeModel, tintVariant, darkVariant, hexMix, hexMul, STACK_TILT, STACK_CONFIG} from './stack2d.js';
import {solveElbow, fidgetAt, humanoidPose, newRigOut, IDLE_FIDGETS, registerIdleFidget, RIG} from './rig2d.js';
import {kitFor, gunStack, gunGeometry} from './models2d.js';
import {gunMuzzle} from './sprites2d.js';
import {GUNS} from './catalog.js';

const TAU = Math.PI * 2;

test('yaw buckets wrap and round trip', () => {
  assert.equal(bucketIndex(0, 48), 0);
  assert.equal(bucketIndex(TAU, 48), 0);
  assert.equal(bucketIndex(-Math.PI / 24, 48), 47);
  assert.equal(bucketIndex(Math.PI, 48), 24);
  for (let i = 0; i < 48; i++) assert.equal(bucketIndex(bucketYaw(i, 48), 48), i);
});

test('lower slices are darker and exposed tops are lighter', () => {
  assert.ok(layerShade(0) < layerShade(0.5) && layerShade(0.5) < layerShade(1));
  assert.ok(layerShade(0) > 0.5 && layerShade(1) <= 1);
  const lit = voxelColor('#406080', 0.6, true), shaded = voxelColor('#406080', 0.6, false);
  const sum = (c) => c.match(/\d+/g).reduce((a, v) => a + +v, 0);
  assert.ok(sum(lit) > sum(shaded));
});

test('VoxelGrid box / ellipsoid / mirror / rows round trip', () => {
  const g = new VoxelGrid(6, 6, 3);
  g.box(1, 1, 0, 3, 3, 2, 'a');
  assert.equal(g.count(), 8);
  assert.ok(g.has(1, 1, 0) && !g.has(3, 3, 0));
  g.mirrorY();
  assert.equal(g.count(), 16);
  assert.ok(g.has(1, 4, 0));
  const e = new VoxelGrid(9, 9, 9).ellipsoid(4.5, 4.5, 4.5, 3, 3, 3, 'b');
  assert.ok(e.has(4, 4, 4) && !e.has(0, 0, 0));
  // symmetric about the centre
  assert.equal(e.has(2, 4, 4), e.has(6, 4, 4));
  const rows = g.layerRows(0);
  assert.equal(rows.length, 6);
  const back = VoxelGrid.fromLayers([rows, g.layerRows(1), g.layerRows(2)]);
  assert.equal(back.count(), g.count());
  g.set(0, 0, 0, 'z'); g.replace('z', 'y');
  assert.equal(g.get(0, 0, 0), 'y'.charCodeAt(0));
  g.set(0, 0, 0, '.');
  assert.ok(!g.has(0, 0, 0));
  g.set(99, 99, 99, 'a');   // out of range is ignored
});

test('topCoat paints only cells with nothing above', () => {
  const g = new VoxelGrid(2, 2, 3).box(0, 0, 0, 2, 2, 2, 'a');
  g.set(0, 0, 2, 'a');
  g.topCoat('a', 'T');
  assert.equal(g.get(1, 1, 1), 'T'.charCodeAt(0));
  assert.equal(g.get(0, 0, 1), 'a'.charCodeAt(0));
  assert.equal(g.get(0, 0, 2), 'T'.charCodeAt(0));
});

test('normalizeModel accepts voxel strings, grids and procedural slices', () => {
  const a = normalizeModel({id: 'a', layers: [['aa', 'aa'], ['a.', '..']], palette: {a: '#fff'}});
  assert.equal(a.kind, 'vox'); assert.equal(a.count, 2); assert.equal(a.height, 2);
  assert.ok(a.radius > 0);
  const g = normalizeModel({id: 'g', unit: 0.5, layerH: 0.5, grid: new VoxelGrid(4, 4, 5).box(0, 0, 0, 4, 4, 5, 'x'), palette: {x: {c: '#000', emit: true}}});
  assert.equal(g.count, 5); assert.equal(g.height, 2.5); assert.equal(g.palette.x.emit, true);
  assert.ok(Math.abs(g.radius - Math.hypot(2, 2) * 0.5) < 1e-9);
  const d = normalizeModel({id: 'd', size: {w: 10, h: 6}, slices: [{z: 3, draw() {}}, {z: 0, draw() {}}]});
  assert.equal(d.kind, 'draw'); assert.equal(d.count, 4);
  assert.deepEqual(d.slices.map((s) => s.z), [0, 3]);
});

test('variants mix and darken colours', () => {
  assert.equal(hexMix('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(hexMul('#ff8000', 0.5), '#804000');
  assert.notEqual(tintVariant('elite', '#ff0000', 0.2).key, tintVariant('elite', '#ff0000', 0.3).key);
  assert.equal(darkVariant('dead', 0.5).fn('#ffffff'), '#808080');
});

test('stack tilt and config are sane', () => {
  assert.ok(STACK_TILT > 0.3 && STACK_TILT < 1.2);
  assert.ok(STACK_CONFIG.kinds.has('player') && STACK_CONFIG.kinds.has('gunner'));
});

test('two-bone elbow keeps both bones at their length and flares to the arm side', () => {
  for (const side of [1, -1]) {
    const e = solveElbow(0, 0, 9, 3, 6.4, side, 0);
    assert.ok(Math.abs(Math.hypot(e.x, e.y) - 6.4) < 1e-6);
    assert.ok(Math.abs(Math.hypot(e.x - 9, e.y - 3) - 6.4) < 1e-6);
  }
  const r = solveElbow(0, 0, 8, 0, 6.4, 1, 0), l = solveElbow(0, 0, 8, 0, 6.4, -1, 0);
  assert.ok(r.y > 0 && l.y < 0);
  // out of reach: the elbow lands on the line
  const far = solveElbow(0, 0, 30, 0, 6.4, 1, 0);
  assert.ok(Math.abs(far.x - 15) < 1e-6 && Math.abs(far.y) < 0.5);
});

test('idle fidgets start after a still period, one per slot, and can be extended', () => {
  assert.equal(fidgetAt(0), null);
  assert.equal(fidgetAt(2), null);
  const f = fidgetAt(IDLE_FIDGETS[0].from + 0.5, 0);
  assert.equal(f.fidget.id, IDLE_FIDGETS[0].id);
  assert.ok(f.u > 0 && f.u < 1);
  assert.equal(fidgetAt(IDLE_FIDGETS[0].from + 6.0, 0), null);   // between fidgets
  const n = IDLE_FIDGETS.length;
  registerIdleFidget({id: 'test-egg', from: 99, dur: 1, apply() {}});
  assert.equal(IDLE_FIDGETS.length, n + 1);
  IDLE_FIDGETS.pop();
});

test('humanoid pose places the muzzle on gunMuzzle and stays allocation-free', () => {
  for (const kind of ['player', 'gunner']) {
    const kit = kitFor(kind), out = newRigOut();
    for (const gun of [GUNS[0], GUNS.find((g) => g.id === 'sniper_lynx'), GUNS.find((g) => g.id === 'shotgun')]) {
      const geo = gunGeometry(gun), model = gunStack(gun, {});
      humanoidPose(kit, {bodyYaw: 0, aimYaw: 0, gunModel: model, gunGeo: geo, kick: 0}, out);
      assert.ok(Math.abs(out.muzzleX - gunMuzzle(gun)) < 1e-6, `${kind}/${gun.id}`);
      assert.ok(Math.abs(out.muzzleY) < 1e-6);
      assert.ok(out.n >= 8 && out.n <= out.items.length);
      // aiming down: the muzzle follows the aim
      humanoidPose(kit, {bodyYaw: Math.PI / 2, aimYaw: Math.PI / 2, gunModel: model, gunGeo: geo}, out);
      assert.ok(Math.abs(out.muzzleY - gunMuzzle(gun)) < 1e-6 && Math.abs(out.muzzleX) < 1e-6);
    }
    // items are depth sorted
    for (let i = 1; i < out.n; i++) assert.ok(out.items[i - 1].key <= out.items[i].key);
  }
});

test('walking moves the feet and bobs the torso; death topples the parts', () => {
  const kit = kitFor('player'), a = newRigOut(), b = newRigOut();
  humanoidPose(kit, {amp: 1, phase: 0.25, moveYaw: 0}, a);
  humanoidPose(kit, {amp: 1, phase: 0.75, moveYaw: 0}, b);
  const legsA = a.items.filter((i) => i.model === kit.leg), legsB = b.items.filter((i) => i.model === kit.leg);
  assert.equal(legsA.length, 2);
  assert.ok(Math.abs(legsA[0].x - legsB[0].x) > 2 || Math.abs(legsA[1].x - legsB[1].x) > 2);
  const dead = newRigOut();
  humanoidPose(kit, {dead: 1, fallYaw: 0}, dead);
  const head = dead.items.find((i) => i.model === kit.head), torso = dead.items.find((i) => i.model === kit.torso);
  assert.ok(head.x > torso.x && head.z < RIG.headZ * 0.8);
  assert.ok(dead.items.every((i) => i.model !== kit.arm));
});

test('gun models: muzzle length follows visual.length and mag can be left out', () => {
  const gun = GUNS[0];
  const full = gunStack(gun, {}), noMag = gunStack(gun, {noMag: true});
  assert.notEqual(full, noMag);
  assert.equal(gunStack(gun, {}), full);   // cached
  assert.ok(full.grid.count() >= noMag.grid.count());
  assert.ok(Math.abs(gunGeometry(gun).L - gun.visual.length * 0.7) < 1e-9);
});
