// Knowledge layer: persistence for the Signal Check flag, one-time NAME CARDS and the FIELD MANUAL.
// Pure: every function takes plain data (and an optional Storage), so it is unit tested under node.
//
// Principle 2 (no hidden rules): the pause menu lists one plain line per mechanic the player has met.
// Principle 3: a new thing gets a name card the first time it appears (non-blocking, 2 s, top of screen).

export const ONBOARDING_KEY = 'dead-air.onboarding.v1';

export const emptyOnboarding = () => ({signalDone: false, manual: [], cards: []});

export function parseOnboarding(raw) {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const ok = !!data && typeof data === "object";
    const ids = list => (ok && Array.isArray(list) ? [...new Set(list.filter(x => typeof x === 'string'))] : []);
    return {signalDone: ok && data.signalDone === true, manual: ids(data?.manual), cards: ids(data?.cards)};
  } catch { return emptyOnboarding(); }
}
export function loadOnboarding(storage) {
  try { return parseOnboarding(storage?.getItem(ONBOARDING_KEY)); } catch { return emptyOnboarding(); }
}
export function saveOnboarding(storage, data) {
  try { storage?.setItem(ONBOARDING_KEY, JSON.stringify({signalDone: !!data.signalDone, manual: [...data.manual], cards: [...data.cards]})); return true; } catch { return false; }
}
export function clearOnboarding(storage) { try { storage?.removeItem(ONBOARDING_KEY); } catch { /* storage unavailable */ } }

/** First runs start on the Signal Check. Returning players (a finished run, or the flag) skip it. */
export function shouldRunSignalCheck(onboarding, progress, {daily = false, forced = false} = {}) {
  if (forced) return true;
  if (daily) return false;
  if (onboarding?.signalDone) return false;
  return !((progress?.stats?.runs ?? 0) > 0);
}

// ------------------------------------------------------------------------------------------------ name cards
/** id -> {title, line}. Shown once, ever, the first time the thing appears. Lines are short fragments, not sentences. */
export const NAME_CARDS = Object.freeze({
  'time.breath': {title: 'BREATH', line: 'time follows your feet'},
  'time.shot': {title: 'SHOT', line: 'every shot lets time through'},
  'enemy.chaser': {title: 'RUSHER', line: 'back-pedal on the red swing'},
  'enemy.gunner': {title: 'GUNNER', line: 'leave the red line'},
  'enemy.guard': {title: 'WARDEN', line: 'step out of the red line'},
  'enemy.sniper': {title: 'MARKSMAN', line: 'leave its lane'},
  'enemy.brute': {title: 'BRUTE', line: 'circle the heavy swing'},
  'enemy.riot': {title: 'RIOT', line: 'hit the sides or the back'},
  'mech.door': {title: 'DOOR', line: 'hold E to peek'},
  'mech.sleeper': {title: 'SLEEPER', line: 'no cone · hears noise'},
  'mech.silent': {title: 'SILENT', line: 'unseen hits count double'},
  'mech.flash': {title: 'FLASH', line: 'stuns what it sees'},
  'mech.choice': {title: 'CHOICE', line: 'walk into one'},
  'mech.glass': {title: 'WINDOW', line: 'shots pass through'},
});
export const enemyCardId = type => `enemy.${type}`;
/** Cards the Signal Check itself plays; a replay shows them again. */
export const SIGNAL_CARD_IDS = Object.freeze(['time.breath', 'time.shot', 'enemy.guard', 'mech.door', 'mech.choice']);

/** Next card to show: the first wanted id not yet seen. `wanted` is ordered by priority. */
export function nextCard(wanted, seen) {
  for (const id of wanted) if (NAME_CARDS[id] && !seen.has(id)) return {id, ...NAME_CARDS[id]};
  return null;
}

// ------------------------------------------------------------------------------------------------ field manual
export const MANUAL_SECTIONS = Object.freeze(['TIME', 'COMBAT', 'ENEMIES', 'ITEMS', 'ECONOMY', 'ROOMS']);

