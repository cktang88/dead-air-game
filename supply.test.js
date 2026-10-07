import test from 'node:test';
import assert from 'node:assert/strict';
import {GUNS} from './catalog.js';
import {LETHALITY, hitsToKill} from './stealth.js';
import {shotBeat} from './time-rule.js';
import {PRICES, SIGNAL_COST, SUPPLY_MEDKIT_HP, armsOffer, offerCard, offerStatus, reshuffleCost, supplyOffers} from './supply.js';

const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };
const machine = GUNS.find(g => g.id === 'machine');
const base = {ammoNeed: true, health: 5, maxHealth: 5, gunCandidates: [3], activeGun: machine, activeModId: null};

test('a supply drop always shows three options: sustain, arms, signal', () => {
  const offers = supplyOffers({...base, rng: seq(.9, .1, .5)});
  assert.deepEqual(offers.map(o => o.slot), ['sustain', 'arms', 'signal']);
  assert.equal(offers[2].kind, 'freq'); assert.equal(offers[2].cost, SIGNAL_COST);
  assert.equal(offers[0].cost, PRICES.ammo); assert.equal(offers[1].cost, PRICES.mod);
});

test('every card carries a scrap price, and a fresh run cannot afford all three', () => {
  for (const r of [.1, .9]) for (const o of supplyOffers({...base, rng: seq(r, .5)})) assert.ok(o.cost > 0, `${o.kind} is priced`);
  const all = supplyOffers({...base, rng: seq(.9, .5)}).reduce((n, o) => n + o.cost, 0);
  assert.ok(all >= 100 && all <= 170, `three cards cost ${all}`);
  assert.equal(supplyOffers({...base, health: 2, rng: seq(.9)})[0].cost, PRICES.heal);
});

test('status checks the price too, and a bought card stays bought', () => {
  assert.equal(offerStatus({kind: 'ammo', cost: 20}, {ammoNeed: true, scrap: 5}).reason, 'NEED 15 MORE SCRAP');
  assert.equal(offerStatus({kind: 'ammo', cost: 20}, {ammoNeed: true, scrap: 20}).ok, true);
  assert.equal(offerStatus({kind: 'ammo', cost: 20, sold: true}, {ammoNeed: true, scrap: 99}).reason, 'BOUGHT');
  assert.equal(offerStatus({kind: 'ammo', cost: 20}, {ammoNeed: false, scrap: 99}).reason, 'AMMO ALREADY FULL', 'unusable beats unaffordable');
});

test('reshuffle gets dearer each time and never re-offers the same card', () => {
  assert.deepEqual([0, 1, 2].map(reshuffleCost), [15, 25, 35]);
  const first = armsOffer({...base, rng: seq(.9, .0)});
  for (let i = 0; i < 20; i++) {
    const next = armsOffer({...base, rng: seq(.9, (i * .05) % 1, .3), avoid: first});
    assert.ok(next.kind !== first.kind || next.modId !== first.modId, 'differs from the replaced card');
    assert.equal(next.slot, 'arms');
  }
});

test('sustain is ammo by default and a medkit when you are badly hurt (or full on ammo and hurt)', () => {
  assert.equal(supplyOffers({...base, rng: seq(.9)})[0].kind, 'ammo');
  assert.equal(supplyOffers({...base, health: 2, rng: seq(.9)})[0].kind, 'heal');
  assert.equal(supplyOffers({...base, health: 4, ammoNeed: false, rng: seq(.9)})[0].kind, 'heal');
  assert.equal(supplyOffers({...base, health: 4, ammoNeed: true, rng: seq(.9)})[0].kind, 'ammo');
  assert.equal(supplyOffers({...base, ammoNeed: false, rng: seq(.9)})[0].kind, 'ammo');
});

test('arms is a named gun some of the time and a named mod otherwise', () => {
  const gun = supplyOffers({...base, rng: seq(.1, .5)})[1];
  assert.equal(gun.kind, 'gun'); assert.equal(gun.gunIndex, 3);
  const mod = supplyOffers({...base, rng: seq(.9, .5)})[1];
  assert.equal(mod.kind, 'mod'); assert.ok(mod.modId);
  assert.equal(supplyOffers({...base, gunCandidates: [], rng: seq(.1, .5)})[1].kind, 'mod', 'no gun to offer -> a mod');
});

