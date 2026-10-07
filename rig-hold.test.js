import test from 'node:test';
import assert from 'node:assert/strict';
import {humanoidPose, newRigOut, RIG} from './rig2d.js';
import {kitFor, gunStack, gunGeometry} from './models2d.js';
import {gunMuzzle, gunReach} from './sprites2d.js';
import {muzzleDistance} from './feel.js';
import {GUNS} from './catalog.js';

const byId = (id) => GUNS.find((g) => g.id === id);
const SHOULDER_W = 2 * RIG.shoulder.y;

test('long guns are the dominant shape: well past the hands, sniper / AMR longest', () => {
  const L = (id) => gunGeometry(byId(id)).L;
  for (const id of ['ar_ash', 'shotgun', 'launcher']) assert.ok(L(id) >= 1.9 * SHOULDER_W, `${id} ${L(id)}`);   // >= ~2 shoulder widths
  assert.ok(L('sniper_lynx') > L('ar_ash') && L('sniper_mule') > L('sniper_lynx'));
  assert.ok(L('pistol_9') < 0.5 * L('ar_ash'));
});

test('every muzzle distance agrees: gunMuzzle, feel.muzzleDistance and the rig muzzle', () => {
  const kit = kitFor('player'), out = newRigOut();
  for (const gun of GUNS) {
    assert.ok(Math.abs(gunMuzzle(gun) - muzzleDistance(gun)) < 1e-9, gun.id);
    humanoidPose(kit, {bodyYaw: 0.4, aimYaw: 0.4, gunModel: gunStack(gun, {}), gunGeo: gunGeometry(gun)}, out);
    assert.ok(Math.abs(Math.hypot(out.muzzleX, out.muzzleY) - gunMuzzle(gun)) < 1e-6, gun.id);
  }
  assert.equal(gunReach(byId('pistol_9')), 11);
  assert.equal(gunReach(byId('ar_ash')), 5);
});

test('arms are one smooth limb per side and the hands sit on the gun grip points', () => {
  const kit = kitFor('player'), out = newRigOut();
  for (const id of ['pistol_9', 'ar_ash', 'sniper_lynx']) {
    const gun = byId(id), geo = gunGeometry(gun);
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      humanoidPose(kit, {bodyYaw: a, aimYaw: a, gunModel: gunStack(gun, {}), gunGeo: geo}, out);
      const limbs = [], hands = [];
      for (let i = 0; i < out.n; i++) { const it = out.items[i]; if (it.draw && it.draw.name === 'drawLimb') limbs.push(it); if (it.draw && it.draw.name === 'drawHand') hands.push(it); }
      assert.equal(limbs.length, 2); assert.equal(hands.length, 2);
      for (const l of limbs) {
        const p = l.p, reach = Math.hypot(p[6] - p[0], p[7] - p[1]);
        assert.ok(reach < 2 * Math.hypot(p[3] - p[0], p[4] - p[1]) + 1e-6, 'elbow bends the right way');
        const h = hands.find((x) => Math.abs(x.p[0] - p[6]) < 1e-9 && Math.abs(x.p[1] - p[7]) < 1e-9);
        assert.ok(h, 'a glove at each wrist');
      }
    }
  }
});
