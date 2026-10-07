import {TILE} from './catalog.js';
import {emptyStats} from './goals.js';
import {KITS, UNLOCK_BY_ID, LEGACY_UNLOCK_COSTS, isUnlocked, kitUnlocked} from './unlocks.js';
import {COIN_RATES} from './run-loop.js';
import {TAPE_BY_ID} from './story.js';
import {INTERFERENCE_BY_ID} from './interference.js';

// v1: coins + 7 flat upgrades. v2 adds unlocks, starting kit, run stats, goals and the daily record.
// v3 is the behavior rework: removed gun/throwable unlocks are refunded and CARRY RIG became THIRD SLOT.
export const SAVE_VERSION = 3;
const CARRY_RIG_COSTS = [35,60,95];
export const SAVE_KEY = 'dead-air.progress.v1';
const ROOM_SENSE_RANGE_TILES = [15,25,35];

export const META_UPGRADES = [
  {id:'runner',name:'RUNNER’S LEGS',description:'+6% movement speed per level',costs:[25,50,80]},
  {id:'stillmind',name:'STILL MIND',description:'Standing-still time drops 0.01× per level (0.08× → 0.05×)',costs:[30,55,85]},
  {id:'thirdslot',name:'THIRD SLOT',description:'Carry a third gun (key 3) · every gun swap takes 0.4 s longer',costs:[95]},
  {id:'salvager',name:'SALVAGER',description:'+10% crate scrap chance and +2 room-clear scrap per level',costs:[20,45,75]},
  {id:'luckyfind',name:'LUCKY FIND',description:'Rare gun variants and mod drops turn up more often',costs:[30,60,90]},
  {id:'roomsense',name:'ROOM SENSE',description:`Reveal room outlines and enemy blips through walls within ${ROOM_SENSE_RANGE_TILES.join(' / ')} tiles`,costs:[35,65,100]},
  {id:'vitalreserve',name:'VITAL RESERVE',description:'+1 maximum health per level · start each run fully healed',costs:[40,80,130]},
  // Tradeoff upgrades: unlocked by goals, then bought like any other.
  {id:'highroller',name:'HIGH ROLLER',description:'+25% coins from every run, but dying keeps only 25% instead of 40%',costs:[60],requires:'upg:highroller'},
  {id:'adrenal',name:'ADRENAL GLAND',description:'+20% damage, but −1 maximum health',costs:[50],requires:'upg:adrenal'},
  {id:'stockpile',name:'STOCKPILE',description:'+40 starting scrap per level, but −6% move speed per level',costs:[30,50],requires:'upg:stockpile'},
];
export const UPGRADE_IDS = META_UPGRADES.map(item => item.id);

export function emptyProgress() {
  return {
    version:SAVE_VERSION,coins:0,
    upgrades:Object.fromEntries(UPGRADE_IDS.map(id=>[id,0])),
    unlocked:[],kit:'standard',stats:emptyStats(),goals:{},tapes:[],interference:[],
    daily:{date:'',bestFloor:0,bestKills:0},
  };
}

const num=(value,fallback=0)=>Number.isFinite(value)?value:fallback;

