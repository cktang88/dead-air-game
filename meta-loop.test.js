import test from 'node:test';
import assert from 'node:assert/strict';
import {SAVE_KEY, SAVE_VERSION, emptyProgress, migrateProgress, parseProgress, progressionStats, purchaseUpgrade, recordDaily} from './progression.js';
import {KITS, UNLOCKS, UNLOCK_BY_ID, STARTER_GUNS, grantUnlock, isUnlocked, kitThrowables, kitUnlocked, purchaseUnlock, selectKit, unlockedGunIds, unlockedFreqIds, unlockedThrowableIds} from './unlocks.js';
import {UPGRADES, STATIONS, CROSSFADES, MAX_RANK, activeCrossfades, availableUpgrades, crossfadesCompletedBy, freqStats, offerFrequencies, pickFrequency, stationLevel} from './frequencies.js';
import {GOALS, GOAL_BY_ID, emptyStats, goalProgress, recordRun, updateStats} from './goals.js';
import {dailyShareLine, COIN_RATES, FINAL_FLOOR, dailySeed, dateKey, encounterDepth, floorConfig, floorSeed, grossCoins, settleRun} from './run-loop.js';
import {GUNS, BASE_GUN_IDS} from './catalog.js';
import {chooseEncounterTypes, eligibleRecipes, gunPickupPlan} from './rules.js';
import {BOSS, BOSS_PATTERNS, PATTERN_SPECS, activateBoss, bossDamageMult, bossPhaseFor, bossVulnerable, createBoss, stepBoss} from './boss.js';

/* ------------------------------------------------------------------ save migration */
test('save version is 3 and a v1 save migrates keeping coins and upgrade levels', () => {
  assert.equal(SAVE_VERSION, 3);
  const migrated = parseProgress(JSON.stringify({version: 1, coins: 137, upgrades: {runner: 2, vitalreserve: 3, bogus: 9}}));
  assert.equal(migrated.version, 3);
  assert.equal(migrated.coins, 137);
  assert.equal(migrated.upgrades.runner, 2);
  assert.equal(migrated.upgrades.vitalreserve, 3);
  assert.equal(migrated.upgrades.bogus, undefined);
  assert.deepEqual(migrated.unlocked, []);
  assert.equal(migrated.kit, 'standard');
  assert.deepEqual(migrated.stats, emptyStats());
  assert.equal(SAVE_KEY.startsWith('dead-air.progress'), true);
});

test('unknown future versions and garbage fall back to a fresh profile', () => {
  assert.deepEqual(parseProgress(JSON.stringify({version: 99, coins: 50})), emptyProgress());
  assert.deepEqual(parseProgress(null), emptyProgress());
  assert.deepEqual(parseProgress('not json'), emptyProgress());
  assert.deepEqual(migrateProgress(null), emptyProgress());
});

test('a v3 profile round-trips and is sanitized', () => {
  let progress = {...emptyProgress(), coins: 300};
  progress = grantUnlock(progress, 'gun:smg_burst');
  progress = grantUnlock(progress, 'kit:duelist');
  progress = {...selectKit(progress, 'duelist'), goals: {first_blood: true}};
  assert.deepEqual(parseProgress(JSON.stringify(progress)), progress);
  const dirty = parseProgress(JSON.stringify({...progress, unlocked: ['nope', 'gun:smg_burst', 'gun:smg_burst'], kit: 'marksman', stats: {runs: -3, totalKills: 'x', deepestFloor: 2.9}, goals: {a: true, b: 1}}));
  assert.deepEqual(dirty.unlocked, ['gun:smg_burst']);
  assert.equal(dirty.kit, 'standard', 'unowned kit falls back');
  assert.equal(dirty.stats.runs, 0);
  assert.equal(dirty.stats.deepestFloor, 2);
  assert.deepEqual(dirty.goals, {a: true});
});

