// HEAT (id 'interference' in saves): stackable difficulty modifiers (Hades' heat) unlocked after the first boss win. Each active
// modifier adds a coin bonus to the run payout. Pure data + folding into plain numbers.

export const INTERFERENCE = [
  {id: 'armored', name: 'ARMORED ENEMIES', desc: 'Enemies have +30% health.', bonus: .2, effects: {enemyHp: .3}},
  {id: 'overdrive', name: 'FAST ENEMIES', desc: 'Enemies move 15% faster.', bonus: .15, effects: {enemySpeed: .15}},
  {id: 'redline', name: 'NO SAFE HARBOR', desc: 'Below 2 health, standing still only slows time to 0.5×.', bonus: .2, effects: {lowHealthIdle: .5}},
  {id: 'scarce', name: 'SCARCE', desc: '40% less scrap from everything.', bonus: .15, effects: {scrap: -.4}},
  {id: 'thin_air', name: 'NO MEDKITS', desc: 'Medkits no longer drop from clears.', bonus: .2, effects: {noHeals: 1}},
  {id: 'encore', name: 'TOUGH BOSS', desc: 'The Conductor has +40% health.', bonus: .25, effects: {bossHp: .4}},
];
export const INTERFERENCE_BY_ID = new Map(INTERFERENCE.map(m => [m.id, m]));

// Unlocked once the player has won (killed the boss) at least once.
export const interferenceUnlocked = progress => (progress?.stats?.wins || 0) >= 1;

export function toggleInterference(progress, id) {
  if (!interferenceUnlocked(progress) || !INTERFERENCE_BY_ID.has(id)) return progress;
  const active = progress.interference || [];
  return {...progress, interference: active.includes(id) ? active.filter(item => item !== id) : [...active, id]};
}

// Active ids (only if unlocked and valid) folded into numbers.
export function interferenceStats(progress) {
  const active = interferenceUnlocked(progress) ? (progress.interference || []).filter(id => INTERFERENCE_BY_ID.has(id)) : [];
  const sum = key => active.reduce((t, id) => t + (INTERFERENCE_BY_ID.get(id).effects[key] || 0), 0);
  return {
    active,
    enemyHpMult: 1 + sum('enemyHp'), enemySpeedMult: 1 + sum('enemySpeed'), lowHealthIdle: Math.max(0, ...active.map(id => INTERFERENCE_BY_ID.get(id).effects.lowHealthIdle || 0)),
    scrapMult: Math.max(.2, 1 + sum('scrap')), noHeals: sum('noHeals') > 0, bossHpMult: 1 + sum('bossHp'),
    coinBonus: active.reduce((t, id) => t + INTERFERENCE_BY_ID.get(id).bonus, 0),
  };
}
