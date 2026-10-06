// FREQUENCIES: the in-run build system. Each radio STATION is a family with its own voice and play style;
// upgrades rank up when picked again (common -> rare -> epic), and holding two stations at level 2+ switches on a
// CROSSFADE synergy. Pure data and logic (no DOM): game.js applies the numbers from freqStats() at real hooks.
//
// `owned` everywhere is a plain object {upgradeId: rank}. Offers are pick-1-of-3 and come from doors and floors.

export const STATIONS = [
  {id:'static', name:'STATIC', tag:'CHAIN · STUN · INTERFERE', color:'#9ad8ff', voice:'Hiss and arc. Your shots leak into the room.'},
  {id:'deadline', name:'DEADLINE', tag:'KILLS BUY TIME', color:'#ffd27a', voice:'Every kill refunds the clock.'},
  {id:'carrier', name:'CARRIER', tag:'PIERCE · RICOCHET', color:'#74dfab', voice:'One clean signal through everything.'},
  {id:'nightshift', name:'NIGHT SHIFT', tag:'STEALTH · SILENT KILLS', color:'#b49bff', voice:'Quiet hands. Nobody hears the shift end.'},
  {id:'feedback', name:'FEEDBACK', tag:'DAMAGE SCALES WITH RISK', color:'#ff7a8a', voice:'The closer you are to dead, the louder you get.'},
];
export const STATION_BY_ID = new Map(STATIONS.map(s => [s.id, s]));

export const RANK_NAMES = ['COMMON', 'RARE', 'EPIC'];
export const MAX_RANK = 3;