/* ------------------------------------------------------------------ unlocks */
test('starter guns are pooled; bought guns and kit guns join the pool', () => {
  let progress = emptyProgress();
  assert.deepEqual([...unlockedGunIds(progress)].sort(), [...STARTER_GUNS].sort());
  progress = {...progress, coins: 500};
  const bought = purchaseUnlock(progress, 'gun:smg_burst');
  assert.equal(bought.purchased, true);
  assert.equal(bought.progress.coins, 500 - UNLOCK_BY_ID.get('gun:smg_burst').cost);
  assert.equal(unlockedGunIds(bought.progress).has('smg_burst'), true);
  assert.equal(purchaseUnlock(bought.progress, 'gun:smg_burst').purchased, false, 'cannot rebuy');
  const kit = purchaseUnlock(progress, 'kit:marksman');
  assert.equal(unlockedGunIds(kit.progress).has('sniper_lynx'), true);
});

test('goal-only unlocks cannot be bought and too-poor purchases fail', () => {
  const rich = {...emptyProgress(), coins: 9999};
  assert.equal(purchaseUnlock(rich, 'gun:sniper_mule').purchased, false);
  assert.equal(purchaseUnlock({...emptyProgress(), coins: 1}, 'gun:smg_burst').purchased, false);
  assert.equal(purchaseUnlock(rich, 'nope').purchased, false);
});

test('every kit is two distinct base-roster verbs that exist and can be held at once', () => {
  for (const kit of KITS) {
    const indices = kit.guns.map(id => GUNS.findIndex(gun => gun.id === id));
    assert.ok(indices.every(i => i >= 0), kit.id);
    assert.ok(kit.guns.every(id => BASE_GUN_IDS.includes(id)), `${kit.id} uses a run-only variant`);
    assert.equal(new Set(kit.guns.map(id => GUNS[GUNS.findIndex(g => g.id === id)].verb)).size, 2, `${kit.id} has two different verbs`);
    assert.equal(gunPickupPlan([indices[0]], indices[1], 2, 0).slot, 1);
    assert.equal(kit.throwables.incendiary, undefined);
  }
});

test('a v2 save with removed ids is migrated gracefully: refunds, no dead ids, carry rig becomes third slot', () => {
  const old = {version: 2, coins: 100, upgrades: {carryrig: 3, runner: 1}, unlocked: ['gun:smg_vector', 'gun:rifle', 'throw:incendiary', 'gun:smg_burst', 'kit:duelist'], kit: 'bruiser'};
  const migrated = parseProgress(JSON.stringify(old));
  assert.deepEqual(migrated.unlocked.sort(), ['gun:smg_burst', 'kit:duelist']);
  // refunds: 40 + 70 + 60 for the removed unlocks, 35+60+95 for the rig, minus the free third slot (95)
  assert.equal(migrated.coins, 100 + 40 + 70 + 60 + (35 + 60 + 95) - 95);
  assert.equal(migrated.upgrades.thirdslot, 1);
  assert.equal(migrated.upgrades.carryrig, undefined);
  assert.equal(migrated.kit, 'standard', 'an unowned kit falls back');
  const low = parseProgress(JSON.stringify({version: 2, coins: 0, upgrades: {carryrig: 2}}));
  assert.equal(low.coins, 35 + 60); assert.equal(low.upgrades.thirdslot, 0);
  assert.equal(progressionStats(migrated).maxWeaponSlots, 3);
  assert.equal(progressionStats(low).maxWeaponSlots, 2);
});

test('kit selection needs ownership and throwables respect unlocks', () => {
  let progress = {...emptyProgress(), coins: 400};
  assert.equal(selectKit(progress, 'marksman').kit, 'standard');
  progress = purchaseUnlock(progress, 'kit:marksman').progress;
  assert.equal(kitUnlocked(progress, 'marksman'), true);
  assert.equal(selectKit(progress, 'marksman').kit, 'marksman');
  assert.deepEqual(kitThrowables(emptyProgress(), 'standard'), {smoke: 1, flash: 1, frag: 0});
  const withFrag = grantUnlock(emptyProgress(), 'throw:frag');
  assert.equal(kitThrowables(withFrag, 'standard').frag, 2);
  assert.equal(unlockedThrowableIds(withFrag).has('frag'), true);
});