/** One plain line per mechanic (current code: continuous time rule, stealth, 3 HP, doors, frequencies, multi-floor runs). */
export const MANUAL = Object.freeze([
  // TIME
  {id: 'still', section: 'TIME', title: 'STILL', line: 'Stand still and the world nearly stops (0.08x).'},
  {id: 'walk', section: 'TIME', title: 'WALK', line: 'Walking lets time crawl at about a third. Sprinting runs it at full speed, and it is loud.'},
  {id: 'shot', section: 'TIME', title: 'EVERY SHOT', line: 'Each shot lets a beat of time through, so one careful shot is cheap and spraying is not.'},
  {id: 'hands', section: 'TIME', title: 'YOUR HANDS', line: 'Your aim, movement, reload and bullets never slow down. Only the world does.'},
  // COMBAT
  {id: 'hp', section: 'COMBAT', title: 'THREE HITS', line: 'You go down in three hits. After a hit you are briefly untouchable (the ring around you).'},
  {id: 'armor', section: 'COMBAT', title: 'ARMOR', line: 'A plate soaks damage before your health does, then it is spent.'},
  {id: 'bloom', section: 'COMBAT', title: 'CROSSHAIR', line: 'The ring widens when you move or keep firing. Stand still and tap for pinpoint shots.'},
  {id: 'reload', section: 'COMBAT', title: 'RELOAD', line: 'An empty gun reloads by itself. Press R to top it up early.'},
  {id: 'swap', section: 'COMBAT', title: 'AUTO SWAP', line: 'With no reserve left you swap to a loaded gun automatically.'},
  {id: 'pierce', section: 'COMBAT', title: 'PIERCING', line: 'Marksman rounds punch through enemies and crates. Anti-materiel also goes through one wall.'},
  {id: 'crate', section: 'COMBAT', title: 'CRATES', line: 'Crates stop bullets, yours and theirs, until they break.'},
  {id: 'noise', section: 'COMBAT', title: 'NOISE RINGS', line: 'Shots and kicked doors ring outward. Sprinting is loud too: a sound-wave mark shows who hears your steps.'},
  {id: 'silent', section: 'COMBAT', title: 'SILENT', line: 'Hit a sleeper, or an unaware enemy from behind, for double damage.'},
  {id: 'throw', section: 'COMBAT', title: 'THROWABLES', line: 'Flash stuns what sees it, frag kills (and hurts you). Walls stop both.'},
  {id: 'glass', section: 'COMBAT', title: 'GLASS', line: 'Windows stop walking but not sight or bullets.'},
  // ENEMIES
  {id: 'alert', section: 'ENEMIES', title: '! AND ?', line: '? means it is working you out, ! means it has you. Fill time is longer when you move slowly.'},
  {id: 'cone', section: 'ENEMIES', title: 'VISION CONE', line: 'An unaware enemy sees only inside its drawn cone. Stay out of it or come from behind.'},
  {id: 'sleeper', section: 'ENEMIES', title: 'SLEEPERS', line: 'zZ means asleep: no cone, but shots and sprinting wake it.'},
  {id: 'chaser', section: 'ENEMIES', title: 'RUSHER', line: 'Sprints in, then lunges after a red wind-up. Back-pedal as it winds up.'},
  {id: 'gunner', section: 'ENEMIES', title: 'GUNNER', line: 'A red line fills, then it fires. Leave the line.'},
  {id: 'guard', section: 'ENEMIES', title: 'WARDEN', line: 'Slow, tough shooter with a longer wind-up. Keeps its distance.'},
  {id: 'sniper', section: 'ENEMIES', title: 'MARKSMAN', line: 'A lane that turns white-hot has locked on. Break the line of sight.'},
  {id: 'brute', section: 'ENEMIES', title: 'BRUTE', line: 'A heavy orange swing. Circle it; it is open right after it swings.'},
  {id: 'riot', section: 'ENEMIES', title: 'RIOT', line: 'The shield covers its front. Hit the sides or back, or flash it.'},
  {id: 'stun', section: 'ENEMIES', title: 'STUNNED', line: 'Stars over a head mean it cannot act.'},
  {id: 'offscreen', section: 'ENEMIES', title: 'ON SCREEN ONLY', line: 'Enemies only fire at you while on screen. Chevrons point at threats off screen.'},
  // ITEMS
  {id: 'pickup', section: 'ITEMS', title: 'PICKUPS', line: 'Green plus heals, blue plates armor, cyan is ammo. Walk over them.'},
  {id: 'gun', section: 'ITEMS', title: 'GUNS', line: 'Take a gun to swap it into a slot. Its stats compare against your current gun.'},
  {id: 'mod', section: 'ITEMS', title: 'MODS', line: 'A mod changes how a gun behaves. Fit them at the workbench (TAB).'},
  // ECONOMY
  {id: 'scrap', section: 'ECONOMY', title: 'SCRAP', line: 'Scrap is this run’s money. You lose what you carry if you die.'},
  {id: 'coins', section: 'ECONOMY', title: 'COINS', line: 'Coins are banked when a run ends and buy permanent options in the safehouse.'},
  {id: 'gate', section: 'ECONOMY', title: 'GATES', line: 'A locked gate costs scrap and hides a cache.'},
  {id: 'supply', section: 'ECONOMY', title: 'SUPPLY', line: 'Spend scrap or pick one reward at a supply station.'},
  {id: 'freq', section: 'ECONOMY', title: 'FREQUENCIES', line: 'Frequencies are in-run upgrades from radio stations. They stack, and pairs crossfade.'},
  {id: 'extract', section: 'ECONOMY', title: 'EXTRACT OR DESCEND', line: 'When the route is clear, leave with your coins or go deeper for more.'},
  // ROOMS
  {id: 'door', section: 'ROOMS', title: 'DOORS', line: 'E opens a door (quietly; at a sprint it is loud). Hold E to peek in frozen time.'},
  {id: 'clear', section: 'ROOMS', title: 'CLEARING', line: 'Clearing a room pays scrap and drops a medkit when you are hurt.'},
  {id: 'rewards', section: 'ROOMS', title: 'REWARD DOORS', line: 'The icon over a doorway shows what the room beyond pays.'},
  {id: 'minimap', section: 'ROOMS', title: 'MINIMAP', line: 'Dots are enemies in rooms you have seen.'},
]);
export const MANUAL_BY_ID = new Map(MANUAL.map(entry => [entry.id, entry]));

