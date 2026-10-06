// Goals (achievements) and persisted run stats. Pure: recordRun() folds one finished run's summary into
// progress.stats, then completes any goal whose metric is met, paying coins and granting unlocks.
import {grantUnlock, UNLOCK_BY_ID} from './unlocks.js';

export const GOALS = [
  {id:'first_blood', name:'FIRST BLOOD', desc:'Down any enemy.', metric:'totalKills', goal:1, reward:{coins:10}},
  {id:'still_life', name:'STILL LIFE', desc:'Clear a room without moving more than 3 tiles.', metric:'stillRooms', goal:1, reward:{coins:30, unlock:['gun:smg_vector']}},
  {id:'slow_triple', name:'THREE IN ONE BREATH', desc:'Kill 3 enemies without moving: one slow-mo window.', metric:'slowTriples', goal:1, reward:{coins:40, unlock:['gun:smg_burst']}},
  {id:'floor_2', name:'GOING DOWN', desc:'Reach floor 2.', metric:'deepestFloor', goal:2, reward:{coins:40}},
  {id:'floor_3', name:'DEEP CUT', desc:'Reach floor 3.', metric:'deepestFloor', goal:3, reward:{coins:80, unlock:['throw:frag']}},
  {id:'untouched', name:'UNTOUCHED', desc:'Clear a whole floor without taking damage.', metric:'noHitFloors', goal:1, reward:{coins:60, unlock:['upg:adrenal']}},
  {id:'speed_floor', name:'DEAD SPRINT', desc:'Clear floor 1 in under 4 minutes.', metric:'fastestFloor1', goal:240, cmp:'lte', reward:{coins:50, unlock:['upg:stockpile']}},
  {id:'runs_5', name:'REGULAR', desc:'Start 5 runs.', metric:'runs', goal:5, reward:{coins:30}},
  {id:'extract_3', name:'GET OUT ALIVE', desc:'Extract with your loot 3 times.', metric:'extracts', goal:3, reward:{coins:50, unlock:['throw:incendiary']}},
  {id:'kills_100', name:'CLEANER', desc:'Down 100 enemies across all runs.', metric:'totalKills', goal:100, reward:{coins:60, unlock:['freq:dead_channel']}},
  {id:'daily_1', name:'DAILY GRIND', desc:'Finish a daily seed run.', metric:'dailyRuns', goal:1, reward:{coins:40}},
  {id:'boss_slayer', name:'THE LAST NOTE', desc:'Defeat THE CONDUCTOR.', metric:'bossKills', goal:1, reward:{coins:300, unlock:['gun:sniper_mule']}},
  {id:'boss_pistol', name:'SIDEARM SOLO', desc:'Land the killing blow on THE CONDUCTOR with a pistol.', metric:'bossPistolKills', goal:1, reward:{coins:200, unlock:['upg:highroller','freq:wager']}},
  {id:'kills_500', name:'EXTERMINATOR', desc:'Down 500 enemies across all runs.', metric:'totalKills', goal:500, reward:{coins:120}},
  {id:'boss_3', name:'ENCORE', desc:'Defeat THE CONDUCTOR 3 times.', metric:'bossKills', goal:3, reward:{coins:150}},
];

export const GOAL_BY_ID = new Map(GOALS.map(goal => [goal.id, goal]));

export function emptyStats() {
  return {runs:0, totalKills:0, deepestFloor:0, extracts:0, wins:0, deaths:0, bossKills:0, bossPistolKills:0, stillRooms:0, slowTriples:0, noHitFloors:0,
    dailyRuns:0, mostKills:0, fastestWin:0, fastestFloor1:0, bestRunCoins:0, totalBanked:0};
}

// `summary`: {kills, floorReached, outcome:'dead'|'extract'|'won', seconds, bossKilled, bossPistol, stillRooms, slowTriples,
//             noHitFloors, floor1Seconds (0 if floor 1 was not cleared), daily, coins}
export function updateStats(stats, summary) {
  const next = {...emptyStats(), ...stats};
  const n = value => Number.isFinite(value) ? Math.max(0, value) : 0;
  next.runs += 1;
  next.totalKills += Math.floor(n(summary.kills));
  next.deepestFloor = Math.max(next.deepestFloor, Math.floor(n(summary.floorReached)));
  if (summary.outcome === 'extract' || summary.outcome === 'won') next.extracts += 1;
  if (summary.outcome === 'won') {
    next.wins += 1;
    const seconds = n(summary.seconds);
    if (seconds > 0 && (next.fastestWin === 0 || seconds < next.fastestWin)) next.fastestWin = Math.round(seconds);
  }
  if (summary.outcome === 'dead') next.deaths += 1;
  if (summary.bossKilled) next.bossKills += 1;
  if (summary.bossPistol) next.bossPistolKills += 1;
  next.stillRooms += Math.floor(n(summary.stillRooms));
  next.slowTriples += Math.floor(n(summary.slowTriples));
  next.noHitFloors += Math.floor(n(summary.noHitFloors));
  if (summary.daily) next.dailyRuns += 1;
  next.mostKills = Math.max(next.mostKills, Math.floor(n(summary.kills)));
  const f1 = n(summary.floor1Seconds);
  if (f1 > 0 && (next.fastestFloor1 === 0 || f1 < next.fastestFloor1)) next.fastestFloor1 = Math.round(f1);
  next.bestRunCoins = Math.max(next.bestRunCoins, Math.floor(n(summary.coins)));
  next.totalBanked += Math.floor(n(summary.coins));
  return next;
}

export function goalValue(stats, goal) {
  return stats?.[goal.metric] || 0;
}
export function goalDone(stats, goal) {
  const value = goalValue(stats, goal);
  return goal.cmp === 'lte' ? value > 0 && value <= goal.goal : value >= goal.goal;
}
export function goalProgress(progress, goal) {
  const value = goalValue(progress.stats, goal), done = Boolean(progress.goals?.[goal.id]);
  const pct = done ? 1 : goal.cmp === 'lte' ? 0 : Math.max(0, Math.min(1, value / goal.goal));
  return {value, goal:goal.goal, pct, done};
}

// Fold a finished run into progress: stats, newly completed goals (coins + unlocks). `coins` is NOT added here;
// the caller banks the run payout separately so the two stay easy to test.
export function recordRun(progress, summary) {
  let next = {...progress, stats:updateStats(progress.stats, summary), goals:{...progress.goals}};
  const completed = [], unlockedIds = [];
  for (const goal of GOALS) {
    if (next.goals[goal.id] || !goalDone(next.stats, goal)) continue;
    next.goals[goal.id] = true;
    completed.push(goal);
    next.coins += goal.reward.coins || 0;
    for (const id of goal.reward.unlock || []) {
      if (!UNLOCK_BY_ID.has(id)) continue;
      if (!next.unlocked.includes(id)) unlockedIds.push(id);
      next = grantUnlock(next, id);
    }
  }
  return {progress:next, completed, unlockedIds};
}