test('it does not offer the mod you are already wearing', () => {
  for (let i = 0; i < 24; i++) {
    const arms = supplyOffers({...base, activeModId: 'ricochet', rng: seq(.9, (i + .5) / 24)})[1];
    if (arms.kind === 'mod') assert.notEqual(arms.modId, 'ricochet');
  }
});

test('option status explains why a card is disabled', () => {
  assert.equal(offerStatus({kind: 'ammo'}, {ammoNeed: false}).ok, false);
  assert.equal(offerStatus({kind: 'ammo'}, {ammoNeed: true}).ok, true);
  assert.equal(offerStatus({kind: 'heal'}, {health: 5, maxHealth: 5}).reason, 'HEALTH ALREADY FULL');
  assert.equal(offerStatus({kind: 'mod', modId: 'ricochet'}, {activeModId: 'ricochet'}).reason, 'ALREADY FITTED');
  assert.equal(offerStatus({kind: 'mod', modId: 'ricochet'}, {activeModId: 'suppressor'}).ok, true);
  assert.equal(offerStatus({kind: 'gun', gunIndex: 1}, {}).ok, true);
  assert.equal(offerStatus({kind: 'freq', cost: 30}, {scrap: 12}).reason, 'NEED 18 MORE SCRAP');
  assert.equal(offerStatus({kind: 'freq', cost: 30}, {scrap: 30}).ok, true);
});

test('cards name exactly what you get, what it replaces, and the price of the signal', () => {
  const mod = offerCard({kind: 'mod', modId: 'suppressor'}, {activeGun: machine, activeModId: 'ricochet'});
  assert.equal(mod.title, 'SUPPRESSOR'); assert.match(mod.text, /Noise ring halved/); assert.match(mod.text, /fits MACHINE PISTOL/); assert.match(mod.text, /REPLACES RICOCHET/);
  assert.doesNotMatch(offerCard({kind: 'mod', modId: 'suppressor'}, {activeGun: machine}).text, /REPLACES/);
  const gun = offerCard({kind: 'gun', gunIndex: 1}, {handGun: machine});
  assert.equal(gun.title, GUNS[1].name); assert.match(gun.text, /SWAPS MACHINE PISTOL/);
  assert.doesNotMatch(offerCard({kind: 'gun', gunIndex: 1}, {}).text, /SWAPS/);
  assert.match(offerCard({kind: 'heal'}).text, new RegExp(`\\+${SUPPLY_MEDKIT_HP} health`));
});

test('time beats suit the new roster: sprays tick cheaply, launch/breach/punch cost real time', () => {
  const beat = id => { const g = GUNS.find(x => x.id === id); return shotBeat({damage: g.damage, fireInterval: g.rate, pellets: g.count || 1}); };
  assert.ok(beat('launcher') > beat('machine') * 2, 'a shell is a big beat');
  assert.ok(beat('sniper_mule') > beat('pistol_9'));
  assert.ok(beat('pistol_45') > beat('smg_vector'));
  assert.ok(beat('smg_vector') <= beat('machine'), 'the faster spray variant stays cheap per shot');
  for (const g of GUNS) assert.ok(Number.isFinite(beat(g.id)) && beat(g.id) > 0, g.id);
});

test('every gun fits the lethality table: basic enemies die in 1-2 good hits of a fitting gun, brutes take real work', () => {
  const dmg = g => g.damage * (g.burst ? 1 : 1);
  for (const g of GUNS) {
    if (g.id === 'launcher') continue; // blast, not hits
    const hits = type => hitsToKill(LETHALITY[type].hp, dmg(g));
    assert.ok(hits('guard') <= 5, `${g.id} kills a warden in a few hits`);
    assert.ok(hits('brute') >= (g.id === 'sniper_mule' ? 1 : 2), `${g.id} does not one-shot a brute unless it is the breach gun`);
  }
  for (const id of ['pistol_45', 'rifle', 'ar_bastion', 'sniper_lynx', 'sniper_quill', 'sniper_mule', 'smg_heavy'])
    assert.ok(hitsToKill(LETHALITY.gunner.hp, GUNS.find(g => g.id === id).damage) <= 2, `${id} drops a gunner in 1-2 hits`);
  for (const id of ['machine', 'ar_ash', 'smg_burst', 'pistol_9']) assert.ok(hitsToKill(LETHALITY.chaser.hp, GUNS.find(g => g.id === id).damage) <= 2, `${id} drops a rusher in 1-2 hits`);
  assert.ok(GUNS.find(g => g.id === 'launcher').lob.damage >= LETHALITY.gunner.hp, 'a shell kills a basic enemy outright');
});
