import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOnboarding, loadOnboarding, saveOnboarding, clearOnboarding, shouldRunSignalCheck, nextCard, NAME_CARDS, MANUAL, MANUAL_BY_ID, MANUAL_SECTIONS, manualTriggers, unlockManual, manualView, enemyCardId, ONBOARDING_KEY} from './onboarding.js';
import {ENEMY_TYPES} from './catalog.js';

const memory = () => { const m = new Map(); return {getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k)}; };
const base = () => ({speedRatio: 0, moved: false, shots: 0, runSeconds: 0, hits: 0, armor: 0, bloom: 0, enemies: [], pickedUp: new Set(), scrap: 0, roomsCleared: 0});

test('persistence round-trips and survives garbage and a throwing storage', () => {
  const s = memory();
  assert.deepEqual(loadOnboarding(s), {signalDone: false, manual: [], cards: []});
  assert.equal(saveOnboarding(s, {signalDone: true, manual: ['still', 'still', 'walk'], cards: ['mech.door']}), true);
  assert.deepEqual(loadOnboarding(s), {signalDone: true, manual: ['still', 'walk'], cards: ['mech.door']});
  s.setItem(ONBOARDING_KEY, '{nope'); assert.deepEqual(loadOnboarding(s), {signalDone: false, manual: [], cards: []});
  s.setItem(ONBOARDING_KEY, JSON.stringify({signalDone: 'yes', manual: [1, 'door'], cards: 7})); assert.deepEqual(parseOnboarding(s.getItem(ONBOARDING_KEY)), {signalDone: false, manual: ['door'], cards: []});
  const bad = {getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); }};
  assert.deepEqual(loadOnboarding(bad), {signalDone: false, manual: [], cards: []});
  assert.equal(saveOnboarding(bad, {signalDone: true, manual: [], cards: []}), false);
  clearOnboarding(bad); clearOnboarding(s); assert.equal(s.getItem(ONBOARDING_KEY), null);
});
test('first runs get the Signal Check; returning players, finished players and dailies skip it; replay forces it', () => {
  const fresh = {signalDone: false}, runs = {stats: {runs: 3}};
  assert.equal(shouldRunSignalCheck(fresh, {stats: {runs: 0}}), true);
  assert.equal(shouldRunSignalCheck({signalDone: true}, {stats: {runs: 0}}), false);
  assert.equal(shouldRunSignalCheck(fresh, runs), false);
  assert.equal(shouldRunSignalCheck(fresh, {stats: {runs: 0}}, {daily: true}), false);
  assert.equal(shouldRunSignalCheck({signalDone: true}, runs, {forced: true}), true);
});
test('name cards: every enemy type has one, order is priority, each shows once', () => {
  for (const type of Object.keys(ENEMY_TYPES)) if (type !== 'boss') assert.ok(NAME_CARDS[enemyCardId(type)], `card for ${type}`);
  for (const [id, c] of Object.entries(NAME_CARDS)) assert.ok(c.title.length <= 10 && c.line.split(' ').length <= 6, id);
  const seen = new Set();
  assert.equal(nextCard(['mech.door', 'enemy.sniper'], seen).id, 'mech.door');
  seen.add('mech.door');
  assert.equal(nextCard(['mech.door', 'enemy.sniper'], seen).title, 'MARKSMAN');
  assert.equal(nextCard(['nope'], seen), null);
});
test('manual: unique ids, six sections, one plain line each', () => {
  assert.equal(new Set(MANUAL.map(e => e.id)).size, MANUAL.length);
  assert.deepEqual([...new Set(MANUAL.map(e => e.section))], MANUAL_SECTIONS);
  for (const e of MANUAL) { assert.ok(e.line.length > 10 && e.line.length < 130, e.id); assert.ok(!/\n/.test(e.line)); }
});
test('manual triggers unlock on first sight and never twice', () => {
  const ctx = base();
  assert.deepEqual(manualTriggers(ctx), []);
  ctx.moved = true; ctx.speedRatio = 0.5;
  assert.ok(manualTriggers(ctx).includes('walk'));
  ctx.speedRatio = 0; assert.ok(manualTriggers(ctx).includes('still'));
  ctx.moved = false; assert.ok(!manualTriggers(ctx).includes('still'), 'still needs a stop after moving');
  let r = unlockManual([], ['still', 'walk', 'bogus']);
  assert.deepEqual(r.fresh, ['still', 'walk']);
  r = unlockManual(r.unlocked, ['walk', 'shot']);
  assert.deepEqual(r.fresh, ['shot']);
  assert.equal(r.unlocked.length, 3);
});
test('manual triggers: combat, enemies, rooms', () => {
  const ctx = {...base(), shots: 2, bloom: 0.2, hits: 1, shotCategory: 'SNIPER', crateHit: true, noiseRing: true, silentHit: true, thrown: true, glassSeen: true,
    doorSeen: true, roomsCleared: 1, runSeconds: 12,
    enemies: [{type: 'sniper', visible: true, aware: false, posture: 'guard', suspicion: 0.3}, {type: 'chaser', visible: true, posture: 'sleep', aware: false}, {type: 'riot', visible: false, aware: false}]};
  const ids = manualTriggers(ctx);
  for (const id of ['shot', 'bloom', 'hp', 'pierce', 'crate', 'noise', 'silent', 'throw', 'glass', 'door', 'clear', 'hands', 'alert', 'cone', 'sleeper', 'sniper', 'chaser']) assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes('riot'), 'unseen enemy types stay locked');
  assert.ok(ids.every(id => MANUAL_BY_ID.has(id)), 'every trigger id is a manual entry');
});
test('manual view counts known and locked per section', () => {
  const v = manualView(['still', 'door']);
  assert.equal(v.length, 6);
  const time = v.find(s => s.section === 'TIME');
  assert.equal(time.known.length, 1); assert.equal(time.locked, time.total - 1);
  assert.equal(v.find(s => s.section === 'ROOMS').known[0].id, 'door');
});
