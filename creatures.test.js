import test from 'node:test';
import assert from 'node:assert/strict';
import {solveLeg, newCreatureOut} from './creature-core.js';
import {pitchedGrid, rusherKit, RUSHER_SPEC, ELITE_RUSHER_SPEC, bladeModel, BLADE_PITCHES, nearestPitch, flipY, flipZ} from './creature-models.js';
import {bruteKit, BRUTE_SPEC, ELITE_BRUTE_SPEC, hammerModel, HAMMER_PITCHES, nearestHammerPitch} from './brute-models.js';
import {conductorKit, mastModel, MAST_PITCHES, nearestMast, tailModel, TAIL_PITCHES, nearestTail} from './conductor-models.js';
import {rusherPose} from './rusher-pose.js';
import {brutePose, BRUTE_RIG} from './brute-pose.js';
import {conductorPose, conductAt, batonTarget, CONDUCTOR_RIG} from './conductor-pose.js';
import {fidgetAt, IDLE_FIDGETS} from './rig2d.js';
import {VoxelGrid, normalizeModel} from './stack2d.js';

const finite = (out) => { for (let i = 0; i < out.n; i++) { const it = out.items[i]; for (const k of ['x', 'y', 'z', 'yaw', 'key']) assert.ok(Number.isFinite(it[k]), `item ${i}.${k} = ${it[k]}`); assert.ok(it.model || it.draw, `item ${i} has neither a model nor a draw fn`); } };

test('solveLeg keeps both bone lengths when the target is reachable and clamps when it is not', () => {
  const k = {};
  solveLeg(0, 0, 4, 5, 3, 0, 5, 6, k);
  const d1 = Math.hypot(k.x, k.y, k.z - 4), d2 = Math.hypot(k.fx - k.x, k.fy - k.y, k.fz - k.z);
  assert.ok(Math.abs(d1 - 5) < 1e-6 && Math.abs(d2 - 6) < 1e-6, `${d1} ${d2}`);
  assert.ok(k.z > 0, 'the default pole bends the knee up');
  solveLeg(0, 0, 4, 40, 0, 0, 5, 6, k);
  assert.ok(Math.hypot(k.fx, k.fy, k.fz - 4) <= 11 + 1e-6, 'unreachable targets clamp to full extension');
  solveLeg(0, 0, 4, 6, 0, 4, 5, 5, k, 0, 1, 0);
  assert.ok(k.y > 0, 'a sideways pole bends the elbow sideways');
});

test('pitchedGrid rotates a part about its joint and keeps it solid', () => {
  const cells = []; for (let a = 0; a < 10; a++) for (let c = 0; c < 2; c++) cells.push([a, 0, c, 'k']);
  const flat = pitchedGrid(cells, 0, 3), up = pitchedGrid(cells, Math.PI / 2, 3);
  assert.ok(flat.grid.w >= 10 && flat.grid.h <= 3);
  assert.ok(up.grid.h >= 10 && up.grid.w <= 4, `${up.grid.w}x${up.grid.h}`);
  assert.ok(up.grid.count() > 10, 'rotated sampling must not leave holes');
  assert.ok(flat.pivot.x >= 0 && flat.pz >= 0);
});

test('flipY mirrors and flipZ turns a grid over', () => {
  const g = new VoxelGrid(3, 4, 2); g.set(0, 0, 0, 'a');
  assert.equal(flipY(g).get(0, 3, 0), 'a'.charCodeAt(0));
  assert.equal(flipZ(g).get(0, 0, 1), 'a'.charCodeAt(0));
});

test('every model kit builds, stays inside the cell budget and is a valid stack model', () => {
  const kits = [rusherKit(RUSHER_SPEC), rusherKit(ELITE_RUSHER_SPEC), bruteKit(BRUTE_SPEC), bruteKit(ELITE_BRUTE_SPEC), conductorKit(0), conductorKit(1), conductorKit(2)];
  for (const kit of kits) for (const [name, m] of Object.entries(kit)) {
    if (!m || !m.grid || !m.id) continue;
    const n = normalizeModel(m);
    assert.ok(n.grid.count() > 0, `${name} is empty`);
    assert.ok(n.grid.count() < 12000, `${m.id} has ${n.grid.count()} cells`);
    assert.ok(m.pivot.x >= 0 && m.pivot.x <= m.grid.w && m.pivot.y >= 0 && m.pivot.y <= m.grid.d, `${m.id} pivot is off its grid`);
  }
  // distinct elite / damage variants must not share cache ids
  const ids = new Set(); for (const kit of kits) for (const m of Object.values(kit)) if (m && m.grid) { assert.ok(!ids.has(m.id), `duplicate id ${m.id}`); ids.add(m.id); }
});

