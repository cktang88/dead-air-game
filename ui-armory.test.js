import test from 'node:test';
import assert from 'node:assert/strict';
import {analogMeters, needleAngle, gaugeSvg} from './ui-art.js';
import {rackHtml, binsHtml, modChipHtml} from './armory-ui.js';
import {rmsToLevel, ballistic, segmentTone, knobAngle, VU_SEGMENTS} from './desk-ui.js';
import {hasTray, trayHeight} from './tray2d.js';
import {GUNS, MODS, SHOTGUN_SHELLS} from './catalog.js';

test('analog meters: fractions are 0..1, ghost only when comparing', () => {
  const ms = analogMeters(GUNS[0], GUNS);
  assert.deepEqual(ms.map(m => m.id), ['damage', 'rate', 'range', 'noise']);
  assert.ok(ms.every(m => m.frac >= 0 && m.frac <= 1 && m.ghost === null));
  const vs = analogMeters(GUNS[0], GUNS, {versus: GUNS[1]});
  assert.ok(vs.every(m => typeof m.ghost === 'number'));
  assert.equal(needleAngle(0), -75); assert.equal(needleAngle(1), 75);
  assert.match(gaugeSvg(vs[0]), /needle ghost/);
});
test('a suppressor lowers the noise needle', () => {
  const sup = MODS.find(m => m.id === 'suppressor');
  assert.ok(analogMeters(GUNS[0], GUNS, {mod: sup})[3].value < analogMeters(GUNS[0], GUNS)[3].value);
});
test('armory markup: a peg per gun with canvas and chip socket; bins for shells and grenades', () => {
  const slot = (g, i, active) => ({slot: i, index: GUNS.indexOf(g), gun: g, active, slotLabel: 'PRIMARY', mod: null, modDef: null, ammo: 1, mag: 2, reserve: 3, swapText: '0.30 S', color: '#fff'});
  const slots = [slot(GUNS[0], 0, true), slot(GUNS[1], 1, false)];
  const html = rackHtml(slots, GUNS, slots[0]);
  assert.equal((html.match(/data-stack="gun"/g) || []).length, 2);
  assert.match(html, /modchip empty/); assert.match(html, /Ghost needle/);
  assert.match(modChipHtml(MODS[0]), /--c:#/);
  const bins = binsHtml({shells: SHOTGUN_SHELLS, shellId: 'slug', throwables: [{id: 'smoke', name: 'Smoke Grenade', count: 2}, {id: 'frag', name: 'Frag Grenade', count: 0}]});
  assert.match(bins, /data-shell="buckshot"/); assert.match(bins, /disabled aria-pressed="true"/); assert.match(bins, /data-dim="1"/);
});
test('VU maths: silence is empty, full scale is full, release is slower than attack', () => {
  assert.equal(rmsToLevel(0), 0); assert.equal(rmsToLevel(1), 1);
  assert.ok(rmsToLevel(0.1) > rmsToLevel(0.01));
  assert.ok(ballistic(0, 1, 0.05) > 1 - ballistic(1, 0, 0.05));
  assert.equal(segmentTone(0), 0); assert.equal(segmentTone(VU_SEGMENTS - 1), 2);
  assert.equal(knobAngle(0), -135); assert.equal(knobAngle(100), 135);
});
test('tray prompts only for gun and mod targets that carry item data', () => {
  assert.ok(hasTray({kind: 'gun', gunRef: GUNS[0]})); assert.ok(!hasTray({kind: 'gun'})); assert.ok(!hasTray({kind: 'door'}));
  assert.ok(trayHeight({kind: 'gun'}) > 100);
});