// Accepts any saved shape and returns a valid v2 profile. v1 saves (coins + upgrade levels) migrate in place:
// coins and upgrade levels survive, everything new starts at its default.
export function migrateProgress(data) {
  const empty=emptyProgress();
  if(!data||typeof data!=='object'||!Number.isFinite(data.coins))return empty;
  if(data.version!==1&&data.version!==2&&data.version!==SAVE_VERSION)return empty;
  const upgrades={...empty.upgrades};
  for(const upgrade of META_UPGRADES){
    const level=data.upgrades?.[upgrade.id];
    if(Number.isInteger(level))upgrades[upgrade.id]=Math.max(0,Math.min(upgrade.costs.length,level));
  }
  const next={...empty,coins:Math.max(0,Math.floor(data.coins)),upgrades};
  // v1/v2 -> v3: CARRY RIG levels are refunded; level III (the third slot) becomes THIRD SLOT for free.
  const rig=Number.isInteger(data.upgrades?.carryrig)?Math.max(0,Math.min(3,data.upgrades.carryrig)):0;
  if(data.version<SAVE_VERSION&&rig>0){
    next.coins+=CARRY_RIG_COSTS.slice(0,rig).reduce((a,b)=>a+b,0);
    if(rig>=3){next.upgrades.thirdslot=1;next.coins-=META_UPGRADES.find(item=>item.id==='thirdslot').costs[0];}
  }
  if(data.version>=2){
    if(Array.isArray(data.unlocked)){
      next.unlocked=[...new Set(data.unlocked.filter(id=>UNLOCK_BY_ID.has(id)))];
      // Unlocks that no longer exist (variants became run-only drops, incendiary became a mod) refund their price.
      for(const id of new Set(data.unlocked))if(!UNLOCK_BY_ID.has(id)&&LEGACY_UNLOCK_COSTS[id])next.coins+=LEGACY_UNLOCK_COSTS[id];
    }
    if(typeof data.kit==='string')next.kit=data.kit;
    const stats=data.stats&&typeof data.stats==='object'?data.stats:{};
    next.stats=Object.fromEntries(Object.keys(emptyStats()).map(key=>[key,Math.max(0,Math.floor(num(stats[key])))]));
    if(data.goals&&typeof data.goals==='object')for(const [id,done] of Object.entries(data.goals))if(done===true)next.goals[id]=true;
    if(Array.isArray(data.tapes))next.tapes=[...new Set(data.tapes.filter(id=>TAPE_BY_ID.has(id)))];
    if(Array.isArray(data.interference))next.interference=[...new Set(data.interference.filter(id=>INTERFERENCE_BY_ID.has(id)))];
    const daily=data.daily&&typeof data.daily==='object'?data.daily:{};
    next.daily={date:typeof daily.date==='string'?daily.date.slice(0,10):'',bestFloor:Math.max(0,Math.floor(num(daily.bestFloor))),bestKills:Math.max(0,Math.floor(num(daily.bestKills)))};
  }
  // A kit that is not owned falls back to standard issue.
  if(!kitUnlocked(next,next.kit))next.kit='standard';
  return next;
}

export function parseProgress(serialized) {
  if(typeof serialized!=='string')return emptyProgress();
  try {
    return migrateProgress(JSON.parse(serialized));
  } catch {
    return emptyProgress();
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
  if(definition.requires&&!isUnlocked(progress,definition.requires))return {progress,purchased:false};
  const level=progress.upgrades[id];
  const cost=definition.costs[level];
  if(cost===undefined||progress.coins<cost)return {progress,purchased:false};
  return {
    progress:{...progress,coins:progress.coins-cost,upgrades:{...progress.upgrades,[id]:level+1}},
    purchased:true,
  };
}

// Meta-upgrade stats. Frequencies are behaviors, not stats, so they live in frequencies.js / freqStats().
export function progressionStats(progress) {
  const {runner,stillmind,thirdslot=0,salvager,luckyfind,roomsense,vitalreserve,highroller=0,adrenal=0,stockpile=0}=progress.upgrades;
  return {
    moveSpeed:112*(1+.06*runner-.06*stockpile),
    idleScale:Math.max(.03,.08-.01*stillmind),
    maxHealth:Math.max(1,3+vitalreserve-adrenal),
    maxWeaponSlots:thirdslot>=1?3:2,
    crateDropChance:Math.min(.65,.35+.1*salvager),
    roomClearScrap:6+2*salvager,
    luckyFindLevel:luckyfind,
    scannerRange:(ROOM_SENSE_RANGE_TILES[roomsense-1]||0)*TILE,
    // Run-economy and combat modifiers (tradeoff upgrades + perks).
    damageMult:1+.2*adrenal,
    startScrap:40+40*stockpile,
    coinMult:1+.25*highroller,
    deathKeep:highroller?.25:COIN_RATES.deathKeep,
  };
}

// Daily record: keeps the deepest floor / most kills for a given date key.
export function recordDaily(progress,date,{floor,kills}) {
  const same=progress.daily?.date===date;
  const daily={date,bestFloor:Math.max(same?progress.daily.bestFloor:0,floor),bestKills:Math.max(same?progress.daily.bestKills:0,kills)};
  return {...progress,daily};
}