test('pitch variants: nearest picks, models cached per pitch', () => {
  assert.equal(nearestPitch(BLADE_PITCHES[2] + 0.01), 2);
  assert.equal(nearestHammerPitch(10), HAMMER_PITCHES.length - 1);
  assert.equal(nearestMast(1.7), MAST_PITCHES.indexOf(1.75));
  assert.equal(nearestTail(-5), 0);
  assert.equal(bladeModel(RUSHER_SPEC, 1, BLADE_PITCHES[0]), bladeModel(RUSHER_SPEC, 1, BLADE_PITCHES[0]));
  assert.notEqual(bladeModel(RUSHER_SPEC, 1, BLADE_PITCHES[0]).model.id, bladeModel(RUSHER_SPEC, -1, BLADE_PITCHES[0]).model.id);
  assert.ok(hammerModel(BRUTE_SPEC, 0.05).grid === undefined && hammerModel(BRUTE_SPEC, 0.05).model.grid.count() > 100);
  assert.ok(mastModel(0, 1.57).model.grid.h > mastModel(0, 0.12).model.grid.h, 'an upright mast is taller than a fallen one');
  assert.ok(tailModel(2, 1, TAIL_PITCHES[0]).model.grid.count() > 20);
});

test('idle fidgets are filtered per body plan: the humanoid cycle never plays a rusher or brute fidget', () => {
  const human = new Set();
  for (let t = 0; t < 140; t += 0.4) { const f = fidgetAt(t, 3); if (f) human.add(f.fidget.id); }
  assert.ok(human.size >= 3);
  for (const id of human) assert.ok(!id.startsWith('rusher.') && !id.startsWith('brute.'), id);
  const rus = new Set(), bru = new Set();
  for (let t = 0; t < 140; t += 0.2) { const a = fidgetAt(t, 0, 'rusher'), b = fidgetAt(t, 0, 'brute'); if (a) rus.add(a.fidget.id); if (b) bru.add(b.fidget.id); }
  assert.deepEqual([...rus].sort(), ['rusher.groom', 'rusher.scratch', 'rusher.shake', 'rusher.sniff']);
  assert.deepEqual([...bru].sort(), ['brute.knuckles', 'brute.neck', 'brute.roll', 'brute.tap']);
  assert.equal(fidgetAt(0.5, 0, 'rusher'), null, 'nothing plays before the first fidget time');
  assert.ok(IDLE_FIDGETS.every((f) => typeof f.apply === 'function'));
});

test('rusher pose: finite, pooled, tripod gait alternates, wind-up rears up, death flips onto its back', () => {
  const kit = rusherKit(RUSHER_SPEC), out = newCreatureOut();
  const base = {id: 2, t: 1, bodyYaw: 0.4, moveYaw: 0.4};
  rusherPose(kit, {...base, amp: 1, phase: 0.1}, out); finite(out);
  assert.ok(out.n <= out.items.length && out.n > 30, `${out.n} parts`);
  const legZ = (phase) => { rusherPose(kit, {...base, amp: 1, phase}, out); return out.items.slice(0, out.n).filter((i) => i.model === kit.tip).map((i) => i.z); };
  const lifted = (zs) => { const lo = Math.min(...zs); return zs.map((z) => z > lo + 0.4); };
  const a = lifted(legZ(0.05)), b = lifted(legZ(0.30));
  assert.equal(a.length, 6); assert.notDeepEqual(a, b, 'legs swap stance / swing groups across the cycle');
  assert.ok(a.some(Boolean) && a.some((x) => !x), 'some feet are planted while others swing');
  const heightOf = (inp) => { rusherPose(kit, {...base, ...inp}, out); const h = out.items.slice(0, out.n).find((i) => i.model === kit.head || i.model === kit.headInv); return h.z; };
  assert.ok(heightOf({wind: 1}) > heightOf({wind: 0}) + 2, 'the head rises on the wind-up');
  assert.ok(heightOf({lunge: 0.5}) > heightOf({lunge: 0}) + 2, 'the pounce lifts the body');
  rusherPose(kit, {...base, dead: 0.9, deadT: 1.0, spin: 1}, out); finite(out);
  assert.ok(out.items.slice(0, out.n).some((i) => i.model === kit.thoraxInv), 'dead rushers use the belly-up models');
  rusherPose(kit, {...base, dead: 0.1, deadT: 0.1, spin: 1}, out);
  assert.ok(out.items.slice(0, out.n).some((i) => i.model === kit.thorax), 'mid-air they are still right side up');
});

