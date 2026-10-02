import {BASE_CARRY_CAPACITY} from './catalog.js';

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'dead-air.progress.v1';
const ROOM_SENSE_RANGE_TILES = [15,25,35];

export const META_UPGRADES = [
  {id:'runner',name:'RUNNER’S LEGS',description:'+6% movement speed per level',costs:[25,50,80]},
  {id:'stillmind',name:'STILL MIND',description:'Idle time slows by 0.015× per level',costs:[30,55,85]},
  {id:'carryrig',name:'CARRY RIG',description:'+1 carry weight per level · tier III unlocks a third weapon slot',costs:[35,60,95]},
  {id:'salvager',name:'SALVAGER',description:'+10% crate scrap chance per level',costs:[20,45,75]},
  {id:'roomsense',name:'ROOM SENSE',description:`Reveal room outlines and enemy blips through walls within ${ROOM_SENSE_RANGE_TILES.join(' / ')} tiles`,costs:[35,65,100]},
];

export function emptyProgress() {
  return {version:SAVE_VERSION,coins:0,upgrades:{runner:0,stillmind:0,carryrig:0,salvager:0,roomsense:0}};
}

export function parseProgress(serialized) {
  const empty=emptyProgress();
  if(typeof serialized!=='string')return empty;
  try {
    const data=JSON.parse(serialized);
    if(data?.version!==SAVE_VERSION||!Number.isFinite(data.coins))return empty;
    const upgrades={...empty.upgrades};
    for(const upgrade of META_UPGRADES){
      const level=data.upgrades?.[upgrade.id];
      if(Number.isInteger(level))upgrades[upgrade.id]=Math.max(0,Math.min(upgrade.costs.length,level));
    }
    return {version:SAVE_VERSION,coins:Math.max(0,Math.floor(data.coins)),upgrades};
  } catch {
    return empty;
  }
}

export function runCoinPayout({won,roomsCleared,kills}) {
  return 5+Math.max(0,Math.floor(roomsCleared))*8+Math.max(0,Math.floor(kills))*2+(won?50:0);
}

export function awardCoins(progress,amount) {
  return {...progress,coins:progress.coins+Math.max(0,Math.floor(amount))};
}

export function purchaseUpgrade(progress,id) {
  const definition=META_UPGRADES.find(item=>item.id===id);
  if(!definition)return {progress,purchased:false};
  const level=progress.upgrades[id];
  const cost=definition.costs[level];
  if(cost===undefined||progress.coins<cost)return {progress,purchased:false};
  return {
    progress:{...progress,coins:progress.coins-cost,upgrades:{...progress.upgrades,[id]:level+1}},
    purchased:true,
  };
}

export function progressionStats(progress) {
  const {runner,stillmind,carryrig,salvager,roomsense}=progress.upgrades;
  return {
    moveSpeed:112*(1+.06*runner),
    idleScale:Math.max(.12,.18-.015*stillmind),
    carryCapacity:BASE_CARRY_CAPACITY+carryrig,
    maxWeaponSlots:carryrig>=3?3:2,
    crateDropChance:Math.min(.65,.35+.1*salvager),
    scannerRange:(ROOM_SENSE_RANGE_TILES[roomsense-1]||0)*32,
  };
}
