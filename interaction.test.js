import test from 'node:test';
import assert from 'node:assert/strict';
import {activeInteraction, collectInteractables, collectPopup, promptParts, nearestHostileRoom, RANGE} from './interaction.js';
import {HINT_DEFS, pickHint, loadSeen, saveSeen} from './hints.js';

const rooms = [{cx: 5, cy: 5, role: 'entry'}, {cx: 20, cy: 5, role: 'merchant'}, {cx: 40, cy: 5, role: 'combat'}];
const base = (o = {}) => ({player: {x: 100, y: 100}, scrap: 10, gates: [], pickups: [], rooms, enemies: [], guns: [{name: 'HARDLINE', category: 'ASSAULT RIFLE'}], tile: 32, ...o});

test('gate is unaffordable with a reason, affordable once scrap suffices', () => {
  const gate = {x: 3, y: 3, cost: 30, opened: false};
  let t = collectInteractables(base({gates: [gate]})).find(x => x.kind === 'gate');
  assert.equal(t.inRange, true); assert.equal(t.enabled, false); assert.equal(t.reason, 'NEED 30 SCRAP · HAVE 10');
  t = collectInteractables(base({gates: [gate], scrap: 30})).find(x => x.kind === 'gate');
  assert.equal(t.enabled, true); assert.equal(t.reason, '');
  assert.equal(promptParts(t).cost, '30 SCRAP');
});
test('opened gates are not interactable', () => {
  assert.equal(collectInteractables(base({gates: [{x: 3, y: 3, cost: 5, opened: true}]})).some(x => x.kind === 'gate'), false);
});
test('cache is blocked while its room has hostiles', () => {
  const pickups = [{kind: 'cache', x: 110, y: 100, roomIndex: 2, available: true}];
  const enemies = [{alive: true, roomIndex: 2}, {alive: true, roomIndex: 2}, {alive: false, roomIndex: 2}];
  const t = collectInteractables(base({pickups, enemies})).find(x => x.kind === 'cache');
  assert.equal(t.enabled, false); assert.match(t.reason, /CLEAR ROOM FIRST \(2 HOSTILES\)/);
  assert.equal(collectInteractables(base({pickups})).find(x => x.kind === 'cache').enabled, true);
});
test('gun pickup names the gun; auto pickups are not keyed', () => {
  const pickups = [{kind: 'gun', gunIndex: 0, x: 110, y: 100, available: true}, {kind: 'scrap', value: 12, x: 105, y: 100, available: true}];
  const ts = collectInteractables(base({pickups}));
  assert.equal(ts.find(x => x.kind === 'gun').subject, 'HARDLINE');
  assert.equal(ts.find(x => x.kind === 'pickup').keyed, false);
  assert.equal(activeInteraction(ts).kind, 'gun');
});
test('priority: gate beats cache beats station when overlapping', () => {
  const ts = collectInteractables(base({player: {x: 160, y: 160}, gates: [{x: 4, y: 4, cost: 1}], pickups: [{kind: 'cache', x: 165, y: 160, roomIndex: 0, available: true}]}));
  assert.equal(activeInteraction(ts).kind, 'gate');
});
test('out of range targets are labelled but not active; far ones omitted', () => {
  const ts = collectInteractables(base({player: {x: 100, y: 100}, gates: [{x: 10, y: 3, cost: 5}, {x: 100, y: 100, cost: 5}]}));
  assert.equal(ts.find(x => x.id === 'gate:10,3').inRange, false);
  assert.equal(ts.some(x => x.id === 'gate:100,100'), false);
});
test('market and workbench prompts', () => {
  const m = collectInteractables(base({player: {x: 20 * 32 + 16, y: 5 * 32 + 16}})).find(x => x.kind === 'market');
  assert.equal(m.inRange, true); assert.equal(promptParts(m, 'F').head, 'TRADE BLACK MARKET'); assert.equal(promptParts(m, 'F').key, 'F');
  assert.equal(RANGE.station, 110);
});
test('exit reports hostiles on the route', () => {
  const t = collectInteractables(base({pickups: [{kind: 'exit', x: 120, y: 100, available: true}], enemies: [{alive: true, roomIndex: 2}]})).find(x => x.kind === 'exit');
  assert.equal(t.enabled, false); assert.match(t.reason, /1 HOSTILE LEFT/); assert.equal(t.keyed, false);
});
test('popup text and hostile room finder', () => {
  assert.equal(collectPopup('scrap', 12), '+12 SCRAP'); assert.equal(collectPopup('heal', 1), '+1 ♥'); assert.equal(collectPopup('ammo', 30), '+30 AMMO');
  const h = nearestHostileRoom({player: {x: 0, y: 0}, rooms, enemies: [{alive: true, roomIndex: 2}]});
  assert.equal(h.index, 2); assert.equal(h.hostiles, 1);
});
test('hints: one at a time, once, gated on context', () => {
  const keys = {reload: 'R', throwableCycle: 'Q', throwableUse: 'G', loadout: 'TAB'};
  const ctx = {blocked: false, seen: new Set(['basics']), moved: true, runTime: 5, moving: false, stillFor: 1, magEmpty: false, reserve: 10, otherHasAmmo: true, hostilesNear: 0, grenades: 2, hasMod: true, scrap: 0};
  assert.equal(pickHint(ctx, keys).id, 'still');
  ctx.seen.add('still'); assert.equal(pickHint(ctx, keys), null);
  assert.equal(pickHint({...ctx, moving: true}, keys).id, 'move');
  assert.equal(pickHint({...ctx, magEmpty: true}, keys).text, '[R] RELOAD');
  assert.equal(pickHint({...ctx, magEmpty: true, reserve: 0}, keys).id, 'swap');
  assert.equal(pickHint({...ctx, blocked: true, magEmpty: true}, keys), null);
  assert.ok(HINT_DEFS.length >= 6);
});
test('hint storage tolerates failures', () => {
  assert.equal(loadSeen({getItem() { throw new Error('x'); }}).size, 0);
  const mem = {}; const st = {getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }};
  saveSeen(st, new Set(['a'])); assert.deepEqual([...loadSeen(st)], ['a']);
  saveSeen({setItem() { throw new Error('x'); }}, new Set(['a']));
});