// `ranks[i]` describes rank i+1 and holds the raw value read by freqStats via `effect`.
// `unlockCost:null` upgrades are available from the first run; others are bought in the safehouse (id `freq:<id>`).
export const UPGRADES = [
  // STATIC: your fire leaks into the room
  {id:'arc', station:'static', name:'ARC LIGHT', effect:'chain', unlockCost:null, ranks:[{v:.35, desc:'Hits chain to the nearest other enemy for 35% damage.'}, {v:.5, desc:'Chain damage 50%.'}, {v:.7, desc:'Chain damage 70%.'}]},
  {id:'jam', station:'static', name:'JAMMER', effect:'stun', unlockCost:null, ranks:[{v:.35, desc:'Hits stun enemies for +0.35 s: a stunned enemy cannot shoot.'}, {v:.6, desc:'Hits stun for +0.6 s.'}, {v:.9, desc:'Hits stun for +0.9 s.'}]},
  {id:'distortion', station:'static', name:'DISTORTION FIELD', effect:'bubble', unlockCost:35, ranks:[{v:70, desc:'Enemy bullets slow to 45% within 2 tiles of you. Weave through them.'}, {v:100, desc:'Slow field reaches 3 tiles.'}, {v:130, desc:'Slow field reaches 4 tiles.'}]},
  {id:'dead_channel', station:'static', name:'DEAD CHANNEL', effect:'pulse', unlockCost:60, ranks:[{v:80, desc:'Kills pulse a 2.5 tile stun burst.'}, {v:110, desc:'Kill pulse reaches 3.5 tiles.'}, {v:140, desc:'Kill pulse reaches 4.5 tiles.'}]},
  // DEADLINE: time is a currency
  {id:'borrowed', station:'deadline', name:'BORROWED TIME', effect:'credit', unlockCost:null, ranks:[{v:.6, desc:'Each kill: 0.6 s of walking at half speed.'}, {v:.9, desc:'Each kill: 0.9 s of half-speed walking.'}, {v:1.3, desc:'Each kill: 1.3 s of half-speed walking.'}]},
  {id:'reload_kill', station:'deadline', name:'CLEAN SLATE', effect:'reloadKill', unlockCost:null, ranks:[{v:.25, desc:'Kills refill 25% of your magazine. Chain kills never reload.'}, {v:.4, desc:'Kills refill 40% of the magazine.'}, {v:.6, desc:'Kills refill 60% of the magazine.'}]},
  {id:'freeze', station:'deadline', name:'FREEZE FRAME', effect:'freeze', unlockCost:45, ranks:[{v:.3, desc:'Every kill freezes time for 0.3 s, even mid-sprint.'}, {v:.45, desc:'Kill freeze lasts 0.45 s.'}, {v:.65, desc:'Kill freeze lasts 0.65 s.'}]},
  {id:'held_breath', station:'deadline', name:'HELD BREATH', effect:'heldBreath', unlockCost:40, ranks:[{v:.25, desc:'After 0.6 s still, your next shot deals +25%.'}, {v:.4, desc:'Held-breath shot +40%.'}, {v:.6, desc:'Held-breath shot +60%.'}]},
  // CARRIER: one clean signal
  {id:'through', station:'carrier', name:'THROUGHPUT', effect:'pierce', unlockCost:null, ranks:[{v:1, desc:'Rounds pierce 1 extra enemy.'}, {v:2, desc:'Pierce 2 extra enemies.'}, {v:3, desc:'Pierce 3 extra enemies.'}]},
  {id:'bounce', station:'carrier', name:'MULTIPATH', effect:'ricochet', unlockCost:null, ranks:[{v:1, desc:'Bullets bounce off a wall once. Bank shots around cover.'}, {v:2, desc:'Bullets bounce twice.'}, {v:3, desc:'Bullets bounce three times.'}]},
  {id:'homing', station:'carrier', name:'LOCK-ON', effect:'homing', unlockCost:55, ranks:[{v:1, desc:'Bullets curve toward enemies near their path.'}, {v:1.8, desc:'Stronger curve.'}, {v:2.6, desc:'Bullets hunt hard.'}]},
  {id:'shatter', station:'carrier', name:'SHATTER', effect:'shards', unlockCost:70, ranks:[{v:2, desc:'Kills burst into 2 seeking shards.'}, {v:3, desc:'Kills burst into 3 shards.'}, {v:4, desc:'Kills burst into 4 shards.'}]},
  // NIGHT SHIFT: nobody hears the shift end
  {id:'silent', station:'nightshift', name:'DEAD MIC', effect:'noise', unlockCost:null, ranks:[{v:.35, desc:'Your shots wake rooms 35% less.'}, {v:.6, desc:'Shots 60% quieter.'}, {v:.85, desc:'Shots 85% quieter.'}]},
  {id:'blindside', station:'nightshift', name:'BLINDSIDE', effect:'unaware', unlockCost:null, ranks:[{v:.3, desc:'+30% damage to enemies who have not noticed you.'}, {v:.6, desc:'+60% to unaware enemies.'}, {v:1, desc:'+100% to unaware enemies.'}]},
  {id:'smoke_reload', station:'nightshift', name:'SMOKE BLOOM', effect:'smokeReload', unlockCost:45, ranks:[{v:55, desc:'Reloading drops a small smoke cloud. Reload is cover.'}, {v:75, desc:'Larger bloom.'}, {v:95, desc:'Largest bloom.'}]},
  {id:'cold_cash', station:'nightshift', name:'COLD CASH', effect:'unawareScrap', unlockCost:55, ranks:[{v:6, desc:'Unaware kills pay +6 scrap.'}, {v:10, desc:'Unaware kills +10 scrap.'}, {v:16, desc:'Unaware kills +16 scrap.'}]},
  // FEEDBACK: the closer to dead, the louder
  {id:'rage', station:'feedback', name:'RED LINE', effect:'missingHp', unlockCost:null, ranks:[{v:.08, desc:'+8% damage per health point missing.'}, {v:.14, desc:'+14% per missing health.'}, {v:.2, desc:'+20% per missing health.'}]},
  {id:'loop', station:'feedback', name:'FEEDBACK LOOP', effect:'loop', unlockCost:null, ranks:[{v:.04, desc:'Hit streak: each hit within 1.5 s speeds your fire 4% (5 stacks).'}, {v:.07, desc:'7% per hit.'}, {v:.1, desc:'10% per hit.'}]},
  {id:'adrenaline', station:'feedback', name:'ADRENALINE', effect:'hitCredit', unlockCost:50, ranks:[{v:1.5, desc:'Taking damage grants 1.5 s of half-speed walking.'}, {v:2.5, desc:'Taking damage: 2.5 s.'}, {v:3.5, desc:'Taking damage: 3.5 s.'}]},
  {id:'last_stand', station:'feedback', name:'LAST STAND', effect:'lastStand', unlockCost:70, ranks:[{v:.25, desc:'At 1 health: +25% damage and walking runs at half time.'}, {v:.5, desc:'At 1 health: +50% damage.'}, {v:.75, desc:'At 1 health: +75% damage.'}]},
];
export const UPGRADE_BY_ID = new Map(UPGRADES.map(u => [u.id, u]));
export const upgradeById = id => UPGRADE_BY_ID.get(id);

