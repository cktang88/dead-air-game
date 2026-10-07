// FREQUENCIES: the in-run build system. Each radio STATION is a family with its own voice and a distinct VISIBLE
// play style; every upgrade is a behavior you can watch happen, and ranking one up changes what it does (rank 2 adds
// a twist, rank 3 a flourish) instead of just growing a number. Holding two stations at level 2+ switches on a
// CROSSFADE synergy, announced with a freeze-frame name card.
//
// Pure data and logic (no DOM). Every rank is `{fx, text}`: `fx` holds the raw stat values folded by freqStats()
// and `text` renders the one-line player-facing description FROM those values, so the text cannot drift from the
// numbers game.js reads (frequencies.test.js asserts the mapping).
//
// `owned` everywhere is a plain object {upgradeId: rank}. Offers are pick-1-of-3 and come from doors and floors.

export const STATIONS = [
  {id:'static', name:'STATIC', tag:'ARC · JAM · ZAP', color:'#9ad8ff', voice:'Hiss and arc. Your fire leaks into the room.'},
  {id:'deadline', name:'DEADLINE', tag:'KILLS BUY TIME', color:'#ffd27a', voice:'Every kill refunds the clock.'},
  {id:'carrier', name:'CARRIER', tag:'PIERCE · BANK · SEEK', color:'#74dfab', voice:'One clean signal through everything.'},
  {id:'nightshift', name:'NIGHT SHIFT', tag:'HUSH · AMBUSH · SILENT KILLS', color:'#b49bff', voice:'Quiet hands. Nobody hears the shift end.'},
  {id:'feedback', name:'FEEDBACK', tag:'POWER FROM RISK', color:'#ff7a8a', voice:'The closer you are to dead, the louder you get.'},
];
export const STATION_BY_ID = new Map(STATIONS.map(s => [s.id, s]));

export const RANK_NAMES = ['COMMON', 'RARE', 'EPIC'];
export const MAX_RANK = 3;

const TILE = 32;
const pct = v => `${Math.round(v * 100)}%`;
const tiles = px => { const t = px / TILE; return Number.isInteger(t) ? `${t}` : t.toFixed(1); };