test('every goal reward unlock id exists in the catalog', () => {
  for (const goal of GOALS) for (const id of goal.reward.unlock || []) assert.ok(UNLOCK_BY_ID.has(id), `${goal.id} -> ${id}`);
  for (const unlock of UNLOCKS) assert.ok(unlock.cost === null || unlock.cost > 0);
});

/* ------------------------------------------------------------------ meta upgrades with tradeoffs */
test('tradeoff upgrades are locked until a goal grants them', () => {
  const rich = {...emptyProgress(), coins: 500};
  assert.equal(purchaseUpgrade(rich, 'adrenal').purchased, false);
  const unlocked = purchaseUpgrade(grantUnlock(rich, 'upg:adrenal'), 'adrenal');
  assert.equal(unlocked.purchased, true);
  const stats = progressionStats(unlocked.progress);
  assert.equal(stats.maxHealth, 2);
  assert.ok(Math.abs(stats.damageMult - 1.2) < 1e-9);
});

test('high roller trades safety for coin income and stockpile trades speed for scrap', () => {
  const p = grantUnlock(grantUnlock({...emptyProgress(), coins: 999}, 'upg:highroller'), 'upg:stockpile');
  const hr = purchaseUpgrade(p, 'highroller').progress;
  assert.equal(progressionStats(hr).coinMult, 1.25);
  assert.equal(progressionStats(hr).deathKeep, .25);
  const sp = purchaseUpgrade(purchaseUpgrade(p, 'stockpile').progress, 'stockpile').progress;
  assert.equal(progressionStats(sp).startScrap, 120);
  assert.ok(Math.abs(progressionStats(sp).moveSpeed - 112 * .88) < 1e-9);
});

/* ------------------------------------------------------------------ frequencies */
const seq = (seed = .3) => { let v = seed; return () => (v = (v * 9301 + .49297) % 1); };

test('there are five stations of three or more upgrades (FEEDBACK gained KINDLING, the old incendiary) with three ranks each', () => {
  assert.equal(STATIONS.length, 5);
  for (const s of STATIONS) assert.ok(UPGRADES.filter(u => u.station === s.id).length >= 3, s.id);
  assert.equal(UPGRADES.find(u => u.id === 'kindle').station, 'feedback');
  for (const u of UPGRADES) assert.equal(u.ranks.length, MAX_RANK, u.id);
  assert.ok(CROSSFADES.length >= 4);
  for (const c of CROSSFADES) assert.ok(c.stations.every(id => STATIONS.some(s => s.id === id)));
  assert.equal(new Set(UPGRADES.map(u => u.effect)).size, UPGRADES.length, 'unique effect keys');
});

test('picking ranks an upgrade up to the cap', () => {
  let owned = {};
  for (let i = 0; i < 5; i++) owned = pickFrequency(owned, 'arc');
  assert.equal(owned.arc, MAX_RANK);
  assert.deepEqual(pickFrequency({}, 'nope'), {});
  assert.ok(freqStats({arc: 3}).chain > freqStats({arc: 1}).chain);
  assert.equal(freqStats({}).chain, 0);
});

test('two stations at level 2 switch on a crossfade', () => {
  const owned = {arc: 1, jam: 1, through: 2};
  assert.deepEqual(activeCrossfades(owned).map(c => c.id), ['signal_boost']);
  assert.equal(freqStats(owned).chainTargets, 2);
  assert.equal(activeCrossfades({arc: 1, through: 1}).length, 0);
  assert.equal(stationLevel(owned, 'static'), 2);
  assert.deepEqual(crossfadesCompletedBy({arc: 1, jam: 1, through: 1}, 'bounce').map(c => c.id), ['signal_boost']);
  assert.ok(freqStats({rage: 1, loop: 1, through: 1, bounce: 1}).bounceDamage > 0);
});