/**
 * What the player has just met. ctx is a plain snapshot built by game.js:
 *   speedRatio, moved, shots, runSeconds, hits, armor, bloom, reloaded, autoSwapped, crateHit, noiseRing, silentHit,
 *   thrown, glassSeen, enemies:[{type, aware, suspicion, posture, windup, aiming, locked, shield, stun, visible}],
 *   offscreenThreat, pickedUp:Set(kinds), doorSeen, roomsCleared, calmRegen, rewardDoors, minimapEnemies, scrap,
 *   gateSeen, supplySeen, freqPicked, exitOpen, gunPickup, modPickup, coinsBanked, shotCategory
 * Returns the list of manual ids the snapshot unlocks (order stable); the caller removes the ones already known.
 */
export function manualTriggers(ctx) {
  const ids = [];
  const add = (id, cond) => { if (cond) ids.push(id); };
  add('still', ctx.moved && ctx.speedRatio <= 0.04);
  add('walk', ctx.speedRatio >= 0.2);
  add('shot', ctx.shots >= 1);
  add('hands', ctx.runSeconds >= 10);
  add('hp', ctx.hits >= 1);
  add('armor', ctx.armor > 0);
  add('bloom', ctx.shots >= 1 && ctx.bloom > 0.08);
  add('reload', ctx.reloaded);
  add('swap', ctx.autoSwapped);
  add('pierce', ctx.shots >= 1 && (ctx.shotCategory === 'SNIPER' || ctx.shotCategory === 'ANTI-MATERIEL'));
  add('crate', ctx.crateHit);
  add('noise', ctx.noiseRing);
  add('silent', ctx.silentHit);
  add('throw', ctx.thrown);
  add('glass', ctx.glassSeen);
  const en = ctx.enemies || [];
  add('alert', en.some(e => e.aware || e.suspicion >= 0.12));
  add('cone', en.some(e => e.visible && !e.aware && e.posture && e.posture !== 'sleep'));
  add('sleeper', en.some(e => e.visible && e.posture === 'sleep' && !e.aware));
  for (const type of ['chaser', 'gunner', 'guard', 'sniper', 'brute', 'riot']) add(type, en.some(e => e.visible && e.type === type));
  add('stun', en.some(e => e.stun > 0.3));
  add('offscreen', !!ctx.offscreenThreat);
  add('pickup', !!ctx.pickedUp && ctx.pickedUp.size > 0);
  add('gun', ctx.gunPickup);
  add('mod', ctx.modPickup);
  add('scrap', (ctx.scrap > (ctx.startScrap ?? 0)) || (ctx.pickedUp?.has?.('scrap') ?? false));
  add('coins', ctx.coinsBanked);
  add('gate', ctx.gateSeen);
  add('supply', ctx.supplySeen);
  add('freq', ctx.freqPicked);
  add('extract', ctx.exitOpen);
  add('door', ctx.doorSeen);
  add('clear', ctx.roomsCleared >= 1);
  add('rewards', ctx.rewardDoors);
  add('minimap', ctx.minimapEnemies);
  return ids;
}

/** Merge new ids into the unlocked list. Returns {unlocked (array), fresh (ids added now)}. */
export function unlockManual(unlocked, triggered) {
  const have = new Set(unlocked), fresh = [];
  for (const id of triggered) if (MANUAL_BY_ID.has(id) && !have.has(id)) { have.add(id); fresh.push(id); }
  return {unlocked: [...have], fresh};
}

/** Sections with their known / total counts, for the pause tab. Unknown entries render as a locked dot, no text. */
export function manualView(unlocked) {
  const have = new Set(unlocked);
  return MANUAL_SECTIONS.map(section => {
    const entries = MANUAL.filter(entry => entry.section === section);
    return {section, known: entries.filter(entry => have.has(entry.id)), total: entries.length, locked: entries.filter(entry => !have.has(entry.id)).length};
  });
}
