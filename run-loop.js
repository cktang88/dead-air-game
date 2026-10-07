// The macro loop: floors, escalation, risk/reward banking, floor seeds and the daily seed. Pure and data-driven.
import {MAX_RUN_SEED} from './seeds.js';
import {scrapToCoins} from './economy.js';

export const FINAL_FLOOR = 4;

// depthShift is added to each room's 0..1 depth when picking encounter recipes, so MARKSMAN / RIOT squads appear
// earlier on deeper floors. aimMul scales enemy aim error (below 1 = more accurate shots). eliteRooms converts that many ordinary combat rooms into WARDEN rooms.
export const FLOORS = {
  1: {n:1, countMult:0.42, aimMul:0.55, name:'THE SPILLWAY', depthShift:0, countBonus:1, eliteRooms:0, hpMult:1, speedMult:1, clearBonus:40, boss:false},
  2: {n:2, countMult:0.8, aimMul:0.45, name:'FOUNDRY ROW', depthShift:.3, countBonus:3, eliteRooms:2, hpMult:1.08, speedMult:1.04, clearBonus:70, boss:false},
  3: {n:3, countMult:1, aimMul:0.4, name:'THE UNDERCROFT', depthShift:.55, countBonus:3, eliteRooms:3, hpMult:1.15, speedMult:1.08, clearBonus:110, boss:false},
  4: {n:4, countMult:0.9, aimMul:0.55, name:'THE CONDUCTOR’S HALL', depthShift:.45, countBonus:0, eliteRooms:1, hpMult:1.15, speedMult:1.08, clearBonus:0, boss:true},
};

// Enemy headcount per room scales with the floor: floor 1 is a short, ammo-sized introduction (about 15 to 18 hostiles
// against ~108 starting rounds; extraction only needs the route clear), deeper floors grow back toward the full budget.
// Elite rooms keep their fixed pair, breathers stay light (a single enemy never drops to zero).
export function scaledEnemyCount(count, cfg, role = 'combat') {
  if (!(count > 0)) return 0;
  if (role === 'elite') return count;
  return Math.max(1, Math.round(count * (cfg?.countMult ?? 1)));
}

export function floorConfig(n) {
  const floor = Math.max(1, Math.min(FINAL_FLOOR, Math.floor(n) || 1));
  return FLOORS[floor];
}
export const isFinalFloor = n => floorConfig(n).boss;

export function encounterDepth(roomDepth, floor) {
  return Math.max(0, Math.min(1, roomDepth + floorConfig(floor).depthShift));
}

// Each floor reuses the run seed but shifts it, so a given run seed always yields the same four floors.
export function floorSeed(runSeed, floor) {
  if (floor <= 1) return runSeed;
  return ((Math.imul(runSeed, 2654435761) >>> 0) + floor * 104729) % MAX_RUN_SEED + 1;
}

// Daily seed: everyone who plays on the same calendar day gets the same run.
export function dateKey(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function dailySeed(key = dateKey()) {
  let hash = 2166136261;
  for (const char of `dead-air:${key}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash % MAX_RUN_SEED + 1;
}

// ---------------------------------------------------------------------------------------------- economy
export const COIN_RATES = {
  base: 5,
  room: 10,
  kill: 3,
  floorBonus: {1:40, 2:70, 3:110},
  bossBonus: 250,
  deathKeep: .4,
};

// Gross coins a run has earned so far (before the death penalty). `floorsCleared` counts floors whose exit was reached.
export function grossCoins({floorsCleared = 0, roomsCleared = 0, kills = 0, bossKilled = false}) {
  let total = COIN_RATES.base + Math.max(0, Math.floor(roomsCleared)) * COIN_RATES.room + Math.max(0, Math.floor(kills)) * COIN_RATES.kill;
  for (let floor = 1; floor <= Math.floor(floorsCleared); floor++) total += COIN_RATES.floorBonus[floor] || 0;
  if (bossKilled) total += COIN_RATES.bossBonus;
  return total;
}

// Settle a finished run. outcome: 'dead' keeps `keepFraction` of the gross; 'extract' (cash out early) and 'won' keep all.
// coinMult comes from perks / upgrades; keepFraction from upgrades (HIGH ROLLER lowers it).
// Leftover scrap cashes in at SCRAP.cashRate scrap per coin when you extract or win; a death loses it all (spending beats banking).
export function settleRun({outcome, floorsCleared, roomsCleared, kills, bossKilled = false, coinMult = 1, keepFraction = COIN_RATES.deathKeep, scrap = 0}) {
  const earned = Math.floor(grossCoins({floorsCleared, roomsCleared, kills, bossKilled}) * Math.max(0, coinMult));
  const cash = outcome === 'dead' ? 0 : scrapToCoins(scrap);
  const gross = earned + cash;
  const kept = outcome === 'dead' ? Math.floor(earned * Math.max(0, Math.min(1, keepFraction))) : gross;
  return {gross, kept, lost: gross - kept, cash};
}

// Shareable one-line result for the daily seed run.
export function dailyShareLine({date, floor, kills, coins, outcome, seconds = 0}) {
  const status = outcome === 'won' ? 'BOSS DOWN' : outcome === 'extract' ? 'EXTRACTED' : 'LOST THE SIGNAL';
  const mins = Math.floor(seconds / 60), secs = String(Math.floor(seconds % 60)).padStart(2, '0');
  return `DEAD AIR DAILY ${date} · FLOOR ${floor}/${FINAL_FLOOR} · ${kills} KILLS · +${coins} COINS · ${status} · ${mins}:${secs}`;
}