test('frequency offers are three distinct upgrades with the next rank, honoring unlocks', () => {
  const offer = offerFrequencies({owned: {}, unlockedIds: [], rng: seq()});
  assert.equal(offer.length, 3);
  assert.equal(new Set(offer.map(o => o.id)).size, 3);
  assert.ok(offer.every(o => UPGRADES.find(u => u.id === o.id).unlockCost === null));
  assert.ok(offer.every(o => o.rank === 1 && o.isNew));
  const ranked = offerFrequencies({owned: {arc: 1}, unlockedIds: [], rng: () => .01});
  const arc = ranked.find(o => o.id === 'arc');
  if (arc) { assert.equal(arc.rank, 2); assert.equal(arc.rarity, 'rare'); }
  assert.equal(availableUpgrades([], {arc: 3}).some(u => u.id === 'arc'), false);
  assert.equal(availableUpgrades(['freq:dead_channel'], {}).some(u => u.id === 'dead_channel'), true);
  assert.equal(availableUpgrades([], {}).some(u => u.id === 'dead_channel'), false);
  assert.ok(unlockedFreqIds(grantUnlock(emptyProgress(), 'freq:backlash')).includes('freq:backlash'));
});

test('offers lean toward owned stations and surface crossfade completers', () => {
  let completerSeen = false, ownedStation = 0, total = 0;
  const rng = seq(.71);
  for (let i = 0; i < 80; i++) {
    for (const o of offerFrequencies({owned: {arc: 1, jam: 1, through: 1}, rng})) {
      total++; if (o.station === 'static' || o.station === 'carrier') ownedStation++;
      if (o.crossfades.length) completerSeen = true;
    }
  }
  assert.equal(completerSeen, true);
  assert.ok(ownedStation / total > .4);
});

test('a fully ranked build still gets offers from what remains', () => {
  let owned = {};
  for (const u of UPGRADES) if (u.unlockCost === null) owned[u.id] = MAX_RANK;
  assert.deepEqual(offerFrequencies({owned, rng: seq()}), []);
  assert.equal(offerFrequencies({owned, unlockedIds: UPGRADES.map(u => `freq:${u.id}`), rng: seq()}).length, 3);
});

/* ------------------------------------------------------------------ goals */
test('stats accumulate and keep bests', () => {
  let stats = updateStats(emptyStats(), {kills: 12, floorReached: 2, outcome: 'dead', seconds: 400, coins: 40});
  stats = updateStats(stats, {kills: 30, floorReached: 3, outcome: 'won', seconds: 900, bossKilled: true, coins: 500, floor1Seconds: 200, daily: true});
  assert.equal(stats.runs, 2);
  assert.equal(stats.totalKills, 42);
  assert.equal(stats.mostKills, 30);
  assert.equal(stats.deepestFloor, 3);
  assert.equal(stats.wins, 1);
  assert.equal(stats.fastestWin, 900);
  assert.equal(stats.fastestFloor1, 200);
  assert.equal(stats.bossKills, 1);
  assert.equal(stats.dailyRuns, 1);
  assert.equal(stats.bestRunCoins, 500);
  stats = updateStats(stats, {kills: 1, floorReached: 1, outcome: 'won', seconds: 700});
  assert.equal(stats.fastestWin, 700);
});

test('completing goals pays coins once and grants unlocks', () => {
  const first = recordRun(emptyProgress(), {kills: 3, floorReached: 3, outcome: 'extract', seconds: 500, stillRooms: 1, slowTriples: 1, floor1Seconds: 200});
  const ids = first.completed.map(goal => goal.id);
  for (const id of ['first_blood', 'still_life', 'slow_triple', 'floor_2', 'floor_3', 'speed_floor']) assert.ok(ids.includes(id), id);
  assert.equal(isUnlocked(first.progress, 'gun:smg_burst'), true);
  assert.equal(isUnlocked(first.progress, 'throw:frag'), true);
  assert.equal(isUnlocked(first.progress, 'upg:stockpile'), true);
  assert.equal(first.progress.coins, 10 + 30 + 40 + 40 + 80 + 50);
  const again = recordRun(first.progress, {kills: 3, floorReached: 3, outcome: 'extract', seconds: 500});
  assert.equal(again.completed.some(goal => goal.id === 'first_blood'), false);
});