// `unlockCost:null` upgrades are available from the first run; others are bought in the safehouse (id `freq:<id>`).
const RAW = [
  // ---------------------------------------------------------------- STATIC: your fire leaks into the room
  {id:'arc', station:'static', name:'ARC LIGHT', effect:'arc', unlockCost:null, ranks:[
    {fx:{chain:.5, chainTargets:1}, text: f => `Every hit arcs a lightning bolt to the nearest other enemy within 4 tiles for ${pct(f.chain)} damage.`},
    {fx:{chain:.5, chainTargets:2}, text: () => 'Twist: the arc jumps on to a second enemy.'},
    {fx:{chain:.6, chainTargets:2, arcStun:1}, text: f => `Flourish: arcs hit for ${pct(f.chain)} and jam every enemy they touch for ${f.arcStun} s.`},
  ]},
  {id:'jam', station:'static', name:'JAMMER', effect:'jam', unlockCost:null, ranks:[
    {fx:{jam:.4}, text: f => `Your hits jam the target for ${f.jam} s: it cannot shoot, and its bullets in the air vanish.`},
    {fx:{jam:.4, jamSplash:64}, text: f => `Twist: the jam splashes to enemies within ${tiles(f.jamSplash)} tiles of the target.`},
    {fx:{jam:.8, jamSplash:96}, text: f => `Flourish: jam lasts ${f.jam} s and splashes ${tiles(f.jamSplash)} tiles.`},
  ]},
  {id:'distortion', station:'static', name:'DISTORTION FIELD', effect:'bubble', unlockCost:35, ranks:[
    {fx:{bubble:64, bubbleSlow:.45}, text: f => `A ring around you (${tiles(f.bubble)} tiles) slows enemy bullets to ${pct(f.bubbleSlow)}. Weave through them.`},
    {fx:{bubble:96, bubbleSlow:.25}, text: f => `Twist: the ring grows to ${tiles(f.bubble)} tiles and slows bullets to ${pct(f.bubbleSlow)}.`},
    {fx:{bubble:96, bubbleSlow:.25, bubbleZap:44}, text: f => `Flourish: any bullet that gets within ${tiles(f.bubbleZap)} tiles of you is zapped out of the air.`},
  ]},
  {id:'dead_channel', station:'static', name:'DEAD CHANNEL', effect:'pulse', unlockCost:60, ranks:[
    {fx:{pulse:80}, text: f => `Kills release a shockwave that jams enemies within ${tiles(f.pulse)} tiles.`},
    {fx:{pulse:80, pulseWipe:1}, text: () => 'Twist: the shockwave also erases enemy bullets in the air.'},
    {fx:{pulse:128, pulseWipe:1, pulseKnock:1}, text: f => `Flourish: the shockwave reaches ${tiles(f.pulse)} tiles and shoves enemies back.`},
  ]},
  // ---------------------------------------------------------------- DEADLINE: time is a currency
  {id:'borrowed', station:'deadline', name:'BORROWED TIME', effect:'credit', unlockCost:null, ranks:[
    {fx:{creditPerKill:.8}, text: f => `Each kill refunds ${f.creditPerKill} s of slow time: the world runs at half speed while you walk.`},
    {fx:{creditPerKill:.8, hitCredit:1.5}, text: f => `Twist: getting hit refunds ${f.hitCredit} s too, so a mistake buys room to recover.`},
    {fx:{creditPerKill:.8, hitCredit:1.5, lastStand:1}, text: () => 'Flourish: at 1 health the world always runs at half speed while you walk.'},
  ]},
  {id:'freeze', station:'deadline', name:'HANG FIRE', effect:'hang', unlockCost:45, ranks:[
    {fx:{hangKill:1.5}, text: f => `A kill while you stand still freezes the victim's bullets in mid-air for ${f.hangKill} s.`},
    {fx:{hangKill:4, hangUntilMove:1}, text: f => `Twist: frozen bullets hang until you move again (at most ${f.hangKill} s).`},
    {fx:{hangKill:4, hangUntilMove:1, hangAll:192}, text: f => `Flourish: the kill freezes every enemy bullet within ${tiles(f.hangAll)} tiles.`},
  ]},
  {id:'held_breath', station:'deadline', name:'HELD BREATH', effect:'heldBreath', unlockCost:null, ranks:[
    {fx:{heldBreath:.5}, text: f => `Stand still for 0.6 s and a ring pings: your next shot deals +${pct(f.heldBreath)}.`},
    {fx:{heldBreath:.5, heldPierce:1}, text: () => 'Twist: the charged shot pierces every enemy in its line.'},
    {fx:{heldBreath:.5, heldPierce:1, heldBreathSilent:1}, text: () => 'Flourish: the charged shot is silent.'},
  ]},
  // ---------------------------------------------------------------- CARRIER: one clean signal
  {id:'through', station:'carrier', name:'THROUGHPUT', effect:'pierce', unlockCost:null, ranks:[
    {fx:{pierce:1}, text: f => `Rounds pierce ${f.pierce} enemy: one tracer, two victims.`},
    {fx:{pierce:2, crateThru:1}, text: f => `Twist: rounds pierce ${f.pierce} enemies and punch straight through crates.`},
    {fx:{pierce:9, crateThru:1}, text: () => 'Flourish: rounds pierce every enemy and crate in their line.'},
  ]},
  {id:'bounce', station:'carrier', name:'MULTIPATH', effect:'ricochet', unlockCost:null, ranks:[
    {fx:{ricochet:1}, text: () => 'Bullets bounce off a wall once. Bank shots around cover.'},
    {fx:{ricochet:1, bounceSeek:1}, text: () => 'Twist: the bounce bends toward the nearest enemy.'},
    {fx:{ricochet:3, bounceSeek:1}, text: f => `Flourish: bullets bounce ${f.ricochet} times, bending toward an enemy each time.`},
  ]},
  {id:'homing', station:'carrier', name:'LOCK-ON', effect:'homing', unlockCost:55, ranks:[
    {fx:{homing:1, homingRange:140}, text: f => `Bullets curve toward an enemy within ${tiles(f.homingRange)} tiles of their path.`},
    {fx:{homing:1.8, homingRange:200}, text: f => `Twist: a tighter curve that finds enemies up to ${tiles(f.homingRange)} tiles away.`},
    {fx:{homing:2.6, homingRange:280}, text: f => `Flourish: bullets hunt: they swing onto targets up to ${tiles(f.homingRange)} tiles away.`},
  ]},
  {id:'shatter', station:'carrier', name:'SHATTER', effect:'shards', unlockCost:70, ranks:[
    {fx:{shards:2}, text: f => `Kills burst into ${f.shards} seeking shards.`},
    {fx:{shards:3, shardPierce:1}, text: f => `Twist: ${f.shards} shards, and each pierces one enemy.`},
    {fx:{shards:4, shardPierce:1, shardBounce:1}, text: f => `Flourish: ${f.shards} shards that also ricochet off one wall.`},
  ]},
  // ---------------------------------------------------------------- NIGHT SHIFT: nobody hears the shift end
  {id:'silent', station:'nightshift', name:'DEAD MIC', effect:'noise', unlockCost:null, ranks:[
    {fx:{noise:.5}, text: () => 'Your shots make half the noise: the ring that wakes rooms is half size.'},
    {fx:{noise:.5, quietKill:1}, text: () => 'Twist: a shot that kills an enemy who has not noticed you makes no noise at all.'},
    {fx:{noise:.75, quietKill:1, sprintSilent:1}, text: f => `Flourish: shots are ${pct(f.noise)} quieter and sprinting makes no noise.`},
  ]},
  {id:'blindside', station:'nightshift', name:'BLINDSIDE', effect:'unaware', unlockCost:null, ranks:[
    {fx:{unaware:.6}, text: f => `+${pct(f.unaware)} damage to enemies who have not noticed you.`},
    {fx:{unaware:.6, ambush:1}, text: () => 'Twist: any hit on an unaware enemy kills it outright (brutes, riots and the boss excepted).'},
    {fx:{unaware:.6, ambush:1, ammoBack:1}, text: () => 'Flourish: a quiet takedown puts the round back in your magazine.'},
  ]},
  {id:'smoke_reload', station:'nightshift', name:'SMOKE BLOOM', effect:'smokeReload', unlockCost:45, ranks:[
    {fx:{smokeReload:55, smokeTime:3}, text: f => `Reloading drops a small smoke cloud (${f.smokeTime} s). Reload is cover.`},
    {fx:{smokeReload:75, smokeTime:3}, text: f => `Twist: a bigger cloud, ${tiles(f.smokeReload)} tiles wide.`},
    {fx:{smokeReload:95, smokeTime:6}, text: f => `Flourish: the cloud grows to ${tiles(f.smokeReload)} tiles and lingers ${f.smokeTime} s.`},
  ]},
  {id:'blackout', station:'nightshift', name:'BLACKOUT', effect:'cones', unlockCost:55, ranks:[
    {fx:{coneRange:.8}, text: f => `Enemy vision cones are ${pct(1 - f.coneRange)} shorter. Watch them shrink.`},
    {fx:{coneRange:.7, coneHalf:.8}, text: f => `Twist: cones are ${pct(1 - f.coneRange)} shorter and ${pct(1 - f.coneHalf)} narrower.`},
    {fx:{coneRange:.6, coneHalf:.7, stillCloak:96}, text: f => `Flourish: stand still and unaware enemies cannot notice you from more than ${tiles(f.stillCloak)} tiles.`},
  ]},
  // ---------------------------------------------------------------- FEEDBACK: the closer to dead, the louder
  {id:'rage', station:'feedback', name:'RED LINE', effect:'missingHp', unlockCost:null, ranks:[
    {fx:{missingHp:.2}, text: f => `Each health point you are missing: +${pct(f.missingHp)} damage, and your shots grow bigger and brighter.`},
    {fx:{missingHp:.2, ragePierce:1}, text: () => 'Twist: at 2 health or less your shots pierce one enemy.'},
    {fx:{missingHp:.2, ragePierce:1, rageBlast:48}, text: f => `Flourish: at 1 health your shots burst on impact (${tiles(f.rageBlast)} tiles).`},
  ]},
  {id:'loop', station:'feedback', name:'ECHO', effect:'echo', unlockCost:null, ranks:[
    {fx:{echoDmg:.5, echoCount:1}, text: f => `At 2 health or less every shot echoes: a ghost round follows 0.2 s later for ${pct(f.echoDmg)} damage.`},
    {fx:{echoDmg:.75, echoCount:1}, text: f => `Twist: the echo hits for ${pct(f.echoDmg)}.`},
    {fx:{echoDmg:.75, echoCount:2}, text: () => 'Flourish: two echoes trail every shot.'},
  ]},
  {id:'kindle', station:'feedback', name:'KINDLING', effect:'burnKill', unlockCost:55, ranks:[
    {fx:{burnKill:70}, text: f => `Kills set fire to enemies within ${tiles(f.burnKill)} tiles: they burn for 3 s and panic.`},
    {fx:{burnKill:100}, text: f => `Twist: the fire reaches ${tiles(f.burnKill)} tiles.`},
    {fx:{burnKill:130}, text: f => `Flourish: the fire reaches ${tiles(f.burnKill)} tiles.`},
  ]},
  {id:'backlash', station:'feedback', name:'BACKLASH', effect:'backlash', unlockCost:70, ranks:[
    {fx:{hitPulse:96}, text: f => `Taking a hit sends out a shockwave that jams enemies within ${tiles(f.hitPulse)} tiles.`},
    {fx:{hitPulse:128, hitWipe:1}, text: () => 'Twist: the shockwave also erases enemy bullets in the air.'},
    {fx:{hitPulse:160, hitWipe:1, hitKnock:1}, text: f => `Flourish: the shockwave reaches ${tiles(f.hitPulse)} tiles and shoves enemies back.`},
  ]},
];
export const UPGRADES = RAW.map(u => ({...u, ranks: u.ranks.map(r => ({...r, v: r.fx, desc: r.text(r.fx)}))}));
export const UPGRADE_BY_ID = new Map(UPGRADES.map(u => [u.id, u]));
export const upgradeById = id => UPGRADE_BY_ID.get(id);

