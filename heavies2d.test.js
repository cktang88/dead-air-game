import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeModel} from './stack2d.js';
import {heavyKit, heavyGun, riotBaton, riotShield, riotShieldFlat, HEAVY_TYPES} from './heavy-models2d.js';
import {deadRig, heavyMuzzle, heavyPose, heavyState} from './heavies2d.js';
import {newRigOut, fidgetAt, IDLE_FIDGETS} from './rig2d.js';
import {gunMuzzle} from './sprites2d.js';

test('every heavy kit part and gun model normalises (palette complete)', () => {
  for (const t of HEAVY_TYPES) for (const el of [false, true]) {
    const k = heavyKit(t, el);
    for (const part of ['leg', 'torso', 'head', 'arm', 'gloveL', 'gloveR']) assert.ok(normalizeModel(k[part]).count > 0, `${t}${el} ${part}`);
  }
  for (const t of ['guard', 'sniper']) { const g = heavyGun(t); assert.ok(normalizeModel(g.body).count > 0); assert.ok(normalizeModel(g.aux).count > 0); }
  assert.ok(normalizeModel(riotBaton().body).count > 0);
  for (let c = 0; c < 4; c++) { assert.ok(normalizeModel(riotShield(c)).count > 0); assert.ok(normalizeModel(riotShieldFlat(c)).count > 0); }
});

test('cracks add cells to the shield', () => {
  const n = (c) => riotShield(c).grid.v.filter((x) => x === 'C'.charCodeAt(0)).length;
  assert.equal(n(0), 0); assert.ok(n(1) > 0 && n(2) > n(1) && n(3) > n(2));
});

test('muzzle length matches gunMuzzle for the stacked guns', () => {
  const descs = {guard: {visual: {length: 27}}, sniper: {visual: {length: 52}}};
  for (const t of ['guard', 'sniper']) {
    assert.ok(Math.abs(heavyGun(t).geo.L + 5 - gunMuzzle(descs[t])) < 1e-9);
    assert.ok(Math.abs(heavyMuzzle({type: t}) - gunMuzzle(descs[t])) < 1e-9);
    assert.ok(heavyMuzzle({type: t, elite: true}) > heavyMuzzle({type: t}));
  }
});

test('fidgets are filtered by actor kind', () => {
  const kinds = {guard: 'w-', sniper: 's-', riot: 'r-'};
  for (const [kind, pre] of Object.entries(kinds)) for (let seed = 0; seed < 6; seed++) for (let slot = 0; slot < 8; slot++) {
    const f = fidgetAt(IDLE_FIDGETS[0].from + slot * 6.5 + 0.1, seed, kind);
    assert.ok(f && !f.fidget.id.startsWith(kinds[kind === 'guard' ? 'sniper' : 'guard']) && f.fidget.id !== 'antenna', `${kind} ${f && f.fidget.id}`);
    void pre;
  }
});

test('the lying pose spreads head and legs about the torso and rests on the floor', () => {
  const out = newRigOut();
  for (const t of HEAVY_TYPES) {
    deadRig(t, false, 1, 0, 0, out);
    const kit = heavyKit(t, false), by = (m) => out.items.slice(0, out.n).filter((i) => i.model === m);
    const torso = by(kit.torso)[0], head = by(kit.head)[0];
    assert.ok(Math.hypot(head.x - torso.x, head.y - torso.y) > 6, t + ' head apart from torso');
    assert.equal(by(kit.leg).length, 2);
    assert.ok(out.items.slice(0, out.n).every((i) => i.z < 3), t + ' everything on the floor');
  }
});

test('heavyPose fills parts without throwing for each type and state', () => {
  const out = newRigOut();
  for (const type of HEAVY_TYPES) for (const elite of [false, true]) {
    const e = {type, elite, id: 2, aimTimer: 0.2, meleeWindup: type === 'riot' ? 0.2 : 0, stun: 0, shieldFlash: 0.2, shieldAng: 0.4};
    const v = {ang: 0.3, mv: 1, phase: 0.2, kick: 1, punch: 0, flash: 0, aimMax: 1, speed: 80, lunge: 0.5, brace: 1, cracks: 2};
    heavyPose(e, v, 5, out, {});
    assert.ok(out.n >= 10 && out.n <= 30, `${type} parts ${out.n}`);
    for (let i = 1; i < out.n; i++) assert.ok(out.items[i - 1].key <= out.items[i].key);
  }
  const s = heavyState({aimTimer: 0.25, meleeWindup: 0}, {aimMax: 1}, 3);
  assert.ok(Math.abs(s.aimP - 0.75) < 1e-9);
});
