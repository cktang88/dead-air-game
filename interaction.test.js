import test from 'node:test';
import assert from 'node:assert/strict';
import {activeInteraction, collectInteractables, collectPopup, promptParts, nearestHostileRoom, RANGE} from './interaction.js';
import {HINT_DEFS, pickHint, loadSeen, saveSeen} from './hints.js';

const rooms = [{cx: 5, cy: 5, role: 'entry'}, {cx: 20, cy: 5, role: 'combat'}, {cx: 40, cy: 5, role: 'combat'}];
const base = (o = {}) => ({player: {x: 100, y: 100}, scrap: 10, gates: [], pickups: [], rooms, enemies: [], guns: [{name: 'HARDLINE', verb: 'STEADY', category: 'ASSAULT RIFLE'}, {name: 'KITE BURST', verb: 'BURST', category: 'SMG'}, {name: 'TALON .45', verb: 'PUNCH', category: 'PISTOL'}], tile: 32, ...o});

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
test('supply drop is blocked while its room has hostiles', () => {
  const pickups = [{kind: 'supply', x: 110, y: 100, roomIndex: 2, available: true}];
  const enemies = [{alive: true, roomIndex: 2}, {alive: true, roomIndex: 2}, {alive: false, roomIndex: 2}];
  const t = collectInteractables(base({pickups, enemies})).find(x => x.kind === 'supply');
  assert.equal(t.enabled, false); assert.match(t.reason, /CLEAR ROOM FIRST \(2 HOSTILES\)/);
  assert.equal(collectInteractables(base({pickups})).find(x => x.kind === 'supply').enabled, true);
});
test('gun pickup names the gun; auto pickups are not keyed', () => {
  const pickups = [{kind: 'gun', gunIndex: 0, x: 110, y: 100, available: true}, {kind: 'scrap', value: 12, x: 105, y: 100, available: true}];
  const ts = collectInteractables(base({pickups}));
  assert.equal(ts.find(x => x.kind === 'gun').subject, 'HARDLINE');
  assert.equal(ts.find(x => x.kind === 'pickup').keyed, false);
  assert.equal(activeInteraction(ts).kind, 'gun');
});
test('priority: gate beats supply drop when overlapping', () => {
  const ts = collectInteractables(base({player: {x: 160, y: 160}, gates: [{x: 4, y: 4, cost: 1}], pickups: [{kind: 'supply', x: 165, y: 160, roomIndex: 0, available: true}]}));
  assert.equal(activeInteraction(ts).kind, 'gate');
});
test('out of range targets are labelled but not active; far ones omitted', () => {
  const ts = collectInteractables(base({player: {x: 100, y: 100}, gates: [{x: 10, y: 3, cost: 5}, {x: 100, y: 100, cost: 5}]}));
  assert.equal(ts.find(x => x.id === 'gate:10,3').inRange, false);
  assert.equal(ts.some(x => x.id === 'gate:100,100'), false);
});
test('supply drop prompt says what to expect', () => {
  const t = collectInteractables(base({pickups: [{kind: 'supply', x: 110, y: 100, roomIndex: 2, available: true}]})).find(x => x.kind === 'supply');
  assert.equal(promptParts(t, 'F').head, 'OPEN SUPPLY DROP'); assert.equal(t.reason, 'BUY WITH SCRAP · PRICES INSIDE'); assert.equal(RANGE.market, undefined);
});
test('mod pickups name the mod, say what they replace, and are never auto-collected', () => {
  const pickups = [{kind: 'mod', modId: 'ricochet', x: 110, y: 100, available: true}];
  const hand = {gun: {id: 'machine', name: 'MACHINE PISTOL'}, modId: 'suppressor'};
  let t = collectInteractables(base({pickups, hand})).find(x => x.kind === 'mod');
  assert.equal(t.subject, 'RICOCHET'); assert.equal(t.keyed, true); assert.equal(promptParts(t).head, 'FIT RICOCHET');
  assert.equal(t.reason, 'ON MACHINE PISTOL · REPLACES SUPPRESSOR'); assert.equal(t.icon, 'mod-ricochet'); assert.equal(t.enabled, true);
  t = collectInteractables(base({pickups, hand: {...hand, modId: 'ricochet'}})).find(x => x.kind === 'mod');
  assert.equal(t.enabled, false); assert.equal(t.reason, 'ALREADY FITTED');
  t = collectInteractables(base({pickups: [{...pickups[0], modId: 'longbarrel'}], hand: {gun: {id: 'launcher', name: 'CORK LAUNCHER'}}})).find(x => x.kind === 'mod');
  assert.equal(t.enabled, false); assert.match(t.reason, /DOES NOT FIT/);
});
test('gun pickups swap the gun in hand when full and show which', () => {
  const pickups = [{kind: 'gun', gunIndex: 1, x: 110, y: 100, available: true}];
  let t = collectInteractables(base({pickups, hand: {weapons: [0, 2], maxSlots: 2, activeSlot: 1}})).find(x => x.kind === 'gun');
  assert.equal(t.verb, 'SWAP'); assert.match(t.reason, /BURST · REPLACES/); 
  t = collectInteractables(base({pickups, hand: {weapons: [0], maxSlots: 2, activeSlot: 0}})).find(x => x.kind === 'gun');
  assert.equal(t.verb, 'TAKE');
  t = collectInteractables(base({pickups, hand: {weapons: [0, 1], maxSlots: 2, activeSlot: 0}})).find(x => x.kind === 'gun');
  assert.equal(t.enabled, false);
});
test('exit reports what keeps it locked, and lets you leave sleepers behind', () => {
  const exit = [{kind: 'exit', x: 120, y: 100, available: true}], get = enemies => collectInteractables(base({pickups: exit, enemies})).find(x => x.kind === 'exit');
  let t = get([{alive: true, roomIndex: 2, aware: false}]);
  assert.equal(t.enabled, false); assert.match(t.reason, /CLEAR THE EXIT ROOM · 1 HOSTILE/); assert.equal(t.keyed, false);
  t = get([{alive: true, roomIndex: 1, aware: true}]);
  assert.equal(t.enabled, false); assert.match(t.reason, /1 AWARE HOSTILE/);
  t = get([{alive: true, roomIndex: 1, aware: false}]);
  assert.equal(t.enabled, true); assert.match(t.reason, /1 UNAWARE LEFT BEHIND/);
  assert.equal(nearestHostileRoom({player: {x: 0, y: 0}, rooms, enemies: [{alive: true, roomIndex: 1, aware: false}]}), null, 'sleepers are not a clear-this-room target');
});
test('popup text and hostile room finder', () => {
  assert.equal(collectPopup('scrap', 12), '+12 SCRAP'); assert.equal(collectPopup('heal', 1), '+1 ♥'); assert.equal(collectPopup('ammo', 30), '+30 AMMO');
  const h = nearestHostileRoom({player: {x: 0, y: 0}, rooms, enemies: [{alive: true, roomIndex: 2}]});
  assert.equal(h.index, 2); assert.equal(h.hostiles, 1);
});
test('hints: one at a time, once, gated on context', () => {
  const keys = {reload: 'R', throwableCycle: 'Q', throwableUse: 'G', loadout: 'TAB'};
  const ctx = {blocked: false, seen: new Set(['basics']), moved: true, runTime: 5, moving: false, stillFor: 1, magEmpty: false, reserve: 10, otherHasAmmo: true, hostilesNear: 0, grenades: 2, hasMod: true, scrap: 0};
  assert.equal(pickHint(ctx, keys), null, 'movement and time hints moved to the Signal Check');
  assert.equal(pickHint({...ctx, magEmpty: true}, keys).text, '[R] RELOAD');
  assert.equal(pickHint({...ctx, magEmpty: true, reserve: 0}, keys).id, 'swap');
  assert.equal(pickHint({...ctx, blocked: true, magEmpty: true}, keys), null);
  assert.ok(HINT_DEFS.length >= 5);
});
test('hint storage tolerates failures', () => {
  assert.equal(loadSeen({getItem() { throw new Error('x'); }}).size, 0);
  const mem = {}; const st = {getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }};
  saveSeen(st, new Set(['a'])); assert.deepEqual([...loadSeen(st)], ['a']);
  saveSeen({setItem() { throw new Error('x'); }}, new Set(['a']));
});

test('claimed supply drop is shown as TAKEN and cannot be activated', () => {
  const pickups = [{kind: 'supply', x: 110, y: 100, roomIndex: 2, available: true, claimed: true}];
  const ts = collectInteractables(base({pickups}));
  assert.equal(ts.some(x => x.kind === 'supply'), false);
  assert.equal(ts.find(x => x.kind === 'claimed').subject, 'SUPPLY DROP · TAKEN');
  assert.notEqual(activeInteraction(ts)?.kind, 'claimed');
});