// Crossfades: both stations at level 2+ (total ranks) switch the synergy on. Each has a visible effect in play.
export const CROSSFADE_LEVEL = 2;
export const CROSSFADES = [
  {id:'signal_boost', stations:['static', 'carrier'], name:'SIGNAL BOOST', desc:'Arcs jump to one extra enemy, and every ricochet fires an arc at the nearest enemy.', effects:{chainTargets:1, bounceArc:1}},
  {id:'dead_air', stations:['static', 'deadline'], name:'DEAD AIR', desc:'Killing a jammed enemy refunds 1 s of slow time.', effects:{stunKillCredit:1}},
  {id:'hold_breath', stations:['deadline', 'nightshift'], name:'HOLD YOUR BREATH', desc:'The held-breath bonus doubles and the shot is silent.', effects:{heldBreathMult:2, heldBreathSilent:1}},
  {id:'red_shift', stations:['carrier', 'feedback'], name:'RED SHIFT', desc:'Ricocheted bullets deal +60% damage and glow red.', effects:{bounceDamage:.6}},
  {id:'borrowed_pulse', stations:['deadline', 'feedback'], name:'BORROWED PULSE', desc:'At 2 health or less, every kill releases a 3-tile jamming shockwave.', effects:{lowPulse:96}},
  {id:'dead_drop', stations:['nightshift', 'feedback'], name:'DEAD DROP', desc:'Quiet kills heal 1 health when you are at half health or less.', effects:{unawareHeal:1}},
  {id:'white_noise', stations:['static', 'nightshift'], name:'WHITE NOISE', desc:'Jams last twice as long on enemies who have not noticed you.', effects:{unawareStunMult:2}},
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const rankOf = (owned, id) => owned?.[id] || 0;
export function stationLevel(owned, station) {
  return UPGRADES.filter(u => u.station === station).reduce((sum, u) => sum + rankOf(owned, u.id), 0);
}
export function activeCrossfades(owned) {
  return CROSSFADES.filter(c => c.stations.every(s => stationLevel(owned, s) >= CROSSFADE_LEVEL));
}
export function dominantStation(owned) {
  let best = null, level = 0;
  for (const s of STATIONS) { const l = stationLevel(owned, s.id); if (l > level) { level = l; best = s.id; } }
  return best;
}

// Every raw stat a rank's `fx` may set, with its zero value. Tests check that each rank only uses these keys.
export const STAT_DEFAULTS = {
  chain:0, chainTargets:0, arcStun:0, jam:0, jamSplash:0, bubble:0, bubbleSlow:1, bubbleZap:0, pulse:0, pulseWipe:0, pulseKnock:0,
  creditPerKill:0, hitCredit:0, lastStand:0, hangKill:0, hangUntilMove:0, hangAll:0, heldBreath:0, heldPierce:0, heldBreathSilent:0,
  pierce:0, crateThru:0, ricochet:0, bounceSeek:0, homing:0, homingRange:0, shards:0, shardPierce:0, shardBounce:0,
  noise:0, quietKill:0, sprintSilent:0, unaware:0, ambush:0, ammoBack:0, smokeReload:0, smokeTime:3, coneRange:1, coneHalf:1, stillCloak:0,
  missingHp:0, ragePierce:0, rageBlast:0, echoDmg:0, echoCount:0, burnKill:0, hitPulse:0, hitWipe:0, hitKnock:0,
};

// Fold owned ranks + active crossfades into plain numbers for the game hooks.
export function freqStats(owned = {}) {
  const x = {}; for (const c of activeCrossfades(owned)) for (const [k, v] of Object.entries(c.effects)) x[k] = (x[k] || 0) + v;
  const s = {...STAT_DEFAULTS};
  for (const u of UPGRADES) { const r = rankOf(owned, u.id); if (r > 0) Object.assign(s, u.ranks[Math.min(r, MAX_RANK) - 1].fx); }
  return {
    ...s,
    chainTargets: s.chainTargets + (x.chainTargets || 0), bounceArc: Boolean(x.bounceArc),
    heldBreath: s.heldBreath * (x.heldBreathMult || 1), heldBreathSilent: Boolean(s.heldBreathSilent || x.heldBreathSilent),
    bounceDamage: x.bounceDamage || 0,
    noiseMult: clamp(1 - s.noise, .1, 1), unawareDamage: s.unaware, missingHpDamage: s.missingHp,
    stunKillCredit: x.stunKillCredit || 0, lowPulse: x.lowPulse || 0, unawareHeal: x.unawareHeal || 0, unawareStunMult: x.unawareStunMult || 1,
  };
}

export function pickFrequency(owned, id) {
  const u = UPGRADE_BY_ID.get(id);
  if (!u || rankOf(owned, id) >= MAX_RANK) return owned;
  return {...owned, [id]: rankOf(owned, id) + 1};
}

export function availableUpgrades(unlockedIds, owned = {}) {
  const unlocked = new Set(unlockedIds);
  return UPGRADES.filter(u => (u.unlockCost === null || unlocked.has(`freq:${u.id}`)) && rankOf(owned, u.id) < MAX_RANK);
}

// Crossfades that picking `upgrade` would newly switch on.
export function crossfadesCompletedBy(owned, upgradeId) {
  const before = new Set(activeCrossfades(owned).map(c => c.id));
  return activeCrossfades(pickFrequency(owned, upgradeId)).filter(c => !before.has(c.id));
}

// Pick-1-of-3 offer. Builds come from commitment, so crossfades actually happen:
//   card 1: a crossfade completer when one is in reach (60%), otherwise a card from a station you hold;
//   card 2: a card from a station you hold;
//   card 3: a fresh voice (a station not already on the table) so a build can still pivot.
// With nothing held yet it is three cards from three different stations. At most two cards share a station.
export function offerFrequencies({unlockedIds = [], owned = {}, rng = Math.random, count = 3} = {}) {
  const pool = availableUpgrades(unlockedIds, owned);
  const held = new Set(STATIONS.map(s => s.id).filter(s => stationLevel(owned, s) > 0));
  const chosen = [], used = new Map();
  const pickFrom = list => {
    if (!list.length) return false;
    const u = list[Math.floor(rng() * list.length)];
    chosen.push(u); used.set(u.station, (used.get(u.station) || 0) + 1); pool.splice(pool.indexOf(u), 1);
    return true;
  };
  const room = u => (used.get(u.station) || 0) < 2;
  if (held.size) {
    const completers = pool.filter(u => crossfadesCompletedBy(owned, u.id).length);
    if (completers.length && rng() < .6) pickFrom(completers);
    pickFrom(pool.filter(u => held.has(u.station) && room(u)));
    if (chosen.length < 2) pickFrom(pool.filter(u => held.has(u.station) && room(u)));
  }
  while (chosen.length < count && pool.length) {
    const fresh = pool.filter(u => !used.has(u.station)), roomy = pool.filter(room);
    pickFrom(fresh.length ? fresh : roomy.length ? roomy : pool);
  }
  return chosen.map(u => {
    const rank = rankOf(owned, u.id) + 1;
    return {id: u.id, station: u.station, name: u.name, rank, rarity: RANK_NAMES[rank - 1].toLowerCase(), desc: u.ranks[rank - 1].desc, isNew: rank === 1, held: held.has(u.station), crossfades: crossfadesCompletedBy(owned, u.id).map(c => c.id)};
  });
}

export function buildSummary(owned = {}) {
  return UPGRADES.filter(u => rankOf(owned, u.id) > 0).map(u => ({id: u.id, name: u.name, station: u.station, rank: rankOf(owned, u.id)}));
}