test('boss goals: pistol finish unlocks the high roller and wager', () => {
  const r = recordRun(emptyProgress(), {kills: 40, floorReached: 4, outcome: 'won', seconds: 1200, bossKilled: true, bossPistol: true});
  assert.ok(r.completed.some(goal => goal.id === 'boss_slayer'));
  assert.ok(r.completed.some(goal => goal.id === 'boss_pistol'));
  assert.equal(isUnlocked(r.progress, 'upg:highroller'), true);
  assert.equal(isUnlocked(r.progress, 'freq:backlash'), true);
  assert.equal(isUnlocked(r.progress, 'gun:sniper_mule'), true);
});

test('goal progress reports fraction toward cumulative goals', () => {
  const progress = {...emptyProgress(), stats: {...emptyStats(), totalKills: 25}};
  const view = goalProgress(progress, GOAL_BY_ID.get('kills_100'));
  assert.equal(view.value, 25);
  assert.equal(view.pct, .25);
  assert.equal(view.done, false);
  assert.equal(goalProgress({...progress, goals: {kills_100: true}}, GOAL_BY_ID.get('kills_100')).pct, 1);
});

test('daily record keeps the best of the day and resets on a new date', () => {
  let progress = recordDaily(emptyProgress(), '2026-10-06', {floor: 2, kills: 10});
  progress = recordDaily(progress, '2026-10-06', {floor: 1, kills: 25});
  assert.deepEqual(progress.daily, {date: '2026-10-06', bestFloor: 2, bestKills: 25});
  progress = recordDaily(progress, '2026-10-07', {floor: 1, kills: 3});
  assert.deepEqual(progress.daily, {date: '2026-10-07', bestFloor: 1, bestKills: 3});
});

/* ------------------------------------------------------------------ run loop and economy */
test('floors escalate and the final floor is the boss floor', () => {
  assert.equal(FINAL_FLOOR, 4);
  assert.equal(floorConfig(4).boss, true);
  assert.equal(floorConfig(3).boss, false);
  for (let n = 2; n <= 4; n++) assert.ok(floorConfig(n).hpMult >= floorConfig(n - 1).hpMult);
  assert.ok(floorConfig(3).eliteRooms > floorConfig(1).eliteRooms);
  assert.equal(floorConfig(99).n, 4);
  assert.equal(floorConfig(0).n, 1);
});

test('deeper floors unlock specialist squads earlier', () => {
  const early = encounterDepth(.1, 1), later = encounterDepth(.1, 3);
  assert.equal(eligibleRecipes(early).some(r => r.id === 'marksman-rush'), false);
  assert.equal(eligibleRecipes(later).some(r => r.id === 'marksman-rush'), true);
  assert.ok(encounterDepth(.9, 3) <= 1);
  assert.equal(chooseEncounterTypes(5, 12345, encounterDepth(.5, 3)).length, 5);
});

test('floor seeds are deterministic, distinct and in range', () => {
  const seeds = [1, 2, 3, 4].map(n => floorSeed(777, n));
  assert.equal(seeds[0], 777);
  assert.equal(new Set(seeds).size, 4);
  assert.deepEqual(seeds, [1, 2, 3, 4].map(n => floorSeed(777, n)));
  for (const seed of seeds) assert.ok(seed >= 1 && seed <= 0x7fffffff);
});

test('daily seed is stable per date and varies across dates', () => {
  assert.equal(dateKey(new Date(2026, 9, 6)), '2026-10-06');
  assert.equal(dailySeed('2026-10-06'), dailySeed('2026-10-06'));
  assert.notEqual(dailySeed('2026-10-06'), dailySeed('2026-10-07'));
  assert.ok(dailySeed() >= 1);
});