// Crossfades: both stations at level 2+ (total ranks) switch the synergy on.
export const CROSSFADE_LEVEL = 2;
export const CROSSFADES = [
  {id:'signal_boost', stations:['static', 'carrier'], name:'SIGNAL BOOST', desc:'Chains jump to one extra enemy and ricochets arc to a target.', effects:{chainTargets:1}},
  {id:'dead_air', stations:['static', 'deadline'], name:'DEAD AIR', desc:'Killing a stunned enemy refunds 1 s of time.', effects:{stunKillCredit:1}},
  {id:'hold_breath', stations:['deadline', 'nightshift'], name:'HOLD YOUR BREATH', desc:'Held-breath shots are silent and deal double the bonus.', effects:{heldBreathMult:2, heldBreathSilent:1}},
  {id:'red_shift', stations:['carrier', 'feedback'], name:'RED SHIFT', desc:'Ricocheted bullets deal +60% damage.', effects:{bounceDamage:.6}},
  {id:'borrowed_pulse', stations:['deadline', 'feedback'], name:'BORROWED PULSE', desc:'Getting hit also stuns everything within 3 tiles.', effects:{hitPulse:96}},
  {id:'dead_drop', stations:['nightshift', 'feedback'], name:'DEAD DROP', desc:'Unaware kills heal 1 health when you are at half health or less.', effects:{unawareHeal:1}},
  {id:'white_noise', stations:['static', 'nightshift'], name:'WHITE NOISE', desc:'Stun lasts twice as long on enemies who have not noticed you.', effects:{unawareStunMult:2}},
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

function valueOf(owned, effect) {
  const u = UPGRADES.find(item => item.effect === effect);
  const rank = u ? rankOf(owned, u.id) : 0;
  return rank > 0 ? u.ranks[Math.min(rank, MAX_RANK) - 1].v : 0;
}

// Fold owned ranks + active crossfades into plain numbers for the game hooks.
export function freqStats(owned = {}) {
  const x = {}; for (const c of activeCrossfades(owned)) for (const [k, v] of Object.entries(c.effects)) x[k] = (x[k] || 0) + v;
  return {
    chain: valueOf(owned, 'chain'), chainTargets: 1 + (x.chainTargets || 0), stunBonus: valueOf(owned, 'stun'),
    bubble: valueOf(owned, 'bubble'), pulse: valueOf(owned, 'pulse'),
    creditPerKill: valueOf(owned, 'credit'), freezeKill: valueOf(owned, 'freeze'), reloadKill: valueOf(owned, 'reloadKill'),
    heldBreath: valueOf(owned, 'heldBreath') * (x.heldBreathMult || 1), heldBreathSilent: Boolean(x.heldBreathSilent),
    pierce: valueOf(owned, 'pierce'), ricochet: valueOf(owned, 'ricochet'), homing: valueOf(owned, 'homing'), shards: valueOf(owned, 'shards'),
    bounceDamage: x.bounceDamage || 0,
    noiseMult: clamp(1 - valueOf(owned, 'noise'), .1, 1), unawareDamage: valueOf(owned, 'unaware'), smokeReload: valueOf(owned, 'smokeReload'),
    unawareScrap: valueOf(owned, 'unawareScrap'),
    missingHpDamage: valueOf(owned, 'missingHp'), loopPerStack: valueOf(owned, 'loop'), hitCredit: valueOf(owned, 'hitCredit'), lastStand: valueOf(owned, 'lastStand'),
    stunKillCredit: x.stunKillCredit || 0, hitPulse: x.hitPulse || 0, unawareHeal: x.unawareHeal || 0, unawareStunMult: x.unawareStunMult || 1,
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

// Pick-1-of-3 offer. Builds come from commitment: stations you already hold are weighted up, and an offer that
// completes a crossfade is guaranteed (half the time) when one is within reach. `minRank` lets an ELITE reward
// force at least rank 2 offers where available.
export function offerFrequencies({unlockedIds = [], owned = {}, rng = Math.random, count = 3} = {}) {
  const pool = availableUpgrades(unlockedIds, owned).map(u => ({u, w: 1 + Math.min(4, stationLevel(owned, u.station)) * .9 + (rankOf(owned, u.id) ? .6 : 0)}));
  const chosen = [], stationsUsed = new Map();
  const take = (index) => { const item = pool.splice(index, 1)[0]; chosen.push(item.u); stationsUsed.set(item.u.station, (stationsUsed.get(item.u.station) || 0) + 1); };
  // Try to guarantee a crossfade completer.
  const completers = pool.map((item, index) => ({index, cf: crossfadesCompletedBy(owned, item.u.id)})).filter(item => item.cf.length);
  if (completers.length && rng() < .5) take(completers[Math.floor(rng() * completers.length)].index);
  while (chosen.length < count && pool.length) {
    const weights = pool.map(item => item.w / (1 + (stationsUsed.get(item.u.station) || 0) * 1.5));
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = rng() * total, index = 0;
    for (; index < pool.length - 1; index++) { roll -= weights[index]; if (roll < 0) break; }
    take(index);
  }
  return chosen.map(u => {
    const rank = rankOf(owned, u.id) + 1;
    return {id: u.id, station: u.station, name: u.name, rank, rarity: RANK_NAMES[rank - 1].toLowerCase(), desc: u.ranks[rank - 1].desc, isNew: rank === 1, crossfades: crossfadesCompletedBy(owned, u.id).map(c => c.id)};
  });
}

export function buildSummary(owned = {}) {
  return UPGRADES.filter(u => rankOf(owned, u.id) > 0).map(u => ({id: u.id, name: u.name, station: u.station, rank: rankOf(owned, u.id)}));
}