test('claimed cache is shown as CLAIMED and cannot be activated', () => {
  const pickups = [{kind: 'cache', x: 110, y: 100, roomIndex: 2, available: true, claimed: true}];
  const ts = collectInteractables(base({pickups}));
  assert.equal(ts.some(x => x.kind === 'cache'), false);
  assert.equal(ts.find(x => x.kind === 'claimed').subject, 'CACHE · CLAIMED');
  assert.notEqual(activeInteraction(ts)?.kind, 'claimed');
});
test('supply locker prompt reads BUY AMMO with a scrap cost, and disables when full or broke', () => {
  const pickups = [{kind: 'locker', x: 110, y: 100, available: true}];
  let t = collectInteractables(base({pickups, scrap: 50, ammo: {reserve: 0, maxReserve: 30}})).find(x => x.kind === 'locker');
  assert.equal(t.enabled, true); assert.equal(promptParts(t).head, 'BUY AMMO'); assert.equal(promptParts(t).cost, '21 SCRAP');
  t = collectInteractables(base({pickups, scrap: 5, ammo: {reserve: 0, maxReserve: 30}})).find(x => x.kind === 'locker');
  assert.equal(t.enabled, false); assert.match(t.reason, /NEED 21 SCRAP/);
  t = collectInteractables(base({pickups, scrap: 50, ammo: {reserve: 30, maxReserve: 30}})).find(x => x.kind === 'locker');
  assert.equal(t.enabled, false); assert.equal(t.reason, 'AMMO FULL'); assert.equal(promptParts(t).cost, '');
});