test('dying keeps 40% of the gross, extracting and winning keep all', () => {
  const run = {floorsCleared: 1, roomsCleared: 8, kills: 20};
  const gross = grossCoins(run);
  assert.equal(gross, 5 + 80 + 60 + 40);
  const dead = settleRun({...run, outcome: 'dead'}), out = settleRun({...run, outcome: 'extract'});
  assert.equal(out.kept, gross);
  assert.equal(dead.kept, Math.floor(gross * .4));
  assert.equal(dead.lost, gross - dead.kept);
  assert.ok(out.kept > dead.kept, 'banking early beats dying');
  assert.equal(settleRun({...run, outcome: 'extract', scrap: 52}).cash, 10, 'extracting cashes leftover scrap');
  assert.equal(settleRun({...run, outcome: 'extract', scrap: 52}).kept, gross + 10);
  assert.equal(settleRun({...run, outcome: 'dead', scrap: 500}).cash, 0, 'death loses all scrap');
  assert.equal(settleRun({...run, outcome: 'dead', scrap: 500}).kept, dead.kept);
  assert.equal(settleRun({...run, outcome: 'dead', keepFraction: .25}).kept, Math.floor(gross * .25));
  assert.equal(settleRun({...run, outcome: 'extract', coinMult: 1.25}).gross, Math.floor(gross * 1.25));
});

test('the boss win pays the most and risk grows with depth', () => {
  const floor3 = settleRun({outcome: 'extract', floorsCleared: 3, roomsCleared: 24, kills: 60});
  const win = settleRun({outcome: 'won', floorsCleared: 3, roomsCleared: 28, kills: 70, bossKilled: true});
  assert.ok(win.kept > floor3.kept);
  assert.ok(COIN_RATES.bossBonus >= 200);
});

test('pacing: a new player dying early can already afford something every few runs', () => {
  const cheapest = Math.min(...UNLOCKS.filter(u => u.cost).map(u => u.cost));
  const typicalFirstRun = settleRun({outcome: 'dead', floorsCleared: 0, roomsCleared: 4, kills: 8}).kept;
  assert.ok(typicalFirstRun * 2 >= cheapest, `two early deaths (${typicalFirstRun * 2}) buy the cheapest unlock (${cheapest})`);
  assert.ok(UNLOCKS.filter(u => u.cost && u.cost <= 100).length >= 8, 'plenty of unlocks under 100 coins');
});

/* ------------------------------------------------------------------ boss */
function boss(over = {}) { const b = createBoss(); activateBoss(b); b.mode = 'idle'; b.t = 0; b.invuln = false; return Object.assign(b, over); }
const ctx = (extra = {}) => ({boss: {x: 0, y: 0}, player: {x: 200, y: 0}, hpFraction: 1, adds: 0, rng: () => .25, ...extra});

function run(b, seconds, extra = {}, dt = .05) {
  const actions = [];
  for (let t = 0; t < seconds; t += dt) actions.push(...stepBoss(b, dt, ctx(extra)).actions);
  return actions;
}

test('boss phases follow remaining health', () => {
  assert.equal(bossPhaseFor(1), 1);
  assert.equal(bossPhaseFor(.66), 2);
  assert.equal(bossPhaseFor(.5), 2);
  assert.equal(bossPhaseFor(.33), 3);
  assert.equal(bossPhaseFor(.01), 3);
});

test('a dormant boss does nothing, and activation starts an invulnerable intro', () => {
  const b = createBoss();
  assert.deepEqual(stepBoss(b, 1, ctx()).actions, []);
  activateBoss(b);
  assert.equal(bossVulnerable(b), false);
  run(b, 2);
  assert.equal(bossVulnerable(b), true);
});

test('every attack shows a telegraph before it fires, and the telegraph lasts long enough to read', () => {
  for (const [kind, spec] of Object.entries(PATTERN_SPECS)) assert.ok(kind === 'beat' || spec.telegraph >= .8, kind); // the beat pattern telegraphs on the music (two beats: mark, then move), see boss.test.js
  const b = boss();
  let sawTelegraph = false, firedAfter = null, elapsed = 0;
  for (let i = 0; i < 400 && firedAfter === null; i++) {
    const result = stepBoss(b, .05, ctx());
    elapsed += .05;
    if (b.telegraph) sawTelegraph = true;
    if (result.actions.some(a => a.type === 'bullets')) firedAfter = elapsed;
  }
  assert.equal(sawTelegraph, true);
  assert.ok(firedAfter >= .8, 'no bullets before the telegraph elapses');
});