test('brute pose: hammer is keyframed (carry -> overhead -> floor), both hands stay on it, death drops it', () => {
  const kit = bruteKit(BRUTE_SPEC), out = newCreatureOut(), base = {id: 1, t: 1, bodyYaw: 0, moveYaw: 0};
  brutePose(kit, {...base, wind: 0}, out); finite(out);
  const carry = out.hamPitch, carryZ = out.hammerZ;
  brutePose(kit, {...base, wind: 1}, out); finite(out);
  assert.ok(out.hamPitch > 1.45, 'overhead at full wind-up');
  assert.ok(out.hammerZ > carryZ + 8, 'the head is raised high');
  brutePose(kit, {...base, lunge: 0.01}, out); finite(out);
  assert.ok(out.hamPitch < 0.1 && out.hammerZ < 6, `slam ends on the floor (pitch ${out.hamPitch}, z ${out.hammerZ})`);
  assert.ok(carry > 0.5);
  brutePose(kit, {...base, rec: 1}, out); assert.ok(out.hamPitch < 0.2, 'recovery starts with the hammer on the ground');
  const fists = (o) => o.items.slice(0, o.n).filter((i) => i.model === kit.fist).length;
  assert.equal(fists(out), 2);
  brutePose(kit, {...base, dead: 0.8, deadT: 1.0, spin: 1, fallYaw: 0}, out); finite(out);
  assert.ok(out.n > 8);
  assert.ok(BRUTE_RIG.anchorZ > 8);
});

test('conducting: a 4-beat pattern that hits its ictus, the baton reaches by telegraph kind', () => {
  const o = {};
  conductAt(0, 0.0, o); assert.ok(o.z < 12, 'beat 1 is the low ictus'); const down = o.z;
  conductAt(3, 0.0, o); assert.ok(o.z > down + 15, 'beat 4 is the high preparation');
  conductAt(1, 0.0, o); assert.ok(o.th < -0.5, 'beat 2 goes left'); conductAt(2, 0.0, o); assert.ok(o.th > 0.5, 'beat 3 goes right');
  const t = {}, run = (kind, p, extra = {}) => { batonTarget({mode: 'telegraph', kind, telP: p, aimRel: 0.2, t: 1, level: 0, ...extra}, t); return {...t}; };
  assert.ok(run('fan', 0.9).th > run('fan', 0.1).th, 'the fan telegraph sweeps the baton across the arc');
  assert.ok(run('ring', 0.5).z > 28, 'the ring telegraph circles overhead');
  assert.ok(run('charge', 1, {locked: true}).r > run('charge', 0).r, 'locking the charge points the baton at you');
  assert.ok(run('lob', 0.8).z > run('lob', 0.1).z, 'a lob lofts the baton');
  assert.ok(batonTarget({mode: 'beat', stage: 'fire', beatPhase: 0.3}, t).thrust === 1);
  assert.ok(batonTarget({mode: 'shift', t: 1}, t).z > 38);
});

test('conductor pose: finite at every phase / mode, the mast stands then topples, the right arm reaches the baton', () => {
  const out = newCreatureOut(), face = {level: 0, t: 1, tempo: 1, mode: 'idle', beat: 0.2, beatIndex: 0, dead: null, deadT: 0, flash: 0, invuln: false, exposed: false, hurt: 0, voice: 0.5};
  const modes = ['intro', 'idle', 'telegraph', 'attack', 'charge', 'beat', 'recover', 'shift'];
  for (const level of [0, 1, 2]) for (const mode of modes) {
    conductorPose({t: 2, bodyYaw: 0.3, moveYaw: 0.3, amp: 0.5, phase: 0.3, level, mode, kind: 'fan', telP: 0.5, stage: 'mark', aimRel: 0.1, beatIndex: 1, beatPhase: 0.4, amp01: 1, introP: 0.5, dead: null, face}, out); finite(out);
    assert.ok(out.n < out.items.length && out.n > 25, `${level}/${mode}: ${out.n} parts`);
  }
  const mastPitchOf = (deadT) => { conductorPose({t: 2, bodyYaw: 0, level: 2, mode: 'dead', dead: deadT / 2.7, deadT, beatIndex: 0, beatPhase: 0, amp01: 1, face}, out); const mi = out.items.slice(0, out.n).find((i) => i.model && /mast/.test(i.model.id)); return mi.model.id; };
  assert.notEqual(mastPitchOf(0.0), mastPitchOf(1.2), 'the mast model changes pitch variant as it falls');
  conductorPose({t: 2, bodyYaw: 0, level: 1, mode: 'idle', beatIndex: 0, beatPhase: 0.02, amp01: 1, dead: null, face}, out);
  assert.ok(Number.isFinite(out.tipX) && Math.hypot(out.tipX, out.tipY) < 60, 'the baton tip stays within reach');
  assert.ok(CONDUCTOR_RIG.baton > 8);
});