test('fan bullets are aimed at the locked angle and ring has a gap', () => {
  const b = boss({patternIndex: 0});
  const fan = run(b, 2.2).find(a => a.type === 'bullets');
  assert.equal(fan.shots.length, 5);
  assert.ok(fan.shots.every(s => Math.abs(s.angle) < .6), 'fan centred on the player at +x');
  const ring = run(boss({patternIndex: 1}), 2.4).find(a => a.type === 'bullets');
  assert.ok(ring.shots.length >= 12 && ring.shots.length < 16, 'ring leaves a gap');
});

test('phase changes pause the boss, then summon adds', () => {
  const b = boss({t: 5});
  const result = stepBoss(b, .05, ctx({hpFraction: .6}));
  assert.deepEqual(result.actions, [{type: 'phase', phase: 2}]);
  assert.equal(b.invuln, true);
  assert.ok(run(b, 2.2, {hpFraction: .6}).some(a => a.type === 'summon'));
  assert.equal(b.invuln, false);
  assert.equal(stepBoss(b, .05, ctx({hpFraction: .6})).actions.some(a => a.type === 'phase'), false);
});

test('phase 3 charges, then is exposed to extra damage', () => {
  const b = boss({phase: 3, patternIndex: 2});
  const actions = [];
  let exposedSeen = false;
  for (let i = 0; i < 100; i++) {
    const before = b.mode, r = stepBoss(b, .05, ctx({hpFraction: .2}));
    actions.push(...r.actions);
    if (bossDamageMult(b) > 1) exposedSeen = true;
    if (before === 'charge' && b.mode === 'charge') assert.ok(Math.hypot(r.move.x, r.move.y) >= BOSS.chargeSpeed - 1);
  }
  assert.ok(actions.some(a => a.type === 'charge'));
  assert.ok(actions.some(a => a.type === 'exposed'));
  assert.equal(exposedSeen, true);
});

test('a charge that hits a wall ends early', () => {
  const b = boss({phase: 3, mode: 'charge', t: BOSS.chargeTime, angle: 0});
  stepBoss(b, .1, ctx({hpFraction: .2}));
  b.hitWall = true;
  assert.ok(stepBoss(b, .05, ctx({hpFraction: .2})).actions.some(a => a.type === 'exposed'));
});

test('summons never exceed the add cap', () => {
  const b = boss({phase: 2, mode: 'telegraph', pattern: 'summon', t: .01, total: 1.2});
  assert.equal(stepBoss(b, .05, ctx({hpFraction: .5, adds: BOSS.maxAdds})).actions.some(a => a.type === 'summon'), false);
});

test('time scale stretches telegraphs: slow-mo gives more real time to react', () => {
  const fast = boss(), slow = boss();
  let fastFrames = 0, slowFrames = 0;
  while (!stepBoss(fast, .016, ctx()).actions.some(a => a.type === 'bullets')) fastFrames++;
  while (!stepBoss(slow, .016 * .18, ctx()).actions.some(a => a.type === 'bullets')) slowFrames++;
  assert.ok(slowFrames > fastFrames * 4);
});

test('every phase has a pattern list of known patterns', () => {
  for (const list of Object.values(BOSS_PATTERNS)) for (const kind of list) assert.ok(PATTERN_SPECS[kind], kind);
});

test('daily share line summarises the result', () => {
  const line = dailyShareLine({date: '2026-10-06', floor: 3, kills: 41, coins: 212, outcome: 'extract', seconds: 754});
  assert.equal(line, 'DEAD AIR DAILY 2026-10-06 · FLOOR 3/4 · 41 KILLS · +212 COINS · EXTRACTED · 12:34');
});
