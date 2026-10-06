import {createRenderer,hexStr} from './render2d.js';
import {VIEW_HALF_HEIGHT as CAMERA_HALF_HEIGHT} from './camera2d.js';
import RAPIER from 'https://esm.sh/@dimforge/rapier2d-compat@0.17.3';
import * as ROT from 'https://esm.sh/rot-js@2.1.3';
import {playNearMiss, playShieldBlock, playSniperLock, isAudioMuted, loadAudioSettings, playArmorHit, playBruteWindup, playCrateBreak, playEmptyClick, playLowAmmo, playEnemyShot, playEnemyTell, playExplosion, playExtraction, playFlashbang, playFire, playGateUnlock, playGunshot, playHit, playKill, playPickup, playPlayerHurt, playReload, playReloadEnd, playRoomClear, playSlowmoEnter, playSlowmoExit, playSmoke, playUiClick, playWallImpact, setAudioMuted, setMasterVolume, setTimeScaleAudio, unlockAudio} from './audio.js';
import {BASE_CARRY_CAPACITY, ENEMY_TYPES, GEAR, GUNS, MODS, SHOTGUN_SHELLS, TAU, TILE, WALL_H} from './catalog.js';
import {drawIcon} from './icons.js';
import {HINTS_KEY, loadSeen, pickHint, saveSeen} from './hints.js';
import {collectInteractables, activeInteraction, ambientPrompt, collectPopup} from './interaction.js';
import {absorbArmorDamage, chooseEncounterTypes, chooseWeaponReplacementSlot, compatibleAttachments, crateDamageStage, damageDurability, distanceToRect, minimapContactVisible, minimapPickupVisible, reloadSeconds, segmentCircleHitTime, segmentIntersectsCircle, segmentWallRuns, shotgunShellStats, timeScale, unlockRewardGate, weaponLoadoutWeight, weaponPenetration, weaponReplacement, weaponStats, withinWorldView} from './rules.js';
import {META_UPGRADES, awardCoins, emptyProgress, progressionStats, purchaseUpgrade, recordDaily} from './progression.js';
import {FINAL_FLOOR, floorConfig, floorSeed, encounterDepth, settleRun, grossCoins, COIN_RATES, dateKey, dailySeed, dailyShareLine} from './run-loop.js';
import {kitById, kitThrowables, unlockedGunIds, unlockedThrowableIds, unlockedFreqIds, purchaseUnlock, selectKit, UNLOCK_BY_ID} from './unlocks.js';
import {freqStats, pickFrequency, offerFrequencies, upgradeById, STATION_BY_ID, activeCrossfades, CROSSFADES} from './frequencies.js';
import {recordRun} from './goals.js';
import {assignRoomRewards, computeDoorLinks, doorPreviews} from './door-rewards.js';
import {collectTape, operatorLines, causeName} from './story.js';
import {interferenceStats, toggleInterference} from './interference.js';
import {spawnBoss, updateBossEnemy, bossDamageFor} from './boss-fight.js';
import {BOSS} from './boss.js';
import {decisionHtml, freqOfferHtml, buildStripHtml, bossBarHtml, metaPanelHtml, kitChipHtml, storyHtml} from './meta-ui.js';
import {clearSavedProgress, readSavedProgress, writeSavedProgress} from './progress-storage.js';
import {consumeThrowable, isWithinThrowableRadius, THROWABLES, throwableAffectsTarget, throwableById} from './tactical.js';
import {shapeDungeon} from './layout.js';
import {findRoomCratePosition as findGuaranteedRoomCratePosition, findRoomPropPosition} from './room-props.js';
import {paceEnemyCount} from './room-templates.js';
import {generateDungeon} from './dungeon.js';
import {createNav, stepEnemyBrain} from './enemy-brain.js';
import {ammoStatus,nextLoadedSlot,ammoPickupRounds,supplyDrop,clearHealAmount,shouldRegen,lockerSpawns,cooldownReady,objectiveText,refillCost} from './economy.js';
import {hasUnclearedRouteEnemies, roomEnemyCount, roomEncounterTypes, roomHasEncounter, roomHasLivingEnemies, roomPickupKinds} from './room-roles.js';
import {MAX_RUN_SEED, parseRunSeed} from './seeds.js';
import {flashOverlayOpacity,loadVisualSettings,saveVisualSettings,scaledCameraShake} from './visual-settings.js';
import {particleBurstBudget} from './particles.js';
import {resolveProjectileImpacts} from './projectile-impacts.js';
import {lootTier,lootTierForRoll} from './loot.js';
import {showBanner,gunIcon,strokeIcon,statBarsHtml,tierColor,categoryColor,tempoView,hudOccludes,formatClock,pushFeed,roomBanner,roomClearBanner,updateLowHealth,pulseHurt,setPauseScreen,runEndHtml,keycap,feedTone} from './hud-ui.js';
export {pushFeed};
import {cacheRewardAvailable} from './cache-rewards.js';
import {bruteMeleeHits,shieldBlocks,stepBruteMelee,turnShield} from './enemy-attacks.js';
import {registerHitIndicator} from './threat-indicators.js';
import {trapDialogTab} from './dialog-focus.js';
import {KNOCK_DECAY,ENEMY_KNOCK_DECAY,MOVE_TUNING,PRESS_BUFFER,addRecoil,approach,clipBlockedVelocity,cornerNudge,easeTimeScale,effectiveSpread,enemyKnockback,fanAngles,gunFeel,hitstopFor,loadoutMobility,muzzlePoint,newBloom,nextFireTime,playerHitKnock,pushEvent,registerShot,reloadTime,stepBloom,stepRecoil,stepVelocity}from './feel.js';
import {advanceWeaponBurst,beginWeaponBurst} from './weapon-burst.js';
import {DEFAULT_KEY_BINDINGS,KEY_BINDING_ACTIONS,keyLabel,loadKeyBindings,movementFromKeys,normalizeKey,rebindKey,resolveMovementKey,saveKeyBindings} from './keybindings.js';

const $ = (id) => document.getElementById(id);
const SPRINT_MULTIPLIER=1.45;
const attachmentsFor=(gun)=>state.attachments.get(gun.id)||new Map();
const shellForRun=()=>SHOTGUN_SHELLS.find(shell=>shell.id===state.shotgunShellId)||SHOTGUN_SHELLS[0];
const magSize=(gun)=>weaponStats(gun,attachmentsFor(gun)).magazine;
const reloadDuration=(gun)=>reloadSeconds(attachmentsFor(gun),gun,GEAR.find(item=>item.id===state.gear)?.reloadMultiplier||1);

const state = {
  noises:[], nav:null, mode:'title', running:false, paused:false, loadoutOpen:false, time:0, elapsed:0, realElapsed:0, calmTimer:0, notify:{}, lastMagWarn:{}, extractionOpen:false, objTimer:0, score:0, kills:0, scrap:0, roomsCleared:0,
  seed:0, tileMap:[], mapW:96, mapH:72, rooms:[], currentRoom:0,
  player:null, enemies:[], bullets:[], pickups:[], crates:[], cover:[], particles:[], props:[], doors:[], lockedDoors:[], solidMap:[], colliders:[], thrown:[], effects:[],
  weaponSlots:[0,1], activeSlot:0, get weaponIndex(){return this.weaponSlots[this.activeSlot];}, gear:null, carryCapacity:BASE_CARRY_CAPACITY, weaponAmmo:GUNS.map(g=>g.mag), reserveAmmo:GUNS.map(g=>g.reserve), attachments:new Map(), health:5, maxHealth:5, armor:0, maxArmor:0,
  progress:loadProgress(), paidOut:false,
  aim:{x:1,y:0}, lastAction:0, lastActionKind:'other', fireCooldown:0, weaponBurst:null, reloadTimer:0, invuln:0, shake:0, flashTimer:0, hitstop:0, toastTimer:0, roomToast:'', sector:1,
  throwableIndex:2, throwables:{smoke:1,flash:1,frag:2,incendiary:1}, shotgunShellId:'buckshot', merchantOpen:false, merchantRoom:null, cacheOpen:false, cachePickup:null, pendingGunPickup:null, pendingLoadoutChange:null,
  physics:null, workbench:null,
};
// Feel state (see feel.js). state.events is the sim -> renderer/audio event queue: the sim pushes plain
// objects, the renderer/audio drain it once per frame and clear it (`state.events.length=0`). Every event has
// {type,t(sim time),x,y} plus:
//   shot        {dx,dy,gun(id),pellets,kick,shake,muzzle:true}  x,y = muzzle point
//   hit         {dx,dy,damage,target:'enemy'|'crate',kill:false}  enemy/crate struck by a player round
//   kill        {dx,dy,damage,enemyType}                         enemy died
//   playerHurt  {damage,armorOnly,health}                        x,y = player
//   impact      {surface:'wall'|'cover'|'crate'|'enemy',owner}   round ended on geometry
//   reloadStart {gun,duration,empty}  reloadEnd {gun,cancelled}  empty {gun,dry}  (dry = no reserve ammo)
// Other eased/readable feel values: timeScaleSmoothed, timeScaleTarget, recoil{x,y,amount}, sprintBlend(0..1), bloom{value}.
Object.assign(state,{floor:1,floorCfg:floorConfig(1),freq:{},daily:false,runModal:null,timeCredit:0,stillFor:0,floorHit:false,floorsCleared:0,runRooms:0,floor1Seconds:0,stillRoomClears:0,slowTriples:0,slowKills:0,tripleFlag:false,noHitFloors:0,roomMove:0,lastPos:null,bossKilled:false,bossPistol:false,lastHitType:null,doorMarkers:[],doorLinks:[],boss:null,metaTab:'unlocks',shotDamageMult:1,levelSeed:0,freqOffers:[],freqThen:null,outcome:null,events:[],timeScaleSmoothed:1,timeScaleTarget:1,frameDt:1/60,recoil:{x:0,y:0,amount:0},sprintBlend:0,bloom:newBloom(),pressUntil:-1,wasFiring:false,playerVel:{x:0,y:0},playerKnock:{x:0,y:0},lastPhysicsStep:0,cmdVel:{x:0,y:0},stepHitstop:false,reloadTotal:0,dryTimer:0});
const emit=(type,x,y,extra)=>pushEvent(state.events,{type,t:state.time,x,y,...extra});
const input = {keys:new Set(), mouseX:innerWidth/2, mouseY:innerHeight/2, firing:false, interact:false};
const controls={bindings:{...DEFAULT_KEY_BINDINGS},waitingFor:null};

let view, physics;
const MINIMAP_LOOT_COLORS={scrap:'#f4c66d',gun:'#74c9ed',mod:'#d38ff5',heal:'#74dfab',cache:'#f4c66d'};
let visualSettings={shake:1,flash:1};
function binding(action){return controls.bindings[action];}
function weaponSlotLabel(slot){return ['PRIMARY','SECONDARY','TERTIARY'][slot]||`SLOT ${slot+1}`;}
function runStats(){return progressionStats(state.progress,state.freq);}
function maxWeaponSlots(){return runStats().maxWeaponSlots;}
function weaponRpm(gun){const shots=gun.burst?.shots||1,cycle=gun.burst?Math.max(gun.rate,(shots-1)*gun.burst.interval):gun.rate;return Math.round(60*shots/cycle);}
function weaponTargets(){return [...state.weaponSlots.map((_,slot)=>slot),...(state.weaponSlots.length<maxWeaponSlots()?[state.weaponSlots.length]:[])];}
function weaponSlotForGun(candidate){
  const gearWeight=GEAR.find(item=>item.id===state.gear)?.weight||0;
  return chooseWeaponReplacementSlot(state.weaponSlots,candidate,maxWeaponSlots(),state.activeSlot,GUNS,state.carryCapacity,gearWeight);
}
function weaponTargetSlot(index){return weaponSlotForGun(index)??state.activeSlot;}
function canEquipGun(index){return weaponSlotForGun(index)!==undefined;}
function hasMovementInput(){return ['moveUp','moveDown','moveLeft','moveRight'].some(action=>input.keys.has(binding(action)));}
function renderKeyBindings(focusAction=null){
  const list=$('key-bindings');if(!list)return;
  list.innerHTML=KEY_BINDING_ACTIONS.map(({id,label})=>`<div class="key-binding-row"><span>${label}</span><button type="button" data-bind-action="${id}" aria-label="${label}: ${keyLabel(binding(id))}" aria-pressed="${controls.waitingFor===id}">${controls.waitingFor===id?'PRESS A KEY':keyLabel(binding(id))}</button></div>`).join('');
  if(focusAction)list.querySelector(`[data-bind-action="${focusAction}"]`)?.focus();
}
function renderKeyGuide(){
  const movement=`${keyLabel(binding('moveUp'))} ${keyLabel(binding('moveLeft'))} ${keyLabel(binding('moveDown'))} ${keyLabel(binding('moveRight'))}`;
  const weaponKeys=maxWeaponSlots()>2?`${keyLabel(binding('weaponOne'))} ${keyLabel(binding('weaponTwo'))} ${keyLabel(binding('weaponThree'))}`:`${keyLabel(binding('weaponOne'))} ${keyLabel(binding('weaponTwo'))}`;
  const caps=text=>text.split(' ').map(keycap).join('');
  $('key-guide').innerHTML=[[movement,'MOVE'],['SHIFT','SPRINT'],['MOUSE','AIM / FIRE'],[keyLabel(binding('interact')),'INTERACT'],[keyLabel(binding('reload')),'RELOAD'],[weaponKeys,'WEAPONS'],['TAB','LOADOUT'],[keyLabel(binding('throwableUse')),'THROW'],['C','SHELL']].map(([k,l])=>`<div class="kg-row"><span class="kg-keys">${caps(k)}</span><i>${l}</i></div>`).join('');
  view?.canvas.setAttribute('aria-label',`DEAD AIR game. Use ${movement} to move and the mouse to aim and fire.`);
}
function markAction(kind='other'){state.lastAction=performance.now()/1000;state.lastActionKind=kind;}

function random(){return ROT.RNG.getUniform();}
function rand(min,max){ return min+random()*(max-min); }
function choose(list){ return list[Math.floor(random()*list.length)]; }
function distance(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
import {clamp} from './util.js';
function loadProgress(){try{return readSavedProgress(localStorage);}catch{return emptyProgress();}}
function saveProgress(){try{writeSavedProgress(localStorage,state.progress);}catch{toast('PROGRESS COULD NOT BE SAVED');}}
function resetProgress(){
  if(!window.confirm('Reset all saved coins and permanent upgrades? This cannot be undone.'))return;
  try{clearSavedProgress(localStorage);}catch{toast('SAVE COULD NOT BE RESET');return;}
  state.progress=emptyProgress();renderMeta();toast('SAFEHOUSE SAVE RESET');
}
function renderSlotStrip(){
  const strip=$('slot-strip');if(!strip)return;
  strip.innerHTML=state.weaponSlots.map((gi,slot)=>{const g=GUNS[gi];return `<div class="slot ${slot===state.activeSlot?'active':''}" style="--cat:${categoryColor(g.category)}">${keycap(keyLabel(binding(['weaponOne','weaponTwo','weaponThree'][slot])))}${gunIcon(g,'gun-ico sm')}<span class="slot-name">${g.name}</span><span class="slot-ammo">${state.weaponAmmo[gi]}<i>/${state.reserveAmmo[gi]}</i></span></div>`;}).join('');
}
// Per-frame HUD writes go through these: the DOM is only touched when the value actually changed.
function setText(el,v){if(el._t!==v){el._t=v;el.textContent=v;}}
function setHtml(el,v){if(el._h!==v){el._h=v;el.innerHTML=v;}}
function syncWeaponPanel(){
  const gun=GUNS[state.weaponIndex],mag=magSize(gun),cur=state.weaponAmmo[state.weaponIndex],reloading=state.reloadTimer>0;
  const low=cur<=Math.ceil(mag*.25);setHtml($('ammo'),`<b class="${cur===0?'empty':low?'low':''}">${cur}</b><i>/ ${mag}</i>`);
  {const res=state.reserveAmmo[state.weaponIndex],st=ammoStatus({mag:cur,reserve:res,magSize:mag});setText($('ammo-reserve'),st==='dry'?'NO AMMO':st==='last'?`LAST MAG · RES ${res}`:`RES ${res}`);const el=$('ammo-reserve');if(el._st!==st){el._st=st;el.classList.toggle('low',st==='last');el.classList.toggle('dry',st==='dry');}}
  const pips=$('ammo-pips');if(pips.dataset.mag!==String(mag)){pips.dataset.mag=String(mag);pips.innerHTML=Array.from({length:mag},()=>'<i></i>').join('');pips.classList.toggle('dense',mag>24);pips._on=-1;}
  if(pips._on!==cur){pips._on=cur;const kids=pips.children;for(let i=0;i<kids.length;i++)kids[i].classList.toggle('on',i<cur);}
  const track=$('reload-track');if(track._a!==reloading){track._a=reloading;track.classList.toggle('active',reloading);}
  if(reloading){const fill=$('reload-fill'),w=`${Math.round(clamp(1-state.reloadTimer/Math.max(.01,reloadDuration(gun)),0,1)*100)}%`;if(fill._w!==w){fill._w=w;fill.style.width=w;}}
  setText($('weapon-note'),reloading?'RELOADING':gun.id==='shotgun'?`${shellForRun().name} · C TO CYCLE`:gun.short);
  const icon=$('gun-icon'),key=`${gun.id}`;if(icon.dataset.g!==key){icon.dataset.g=key;icon.innerHTML=gunIcon(gun,'gun-ico lg');icon.style.setProperty('--cat',categoryColor(gun.category));}
}
function syncRunStats(){
  setText($('kills'),String(state.kills).padStart(2,'0'));setText($('scrap'),String(state.scrap).padStart(3,'0'));
  setText($('sector-count'),`${String(state.roomsCleared)} / ${String(state.rooms.length)}`);
  setText($('run-clock'),`RUN ${formatClock(state.realElapsed)}`);
  setText($('room-name'),state.roomToast||`FLOOR ${String(state.floor).padStart(2,'0')} · ${state.rooms[state.currentRoom]?.name||'ENTRY'}`);
}
function hud(){
  const gun=GUNS[state.weaponIndex];
  $('health').innerHTML=Array.from({length:state.maxHealth},(_,i)=>`<span class="heart pip ${i>=state.health?'empty':''}"></span>`).join('');updateLowHealth(state.health,state.maxHealth);
  {const hn=$('health-num');hn.innerHTML=`${state.health}<i>/ ${state.maxHealth}</i>`;hn.classList.toggle('low',state.health<=1);}
  $('armor-meter').hidden=state.maxArmor===0;$('armor-value').textContent=`${state.armor} / ${state.maxArmor}`;$('armor-pips').innerHTML=Array.from({length:state.maxArmor},(_,i)=>`<i class="${i>=state.armor?'empty':''}"></i>`).join('');
  const mods=attachmentsFor(gun);$('gun-name').textContent=gun.name; $('gun-mods').textContent=mods.size?[...mods].map(([id,tier])=>`${MODS.find(m=>m.id===id)?.name.split(' ')[0]} · ${lootTier(tier).label}`).join(' + '):'BARE BONES';
  renderSlotStrip();syncWeaponPanel();syncRunStats();updateThrowableHud();setHtml($('build-strip'),buildStripHtml(state.freq));
  $('loadout-scrap').textContent=`${String(state.scrap).padStart(3,'0')} SCRAP`;
  if(state.loadoutOpen)renderLoadout();
}
function syncHudFrame(){
  const gun=GUNS[state.weaponIndex];syncWeaponPanel();
  const strip=$('slot-strip');if(strip){const cells=strip.querySelectorAll('.slot-ammo');state.weaponSlots.forEach((gi,slot)=>{const c=cells[slot];if(c){const t=`${state.weaponAmmo[gi]}/${state.reserveAmmo[gi]}`;if(c.dataset.t!==t){c.dataset.t=t;c.innerHTML=`${state.weaponAmmo[gi]}<i>/${state.reserveAmmo[gi]}</i>`;}}});}
  syncRunStats();fadeHudOverPlay();
}
let hudFadeFrame=0,hudFadeOn=false;
function fadeHudOverPlay(){
  if((hudFadeFrame++&7)!==0||!state.player)return;
  const el=$('hud');if(!el)return;
  const cam=view.cam,sc=cam.scale,project=o=>({x:(o.x-cam.x)*sc+innerWidth/2,y:(o.y-cam.y)*sc+innerHeight/2});
  const points=[project(state.player)];
  for(const pk of state.pickups)if(pk.available)points.push(project(pk));
  for(const e of state.enemies)if(!e.alive)points.push(project(e));
  const on=hudOccludes(el.getBoundingClientRect(),points);
  if(on!==hudFadeOn){hudFadeOn=on;el.classList.toggle('ghost',on);}
}
function renderLoadout(){
  if(!$('loadout-gun'))return;
  const gear=GEAR.find(item=>item.id===state.gear),gearWeight=gear?.weight||0,weight=weaponLoadoutWeight(state.weaponSlots,GUNS)+gearWeight;
  const held=GUNS.map((_,index)=>index).sort((x,y)=>{const sx=state.weaponSlots.indexOf(x),sy=state.weaponSlots.indexOf(y);return (sx<0?99:sx)-(sy<0?99:sy)||x-y;});
  $('loadout-gun').innerHTML=held.map(index=>{const gun=GUNS[index];
    const slot=state.weaponSlots.indexOf(index),target=weaponTargetSlot(index),plan=weaponReplacement(state.weaponSlots,target,index,GUNS,state.carryCapacity,gearWeight);
    const eligible=slot>=0||plan.canCarry,versus=slot>=0?null:GUNS[state.weaponSlots[target]];
    const status=slot>=0?`${slot===state.activeSlot?'ACTIVE · ':''}${weaponSlotLabel(slot)} · `:plan.canCarry?`PREVIEW ${target===state.weaponSlots.length?'ADD':'REPLACE'} ${weaponSlotLabel(target)} · `:'UNAVAILABLE · ';
    const result=slot>=0?`CURRENT RIG ${weight.toFixed(1)} / ${state.carryCapacity.toFixed(1)} WT`:plan.canCarry?`AFTER ${target===state.weaponSlots.length?'ADD':'SWAP'} ${plan.totalWeight.toFixed(1)} / ${state.carryCapacity.toFixed(1)} WT`:plan.totalWeight>state.carryCapacity?`TOO HEAVY · ${plan.totalWeight.toFixed(1)} / ${state.carryCapacity.toFixed(1)} WT`:'ALREADY IN OTHER SLOT';
    const badge=slot>=0?`<em class="slot-badge ${slot===state.activeSlot?'active':''}">${slot===state.activeSlot?'ACTIVE · ':''}${weaponSlotLabel(slot)}</em>`:plan.canCarry?`<em class="slot-badge preview">${target===state.weaponSlots.length?'ADD':'REPLACE'} ${weaponSlotLabel(target)}</em>`:'<em class="slot-badge off">UNAVAILABLE</em>';
    return `<button class="loadout-weapon ${index===state.weaponIndex?'active':''} ${slot>=0?'held':''}" style="--cat:${categoryColor(gun.category)}" data-gun="${index}" ${eligible?'':`disabled title="${result}"`}><div class="lw-icon">${gunIcon(gun,'gun-ico')}</div><div class="lw-body"><div class="lw-head"><strong>${gun.name}</strong>${badge}</div><span class="lw-meta">${gun.category} · ${state.weaponAmmo[index]} / ${magSize(gun)} · ${state.reserveAmmo[index]} RESERVE</span>${statBarsHtml(gun,versus,GUNS,{compact:true})}<span class="lw-result ${plan.canCarry||slot>=0?'':'bad'}">${result}</span></div></button>`;
  }).join('');
  $('gear-list').innerHTML=GEAR.map(item=>{
    const equipped=state.gear===item.id,repairing=equipped&&item.armorDurability&&state.armor<state.maxArmor,afterWeight=weaponLoadoutWeight(state.weaponSlots,GUNS)+(equipped?0:item.weight),tooHeavy=!equipped&&afterWeight>state.carryCapacity,cost=repairing?item.repairCost:item.cost,shortOnScrap=state.scrap<cost;
    const reason=equipped?item.armorDurability?`PLATE ${state.armor} / ${state.maxArmor} · CURRENT RIG ${weight.toFixed(1)} / ${state.carryCapacity.toFixed(1)} WT`:`CURRENT RIG ${weight.toFixed(1)} / ${state.carryCapacity.toFixed(1)} WT`:tooHeavy?`TOO HEAVY · ${afterWeight.toFixed(1)} / ${state.carryCapacity.toFixed(1)} WT`:shortOnScrap?`NEED ${cost-state.scrap} MORE SCRAP`:`AFTER SWAP ${afterWeight.toFixed(1)} / ${state.carryCapacity.toFixed(1)} WT`;
    const disabled=repairing?shortOnScrap:!equipped&&(tooHeavy||shortOnScrap),buttonLabel=repairing?`PREVIEW REPAIR · ${cost} SCRAP`:equipped?'PREVIEW UNEQUIP':`${item.cost} SCRAP`;
    const icon=item.id==='armor'?'armor':item.id==='ammo-harness'?'harness':'scanner';
    return `<div class="mod-row ${equipped?'equipped':''}">${strokeIcon(icon,'ico')}<span>${item.name}${equipped?' <em class="chip on">EQUIPPED</em>':''}<br><small>${item.description} · ${item.weight.toFixed(1)} WT · ${reason}</small></span><button data-gear="${item.id}" ${disabled?'disabled':''}>${buttonLabel}</button></div>`;
  }).join('');
  $('carry-readout').textContent=`WEIGHT ${weight.toFixed(1)} / ${state.carryCapacity.toFixed(1)} · ${state.weaponSlots.length}/${maxWeaponSlots()} SLOTS`;
  const gun=GUNS[state.weaponIndex],installed=attachmentsFor(gun),available=compatibleAttachments(gun,MODS);
  $('mod-list').innerHTML=available.map(mod=>{const tier=installed.get(mod.id);return `<div class="mod-row ${tier?'equipped':''}" ${tier?`style="--tier:${tierColor(tier)}"`:''}>${strokeIcon(mod.id,'ico')}<span>${mod.name}${tier?` <em class="chip tier">${lootTier(tier).label}</em>`:''}<br><small>${mod.info}</small></span><button data-mod="${mod.id}" ${tier||state.scrap<mod.cost?'disabled':''}>${tier?`INSTALLED · ${lootTier(tier).label}`:`${mod.cost} SCRAP`}</button></div>`}).join('')||'<div class="mod-row"><span>No compatible attachments for this weapon.</span></div>';
  updateThrowableHud();
}
function previewLoadoutChange(change){
  if(change.type==='weapon'){
    const next=GUNS[change.index],slot=change.slot??weaponTargetSlot(change.index),current=GUNS[state.weaponSlots[slot]],gearWeight=GEAR.find(item=>item.id===state.gear)?.weight||0;
    if(!next||state.weaponSlots.includes(change.index))return;
    const plan=weaponReplacement(state.weaponSlots,slot,change.index,GUNS,state.carryCapacity,gearWeight);if(!plan.canCarry)return;
    change.slot=slot;
    $('loadout-change-title').textContent=`${slot===state.weaponSlots.length?'ADD':'REPLACE'} ${weaponSlotLabel(slot)} · ${next.name}`;
    $('loadout-change-copy').textContent=`${next.category} · ${next.damage} DAMAGE · ${weaponRpm(next)} RPM${next.burst?' · '+next.burst.shots+'-ROUND BURST':''} · ${next.mag} ROUND MAG · ${next.weight.toFixed(1)} WT`;
    $('loadout-change-summary').textContent=`${current?`${current.name} → `:''}${next.name} · RIG ${(weaponLoadoutWeight(state.weaponSlots,GUNS)+gearWeight).toFixed(1)} → ${plan.totalWeight.toFixed(1)} / ${state.carryCapacity.toFixed(1)} WT · STORED AMMO KEPT`;
  }else if(change.type==='gear'){
    const item=GEAR.find(option=>option.id===change.id);if(!item)return;
    const equipped=state.gear===item.id,currentItem=GEAR.find(option=>option.id===state.gear),currentWeight=weaponLoadoutWeight(state.weaponSlots,GUNS)+(currentItem?.weight||0),total=weaponLoadoutWeight(state.weaponSlots,GUNS)+(equipped?0:item.weight);
    const repairing=equipped&&item.armorDurability&&state.armor<state.maxArmor,cost=repairing?item.repairCost:item.cost;
    if(repairing&&state.scrap<cost||!equipped&&(state.scrap<cost||total>state.carryCapacity))return;
    $('loadout-change-title').textContent=repairing?'REPAIR ARMOR PLATE':equipped?`STORE ${item.name}`:`${currentItem?'SWAP':'EQUIP'} ${item.name}`;
    $('loadout-change-copy').textContent=repairing?`Restore the plate to ${item.armorDurability} durability for ${cost} scrap.`:equipped?`Store the ${item.name.toLowerCase()} and free ${item.weight.toFixed(1)} carry weight.`:`${item.description} · ${item.weight.toFixed(1)} WT · ${item.cost} SCRAP`;
    $('loadout-change-summary').textContent=repairing?`PLATE ${state.armor} → ${item.armorDurability} · ${cost} SCRAP · RIG ${currentWeight.toFixed(1)} / ${state.carryCapacity.toFixed(1)} WT`:`RIG ${currentWeight.toFixed(1)} → ${total.toFixed(1)} / ${state.carryCapacity.toFixed(1)} WT · PLATE ${state.armor} → ${equipped?0:item.armorDurability||0} · ${equipped?'NO SCRAP SPENT':'STORED WEAPONS KEPT'}`;
    if(repairing)change.repairing=true;
  }else return;
  state.pendingLoadoutChange=change;$('loadout-confirm').hidden=false;$('loadout-cancel').focus();
}
function closeLoadoutPreview(){
  const change=state.pendingLoadoutChange;state.pendingLoadoutChange=null;$('loadout-confirm').hidden=true;
  if(change?.type==='weapon')$('loadout-gun').querySelector(`[data-gun="${change.index}"]`)?.focus();
  else if(change?.type==='gear')$('gear-list').querySelector(`[data-gear="${change.id}"]`)?.focus();
}
function confirmLoadoutChange(){
  const change=state.pendingLoadoutChange;if(!change)return;
  closeLoadoutPreview();
  if(change.type==='weapon')equipWeapon(change.index);else if(change.type==='gear')equipGear(change.id,change.repairing);
  view?.canvas.focus();
}
function renderWeaponPickup(){
  const pickup=state.pendingGunPickup;if(!pickup)return;
  const gun=GUNS[pickup.gunIndex],gearWeight=GEAR.find(item=>item.id===state.gear)?.weight||0;
  $('weapon-pickup-name').textContent=gun.name;
  const cur=GUNS[state.weaponIndex],col=categoryColor(gun.category);
  $('weapon-pickup-hero').style.setProperty('--cat',col);
  $('weapon-pickup-hero').innerHTML=`<div class="wp-icon">${gunIcon(gun,'gun-ico xl')}</div><div class="wp-tags"><em class="chip" style="--c:${col}">${gun.category}</em>${gun.burst?`<em class="chip">${gun.burst.shots}-ROUND BURST</em>`:''}<em class="chip">${gun.mag} ROUND MAG</em><em class="chip">${gun.weight.toFixed(1)} WT</em></div>`;
  $('weapon-pickup-compare').innerHTML=`<div class="eyebrow">VS ${cur.name} · ▲ BETTER  ▼ WORSE</div>${statBarsHtml(gun,cur,GUNS)}`;
  $('weapon-pickup-stats').textContent=`${gun.category} · ${gun.damage} DAMAGE · ${weaponRpm(gun)} RPM${gun.burst?' · '+gun.burst.shots+'-ROUND BURST':''} · ${gun.mag} ROUND MAG · ${gun.weight.toFixed(1)} WT`;
  $('weapon-swap-options').innerHTML=weaponTargets().map(slot=>{
    const plan=weaponReplacement(state.weaponSlots,slot,pickup.gunIndex,GUNS,state.carryCapacity,gearWeight),oldGun=GUNS[state.weaponSlots[slot]];
    const adding=slot===state.weaponSlots.length,label=`${adding?'ADD':'SWAP'} ${weaponSlotLabel(slot)} · ${oldGun?`${oldGun.name} → `:''}${gun.name}`;
    const weight=plan.canCarry?`${plan.totalWeight.toFixed(1)} / ${state.carryCapacity.toFixed(1)} WT`:plan.totalWeight>state.carryCapacity?`TOO HEAVY · ${plan.totalWeight.toFixed(1)} / ${state.carryCapacity.toFixed(1)} WT`:'ALREADY CARRYING THIS GUN';
    const reason=plan.totalWeight>state.carryCapacity?`Exceeds carry capacity by ${(plan.totalWeight-state.carryCapacity).toFixed(1)} weight`:'This gun is already equipped';
    return `<button type="button" data-pickup-slot="${slot}" ${plan.canCarry?'':`disabled title="${reason}"`}>${keycap(String(slot+1))}${oldGun?gunIcon(oldGun,'gun-ico sm'):'<span class="gun-ico sm empty"></span>'}<span class="sw-text"><strong>${label}</strong><span>${weight} · FRESH MAGAZINE</span></span></button>`;
  }).join('');
  $('weapon-pickup').hidden=false;$('weapon-pickup').setAttribute('aria-hidden','false');
}
function showWeaponPickup(pickup){
  if(state.pendingGunPickup)return;
  state.pendingGunPickup=pickup;input.keys.clear();input.firing=false;renderWeaponPickup();$('weapon-pickup').querySelector('[data-pickup-slot]:not(:disabled)')?.focus();
}
let dialogClosedAt=-1e9;
function closeWeaponPickup(declined=false){dialogClosedAt=performance.now();
  if(declined&&state.pendingGunPickup)state.pendingGunPickup.declined=true;
  state.pendingGunPickup=null;$('weapon-pickup').hidden=true;$('weapon-pickup').setAttribute('aria-hidden','true');view?.canvas.focus();
}
function acceptWeaponPickup(slot){
  const pickup=state.pendingGunPickup;if(!pickup?.available)return;
  if(!weaponTargets().includes(slot))return;
  const gearWeight=GEAR.find(item=>item.id===state.gear)?.weight||0;
  const plan=weaponReplacement(state.weaponSlots,slot,pickup.gunIndex,GUNS,state.carryCapacity,gearWeight);
  if(!plan.canCarry)return;
  const gun=GUNS[pickup.gunIndex],color=pickup.color;
  state.weaponSlots=plan.weapons;state.activeSlot=slot;state.weaponAmmo[pickup.gunIndex]=gun.mag;state.reserveAmmo[pickup.gunIndex]+=gun.mag;
  pickup.available=false;view.fx.pickup(pickup.x,pickup.y,color);
  closeWeaponPickup();hud();toast(`${gun.name} · ${weaponSlotLabel(slot)} EQUIPPED`);renderLoadout();
}
function renderMeta(){
  $('meta-balance').textContent=String(state.progress.coins);
  $('meta-coins').textContent=`AVAILABLE · ${state.progress.coins} COINS`;
  $('meta-list').innerHTML=metaPanelHtml(state.progress,state.metaTab);
  const chip=$('kit-chip');if(chip)chip.innerHTML=kitChipHtml(state.progress);
  const daily=$('daily-button');if(daily)daily.querySelector('small').textContent=state.progress.daily.date===dateKey()?`BEST F${state.progress.daily.bestFloor||'—'}`:'NEW TODAY';
  renderKeyGuide();
}
function toast(message,duration=1700){if(duration>=3000){const el=$('toast');el.textContent=message;el.classList.add('show');state.toastTimer=duration;return;}pushFeed(message,feedTone(message));}
function makeBody(position,radius,fixed=false,sensor=false){
  const desc=fixed?RAPIER.RigidBodyDesc.fixed():RAPIER.RigidBodyDesc.dynamic().setLinearDamping(1.5).setAngularDamping(1);
  const body=physics.createRigidBody(desc.setTranslation(position.x,position.y));
  const collider=RAPIER.ColliderDesc.ball(radius).setDensity(fixed?1:0.7).setRestitution(0.02).setFriction(0.5).setSensor(sensor);
  physics.createCollider(collider,body); return body;
}
function makeFixedBox(x,y,halfW,halfH){
  const body=physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x,y));
  physics.createCollider(RAPIER.ColliderDesc.cuboid(halfW,halfH),body);state.colliders.push({body});
}

function makeRewardDoorGates(){
  for(const door of state.lockedDoors){
    const wideAlongZ=door.axis==='y',span=door.cells.length*TILE,x=(door.cells.reduce((sum,cell)=>sum+cell.x,0)/door.cells.length+.5)*TILE,z=(door.cells.reduce((sum,cell)=>sum+cell.y,0)/door.cells.length+.5)*TILE;
    const body=physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x,z));
    const halfWidth=wideAlongZ?4:span/2,halfDepth=wideAlongZ?span/2:4;
    physics.createCollider(RAPIER.ColliderDesc.cuboid(halfWidth,halfDepth),body);state.colliders.push({body});
    door.body=body;
    for(const {x:tileX,y:tileY} of door.cells)state.solidMap[tileY][tileX]=1;
  }
}
function placeRoleRewards(room){
  const reserved=[];
  for(const kind of roomPickupKinds(room.role)){
    const point=findRoomPropPosition({room,cells:state.tileMap,doors:state.doors,occupied:[...state.cover,...reserved],tileSize:TILE,random,preferred:room.rewardSpots});
    if(!point)continue;
    dropPickup(kind,point.x,point.y,kind==='scrap'?30+Math.floor(random()*21):0,room.index);
    reserved.push({...point,radius:18});
  }
}
function findRoomCratePosition(room){
  const occupied=[...state.cover,...state.pickups.map(pickup=>({...pickup,radius:18}))];
  return findGuaranteedRoomCratePosition({room,cells:state.tileMap,doors:state.doors,occupied,tileSize:TILE,random});
}
function arenaScore(dungeon){const room=dungeon.rooms.at(-1);return (room.x2-room.x1+1)*(room.y2-room.y1+1);}
function createRoomMap(){
  const cfg=state.floorCfg;state.levelSeed=floorSeed(state.seed,state.floor);
  let dungeon=generateDungeon(ROT,state.levelSeed);
  if(cfg.boss){// The boss needs room to dodge: look for a generous arena as the final room.
    for(let attempt=1;attempt<=16&&arenaScore(dungeon)<150;attempt++){try{const alt=generateDungeon(ROT,state.levelSeed+attempt*7919);if(arenaScore(alt)>arenaScore(dungeon)){dungeon=alt;state.levelSeed+=attempt*7919;}}catch{}}
  }
  state.tileMap=dungeon.cells;state.solidMap=dungeon.cells.map(row=>row.slice());state.lockedDoors=dungeon.lockedDoors;state.doors=[...dungeon.doors,...state.lockedDoors];
  state.mapW=dungeon.width;state.mapH=dungeon.height;
  state.rooms=dungeon.rooms;state.currentRoom=0;
  const merchantRooms=state.rooms.map((room,index)=>({room,index})).filter(item=>item.index>=2&&item.index<state.rooms.length-1&&item.room.role==='combat');
  if(merchantRooms.length&&random()<.18){const {room}=choose(merchantRooms);room.role='merchant';room.name='BLACK MARKET';room.stock=[];}
  // Deeper floors turn more ordinary rooms into WARDEN rooms.
  const wardenPool=state.rooms.map((room,index)=>({room,index})).filter(item=>item.index>=2&&item.index<state.rooms.length-1&&item.room.role==='combat'&&!item.room.branch);
  for(let n=0;n<cfg.eliteRooms&&wardenPool.length;n++){const {room}=wardenPool.splice(Math.floor(random()*wardenPool.length),1)[0];room.role='elite';room.name='WARDEN';}
  assignRoomRewards(state.rooms,random);
  state.doorLinks=computeDoorLinks({cells:state.tileMap,rooms:state.rooms,doors:state.doors});state.doorMarkers=[];
}
function makeLevel(){
  clearLevel(); createRoomMap();
  const wallRuns=[];
  for(let y=0;y<state.mapH;y++){
    let run=-1;
    for(let x=0;x<=state.mapW;x++){
      const wall=x<state.mapW&&state.tileMap[y][x]!==0;
      if(!wall&&run>=0){wallRuns.push({x:run,y,len:x-run});run=-1;}
      else if(wall&&run<0)run=x;
    }
  }
  for(const run of wallRuns){const width=run.len*TILE;makeFixedBox(run.x*TILE+width/2,run.y*TILE+TILE/2,width/2,TILE/2);}
  makeRewardDoorGates();
  // Room templates (room-templates.js) already stamped hard cover into the tile map; crates are the destructible low cover.
  for(const room of state.rooms){
    for(const crate of room.crates||[])spawnCrate((crate.x+.5)*TILE,(crate.y+.5)*TILE);
    if(!(room.crates||[]).length){
      const point=findRoomCratePosition(room);
      if(!point)throw new Error(`Room ${room.index} has no safe crate position`);
      spawnCrate(point.x,point.y);
    }
    placeRoleRewards(room);
  }
  let combatIndex=0;
  for(const [i,room] of state.rooms.entries()){
    if(i===0)continue;
    if(room.role==='merchant')continue;
    if(state.floorCfg.boss&&i===state.rooms.length-1)continue;
    const baseCount=paceEnemyCount(room,roomEnemyCount(room.role,random(),combatIndex)),count=baseCount+(room.role==='combat'||room.role==='hazard'?state.floorCfg.countBonus:0),depth=encounterDepth(i/Math.max(1,state.rooms.length-1),state.floor),encounter=roomEncounterTypes(room.role,chooseEncounterTypes(count,state.levelSeed+i*7919,depth),depth);
    if(room.role==='combat')combatIndex++;
    for(let j=0;j<count;j++){
      const elite=room.role==='elite'&&encounter[j]==='brute',point=findEnemySpawn(room,encounter[j],elite);
      if(point)spawnEnemy(encounter[j],point.x,point.y,i,elite);
    }
    if(!roomPickupKinds(room.role).length){
      if(i%2===1){dropPickup('scrap',...freeRoomPoint(room),10+Math.floor(random()*21));}
      if(i%3===0){const kind=choose(['gun','mod','heal']);dropPickup(kind,...freeRoomPoint(room));}
    }
  }
  const start=state.rooms[0];const sx=(start.cx+.5)*TILE,sy=(start.cy+.5)*TILE;
  const body=makeBody({x:sx,y:sy},8,false);body.lockRotations(true,true);body.setLinearDamping(4);body.collider(0).setFriction(0);Object.assign(state,{playerVel:{x:0,y:0},playerKnock:{x:0,y:0},cmdVel:{x:0,y:0},recoil:{x:0,y:0,amount:0},bloom:newBloom(),events:[],sprintBlend:0,pressUntil:-1,cornerStuck:0,cornerSign:1});
  state.player={body,x:sx,y:sy,hp:state.health};state.workbench=placeWorkbench(sx,sy);
  const exit=state.rooms.at(-1);dropPickup('exit',(exit.cx+.5)*TILE,(exit.cy+.5)*TILE);
  state.boss=state.floorCfg.boss?spawnBoss(bossApi,state.rooms.at(-1),interferenceStats(state.progress).bossHpMult):null;
  state.currentRoom=0;state.roomsCleared=0;updateRoom();makeMinimap();hud();view.setLevel();
}
function clearLevel(){
  state.player=null;state.enemies=[];state.bullets=[];state.pickups=[];state.crates=[];state.cover=[];state.thrown=[];state.effects=[];state.workbench=null;state.colliders=[];state.doors=[];state.lockedDoors=[];state.solidMap=[];
  physics?.free();
  physics=new RAPIER.World({x:0,y:0});state.physics=physics;
}



function spawnCrate(x,y){
  const body=physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x,y));
  physics.createCollider(RAPIER.ColliderDesc.cuboid(12,12),body);state.colliders.push({body});
  const crate={x,y,hp:60,maxHp:60,body,healthBarTimer:0,damageStage:0,flash:0,chips:[]};state.crates.push(crate);state.cover.push({x,y,radius:17,kind:'crate',crate});return crate;
}
function freeRoomPoint(room){
  for(let attempt=0;attempt<30;attempt++){
    const tx=Math.floor(rand(room.x1+1,room.x2)),ty=Math.floor(rand(room.y1+1,room.y2)),x=(tx+.5)*TILE,y=(ty+.5)*TILE;
    if(state.solidMap[ty]?.[tx]===0&&!state.cover.some(cover=>Math.hypot(x-cover.x,y-cover.y)<cover.radius+14)&&state.doors.every(door=>Math.hypot(x-(door.x+.5)*TILE,y-(door.y+.5)*TILE)>=TILE*1.2))return [x,y];
  }
  return [(room.cx+.5)*TILE+TILE,(room.cy+.5)*TILE];
}
function findEnemySpawn(room,type,elite=false){
  const radius=elite?13:type==='brute'||type==='riot'?10:8;
  const clear=(x,y)=>state.solidMap[Math.floor(y/TILE)]?.[Math.floor(x/TILE)]===0&&
    state.doors.every(door=>Math.hypot(x-(door.x+.5)*TILE,y-(door.y+.5)*TILE)>=TILE*1.2)&&
    !state.cover.some(cover=>Math.hypot(x-cover.x,y-cover.y)<cover.radius+radius+3)&&
    !state.pickups.some(pickup=>pickup.available&&Math.hypot(x-pickup.x,y-pickup.y)<radius+18)&&
    !state.enemies.some(enemy=>enemy.alive&&Math.hypot(x-enemy.x,y-enemy.y)<radius+enemy.radius+4);
  // Planned spawn tiles sit far from the entry door and near cover; take the best few in random order.
  const planned=(room.spawnTiles||[]).slice(0,14).sort(()=>random()-.5);
  for(const tile of planned){const x=(tile.x+.5)*TILE,y=(tile.y+.5)*TILE;if(clear(x,y))return {x,y};}
  const entry=room.entry?{x:(room.entry.x+.5)*TILE,y:(room.entry.y+.5)*TILE}:null;
  for(let attempt=0;attempt<48;attempt++){
    const x=rand(room.x1+2,room.x2-2)*TILE,y=rand(room.y1+2,room.y2-2)*TILE;
    if(clear(x,y)&&(!entry||attempt>30||Math.hypot(x-entry.x,y-entry.y)>TILE*5))return {x,y};
  }
  for(let ty=room.y1+1;ty<=room.y2;ty++)for(let tx=room.x1+1;tx<=room.x2;tx++){
    const x=(tx+.5)*TILE,y=(ty+.5)*TILE;if(clear(x,y))return {x,y};
  }
  return null;
}

function updateCrateDamageVisual(crate){
  crate.healthBarTimer=2.4;crate.damageStage=crateDamageStage(crate.hp,crate.maxHp);
}
function updateCrateVisuals(dt){
  for(const crate of state.crates){if(crate.healthBarTimer>0)crate.healthBarTimer=Math.max(0,crate.healthBarTimer-dt);}
}
function breakCrate(crate){
  playCrateBreak();
  physics.removeRigidBody(crate.body);state.colliders=state.colliders.filter(item=>item.body!==crate.body);state.crates=state.crates.filter(item=>item!==crate);state.cover=state.cover.filter(item=>item.crate!==crate);
  state.shake=Math.max(state.shake,1.8);view.fx.breakCrate(crate);
  if(random()<runStats().crateDropChance)dropPickup('scrap',crate.x,crate.y,8+Math.floor(random()*13));
  rollSupplyDrop('crate',crate.x,crate.y);
}
function spawnEnemy(type,x,y,roomIndex,elite=false){
  const base=ENEMY_TYPES[type],ih=interferenceStats(state.progress),cfg=state.floorCfg,def0=elite?{...base,name:'WARDEN',hp:200,speed:26,damage:2,color:0xff9566}:base,hpMul=type==='boss'?1:cfg.hpMult*ih.enemyHpMult,def=type==='boss'?def0:{...def0,hp:Math.round(def0.hp*hpMul),speed:def0.speed*cfg.speedMult*ih.enemySpeedMult},radius=type==='boss'?22:elite?13:type==='brute'||type==='riot'?10:8,body=makeBody({x,y},radius,false);body.lockRotations(true,true);body.setLinearDamping(3.4);
  const mag=type==='gunner'?5:type==='guard'?3:type==='sniper'?3:0;state.rooms[roomIndex].hadEncounter=true;const enemy={type,def,body,elite,x,y,roomIndex,radius,hp:def.hp,maxHp:def.hp,fire:rand(.55,1.7),aimTimer:0,aim:{x:1,y:0},meleeWindup:0,meleeCooldown:0,mag,ammo:mag,reloadTimer:0,stun:0,knock:{x:0,y:0},alive:true,id:random(),side:random()<.5?-1:1,tacticTimer:rand(0,.25),intent:'hold',intentGoal:null,navGoal:null,shieldAng:0,shieldFlash:0,locked:false};state.enemies.push(enemy);return enemy;
}
function possiblePickupGuns(){
  const pool=unlockedGunIds(state.progress);return GUNS.map((gun,index)=>index).filter(index=>pool.has(GUNS[index].id)&&!state.weaponSlots.includes(index)&&canEquipGun(index));
}
function dropPickup(kind,x,y,value=0,roomIndex=null){
  if(state.solidMap[Math.floor(y/TILE)]?.[Math.floor(x/TILE)]!==0)return;
  const gunIndex=kind==='gun'?choose(possiblePickupGuns()):undefined;if(kind==='gun'&&!Number.isInteger(gunIndex))return;
  const rarity=kind==='mod'?lootTierForRoll(random(),runStats().luckyFindLevel):null;
  const colors={freq:0x9ad8ff,scrap:0xf4c66d,gun:0x74c9ed,mod:lootTier(rarity).color,heal:0x74dfab,ammo:0x8fe0ff,armor:0x75cfe0,locker:0x8fe0ff,cache:0xf4c66d,exit:0xff5969};
  const pickup={kind,x,y,value,color:hexStr(colors[kind]),gunIndex,rarity,roomIndex,available:true,declined:false};state.pickups.push(pickup);
}

function fireBullet(owner,x,y,dx,dy,gun,damageScale=1,projectile={}){
  const stats=owner==='player'?weaponStats(gun,attachmentsFor(gun)):null;
  const speed=stats?.projectileSpeed??gun.speed;
  // Player rounds (and their tracer mesh) leave exactly at the muzzle; the swept test starts at the
  // shooter's centre (ox,oy) so a muzzle poking through a wall cannot let a round slip past it.
  const start=owner==='player'?muzzlePoint(x,y,dx,dy,gun):{x:x+dx*13,y:y+dy*13};
  const color=owner==='player'?gun.color:0xff6a64;
  const mods=owner==='player'?attachmentsFor(gun):new Set();
  const bullet={owner,enemyId:owner==='enemy'?projectile.enemyId:null,body:null,color,x:start.x,y:start.y,ox:x,oy:y,vx:dx*speed,vy:dy*speed,damage:projectile.damage??(stats?.damage??gun.damage)*damageScale,life:(projectile.range??stats?.range??gun.range??speed*1.7)/speed,penetration:owner==='player'?weaponPenetration(gun,mods):{enemies:0,crates:0,walls:0},hitEnemies:new Set(),hitCrates:new Set(),insideWall:false,style:projectile.style||null,missed:false};
  if(owner==='player'){const f=freqStats(state.freq);bullet.maxBounces=f.ricochet;bullet.bounces=0;bullet.penetration={...bullet.penetration,enemies:bullet.penetration.enemies+f.pierce};bullet.homing=f.homing;bullet.damage*=state.shotDamageMult;}
  state.bullets.push(bullet);
}
function playerMoveRatio(){const ratio=Math.hypot(state.playerVel.x,state.playerVel.y)/(runStats().moveSpeed||112);return ratio>.2?clamp(ratio,0,1):0;}
function firePlayerRound(gun,stats){
  const p=state.player;
  if(!p)return;
  playGunshot(gun,{suppressed:attachmentsFor(gun).has('suppressor')});
  state.noises.push({x:p.x,y:p.y,radius:state.heldSilent?0:(attachmentsFor(gun).has('suppressor')?190:380)*freqStats(state.freq).noiseMult});
  const fq=freqStats(state.freq);{let mult=runStats().damageMult*(1+fq.missingHpDamage*Math.max(0,state.maxHealth-state.health))*(state.health<=1&&fq.lastStand?1+fq.lastStand:1);if(fq.heldBreath>0&&state.stillFor>=.6){mult*=1+fq.heldBreath;state.stillFor=0;view.fx.floater(p.x,p.y-20,fq.heldBreathSilent?'HELD BREATH · SILENT':'HELD BREATH','#ffd27a',13,1);state.heldSilent=fq.heldBreathSilent;}else state.heldSilent=false;state.shotDamageMult=mult;}
  const feel=gunFeel(gun),first=registerShot(state.bloom,feel);
  const aim=Math.atan2(state.aim.y,state.aim.x),shell=gun.id==='shotgun'?shotgunShellStats(shellForRun(),stats):null;
  const count=shell?.pellets??gun.count??1,baseSpread=shell?.spread??stats.spread;
  const spread=effectiveSpread(baseSpread,state.bloom,feel,playerMoveRatio(),first);
  // Single rounds: random aim error inside the spread cone. Multi-pellet: an even fan (so the tracers show
  // where the pellets go) with only a small whole-fan wobble; extra pellets of non-shotguns keep their .08 fan.
  const angles=count>1?fanAngles(aim,count,shell?spread:Math.max(spread,(count-1)*.08),(random()-.5)*spread*.18):[aim+(random()-.5)*spread];
  for(const angle of angles)fireBullet('player',p.x,p.y,Math.cos(angle),Math.sin(angle),gun,1,shell?{damage:shell.damage,range:shell.range}:{});
  const muzzle=muzzlePoint(p.x,p.y,state.aim.x,state.aim.y,gun);
  state.recoil=addRecoil(state.recoil,state.aim.x,state.aim.y,feel.kick);
  state.playerKnock.x-=state.aim.x*feel.nudge;state.playerKnock.y-=state.aim.y*feel.nudge;
  state.shake=Math.max(state.shake,feel.shake);burst(muzzle.x,muzzle.y,0xffd08a,4);
  emit('shot',muzzle.x,muzzle.y,{dx:state.aim.x,dy:state.aim.y,gun:gun.id,pellets:count,kick:feel.kick,shake:feel.shake,spread,first});
}
function startReload(){
  const gun=GUNS[state.weaponIndex],ammo=state.weaponAmmo[state.weaponIndex];
  state.reloadTimer=state.reloadTotal=reloadTime(reloadDuration(gun),ammo);state.weaponBurst=null;
  playReload();emit('reloadStart',state.player.x,state.player.y,{gun:gun.id,duration:state.reloadTotal,empty:ammo<=0});
  const bloom=freqStats(state.freq).smokeReload;if(bloom>0){const item={...throwableById('smoke'),radius:bloom,duration:3};state.effects.push({id:'smoke',item,x:state.player.x,y:state.player.y,remaining:3,elapsed:0,nextTick:0});view.fx.explode('smoke',state.player.x,state.player.y,bloom);}
}
function notifyReady(key,gap){return cooldownReady(state.notify,key,performance.now()/1000,gap);}
function supplyCtx(){const gi=state.weaponIndex,g=GUNS[gi],low=ammoStatus({mag:state.weaponAmmo[gi],reserve:state.reserveAmmo[gi],magSize:magSize(g)})!=='ok'||state.weaponSlots.some(i=>ammoStatus({mag:state.weaponAmmo[i],reserve:state.reserveAmmo[i],magSize:magSize(GUNS[i])})==='dry');return {health:state.health,maxHealth:state.maxHealth,ammoLow:low,armorUseful:state.maxArmor>0&&state.armor<state.maxArmor};}
function rollSupplyDrop(source,x,y){const kind=supplyDrop(random(),source,supplyCtx());if(!kind)return;dropPickup(kind,x,y,kind==='ammo'?(source==='crate'?.35:.2):1);}
function playerShoot(){
  const p=state.player;if(!p||state.reloadTimer>0||state.weaponBurst)return;
  if(state.weaponAmmo[state.weaponIndex]<=0){
    if(state.reserveAmmo[state.weaponIndex]>0){startReload();if(notifyReady('reload',1.5))toast('RELOADING',750);}
    else{
      const next=nextLoadedSlot(state.weaponSlots,state.activeSlot,state.weaponAmmo,state.reserveAmmo);
      if(next>=0){switchWeapon(next);state.fireCooldown=Math.max(state.fireCooldown,state.time+.12);playUiClick();pushFeed(`SWAPPED TO ${GUNS[state.weaponIndex].name} · OUT OF AMMO`,'warn');}
      else if(state.dryTimer<=0){state.dryTimer=.35;emit('empty',p.x,p.y,{gun:GUNS[state.weaponIndex].id,dry:true});playEmptyClick();if(notifyReady('dry',2.5))toast('NO AMMO · FIND A SUPPLY LOCKER',1400);}
    }
    return;
  }
  const weaponIndex=state.weaponIndex,gun=GUNS[weaponIndex],stats=weaponStats(gun,attachmentsFor(gun)),now=state.time;if(now<state.fireCooldown)return;
  state.pressUntil=-1;state.fireCooldown=nextFireTime(now,state.fireCooldown,stats.fireRate/(1+(state.loopStacks||0)*freqStats(state.freq).loopPerStack),state.lastStep||1/60);state.weaponAmmo[weaponIndex]--;firePlayerRound(gun,stats);
  if(state.weaponAmmo[weaponIndex]<=0)emit('empty',p.x,p.y,{gun:gun.id,dry:false});
  if(gun.burst)state.weaponBurst=beginWeaponBurst({weaponIndex,shots:gun.burst.shots,interval:gun.burst.interval,firstShotAt:now,remainingAmmo:state.weaponAmmo[weaponIndex]});
  hud();markAction(hasMovementInput()?'move':'fire');
}
function updateSurvival(dt){
  const gi=state.weaponIndex,g=GUNS[gi];
  if(state.reloadTimer<=0&&!state.weaponBurst&&state.weaponAmmo[gi]<=0&&state.reserveAmmo[gi]>0)startReload();
  const st=ammoStatus({mag:state.weaponAmmo[gi],reserve:state.reserveAmmo[gi],magSize:magSize(g)});
  if(st==='last'&&!state.lastMagWarn[gi]){state.lastMagWarn[gi]=true;playLowAmmo();pushFeed(`LAST MAG · ${g.name}`,'warn');}
  else if(st==='ok')state.lastMagWarn[gi]=false;
  const clear=!roomHasLivingEnemies(state.currentRoom,state.enemies);state.calmTimer=clear?state.calmTimer+dt:0;
  if(shouldRegen({health:state.health,maxHealth:state.maxHealth,calm:state.calmTimer,roomClear:clear})){state.health++;state.calmTimer=0;view.fx.floater(state.player.x,state.player.y-18,'+1 ♥','#74dfab',14,1.1);pushFeed('VITALS STABILISING · +1','good');hud();}
  state.objTimer-=dt;if(state.objTimer<=0){state.objTimer=.2;updateObjective();state.doorMarkers=doorPreviews({rooms:state.rooms,doors:state.doors,links:state.doorLinks,currentRoom:state.currentRoom}).map(m=>({...m,info:m.info}));}
}
function updateObjective(){
  const el=$('objective');if(!el||!state.player)return;
  const route=state.rooms.filter((r,i)=>r.branch!==true&&roomHasLivingEnemies(i,state.enemies));
  const exit=state.pickups.find(p=>p.kind==='exit'&&p.available),routeHostiles=state.enemies.filter(e=>e.alive&&state.rooms[e.roomIndex]?.branch!==true).length;
  const o=objectiveText({routeRoomsLeft:route.length,routeHostiles,here:state.enemies.filter(e=>e.alive&&e.roomIndex===state.currentRoom).length,exitReady:routeHostiles===0,exitMeters:exit?distance(state.player,exit)/TILE:null});
  if(el.textContent!==o.text)el.textContent=o.text;if(el.dataset.tone!==o.tone)el.dataset.tone=o.tone;
}
function updateWeaponBurst(){
  if(!state.weaponBurst)return;
  const weaponIndex=state.weaponIndex,ammo=state.weaponAmmo[weaponIndex];
  const result=advanceWeaponBurst(state.weaponBurst,{weaponIndex,now:state.time,ammo});
  state.weaponBurst=result.burst;
  if(!result.shots)return;
  const gun=GUNS[weaponIndex],stats=weaponStats(gun,attachmentsFor(gun));
  state.weaponAmmo[weaponIndex]-=result.shots;
  for(let shot=0;shot<result.shots;shot++)firePlayerRound(gun,stats);
  if(state.weaponAmmo[weaponIndex]<=0)emit('empty',state.player.x,state.player.y,{gun:gun.id,dry:false});
  hud();markAction(hasMovementInput()?'move':'fire');
}
function enemyShoot(enemy,dx,dy){
  playEnemyShot({distance:distance(enemy,state.player),pan:(enemy.x-state.player.x)/480,heavy:enemy.type==='sniper'});
  view.shot('enemy',enemy,Math.atan2(dy,dx));
  fireBullet('enemy',enemy.x,enemy.y,dx,dy,{speed:enemy.def.projectileSpeed,range:enemy.def.range,damage:enemy.def.damage,color:0xff6a64},1,{enemyId:enemy.id,style:enemy.type==='sniper'?'sniper':null});
}
function burst(){}

function killEnemy(enemy,bullet){
  if(!enemy.alive)return;enemy.alive=false;enemy.corpseTimer=3.5;enemy.aimTimer=0;enemy.meleeWindup=0;for(let i=0;i<enemy.body.numColliders();i++)enemy.body.collider(i).setEnabled(false);{const bl=Math.hypot(bullet.vx,bullet.vy)||1,kv=enemyKnockback((bullet.damage||0)*1.6,enemy.type)*1.4;enemy.body.setLinvel({x:bullet.vx/bl*kv,y:bullet.vy/bl*kv},true);}enemy.hp=0;
  view.fx.kill(enemy,bullet.vx,bullet.vy);
  state.kills++;pushFeed(`DOWNED · ${enemy.def.name}`,'kill');state.scrap+=scrapGain(6+Math.floor(random()*8));state.shake=Math.max(state.shake,3.8);state.hitstop=Math.max(state.hitstop,hitstopFor({kill:true,damage:bullet.damage||0}));burst(enemy.x,enemy.y,enemy.def.color,17,1.4);{const bl=Math.hypot(bullet.vx,bullet.vy)||1;emit('kill',enemy.x,enemy.y,{dx:bullet.vx/bl,dy:bullet.vy/bl,damage:bullet.damage||0,enemyType:enemy.type});}
  if(random()<.2)dropPickup(random()<.55?'scrap':'mod',enemy.x,enemy.y,12+Math.floor(random()*10));
  rollSupplyDrop('kill',enemy.x+rand(-10,10),enemy.y+rand(-10,10));
  playKill();onEnemyKilled(enemy,bullet);hud();checkRoomClear();
}
function hitPlayer(damage,x,y,srcAng=null){const before=state.health+state.armor,wasPlay=state.mode==='play'&&state.invuln<=0;hitPlayerBase(damage,x,y,srcAng);if(wasPlay&&state.health+state.armor<before)onPlayerDamaged();}
function hitPlayerBase(damage,x,y,srcAng=null){
  if(state.invuln>0||state.mode!=='play')return;
  {const p=state.player;if(p){(state.hitIndicators??=[]);registerHitIndicator(state.hitIndicators,srcAng??Math.atan2(y-p.y,x-p.x),damage>1?1.25:1);}}
  const impact=absorbArmorDamage(state.armor,damage);state.armor=impact.armor;state.health=Math.max(0,state.health-impact.healthDamage);state.invuln=.85;state.calmTimer=0;pulseHurt();state.shake=impact.healthDamage>0?5.5:2.8;state.hitstop=Math.max(state.hitstop,.075);(impact.healthDamage>0?playPlayerHurt:playArmorHit)();markAction();emit('playerHurt',state.player.x,state.player.y,{damage:damage,armorOnly:impact.healthDamage===0,health:state.health,sx:x,sy:y});burst(state.player.x,state.player.y,impact.healthDamage>0?0xff4e63:0x75cfe0,12,1.1);
  const message=impact.healthDamage===0?state.armor===0?'PLATE BROKEN · HEALTH HELD':`PLATE HIT · ${state.armor} LEFT`:impact.absorbed>0?'PLATE HIT · VITALS DAMAGED':damage>1?'BRUTAL HIT':'YOU GOT TAGGED';toast(message,900);hud();
  {const kn=playerHitKnock(state.player.x-x,state.player.y-y,impact.healthDamage);state.playerKnock.x+=kn.x;state.playerKnock.y+=kn.y;}
  if(state.health<=0){finishRun('dead');$('vignette').style.background='radial-gradient(ellipse,rgba(95,15,30,.25),rgba(10,6,13,.85))';}
}
function reload(){const gun=GUNS[state.weaponIndex];if(!state.player||state.weaponBurst||state.reloadTimer>0||state.weaponAmmo[state.weaponIndex]>=magSize(gun)||state.reserveAmmo[state.weaponIndex]<=0)return;startReload();toast('RELOADING',700);}
function switchWeapon(slot){if(slot<0||slot>=state.weaponSlots.length)return;if(slot===state.activeSlot)return;if(state.reloadTimer>0&&state.player){emit('reloadEnd',state.player.x,state.player.y,{gun:GUNS[state.weaponIndex].id,cancelled:true});}state.weaponBurst=null;state.reloadTimer=0;state.activeSlot=slot;state.bloom=newBloom();markAction();hud();}
function cycleShotgunShell(){if(state.mode!=='play'||GUNS[state.weaponIndex].id!=='shotgun')return;const index=SHOTGUN_SHELLS.findIndex(shell=>shell.id===state.shotgunShellId);state.shotgunShellId=SHOTGUN_SHELLS[(index+1)%SHOTGUN_SHELLS.length].id;hud();toast(`${shellForRun().name} · ${shellForRun().description}`);markAction();}
function equipWeapon(index,slot=weaponTargetSlot(index)){const currentSlot=state.weaponSlots.indexOf(index);if(currentSlot>=0){switchWeapon(currentSlot);return;}const gear=GEAR.find(item=>item.id===state.gear);if(slot>state.weaponSlots.length||slot>=maxWeaponSlots()||!weaponReplacement(state.weaponSlots,slot,index,GUNS,state.carryCapacity,gear?.weight||0).canCarry){toast('TOO HEAVY · UPGRADE YOUR CARRY RIG');return;}state.weaponSlots[slot]=index;state.weaponAmmo[index]=Math.min(state.weaponAmmo[index],GUNS[index].mag);toast(`${weaponSlotLabel(slot)} · ${GUNS[index].name}`);hud();}
function equipGear(id,repair=false){
  const item=GEAR.find(option=>option.id===id);if(!item)return false;
  if(state.gear===id){
    if(repair&&item.armorDurability&&state.armor<state.maxArmor){if(state.scrap<item.repairCost)return false;state.scrap-=item.repairCost;state.armor=item.armorDurability;toast('ARMOR PLATE REPAIRED');hud();return true;}
    state.gear=null;state.armor=0;state.maxArmor=0;toast(`${item.name} STORED`);hud();return true;
  }
  if(state.scrap<item.cost||weaponLoadoutWeight(state.weaponSlots,GUNS)+item.weight>state.carryCapacity){toast(`NEED ${item.cost} SCRAP AND ${item.weight.toFixed(1)} FREE WEIGHT`);return false;}
  state.scrap-=item.cost;state.gear=id;state.maxArmor=item.armorDurability||0;state.armor=state.maxArmor;
  toast(item.armorDurability?`ARMOR PLATE EQUIPPED · ${item.armorDurability} DURABILITY`:item.reloadMultiplier?'AMMO HARNESS EQUIPPED · FASTER RELOADS':`${item.name} EQUIPPED`);hud();return true;
}
function installMod(id,gunIndex=state.weaponIndex,free=false,tier='common'){const gun=GUNS[gunIndex],mod=MODS.find(m=>m.id===id),installed=attachmentsFor(gun);if(!mod||!compatibleAttachments(gun,MODS).some(item=>item.id===id)||installed.has(id)||(!free&&state.scrap<mod.cost))return false;if(!free)state.scrap-=mod.cost;const previousMagazine=magSize(gun);installed.set(id,lootTier(tier).id);if(id==='extended')state.weaponAmmo[gunIndex]=Math.min(magSize(gun),state.weaponAmmo[gunIndex]+magSize(gun)-previousMagazine);toast(`${lootTier(tier).label} ${mod.name} INSTALLED · ${gun.name}`);hud();return true;}
function collect(pickup,manual=false){if(!pickup.available)return false;const d=distance(state.player,pickup);if(!manual&&d>28)return false;if(pickup.kind==='cache'){if(manual&&!pickup.claimed)openCache(pickup);return false;}if(pickup.kind==='locker')return false;if(pickup.kind==='gun'){if(pickup.declined&&!manual)return false;showWeaponPickup(pickup);return false;}if(pickup.kind==='heal'&&state.health>=state.maxHealth)return false;
  if(pickup.kind==='armor'&&!(state.maxArmor>0&&state.armor<state.maxArmor))return false;
  let ammoSlot=-1;
  if(pickup.kind==='ammo'){const order=[state.activeSlot,...state.weaponSlots.map((_,i)=>i).filter(i=>i!==state.activeSlot)];ammoSlot=order.find(i=>state.reserveAmmo[state.weaponSlots[i]]<GUNS[state.weaponSlots[i]].reserve);if(ammoSlot===undefined){if(notifyReady('ammofull',3))toast('AMMO FULL · KEEP IT FOR LATER',900);return false;}}
  pickup.available=false;view.fx.pickup(pickup.x,pickup.y,pickup.color);
  switch(pickup.kind){
    case'ammo':{const gi=state.weaponSlots[ammoSlot],g=GUNS[gi],add=Math.min(g.reserve-state.reserveAmmo[gi],ammoPickupRounds(g.reserve,pickup.value||.2));state.reserveAmmo[gi]+=add;view.fx.floater(pickup.x,pickup.y-8,collectPopup('ammo',add),'#8fe0ff',14,1.1);toast(`+${add} AMMO · ${g.name}`);break;}
    case'armor':state.armor=Math.min(state.maxArmor,state.armor+1);view.fx.floater(pickup.x,pickup.y-8,'+1 PLATE','#75cfe0',14,1.1);toast('ARMOR PLATE PATCHED · +1');break;
    case'scrap':state.scrap+=scrapGain(pickup.value||12);view.fx.floater(pickup.x,pickup.y-8,collectPopup('scrap',pickup.value||12),'#ffd27a',13,1);toast(`+${pickup.value||12} SCRAP`);break;
    case'mod':{const gun=GUNS[state.weaponIndex],unowned=compatibleAttachments(gun,MODS).filter(mod=>!attachmentsFor(gun).has(mod.id));if(unowned.length)installMod(choose(unowned).id,state.weaponIndex,true,pickup.rarity);else state.scrap+=30;view.fx.floater(pickup.x,pickup.y-8,unowned.length?'MOD INSTALLED':'+30 SCRAP',pickup.color,13,1.2);break;}
    case'heal':{const amt=pickup.value||2,got=Math.min(amt,state.maxHealth-state.health);state.health+=got;view.fx.floater(pickup.x,pickup.y-8,collectPopup('heal',got),'#74dfab',15,1.1);toast(`PATCHED UP · +${got} VITALS`);break;}
    case'freq':openFreqPick(pickup.elite?'elite':'door');break;
    case'exit':if(hasUnclearedRouteEnemies(state.rooms,state.enemies)){toast('CLEAR THE MAIN ROUTE FIRST');pickup.available=true;return false;}reachExit();break;
  }if(!pickup.available){if(pickup.kind!=='exit')playPickup(pickup.kind);}hud();return true;
}
function cacheMods(){const gun=GUNS[state.weaponIndex];return compatibleAttachments(gun,MODS).filter(mod=>!attachmentsFor(gun).has(mod.id));}
function cacheChoiceStatus(choice){const gun=GUNS[state.weaponIndex],mods=cacheMods();
  return cacheRewardAvailable(choice,{health:state.health,maxHealth:state.maxHealth,ammo:state.weaponAmmo[state.weaponIndex],magazine:magSize(gun),reserve:state.reserveAmmo[state.weaponIndex],maxReserve:gun.reserve,hasUpgrade:mods.length>0});
}
function renderCache(){
  const choices=[['ammo','AMMUNITION','Refill the magazine and add half a reserve of rounds.'],['health','FIELD MEDKIT','Restore up to two health.'],['upgrade','FIELD TUNING','Install a random compatible attachment at a Lucky Find quality.'],['prototype','PROTOTYPE DRAW','Install a prototype attachment, but lose one health.'],['scrap','SCRAP STASH','Take 35 scrap for the run.']];
  const icons={ammo:'ammo',health:'health',upgrade:'upgrade',prototype:'prototype',scrap:'scrap'};
  $('cache-options').innerHTML=choices.map(([id,name,description])=>{const ok=cacheChoiceStatus(id);return `<div class="merchant-row cache-row ${id}" data-kind="${id}">${strokeIcon(icons[id],'ico big')}<span><strong>${name}</strong><small>${description}</small></span><button data-cache="${id}" ${ok?'':'disabled'}>${ok?'TAKE':'N/A'}</button></div>`;}).join('');
}
function openCache(pickup){
  if(roomHasLivingEnemies(pickup.roomIndex,state.enemies)){toast('CLEAR THE CACHE ROOM FIRST');return;}
  state.cachePickup=pickup;state.cacheOpen=true;input.keys.clear();input.firing=false;renderCache();$('cache-panel').hidden=false;$('cache-panel').setAttribute('aria-hidden','false');$('close-cache').focus();
}
function closeCache(){dialogClosedAt=performance.now();state.cacheOpen=false;state.cachePickup=null;input.keys.clear();input.firing=false;$('cache-panel').hidden=true;$('cache-panel').setAttribute('aria-hidden','true');view.canvas.focus();}
function takeCacheReward(choice){
  const pickup=state.cachePickup;if(!pickup||!cacheChoiceStatus(choice))return;
  const gun=GUNS[state.weaponIndex];
  if(choice==='ammo'){
    state.weaponAmmo[state.weaponIndex]=magSize(gun);
    state.reserveAmmo[state.weaponIndex]=Math.min(gun.reserve,state.reserveAmmo[state.weaponIndex]+Math.max(12,Math.ceil(gun.reserve*.5)));
    toast('CACHE · AMMO RESTOCKED');view.fx.floater(pickup.x,pickup.y-10,collectPopup('ammo',Math.max(12,Math.ceil(gun.reserve*.5))),'#8fe0ff',14,1.2);
  }else if(choice==='health'){
    const healed=Math.min(2,state.maxHealth-state.health);state.health+=healed;toast(`CACHE · +${healed} HEALTH`);view.fx.floater(pickup.x,pickup.y-10,collectPopup('heal',healed),'#74dfab',15,1.2);
  }else if(choice==='scrap'){
    state.scrap+=35;toast('CACHE · +35 SCRAP');view.fx.floater(pickup.x,pickup.y-10,collectPopup('scrap',35),'#ffd27a',14,1.2);
  }else{
    const mod=choose(cacheMods()),tier=choice==='prototype'?'prototype':lootTierForRoll(random(),runStats().luckyFindLevel);
    if(choice==='prototype')state.health--;
    if(!installMod(mod.id,state.weaponIndex,true,tier))return;
    toast(choice==='prototype'?'PROTOTYPE CACHE · -1 HEALTH':'FIELD CACHE · ATTACHMENT FOUND');
  }
  pickup.claimed=true;view.fx.pickup(pickup.x,pickup.y,pickup.color);playPickup('cache');closeCache();hud();
}
function finishRun(result,cause){if(state.paidOut)return;finishRunImpl(result,cause);}
function winRun(){finishRun('won');}
/* ============================================================ macro loop: floors, decisions, frequencies, run end */
const bossApi={get state(){return state;},get fx(){return view.fx;},spawnEnemy,findEnemySpawn,fireBullet,hitPlayer:(damage,x,y)=>{state.lastHitType='boss';hitPlayer(damage,x,y);},dropPickup,freeRoomPoint,random,toast,banner:(title,sub)=>showBanner(title,sub,'room'),feed:pushFeed,removeBody:body=>physics.removeRigidBody(body),onBossBar:setBossBar};
const scrapGain=amount=>Math.max(1,Math.round(amount*interferenceStats(state.progress).scrapMult));
function setBossBar(init,e){
  const bar=$('boss-bar');if(!bar)return;
  if(init){bar.innerHTML=bossBarHtml(BOSS.name,e.boss.phase);bar.hidden=false;}
  if(bar.hidden)return;
  const fill=$('boss-fill'),ghost=$('boss-ghost');if(!fill)return;
  fill.style.width=`${Math.max(0,e.hp/e.maxHp*100)}%`;ghost.style.width=`${Math.max(0,(e.shownHp??e.hp)/e.maxHp*100)}%`;
  bar.dataset.phase=String(e.boss.phase);bar.classList.toggle('exposed',e.boss.exposed>0);bar.classList.toggle('shielded',!!e.boss.invuln);
  const label=bar.querySelector('.boss-name small'),text=`FLOOR ${FINAL_FLOOR} · PHASE ${['','I','II','III'][e.boss.phase]}`;if(label&&label.textContent!==text)label.textContent=text;
}
function trackRunClock(dt){
  state.timeCredit=Math.max(0,state.timeCredit-dt);state.freezeT=Math.max(0,(state.freezeT||0)-dt);if(state.loopStacks>0){state.loopT-=dt;if(state.loopT<=0)state.loopStacks=0;}
  const moving=hasMovementInput();state.stillFor=moving?0:state.stillFor+dt;
  if(moving){state.slowKills=0;state.tripleFlag=false;}
  const p=state.player;if(p){if(state.lastPos)state.roomMove+=Math.hypot(p.x-state.lastPos.x,p.y-state.lastPos.y);state.lastPos={x:p.x,y:p.y};}
}
function stunBurst(x,y,radius,seconds){
  view.fx.pickup(x,y,'#9ad8ff');
  for(const other of state.enemies)if(other.alive&&other.type!=='boss'&&Math.hypot(other.x-x,other.y-y)<radius)other.stun=Math.max(other.stun||0,seconds);
}
function bubbleFactor(b){const r=freqStats(state.freq).bubble,p=state.player;return r>0&&p&&Math.hypot(b.x-p.x,b.y-p.y)<r?.45:1;}
function steerBullet(b,dt){
  let best=null,bestScore=Infinity;const heading=Math.atan2(b.vy,b.vx);
  for(const e of state.enemies){if(!e.alive)continue;const dx=e.x-b.x,dy=e.y-b.y,d=Math.hypot(dx,dy);if(d>280||d<8)continue;let diff=Math.atan2(dy,dx)-heading;while(diff>Math.PI)diff-=TAU;while(diff<-Math.PI)diff+=TAU;if(Math.abs(diff)>.75)continue;if(d<bestScore){bestScore=d;best={diff};}}
  if(!best)return;const turn=Math.sign(best.diff)*Math.min(Math.abs(best.diff),b.homing*dt),speed=Math.hypot(b.vx,b.vy),a=heading+turn;b.vx=Math.cos(a)*speed;b.vy=Math.sin(a)*speed;
}
function onEnemyKilled(enemy,bullet){
  const f=freqStats(state.freq),unaware=!enemy.aware;
  if(f.freezeKill)state.freezeT=Math.max(state.freezeT||0,f.freezeKill);
  if(f.reloadKill&&bullet?.owner==='player'){const gi=state.weaponIndex,max=magSize(GUNS[gi]),take=Math.min(Math.ceil(max*f.reloadKill),max-state.weaponAmmo[gi]);if(take>0){state.weaponAmmo[gi]+=take;view.fx.floater(state.player.x,state.player.y-22,`+${take} ROUNDS`,'#ffd27a',12,.9);}}
  if(f.shards&&bullet?.owner==='player'&&!bullet.shard){
    const gun=GUNS[state.weaponIndex],near=state.enemies.filter(o=>o.alive&&o!==enemy&&distance(o,enemy)<260).sort((a,c)=>distance(a,enemy)-distance(c,enemy)),base=Math.atan2(bullet.vy,bullet.vx);
    for(let n=0;n<f.shards;n++){const target=near[n%Math.max(1,near.length)],angle=target?Math.atan2(target.y-enemy.y,target.x-enemy.x):base+(n-(f.shards-1)/2)*.6;fireBullet('player',enemy.x,enemy.y,Math.cos(angle),Math.sin(angle),gun,.45,{range:200});const shard=state.bullets.at(-1);if(shard){shard.shard=true;shard.homing=2.5;shard.penetration={enemies:0,crates:0,walls:0};}}
  }
  if(f.creditPerKill)state.timeCredit+=f.creditPerKill;
  if(f.stunKillCredit&&enemy.stun>.25)state.timeCredit+=f.stunKillCredit;
  if(unaware&&f.unawareScrap){state.scrap+=scrapGain(f.unawareScrap);view.fx.floater(enemy.x,enemy.y-16,`+${f.unawareScrap} QUIET KILL`,'#b49bff',12,1);}
  if(unaware&&f.unawareHeal&&state.health<=state.maxHealth/2&&state.health<state.maxHealth){state.health++;view.fx.floater(enemy.x,enemy.y-28,'DEAD DROP +1','#74dfab',13,1.1);}
  if(f.pulse)stunBurst(enemy.x,enemy.y,f.pulse,1);
  if(state.timeScaleTarget<.5&&enemy.type!=='boss'){state.slowKills++;if(state.slowKills>=3&&!state.tripleFlag){state.tripleFlag=true;state.slowTriples++;toast('THREE IN ONE BREATH',1600);pushFeed('THREE IN ONE BREATH','good');}}
  if(enemy.type==='boss')onBossKilled(enemy);
}
function onPlayerDamaged(){
  state.floorHit=true;const f=freqStats(state.freq);
  if(f.hitCredit){state.timeCredit+=f.hitCredit;}
  if(f.hitPulse&&state.player)stunBurst(state.player.x,state.player.y,f.hitPulse,1.2);
}
function playerHitDamage(b,enemy){
  if(b.owner!=='player')return b.damage;
  const f=freqStats(state.freq);let dmg=b.damage;
  if(!enemy.aware&&enemy.type!=='boss')dmg*=1+f.unawareDamage;
  if((b.bounces||0)>0)dmg*=1+f.bounceDamage;
  return bossDamageFor(enemy,dmg);
}
function playerStunBonus(enemy){const f=freqStats(state.freq);return enemy.type==='boss'?0:f.stunBonus*(!enemy.aware?f.unawareStunMult:1);}
function afterPlayerHit(b,enemy,dealt){
  if(enemy.type==='boss'&&dealt===0)view.fx.spark(b.x,b.y,Math.atan2(-b.vy,-b.vx),5,1);
  if(b.owner==='player'){const lf=freqStats(state.freq);if(lf.loopPerStack>0){state.loopStacks=Math.min(5,(state.loopStacks||0)+1);state.loopT=1.5;}}
  const f=freqStats(state.freq);if(!f.chain||b.owner!=='player')return;
  const targets=state.enemies.filter(o=>o.alive&&o!==enemy&&o.type!=='boss'&&distance(o,enemy)<115&&!lineBlocked(enemy.x,enemy.y,o.x,o.y)).sort((a,c)=>distance(a,enemy)-distance(c,enemy)).slice(0,f.chainTargets);
  for(const other of targets){
    const dmg=dealt*f.chain;other.hp-=dmg;other.stun=Math.max(other.stun||0,.3);
    view.fx.hitEnemy(other,dmg,other.x-enemy.x,other.y-enemy.y,other.hp<=0);view.fx.spark(other.x,other.y,Math.atan2(other.y-enemy.y,other.x-enemy.x),7,1.2);view.fx.spark(enemy.x,enemy.y,Math.atan2(other.y-enemy.y,other.x-enemy.x),5,1);
    if(other.hp<=0)killEnemy(other,{vx:other.x-enemy.x,vy:other.y-enemy.y,damage:dmg});
  }
}
function ricochetBullet(b,previous){
  const sx=Math.sign(b.vx),sy=Math.sign(b.vy),solid=(x,y)=>state.solidMap[Math.floor(y/TILE)]?.[Math.floor(x/TILE)]!==0;
  const hitX=solid(b.x+sx*5,b.y),hitY=solid(b.x,b.y+sy*5);
  if(hitX||!hitY)b.vx=-b.vx;if(hitY||!hitX)b.vy=-b.vy;
  b.x=previous.x;b.y=previous.y;b.insideWall=false;b.bounces=(b.bounces||0)+1;b.life=Math.max(b.life,.25);
  view.fx.spark(b.x,b.y,Math.atan2(b.vy,b.vx),5,1);
  return true;
}
function onBossKilled(enemy){
  state.bossKilled=true;state.bossPistol=GUNS[state.weaponIndex].category==='PISTOL';
  $('boss-bar').hidden=true;state.shake=12;state.hitstop=Math.max(state.hitstop,.25);
  showBanner('THE CONDUCTOR FALLS','THE EXIT IS OPEN','clear');pushFeed('THE CONDUCTOR · DOWN','good');playExplosion();
  for(const other of state.enemies)if(other.alive&&other!==enemy){other.hp=0;killEnemy(other,{vx:0,vy:0,damage:0});}
}
function roomRewardDrop(room){
  const kind=room.reward;if(!kind||room.rewardTaken)return;room.rewardTaken=true;
  const [x,y]=freeRoomPoint(room),builtIn=roomPickupKinds(room.role);
  if(kind==='freq'||kind==='elite'){dropPickup('freq',x,y,0,state.rooms.indexOf(room));const pk=state.pickups.at(-1);if(pk?.kind==='freq'&&kind==='elite')pk.elite=true;pushFeed(kind==='elite'?'ELITE DOWN · A FREQUENCY IS BROADCASTING':'A FREQUENCY IS BROADCASTING HERE','loot');}
  else if(kind==='scrap'){for(let n=0;n<4;n++)dropPickup('scrap',...freeRoomPoint(room),14);}
  else if(kind==='gun'&&!builtIn.includes('gun'))dropPickup('gun',x,y,0,state.rooms.indexOf(room));
  else if(kind==='heal'&&!builtIn.includes('heal')&&!interferenceStats(state.progress).noHeals)dropPickup('heal',x,y,2);
  else if(kind==='supply'&&room.role!=='merchant')dropPickup('cache',x,y,0,state.rooms.indexOf(room));
}
function roomClearTracking(room){
  if(state.roomMove<=96&&state.rooms.indexOf(room)>0&&!room.stillCounted){room.stillCounted=true;state.stillRoomClears++;toast('STILL LIFE · CLEARED WITHOUT MOVING',2200);pushFeed('STILL LIFE · GOAL PROGRESS','good');}
}

/* ---------- run modal (decision + frequency pick) */
function setRunModal(kind,html){
  state.runModal=kind;input.keys.clear();input.firing=false;
  const el=$('run-modal');el.innerHTML=html;el.hidden=false;el.setAttribute('aria-hidden','false');el.querySelector('button')?.focus();
}
function closeRunModal(){
  state.runModal=null;const el=$('run-modal');el.hidden=true;el.setAttribute('aria-hidden','true');el.innerHTML='';dialogClosedAt=performance.now();view?.canvas.focus();
}
const runCoinMult=()=>runStats().coinMult*(1+interferenceStats(state.progress).coinBonus);
function reachExit(){
  if(state.mode!=='play'||state.runModal)return;
  if(state.floor>=FINAL_FLOOR){winRun();return;}
  state.floorsCleared=state.floor;if(!state.floorHit)state.noHitFloors++;if(state.floor===1&&!state.floor1Seconds)state.floor1Seconds=state.realElapsed;
  playExtraction();
  const st=runStats(),gross=Math.floor(grossCoins({floorsCleared:state.floorsCleared,roomsCleared:state.runRooms,kills:state.kills})*runCoinMult());
  setRunModal('decision',decisionHtml({floor:state.floor,gross,kept:gross,deathKeep:st.deathKeep,nextClear:COIN_RATES.floorBonus[state.floor+1]||0,hp:state.health,maxHp:state.maxHealth,build:buildSummaryForUi(),interference:interferenceStats(state.progress).coinBonus}));
}
function buildSummaryForUi(){return Object.entries(state.freq).filter(([,rank])=>rank>0).map(([id,rank])=>({name:upgradeById(id)?.name||id,rank}));}
function decide(choice){
  if(state.runModal!=='decision')return;
  closeRunModal();
  if(choice==='extract')finishRun('extract');
  else openFreqPick('floor',()=>startFloor(state.floor+1));
}
function openFreqPick(source='door',then=null){
  const offers=offerFrequencies({unlockedIds:unlockedFreqIds(state.progress),owned:state.freq,rng:random});
  if(!offers.length){state.scrap+=40;toast('ALL FREQUENCIES MAXED · +40 SCRAP');then?.();return;}
  state.freqOffers=offers;state.freqThen=then;
  const meta={floor:['TUNE IN.','FLOOR REWARD · PICK ONE FREQUENCY'],elite:['ELITE SIGNAL.','ELITE CLEARED · PICK ONE FREQUENCY'],door:['TUNE IN.','FREQUENCY FOUND · PICK ONE']}[source]||['TUNE IN.','PICK ONE'];
  setRunModal('freq',freqOfferHtml({offers,owned:state.freq,title:meta[0],eyebrow:meta[1]}));
}
function pickFreq(id){
  const offer=state.freqOffers.find(item=>item.id===id);if(!offer||state.runModal!=='freq')return;
  const before=new Set(activeCrossfades(state.freq).map(c=>c.id));
  state.freq=pickFrequency(state.freq,id);
  const fresh=activeCrossfades(state.freq).filter(c=>!before.has(c.id));
  closeRunModal();playPickup('mod');toast(`${offer.name} · ${offer.isNew?'NEW':`RANK ${offer.rank}`}`,1700);
  if(fresh.length){pushFeed(`CROSSFADE · ${fresh[0].name}`,'good');showBanner(fresh[0].name,fresh[0].desc,'clear');}
  hud();const then=state.freqThen;state.freqThen=null;then?.();
}
function runModalKey(e,key){
  if(key==='tab'){trapDialogTab(e,$('run-modal'),document.activeElement);return;}
  if(state.runModal==='decision'){if(key==='1')decide('extract');else if(key==='2')decide('descend');}
  else if(state.runModal==='freq'){const n=Number(key);if(n>=1&&n<=state.freqOffers.length)pickFreq(state.freqOffers[n-1].id);}
}
function startFloor(n){
  state.floor=n;state.floorCfg=floorConfig(n);state.extractionOpen=false;state.floorHit=false;state.lastPos=null;state.roomMove=0;state.noises=[];state.hitIndicators=[];state.doorMarkers=[];
  ROT.RNG.setSeed(floorSeed(state.seed,n));
  for(const gi of state.weaponSlots)state.reserveAmmo[gi]=Math.min(GUNS[gi].reserve,state.reserveAmmo[gi]+Math.ceil(GUNS[gi].reserve*.4));
  state.health=Math.min(state.maxHealth,state.health+1);
  makeLevel();
  showBanner(state.floorCfg.name,n===FINAL_FLOOR?`FLOOR ${n} · THE CONDUCTOR IS WAITING`:`FLOOR ${n} · THE SIGNAL GETS LOUDER`,'room');
  hud();
}
function finishRunImpl(result,causeArg){
  state.paidOut=true;state.mode=result==='dead'?'dead':'won';state.outcome=result;state.runModal=null;setHtml($('build-strip'),'');$('run-modal').hidden=true;$('boss-bar').hidden=true;
  if(result!=='dead')playExtraction();
  const st=runStats(),ih=interferenceStats(state.progress),floorsCleared=result==='won'?FINAL_FLOOR-1:state.floorsCleared;
  const settle=settleRun({outcome:result,floorsCleared,roomsCleared:state.runRooms,kills:state.kills,bossKilled:state.bossKilled,coinMult:runCoinMult(),keepFraction:st.deathKeep});
  let progress=awardCoins(state.progress,settle.kept);
  const cause=result==='dead'?(causeArg||state.lastHitType||null):null,reached=Math.max(1,state.floor);
  const summary={kills:state.kills,floorReached:reached,outcome:result,seconds:state.realElapsed,bossKilled:state.bossKilled,bossPistol:state.bossKilled&&state.bossPistol,stillRooms:state.stillRoomClears,slowTriples:state.slowTriples,noHitFloors:state.noHitFloors,floor1Seconds:state.floor1Seconds,daily:state.daily,coins:settle.kept};
  const firstBossKill=state.bossKilled&&progress.stats.bossKills===0;
  const rec=recordRun(progress,summary);progress=rec.progress;
  const tape=collectTape(progress);progress=tape.progress;
  if(state.daily)progress=recordDaily(progress,dateKey(),{floor:reached,kills:state.kills});
  const newUnlocks=rec.unlockedIds.map(id=>UNLOCK_BY_ID.get(id)?.name).filter(Boolean);
  state.progress=progress;saveProgress();
  const lines=operatorLines({outcome:result,cause,floor:reached,firstBossKill,newUnlocks,newTape:tape.tape,runs:progress.stats.runs,seed:state.seed+state.kills});
  const share=state.daily?dailyShareLine({date:dateKey(),floor:reached,kills:state.kills,coins:settle.kept,outcome:result,seconds:state.realElapsed}):'';state.shareLine=share;
  const payout=result==='dead'?`BANKED <b>+${settle.kept}</b> · LOST ${settle.lost} UNBANKED · DEATH KEEPS ${Math.round(st.deathKeep*100)}%`:`BANKED <b>+${settle.kept}</b> · FLOOR ${reached} OF ${FINAL_FLOOR}${ih.coinBonus?` · INTERFERENCE +${Math.round(ih.coinBonus*100)}%`:''}`;
  const el=$('run-result');el.hidden=false;
  el.innerHTML=runEndHtml({won:result!=='dead',rooms:state.runRooms,totalRooms:0,kills:state.kills,seconds:state.realElapsed,payout:settle.kept,seed:state.seed,scrap:state.scrap,balance:progress.coins})+storyHtml({lines,goals:rec.completed,unlocks:newUnlocks,tape:tape.tape,share,payout});
  el.dataset.result=result==='dead'?'dead':'won';$('start-button').textContent='RUN AGAIN ↗';$('overlay').classList.add('show');$('meta-panel').hidden=true;renderMeta();$('start-button').focus();
  toast(result==='won'?'THE CONDUCTOR IS DOWN':result==='extract'?'EXTRACTED':'RUN OVER',3500);
}
function wireMacroUi(){
  $('run-modal').addEventListener('click',event=>{
    const act=event.target.closest('[data-act]'),freq=event.target.closest('[data-freq]');
    if(act?.dataset.act==='extract')decide('extract');else if(act?.dataset.act==='descend')decide('descend');else if(freq)pickFreq(freq.dataset.freq);
  });
  $('meta-list').addEventListener('click',event=>{
    const up=event.target.closest('[data-upgrade]'),buy=event.target.closest('[data-buy]'),act=event.target.closest('[data-act]');
    if(up){const result=purchaseUpgrade(state.progress,up.dataset.upgrade);if(result.purchased){state.progress=result.progress;saveProgress();}}
    else if(buy){const id=buy.dataset.buy,result=purchaseUnlock(state.progress,id);if(result.purchased){state.progress=result.progress;if(id.startsWith('kit:'))state.progress=selectKit(state.progress,id.slice(4));saveProgress();toast(`UNLOCKED · ${UNLOCK_BY_ID.get(id).name}`);}}
    else if(act){const id=act.dataset.id,kind=act.dataset.act;if(kind==='tab')state.metaTab=id;else if(kind==='kit'){state.progress=selectKit(state.progress,id);saveProgress();}else if(kind==='heat'){state.progress=toggleInterference(state.progress,id);saveProgress();}}
    renderMeta();
  });
  $('run-result').addEventListener('click',event=>{if(event.target.closest('[data-act="share"]')&&state.shareLine){try{navigator.clipboard?.writeText(state.shareLine);}catch{}event.target.textContent='COPIED';}});
  $('kit-chip')?.addEventListener('click',()=>{state.metaTab='unlocks';renderMeta();$('meta-panel').hidden=false;$('close-meta').focus();});
}

function checkRoomClear(){for(const [i,r] of state.rooms.entries()){
  if(r.cleared||!r.visited)continue;
  const hasEnemy=roomHasLivingEnemies(i,state.enemies);
  if(!hasEnemy){r.cleared=true;state.roomsCleared++;state.runRooms++;if(roomHasEncounter(r)){roomRewardDrop(r);roomClearTracking(r);const reward=scrapGain(runStats().roomClearScrap);state.scrap+=reward;playRoomClear();roomClearBanner(reward);{const cx=(r.cx+.5)*TILE,cy=(r.cy+.5)*TILE;view.fx.pickup(cx,cy,'#6dffb0');view.fx.floater(cx,cy-26,reward?`ROOM CLEARED · +${reward} SCRAP`:'ROOM CLEARED','#6dffb0',17,2.2);}for(let n=0;n<6;n++)dropPickup('scrap',rand(r.x1+1,r.x2-1)*TILE,rand(r.y1+1,r.y2-1)*TILE,4);roomClearSupplies(r);hud();}}
}
  checkExtractionOpen();
}
function roomClearSupplies(room){
  const heal=clearHealAmount({health:state.health,maxHealth:state.maxHealth});
  if(heal>0&&!interferenceStats(state.progress).noHeals){dropPickup('heal',...freeRoomPoint(room),heal);pushFeed('MEDKIT DROPPED · YOU ARE HURT','good');}
  if(room.role!=='entry'&&lockerSpawns(random(),{ammoLow:supplyCtx().ammoLow})){dropPickup('locker',...freeRoomPoint(room),0,room.index);pushFeed('SUPPLY LOCKER · SPEND SCRAP ON AMMO','loot');}
}
function checkExtractionOpen(){
  if(state.extractionOpen||state.mode!=='play')return;
  if(hasUnclearedRouteEnemies(state.rooms,state.enemies))return;
  state.extractionOpen=true;showBanner('EXTRACTION OPEN','FOLLOW THE ARROW TO THE EXIT','clear');pushFeed('EXTRACTION OPEN · REACH THE EXIT','good');playExtraction();
}
function updateRoom(){
  const px=state.player.x/TILE,py=state.player.y/TILE;let found=state.rooms.findIndex(r=>px>=r.x1-1&&px<=r.x2+1&&py>=r.y1-1&&py<=r.y2+1);
  if(found<0){const nearest=state.rooms.reduce((best,r,i)=>Math.hypot(px-r.cx,py-r.cy)<best.d?{i,d:Math.hypot(px-r.cx,py-r.cy)}:best,{i:state.currentRoom,d:Infinity});found=nearest.i;}
  if(found!==state.currentRoom){state.currentRoom=found;state.roomMove=0;const room=state.rooms[found],discoveredSecret=room.secret&&!room.visited;room.visited=true;if(discoveredSecret)room.name=room.revealedName;state.roomToast=discoveredSecret?'SECRET ROOM FOUND':`FLOOR ${String(state.floor).padStart(2,'0')} · ${room.name}`;state.toastTimer=1100;roomBanner(room.name,state.enemies.filter(e=>e.alive&&e.roomIndex===found).length,discoveredSecret);checkRoomClear();hud();}
  if(state.roomToast&&state.toastTimer<=0)state.roomToast='';
}
function placeWorkbench(sx,sy){
  // bench sits ~2.4 tiles from the spawn on open floor, clear of crates/cover/pillars, so it never overlaps the player or props
  const free=(x,y)=>[[-26,-16],[26,-16],[-26,16],[26,16],[0,0]].every(([dx,dy])=>state.solidMap[Math.floor((y+dy)/TILE)]?.[Math.floor((x+dx)/TILE)]===0)&&!state.crates.some(c=>Math.hypot(c.x-x,c.y-y)<44)&&!state.cover.some(c=>Math.hypot(c.x-x,c.y-y)<c.radius+34);
  for(const d of [76,84,96,64]){for(const a of [0,Math.PI,-Math.PI/2,Math.PI/2,Math.PI/4,-Math.PI/4,3*Math.PI/4,-3*Math.PI/4]){const x=sx+Math.cos(a)*d,y=sy+Math.sin(a)*d;if(free(x,y))return {x,y};}}
  return {x:sx+76,y:sy};
}
function buyLockerAmmo(target){
  if(!target.enabled){if(notifyReady('locker',1.2))toast(target.reason||'CANNOT BUY AMMO');return;}
  const gi=state.weaponIndex,g=GUNS[gi],missing=Math.max(0,g.reserve-state.reserveAmmo[gi]),cost=refillCost(missing);
  if(missing<=0||state.scrap<cost)return;
  state.scrap-=cost;state.reserveAmmo[gi]=g.reserve;playPickup('cache');view.fx.floater(target.x,target.y-10,collectPopup('ammo',missing),'#8fe0ff',14,1.2);toast(`AMMO RESTOCKED · ${g.name} · -${cost} SCRAP`);hud();
}
function interactTargets(){return collectInteractables({ammo:{reserve:state.reserveAmmo[state.weaponIndex],maxReserve:GUNS[state.weaponIndex].reserve},player:state.player,scrap:state.scrap,gates:state.lockedDoors,pickups:state.pickups,rooms:state.rooms,enemies:state.enemies,workbench:state.workbench,guns:GUNS,tile:TILE});}
function interact(){
  const target=activeInteraction(interactTargets());
  if(!target)return;
  if(target.kind==='gate'){const gate=target.ref,purchase=unlockRewardGate(gate,state.scrap);if(purchase.status==='insufficient'){toast(`VAULT LOCK · NEED ${purchase.missing} MORE SCRAP`);return;}if(purchase.status!=='opened')return;state.scrap=purchase.scrap;gate.opened=true;gate.openedAt=state.elapsed;for(const {x,y} of gate.cells)state.solidMap[y][x]=0;state.nav?.setSolid(x,y,0);if(gate.body){physics.removeRigidBody(gate.body);state.colliders=state.colliders.filter(item=>item.body!==gate.body);gate.body=null;}view.fx.pickup((gate.x+.5)*TILE,(gate.y+.5)*TILE,'#ffb04a');view.fx.floater((gate.x+.5)*TILE,(gate.y+.5)*TILE-18,`GATE OPEN · -${gate.cost} SCRAP`,'#ffd27a',13,1.6);playGateUnlock();toast(`CACHE GATE OPEN · -${gate.cost} SCRAP`);hud();return;}
  if(target.kind==='cache'){collect(target.ref,true);return;}
  if(target.kind==='market'){openMerchant(target.ref);return;}
  if(target.kind==='gun'){collect(target.ref,true);return;}
  if(target.kind==='station'){toggleLoadout();return;}
  if(target.kind==='locker'){buyLockerAmmo(target);return;}
  if(target.kind==='exit'){if(hasUnclearedRouteEnemies(state.rooms,state.enemies)){toast('CLEAR THE MAIN ROUTE FIRST');return;}reachExit();return;}
}
function createMerchantStock(room){
  const attachmentOptions=compatibleAttachments(GUNS[state.weaponIndex],MODS).filter(mod=>!attachmentsFor(GUNS[state.weaponIndex]).has(mod.id));
  const gearWeight=GEAR.find(item=>item.id===state.gear)?.weight||0;
  const eligibleGuns=GUNS.filter((gun,index)=>unlockedGunIds(state.progress).has(gun.id)&&!state.weaponSlots.includes(index)&&chooseWeaponReplacementSlot(state.weaponSlots,index,maxWeaponSlots(),state.activeSlot,GUNS,state.carryCapacity,gearWeight)!==undefined);
  const gear=choose(GEAR);
  const offers=[{type:'weapon',gunId:choose(eligibleGuns.length?eligibleGuns:GUNS).id,cost:42},{type:'gear',gearId:gear.id,cost:gear.cost+13},{type:'health',cost:24},{type:'ammo',cost:18},{type:'throwable',throwableId:choose(THROWABLES.filter(item=>unlockedThrowableIds(state.progress).has(item.id))).id,cost:22}];
  if(attachmentOptions.length){const mod=choose(attachmentOptions);offers.splice(1,0,{type:'attachment',modId:mod.id,gunIndex:state.weaponIndex,cost:mod.cost+12});}
  room.stock=offers.map(offer=>({...offer,sold:false}));
}
function merchantOfferName(offer){if(offer.type==='weapon')return GUNS.find(gun=>gun.id===offer.gunId)?.name||'WEAPON';if(offer.type==='attachment')return `${MODS.find(mod=>mod.id===offer.modId)?.name||'ATTACHMENT'} · ${GUNS[offer.gunIndex].name}`;if(offer.type==='gear')return GEAR.find(item=>item.id===offer.gearId)?.name||'GEAR';if(offer.type==='health')return 'FIELD MEDKIT';if(offer.type==='ammo')return 'AMMO RESTOCK';const item=throwableById(offer.throwableId);return `${item?.name||'THROWABLE'} REFILL`;}
function merchantCanBuy(offer){
  if(offer.sold||state.scrap<offer.cost)return false;
  if(offer.type==='weapon'){const index=GUNS.findIndex(gun=>gun.id===offer.gunId);return index>=0&&canEquipGun(index);}
  if(offer.type==='attachment'){const gun=GUNS[offer.gunIndex];return !!gun&&compatibleAttachments(gun,MODS).some(mod=>mod.id===offer.modId)&&!attachmentsFor(gun).has(offer.modId);}
  if(offer.type==='gear'){const item=GEAR.find(option=>option.id===offer.gearId);return !!item&&state.gear!==item.id&&weaponLoadoutWeight(state.weaponSlots,GUNS)+item.weight<=state.carryCapacity;}
  if(offer.type==='health')return state.health<state.maxHealth;
  if(offer.type==='ammo')return state.weaponSlots.some(i=>state.reserveAmmo[i]<GUNS[i].reserve);
  if(offer.type==='throwable')return (state.throwables[offer.throwableId]||0)<throwableById(offer.throwableId).stack;
  return false;
}
function renderMerchant(){
  if(!state.merchantRoom)return;const room=state.merchantRoom;if(!room.stock?.length)createMerchantStock(room);
  $('merchant-stock').innerHTML=room.stock.map((offer,index)=>{const active=merchantCanBuy(offer),reason=(offer.type==='weapon'||offer.type==='gear')&&!active&&state.scrap>=offer.cost?(offer.type==='gear'&&state.gear===offer.gearId?' · EQUIPPED':' · TOO HEAVY'):offer.type==='health'&&!active?' · FULL HEALTH':offer.type==='ammo'&&!active&&state.scrap>=offer.cost?' · AMMO FULL':'';const gear=offer.type==='gear'?GEAR.find(item=>item.id===offer.gearId):null;
    const wGun=offer.type==='weapon'?GUNS.find(gun=>gun.id===offer.gunId):null,aGun=offer.type==='attachment'?GUNS[offer.gunIndex]:null;
    const icon=wGun?gunIcon(wGun,'gun-ico md'):strokeIcon(offer.type==='gear'?(offer.gearId==='armor'?'armor':offer.gearId==='ammo-harness'?'harness':'scanner'):offer.type==='attachment'?'mod':offer.type==='health'?'health':offer.type==='ammo'?'ammo':(offer.throwableId||'frag'),'ico big');
    const afford=!offer.sold&&state.scrap<offer.cost?'poor':'';
    return `<div class="merchant-row ${offer.sold?'sold':''} ${afford}" data-kind="${offer.type}"><div class="mr-icon">${icon}</div><span><strong>${merchantOfferName(offer)}</strong><small>${offer.type==='weapon'?`Add or replace a weapon slot (1–${maxWeaponSlots()})`:offer.type==='attachment'?'Permanent for this run · compatible with the named gun':gear?`${gear.description} · ${gear.weight.toFixed(1)} carry weight`:offer.type==='health'?'+2 health':offer.type==='ammo'?'Refill reserve ammo for every carried gun':'Refill to carry limit'}${reason}</small>${wGun?statBarsHtml(wGun,GUNS[state.weaponIndex],GUNS,{compact:true}):''}</span><button data-merchant="${index}" ${active?'':'disabled'}>${offer.sold?'SOLD':`${offer.cost} SCRAP`}</button></div>`;}).join('')+`<div class="merchant-footer">POCKETS · <b>${state.scrap}</b> SCRAP</div>`;
}
function openMerchant(room){state.merchantRoom=room;state.merchantOpen=true;renderMerchant();$('merchant-panel').hidden=false;$('merchant-panel').setAttribute('aria-hidden','false');$('close-merchant').focus();}
function closeMerchant(){dialogClosedAt=performance.now();state.merchantOpen=false;$('merchant-panel').hidden=true;$('merchant-panel').setAttribute('aria-hidden','true');view.canvas.focus();}
function buyMerchantOffer(index){const offer=state.merchantRoom?.stock[index];if(!offer||!merchantCanBuy(offer))return;if(offer.type==='gear'){const item=GEAR.find(option=>option.id===offer.gearId);if(!item||!equipGear(offer.gearId))return;state.scrap-=Math.max(0,offer.cost-item.cost);offer.sold=true;hud();renderMerchant();return;}state.scrap-=offer.cost;
  if(offer.type==='weapon'){const weaponIndex=GUNS.findIndex(gun=>gun.id===offer.gunId),slot=weaponSlotForGun(weaponIndex);if(slot===undefined)return;state.weaponSlots[slot]=weaponIndex;state.weaponAmmo[weaponIndex]=GUNS[weaponIndex].mag;state.reserveAmmo[weaponIndex]=GUNS[weaponIndex].reserve;toast(`${weaponSlotLabel(slot)} · ${GUNS[weaponIndex].name}`);}
  else if(offer.type==='attachment'){state.scrap+=offer.cost;const mod=MODS.find(item=>item.id===offer.modId);if(!installMod(offer.modId,offer.gunIndex))return;state.scrap-=Math.max(0,offer.cost-mod.cost);}
  else if(offer.type==='health'){state.health=Math.min(state.maxHealth,state.health+2);toast('PATCHED UP · +2 VITALS');}
  else if(offer.type==='ammo'){for(const i of state.weaponSlots){state.reserveAmmo[i]=GUNS[i].reserve;}toast('AMMO RESTOCKED · ALL GUNS');}
  else {const item=throwableById(offer.throwableId);state.throwables[offer.throwableId]=item.stack;toast(`${item.name.toUpperCase()} RESTOCKED`);}
  offer.sold=true;hud();renderMerchant();
}
function selectedThrowable(){return THROWABLES[state.throwableIndex];}
function throwThrowable(){const item=selectedThrowable(),inventory=consumeThrowable(state.throwables,item.id);if(!inventory.consumed){toast(`OUT OF ${item.name.toUpperCase()}`,800);return;}const p=state.player,body=makeBody({x:p.x+state.aim.x*12,y:p.y+state.aim.y*12},3,false);body.enableCcd(true);body.setLinearDamping(0);body.setGravityScale(0,true);const speed=item.range/(item.fuse+.28);body.setLinvel({x:state.aim.x*speed,y:state.aim.y*speed},true);state.thrown.push({id:item.id,item,body,fuse:item.fuse,x:p.x,y:p.y});state.throwables=inventory.inventory;markAction();updateThrowableHud();toast(`${item.name.toUpperCase()} OUT`,700);}
function detonateThrowable(projectile){({frag:playExplosion,flash:playFlashbang,smoke:playSmoke,incendiary:playFire})[projectile.id]?.({distance:distance(projectile,state.player),pan:(projectile.x-state.player.x)/480});physics.removeRigidBody(projectile.body);const {item,id,x,y}=projectile;const effect={id,item,x,y,remaining:item.duration,elapsed:0,nextTick:0};state.effects.push(effect);view.fx.explode(id,x,y,item.radius);if(id==='frag')state.shake=Math.max(state.shake,6);else if(id==='flash')state.shake=Math.max(state.shake,2);if(id==='flash'&&distance({x,y},state.player)<item.radius&&!lineBlocked(x,y,state.player.x,state.player.y))state.flashTimer=.24;
  if(id==='frag'||id==='flash'){for(const enemy of state.enemies){if(!enemy.alive)continue;const d=distance({x,y},enemy),blocked=lineBlocked(x,y,enemy.x,enemy.y);if(!throwableAffectsTarget(id,{distance:d,blockedByWall:blocked}))continue;if(id==='flash'){enemy.stun=Math.max(enemy.stun,item.duration);enemy.aimTimer=0;}else{const dmg=item.damage*(1-d/item.radius*.48);enemy.hp-=dmg;view.fx.hitEnemy(enemy,dmg,enemy.x-x,enemy.y-y,enemy.hp<=0);const dx=enemy.x-x,dy=enemy.y-y,len=Math.hypot(dx,dy)||1;enemy.knock.x=dx/len*54;enemy.knock.y=dy/len*54;if(enemy.hp<=0)killEnemy(enemy,{vx:dx/len*600,vy:dy/len*600});}}if(id==='frag'&&distance({x,y},state.player)<item.radius&&!lineBlocked(x,y,state.player.x,state.player.y))hitPlayer(1,x,y);}
}
function updateThrown(dt){for(let i=state.thrown.length-1;i>=0;i--){const projectile=state.thrown[i];projectile.fuse-=dt;const p=projectile.body.translation();projectile.x=p.x;projectile.y=p.y;if(projectile.fuse<=0){detonateThrowable(projectile);state.thrown.splice(i,1);}}}
function updateEffects(dt){for(let i=state.effects.length-1;i>=0;i--){const effect=state.effects[i];effect.remaining-=dt;effect.elapsed+=dt;if(effect.id==='incendiary'&&effect.elapsed>=effect.nextTick){effect.nextTick=effect.elapsed+.48;for(const enemy of state.enemies){const d=distance(effect,enemy);if(enemy.alive&&isWithinThrowableRadius('incendiary',d)&&!lineBlocked(effect.x,effect.y,enemy.x,enemy.y)){enemy.hp-=effect.item.damage;enemy.stun=Math.max(enemy.stun,.12);view.fx.hitEnemy(enemy,effect.item.damage,0,-1,enemy.hp<=0);if(enemy.hp<=0)killEnemy(enemy,{vx:0,vy:0});}}}if(effect.remaining<=0){state.effects.splice(i,1);}}}
function updateThrowableHud(){const sel=selectedThrowable();$('throwable-readout').innerHTML=THROWABLES.map(item=>{const n=state.throwables[item.id]||0;return `<div class="chip-throw ${item.id===sel.id?'sel':''} ${n?'':'none'}" title="${item.name}">${strokeIcon(item.id,'ico')}<b>${n}</b></div>`;}).join('')+`<span class="throw-name">${sel.name.toUpperCase()}</span>`;$('throwable-hint').innerHTML=`${keycap(keyLabel(binding('throwableCycle')))} SELECT ${keycap(keyLabel(binding('throwableUse')))} THROW`;}
function toggleLoadout(force){state.loadoutOpen=force??!state.loadoutOpen;if(!state.loadoutOpen)closeLoadoutPreview();if(state.loadoutOpen)renderLoadout();$('loadout').classList.toggle('show',state.loadoutOpen);$('loadout').setAttribute('aria-hidden',String(!state.loadoutOpen));if(state.loadoutOpen)$('close-loadout').focus();else view.canvas.focus();}
function getTimeScale(){const base=timeScale({mode:state.mode,paused:state.paused||state.merchantOpen||state.cacheOpen||!!state.pendingGunPickup||!!state.runModal,loadoutOpen:state.loadoutOpen,moving:hasMovementInput(),idleScale:runStats().idleScale});if(base>0&&state.freezeT>0)return .06;if(base>=1&&(state.timeCredit>0||(state.health<=1&&freqStats(state.freq).lastStand>0)))return .5;const ih=interferenceStats(state.progress);if(ih.lowHealthIdle&&state.health<=2&&base>0&&base<ih.lowHealthIdle)return ih.lowHealthIdle;return base;}
function updatePlayer(dt){
  const p=state.player;if(!p)return;
  const {x:vx,y:vy}=movementFromKeys(input.keys,controls.bindings);if(vx!==0||vy!==0)markAction('move');
  const sprinting=input.keys.has('shift')&&(vx!==0||vy!==0);
  {// Movement: velocity eases toward the wish direction (snappy accel, short weighty coast), loadout weight trims speed/accel,
    // dynamics run on the real frame clock so slow-mo never makes the player float. Knockback (hits, recoil) rides on top.
    const gear=GEAR.find(item=>item.id===state.gear),mob=loadoutMobility(weaponLoadoutWeight(state.weaponSlots,GUNS)+(gear?.weight||0),state.carryCapacity);
    const topSpeed=runStats().moveSpeed*mob.speedMul*(sprinting?SPRINT_MULTIPLIER:1),rdt=state.stepHitstop?0:state.frameDt;
    const here=p.body.translation();
    if(state.lastPhysicsStep>0)state.playerVel=clipBlockedVelocity(state.playerVel,{x:here.x-p.x,y:here.y-p.y},{x:state.cmdVel.x*state.lastPhysicsStep,y:state.cmdVel.y*state.lastPhysicsStep},state.lastPhysicsStep);
    state.playerVel=stepVelocity(state.playerVel,{x:vx,y:vy},{topSpeed,accelMul:mob.accelMul,frictionMul:mob.frictionMul,sprint:sprinting},rdt);
    if(vx===0&&vy===0&&Math.hypot(state.playerVel.x,state.playerVel.y)<2)state.playerVel={x:0,y:0};
    state.playerKnock.x=approach(state.playerKnock.x,0,KNOCK_DECAY,rdt);state.playerKnock.y=approach(state.playerKnock.y,0,KNOCK_DECAY,rdt);
    const expectLen=Math.hypot(state.cmdVel.x,state.cmdVel.y)*state.lastPhysicsStep,movedLen=Math.hypot(here.x-p.x,here.y-p.y),blockedRatio=expectLen>.4?movedLen/expectLen:1;
    state.cornerStuck=blockedRatio<.35&&(vx!==0||vy!==0)?state.cornerStuck+1:0;if(state.cornerStuck>8){state.cornerSign=-(state.cornerSign||1);state.cornerStuck=0;}
    const nudge=cornerNudge({x:vx,y:vy},blockedRatio,topSpeed,state.cornerSign||1);
    state.cmdVel={x:state.playerVel.x+state.playerKnock.x+nudge.x,y:state.playerVel.y+state.playerKnock.y+nudge.y};p.body.setLinvel(state.cmdVel,true);
    state.sprintBlend=approach(state.sprintBlend,sprinting?1:0,12,rdt);state.recoil=stepRecoil(state.recoil,rdt);state.dryTimer=Math.max(0,state.dryTimer-rdt);
    stepBloom(state.bloom,dt,gunFeel(GUNS[state.weaponIndex]));
    p.x=here.x;p.y=here.y;
  }
  const aimPoint=view.screenToWorld(input.mouseX,input.mouseY);
  {const dx=aimPoint.x-p.x,dy=aimPoint.y-p.y,d=Math.hypot(dx,dy)||1;if(d>2){state.aim.x=dx/d;state.aim.y=dy/d;}}
  state.invuln=Math.max(0,state.invuln-dt);
  if(state.reloadTimer>0){state.reloadTimer-=dt;if(state.reloadTimer<=0){const gun=GUNS[state.weaponIndex],needed=magSize(gun)-state.weaponAmmo[state.weaponIndex],take=Math.min(needed,state.reserveAmmo[state.weaponIndex]);state.weaponAmmo[state.weaponIndex]+=take;state.reserveAmmo[state.weaponIndex]-=take;playReloadEnd();hud();emit('reloadEnd',p.x,p.y,{gun:gun.id,cancelled:false});}}
  if(input.firing&&!state.wasFiring)state.pressUntil=state.time+PRESS_BUFFER;state.wasFiring=input.firing;if(input.firing||state.time<state.pressUntil)playerShoot();updateWeaponBurst();if(input.interact){input.interact=false;interact();}
  for(const pickup of state.pickups){if(pickup.declined&&distance(p,pickup)>48)pickup.declined=false;if(state.pendingGunPickup)break;if(pickup.available&&distance(p,pickup)<19)collect(pickup);}
  {const blocked=state.loadoutOpen||state.merchantOpen||state.cacheOpen||!!state.pendingGunPickup||!!state.runModal,targets=blocked?[]:interactTargets();state.interact={targets,active:activeInteraction(targets),ambient:ambientPrompt(targets),key:keyLabel(binding('interact'))};}
  updateTutorHint(p);
  updateRoom();
}
const tutor={seen:(()=>{try{return loadSeen(localStorage);}catch{return new Set();}})(),shownAt:-99,current:null,still:0,wasMoving:false};
function updateTutorHint(p){
  const el=$('tutor-hint');if(!el)return;const dt=state.frameDt||1/60,moving=hasMovementInput();tutor.still=moving?0:tutor.still+dt;
  const clock=performance.now()/1000;
  if(tutor.current&&clock-tutor.shownAt>5){tutor.current=null;el.classList.remove('show');}
  if(tutor.current||clock-tutor.shownAt<2.5)return;
  const gi=state.weaponIndex,gun=GUNS[gi],others=state.weaponSlots.filter(i=>i!==gi);
  const ctx={blocked:state.loadoutOpen||state.merchantOpen||state.cacheOpen||!!state.pendingGunPickup||!!state.runModal||state.paused||state.mode!=='play',seen:tutor.seen,runTime:state.elapsed,moving,stillFor:tutor.still,magEmpty:state.weaponAmmo[gi]<=0&&state.reloadTimer<=0,reserve:state.reserveAmmo[gi],otherHasAmmo:others.some(i=>state.weaponAmmo[i]>0||state.reserveAmmo[i]>0),hostilesNear:state.enemies.filter(e=>e.alive&&distance(p,e)<360).length,grenades:Object.values(state.throwables).reduce((a,b)=>a+b,0),hasMod:true,scrap:state.scrap};
  const keys={reload:keyLabel(binding('reload')),throwableCycle:keyLabel(binding('throwableCycle')),throwableUse:keyLabel(binding('throwableUse')),loadout:'TAB'};
  const hint=pickHint(ctx,keys);if(!hint)return;
  tutor.current=hint;tutor.shownAt=clock;tutor.seen.add(hint.id);try{saveSeen(localStorage,tutor.seen);}catch{}
  el.textContent=hint.text;el.classList.add('show');
}
function lineBlocked(x1,y1,x2,y2){const start={x:x1,y:y1},end={x:x2,y:y2},length=Math.hypot(x2-x1,y2-y1),steps=Math.ceil(length/8);for(let i=1;i<steps;i++){const t=i/steps,tx=Math.floor((x1+(x2-x1)*t)/TILE),ty=Math.floor((y1+(y2-y1)*t)/TILE);if(state.solidMap[ty]?.[tx]!==0)return true;}return state.crates.some(crate=>segmentIntersectsCircle(start,end,crate,17))||state.cover.some(cover=>!cover.crate&&segmentIntersectsCircle(start,end,cover,cover.radius));}
function smokeBlocksLine(x1,y1,x2,y2){return state.effects.some(effect=>effect.id==='smoke'&&effect.remaining>0&&segmentIntersectsCircle({x:x1,y:y1},{x:x2,y:y2},effect,effect.item.radius));}
// Enemy navigation grid. Rebuilt when the level changes; crates and pillars are dynamic blockers.
function enemyNav(){
  if(!state.nav||state.navSolid!==state.solidMap){state.nav=createNav(state.tileMap,state.solidMap);state.navSolid=state.solidMap;state.navCrates=null;state.navCrateCount=-1;}
  if(state.navCrates!==state.crates||state.navCrateCount!==state.crates.length){
    state.navCrates=state.crates;state.navCrateCount=state.crates.length;
    state.nav.setBlockers(state.cover.map(cover=>({x:cover.x,y:cover.y,r:cover.crate?25:cover.radius+10})));
  }
  return state.nav;
}
// The brain's world view is reused between frames (objects and arrays mutated in place) instead of rebuilt every tick.
const enemyWorld={nav:null,player:{x:0,y:0,vx:0,vy:0,radius:8},los:(ax,ay,bx,by)=>!lineBlocked(ax,ay,bx,by),enemies:null,smoke:[],projectiles:[],noises:null,
  fireAllowed:e=>{const k=e.def.longSight?1.7:1;return withinWorldView(e,state.player,CAMERA_HALF_HEIGHT*innerWidth/innerHeight*k,CAMERA_HALF_HEIGHT*k);}};
function updateEnemies(dt){
  const player=state.player,nav=enemyNav(),pv=player.body.linvel(),world=enemyWorld;
  world.nav=nav;world.enemies=state.enemies;world.noises=state.noises;world.coverBudget=2;
  const wp=world.player;wp.x=player.x;wp.y=player.y;wp.vx=pv.x;wp.vy=pv.y;
  world.smoke.length=0;for(const effect of state.effects)if(effect.id==='smoke'&&effect.remaining>0)world.smoke.push({x:effect.x,y:effect.y,radius:effect.item.radius});
  world.projectiles.length=0;for(const b of state.bullets)if(b.owner==='player')world.projectiles.push(b);
  for(const e of state.enemies){if(!e.alive)continue;if(e.type==='boss'){updateBossEnemy(bossApi,e,dt);continue;}const dx=player.x-e.x,dy=player.y-e.y,d=Math.hypot(dx,dy)||1,nx=dx/d,ny=dy/d;e.stun=Math.max(0,e.stun-dt);if(e.reloadTimer>0){e.reloadTimer=Math.max(0,e.reloadTimer-dt);if(e.reloadTimer===0)e.ammo=e.mag;}
    const out=stepEnemyBrain(e,world,dt,random),canSee=out.sees;
    e.intent=out.intent;e.face={x:out.aimX,y:out.aimY};e.aware=out.aware;e.role=out.role;e.navGoal=out.goal;
    if(out.aiming&&!e.wasAiming)playEnemyTell();e.wasAiming=out.aiming;
    if(out.locked&&!e.locked&&e.type==='sniper')playSniperLock({distance:d,pan:(e.x-player.x)/480});e.locked=!!out.locked;
    if(e.def.shield){if(!e.shieldInit){e.shieldInit=true;e.shieldAng=Math.atan2(ny,nx);}e.shieldAng=turnShield(e.shieldAng,Math.atan2(out.aimY,out.aimX),dt,1.5);e.shieldFacing={x:Math.cos(e.shieldAng),y:Math.sin(e.shieldAng)};e.shieldFlash=Math.max(0,e.shieldFlash-(state.frameDt||dt));}
    if(e.type==='brute'){
      if(e.stun>0){e.meleeWindup=0;}
      else{
        const evasive=['dodge','retreat','cover'].includes(e.intent);
        const attack=stepBruteMelee({windup:e.meleeWindup,cooldown:e.meleeCooldown},dt,d<e.def.range&&canSee&&!evasive,evasive);
        e.meleeWindup=attack.windup;e.meleeCooldown=attack.cooldown;
        if(attack.started)playBruteWindup({distance:d,pan:(e.x-state.player.x)/480}),e.aim={x:nx,y:ny};
        if(attack.strike&&bruteMeleeHits({canSee,distance:d,range:e.def.range,targetRadius:10,aim:e.aim,targetDirection:{x:nx,y:ny}})){state.lastHitType=e.type;hitPlayer(e.def.damage,e.x,e.y);}
      }
      if(out.aiming&&e.meleeWindup<=0)e.aim={x:out.aimX,y:out.aimY};
    }else{
      // The brain owns the telegraph: out.windup is the scaled seconds left before the shot and the aim is locked for all of it.
      e.aimTimer=out.windup;
      if(out.aiming)e.aim={x:out.aimX,y:out.aimY};
      if(out.fire){enemyShoot(e,out.aimX,out.aimY);e.ammo--;if(e.ammo<=0){e.reloadTimer=e.def.brain==='guard'?2.05:e.type==='sniper'?2.8:1.55;playReload();}}
    }
    let vx=out.moveX*e.def.speed,vy=out.moveY*e.def.speed;
    if(e.stun>0||e.meleeWindup>0){vx=0;vy=0;}
    e.body.setLinvel({x:vx+e.knock.x,y:vy+e.knock.y},true);e.knock.x=approach(e.knock.x,0,ENEMY_KNOCK_DECAY,dt);e.knock.y=approach(e.knock.y,0,ENEMY_KNOCK_DECAY,dt);
    const pos=e.body.translation();e.x=pos.x;e.y=pos.y;
    if((e.type==='chaser'||e.def.shield)&&canSee&&d<e.def.range&&random()<dt*1.2){state.lastHitType=e.type;hitPlayer(e.def.damage,e.x,e.y);}
  }
  state.noises.length=0;
}
function updateBullets(dt){
  for(let i=state.bullets.length-1;i>=0;i--){const b=state.bullets[i],previous=b.ox!==undefined?{x:b.ox,y:b.oy}:{x:b.x,y:b.y};b.ox=undefined;b.life-=dt;if(b.life<=0){removeBullet(i);continue;}if(!state.stepHitstop){if(b.homing)steerBullet(b,dt);const k=b.owner==='enemy'?bubbleFactor(b):1;b.x+=b.vx*dt*k;b.y+=b.vy*dt*k;}
    const impacts=[];
    if(b.owner==='player')for(const enemy of state.enemies){if(!enemy.alive||b.hitEnemies.has(enemy))continue;const t=segmentCircleHitTime(previous,b,enemy,enemy.def.hitRadius||(enemy.type==='brute'?13:11));if(t!==null){const blocked=enemy.def.shield&&shieldBlocks({facing:enemy.shieldFacing,halfArc:enemy.def.shieldHalfArc,bulletVx:b.vx,bulletVy:b.vy,stun:enemy.stun});impacts.push({t,kind:blocked?'shield':'enemy',target:enemy});}}
    for(const crate of state.crates){if(b.hitCrates.has(crate))continue;const t=segmentCircleHitTime(previous,b,crate,17);if(t!==null)impacts.push({t,kind:'crate',target:crate});}
    for(const cover of state.cover){if(cover.crate)continue;const t=segmentCircleHitTime(previous,b,cover,cover.radius+2);if(t!==null)impacts.push({t,kind:'cover',target:cover});}
    if(b.owner==='enemy'&&state.player){const t=segmentCircleHitTime(previous,b,state.player,10);if(t!==null)impacts.push({t,kind:'player',target:state.player});}
    const wallState=segmentWallRuns(previous,b,state.solidMap,TILE,b.insideWall);b.insideWall=wallState.endsInsideWall;
    for(const wall of wallState.runs)impacts.push({...wall,kind:'wall'});
    const resolution=resolveProjectileImpacts(impacts,b.penetration);
    b.penetration=resolution.penetration;
    let removed=resolution.stopped;{const tail=resolution.impacts.at(-1);if(removed&&tail&&Number.isFinite(tail.t)){b.x=previous.x+(b.x-previous.x)*tail.t;b.y=previous.y+(b.y-previous.y)*tail.t;}}
    for(const impact of resolution.impacts){
      if(impact.kind==='enemy'){
        const enemy=impact.target;b.hitEnemies.add(enemy);const dealt=playerHitDamage(b,enemy);enemy.hp-=dealt;enemy.stun=Math.max(enemy.stun||0,.1+playerStunBonus(enemy));afterPlayerHit(b,enemy,dealt);const len=Math.hypot(b.vx,b.vy)||1,kn=enemyKnockback(b.damage,enemy.type);enemy.knock.x=b.vx/len*kn;enemy.knock.y=b.vy/len*kn;view.fx.hitEnemy(enemy,b.damage,b.vx,b.vy,enemy.hp<=0);if(enemy.hp>0){state.hitstop=Math.max(state.hitstop,hitstopFor({damage:b.damage}));emit('hit',b.x,b.y,{dx:b.vx/len,dy:b.vy/len,damage:b.damage,target:'enemy',kill:false});}else emit('hit',b.x,b.y,{dx:b.vx/len,dy:b.vy/len,damage:b.damage,target:'enemy',kill:true});
        if(enemy.hp<=0)killEnemy(enemy,b);else{playHit();}
      }else if(impact.kind==='crate'){
        const crate=impact.target;b.hitCrates.add(crate);crate.hp=damageDurability(crate.hp,b.damage);emit('hit',b.x,b.y,{dx:b.vx/(Math.hypot(b.vx,b.vy)||1),dy:b.vy/(Math.hypot(b.vx,b.vy)||1),damage:b.damage,target:'crate',kill:crate.hp===0});updateCrateDamageVisual(crate);if(crate.hp>0)view.fx.hitCrate(crate,b.vx,b.vy);if(crate.hp===0)breakCrate(crate);
      }else if(impact.kind==='player'){
        {const shooter=b.enemyId!=null?state.enemies.find(en=>en.id===b.enemyId):null,pl=state.player;state.lastHitType=shooter?.type||null;hitPlayer(b.damage,b.x,b.y,shooter&&pl?Math.atan2(shooter.y-pl.y,shooter.x-pl.x):Math.atan2(-b.vy,-b.vx));}
      }else if(impact.kind==='shield'){
        const enemy=impact.target;enemy.shieldFlash=.28;burst(b.x,b.y,0xbfd4e4,4,.7);playShieldBlock({distance:distance(b,state.player),pan:(b.x-state.player.x)/480});emit('impact',b.x,b.y,{surface:'cover',owner:b.owner,vx:b.vx,vy:b.vy});view.fx.spark(b.x,b.y,Math.atan2(-b.vy,-b.vx),6,1.1);
      }else if(impact.kind==='cover'){
        burst(b.x,b.y,b.owner==='player'?0xf0c986:0xfa7068,3,.5);emit('impact',b.x,b.y,{surface:'cover',owner:b.owner,vx:b.vx,vy:b.vy});
      }
    }
    if(b.owner==='enemy'&&!b.missed&&state.player&&!removed){const pn=segmentCircleHitTime(previous,b,state.player,28);if(pn!==null){b.missed=true;playNearMiss({distance:distance(b,state.player),pan:(b.x-state.player.x)/480});state.shake=Math.max(state.shake,.9);}}
    if(removed&&resolution.impacts.at(-1)?.kind!=='cover'&&resolution.impacts.at(-1)?.kind!=='player'&&resolution.impacts.at(-1)?.kind!=='shield'){
      playWallImpact({distance:distance(b,state.player),pan:(b.x-state.player.x)/480});burst(b.x,b.y,b.owner==='player'?0xf0c986:0xfa7068,3,.5);const last=resolution.impacts.at(-1);emit('impact',b.x,b.y,{surface:last?.kind||'wall',owner:b.owner,vx:b.vx,vy:b.vy});}
    if(removed&&b.owner==='player'&&(b.bounces||0)<(b.maxBounces||0)&&resolution.impacts.at(-1)?.kind==='wall'&&ricochetBullet(b,previous))removed=false;
    if(removed){removeBullet(i);continue;}
  }
}
function removeBullet(i){const b=state.bullets[i];if(b.body)physics.removeRigidBody(b.body);state.bullets.splice(i,1);}
function updateCorpses(dt){for(let i=state.enemies.length-1;i>=0;i--){const e=state.enemies[i];if(e.alive||!e.corpseTimer)continue;e.corpseTimer-=dt;const p=e.body.translation();e.x=p.x;e.y=p.y;if(e.corpseTimer<=0){if(e.type!=='boss')view.fx.decals.push({kind:'corpse',type:e.elite?'elite':e.type,x:e.x,y:e.y,a:(e.vis?.ang||0)+(e.vis?.spin||0)*.3,seed:Math.floor(e.id*1e6)});physics.removeRigidBody(e.body);state.enemies.splice(i,1);}}}
function syncPauseScreen(){const show=state.mode==='play'&&state.paused;setPauseScreen(show,show?{'pause-room':state.rooms[state.currentRoom]?.name||'ENTRY','pause-time':formatClock(state.realElapsed),'pause-kills':String(state.kills),'pause-seed':String(state.seed)}:{});}
function update(dt){
  syncPauseScreen();state.flashTimer=Math.max(0,state.flashTimer-dt);$('flash-overlay').style.opacity=String(flashOverlayOpacity(state.flashTimer,visualSettings.flash));
  if(state.mode!=='play'||state.paused||state.loadoutOpen||state.merchantOpen||state.cacheOpen||state.pendingGunPickup||state.runModal)return;
  trackRunClock(dt);state.timeScaleTarget=getTimeScale();const scale=state.timeScaleSmoothed=easeTimeScale(state.timeScaleSmoothed,state.timeScaleTarget,dt);setTimeScaleAudio(scale);if(scale>0&&state.mode==='play'&&(scale<.6)!==!!state.audioSlow){state.audioSlow=scale<.6;(state.audioSlow?playSlowmoEnter:playSlowmoExit)();}const step=dt*scale;state.frameDt=dt;state.lastStep=step;
  state.stepHitstop=state.hitstop>0;state.lastPhysicsStep=0;if(state.hitstop>0){state.hitstop-=dt;if(state.hitstop<=0){physics.timestep=Math.min(step,1/30);physics.step();state.lastPhysicsStep=physics.timestep;}}else{physics.timestep=Math.min(step,1/30);physics.step();state.lastPhysicsStep=physics.timestep;}
  state.time+=step;state.elapsed+=step;state.realElapsed+=dt;updatePlayer(step);updateSurvival(dt);updateEnemies(step);updateBullets(step);updateCrateVisuals(step);updateThrown(step);updateEffects(step);updateCorpses(step);view.update(step);state.shake=Math.max(0,state.shake-dt*14);state.toastTimer=Math.max(0,state.toastTimer-dt*1000);if(state.toastTimer<=0){$('toast').classList.remove('show');if(state.roomToast){state.roomToast='';hud();}}
  const moving=hasMovementInput(),firing=input.firing||!!state.weaponBurst;
  const sprinting=moving&&input.keys.has('shift'),tv=tempoView({moving,firing,sprinting,scale}),tempoEl=$('tempo');
  if(tempoEl.dataset.state!==tv.state){tempoEl.dataset.state=tv.state;state.tempoChangedAt=state.elapsedReal=performance.now();tempoEl.classList.remove('idle');}else if(tempoEl.dataset.state&&performance.now()-(state.tempoChangedAt||0)>3500)tempoEl.classList.add('idle');tempoEl.classList.toggle('firing',firing);tempoEl.style.setProperty('--fill',tv.fraction.toFixed(3));
  $('tempo-label').textContent=tv.label;$('tempo-speed').textContent=tv.speed;$('tempo-fill').style.width=`${tv.percent}%`;$('tempo-hint').textContent=tv.hint;
  drawMinimap();syncHudFrame();
}
function makeMinimap(){const c=$('minimap'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);mm.key='';mm.lookup=null;}
function drawLootScannerPings(ctx,sx,sy,player){
  const scanRange=GEAR.find(item=>item.id===state.gear)?.pickupScanRange||0;
  if(!player||!scanRange)return;
  for(const pickup of state.pickups){
    if(!pickup.available||pickup.kind==='exit')continue;
    const room=state.rooms.find(candidate=>pickup.x>=candidate.x1*TILE&&pickup.x<=(candidate.x2+1)*TILE&&pickup.y>=candidate.y1*TILE&&pickup.y<=(candidate.y2+1)*TILE);
    if(!minimapPickupVisible({available:pickup.available,distance:distance(player,pickup),scanRange,hiddenSecret:!!room?.secret&&!room.visited}))continue;
    ctx.fillStyle=MINIMAP_LOOT_COLORS[pickup.kind]||'#d4d0da';ctx.fillRect(pickup.x/TILE*sx-1,pickup.y/TILE*sy-1,2,2);
  }
}
// The minimap's room layer only changes when a room becomes visited or scanner-visible, so it is drawn once into an
// offscreen canvas and re-rendered when that visibility key changes. Enemy room lookups use a tile -> room table.
const mm={c:null,ctx:null,layer:null,key:'',tileMap:null,lookup:null,vis:[]};
function minimapLookup(){
  if(mm.tileMap===state.tileMap&&mm.lookup)return mm.lookup;
  const w=state.mapW,h=state.mapH,t=new Int16Array(w*h).fill(-1);
  for(let i=state.rooms.length-1;i>=0;i--){const r=state.rooms[i];for(let y=Math.max(0,r.y1);y<=Math.min(h-1,r.y2);y++)for(let x=Math.max(0,r.x1);x<=Math.min(w-1,r.x2);x++)t[y*w+x]=i;}
  mm.tileMap=state.tileMap;mm.lookup=t;mm.key='';return t;
}
function drawMinimap(){
  const c=mm.c||(mm.c=$('minimap')),ctx=mm.ctx||(mm.ctx=c.getContext('2d')),sx=c.width/state.mapW,sy=c.height/state.mapH;
  const scanRange=runStats().scannerRange,player=state.player,lookup=minimapLookup(),rooms=state.rooms,vis=mm.vis;
  let key=`${state.mapW}x${state.mapH}:`;
  for(let i=0;i<rooms.length;i++){const r=rooms[i];const roomDistance=player?distanceToRect(player,{left:r.x1*TILE,top:r.y1*TILE,right:(r.x2+1)*TILE,bottom:(r.y2+1)*TILE}):Infinity;
    vis[i]=minimapContactVisible({visited:r.visited,distance:roomDistance,scanRange,secret:r.secret});key+=vis[i]?(r.visited?'2':'1'):'0';}
  if(key!==mm.key){
    mm.key=key;
    const lc=mm.layer||(mm.layer=document.createElement('canvas'));if(lc.width!==c.width||lc.height!==c.height){lc.width=c.width;lc.height=c.height;}
    const lg=lc.getContext('2d');lg.fillStyle='#171420';lg.fillRect(0,0,lc.width,lc.height);
    for(let i=0;i<rooms.length;i++){if(!vis[i])continue;const r=rooms[i];lg.fillStyle=r.visited?'#45404e':'#34303a';for(let y=r.y1;y<=r.y2;y++)for(let x=r.x1;x<=r.x2;x++)if(state.tileMap[y]?.[x]===0)lg.fillRect(x*sx, y*sy, sx+.2, sy+.2);}
  }
  ctx.drawImage(mm.layer,0,0);
  ctx.fillStyle='#ed5a68';for(const e of state.enemies){if(!e.alive)continue;const ex=e.x/TILE,ey=e.y/TILE,spawnRoom=rooms[e.roomIndex],tx=Math.floor(ex),ty=Math.floor(ey),ri=tx>=0&&ty>=0&&tx<state.mapW&&ty<state.mapH?lookup[ty*state.mapW+tx]:-1,room=ri>=0?rooms[ri]:undefined,enemyDistance=player?distance(player,e):Infinity;if(minimapContactVisible({visited:!!room?.visited,distance:enemyDistance,scanRange,secret:spawnRoom?.secret&&!spawnRoom.visited}))ctx.fillRect(ex*sx-1,ey*sy-1,3,3);}
  {const seen=r=>r&&vis[rooms.indexOf(r)];let anySeen=false;for(let i=0;i<vis.length;i++)if(vis[i]){anySeen=true;break;}
    const mark=(id,x,y,color)=>{ctx.fillStyle='rgba(23,20,32,.85)';ctx.beginPath();ctx.arc(x,y,6.5,0,TAU);ctx.fill();drawIcon(ctx,id,x,y,10,color);};
    for(const r of rooms){if(!seen(r))continue;const x=(r.cx+.5)*sx,y=(r.cy+.5)*sy;if(r.role==='merchant')mark('station-merchant',x,y,'#ffd27a');else if(r.role==='clinic')mark('pickup-heal',x,y,'#74dfab');}
    if(rooms[0]&&state.workbench)mark('station-workbench',state.workbench.x/TILE*sx,state.workbench.y/TILE*sy,'#8fe0ff');
    for(const p of state.pickups){if(!p.available)continue;if(p.kind==='cache'&&!p.claimed){const r=rooms[p.roomIndex];if(r&&seen(r)&&!(r.secret&&!r.visited))mark('station-cache',p.x/TILE*sx,p.y/TILE*sy,'#f4c66d');}}
    for(const g of state.lockedDoors)if(!g.opened&&anySeen)mark('lock-locked',(g.x+.5)*sx,(g.y+.5)*sy,'#ffb04a');
    for(const p of state.pickups)if(p.available&&p.kind==='exit'){const ready=!hasUnclearedRouteEnemies(rooms,state.enemies);mark('exit-extraction',p.x/TILE*sx,p.y/TILE*sy,ready?'#6dffb0':'#ff6a78');}}
  drawLootScannerPings(ctx,sx,sy,player);
  if(state.player){ctx.fillStyle='#70e5b2';ctx.beginPath();ctx.arc(state.player.x/TILE*sx,state.player.y/TILE*sy,3,0,TAU);ctx.fill();}
}
function newRun(opts={}){
  input.keys.clear();input.firing=false;input.interact=false;state.daily=!!opts.daily;state.freq={};state.runModal=null;$('run-modal').hidden=true;$('boss-bar').hidden=true;const chosenSeed=state.daily?dailySeed():parseRunSeed($('seed-input').value);state.seed=chosenSeed??(1+Math.floor(Math.random()*MAX_RUN_SEED));state.floor=1;state.floorCfg=floorConfig(1);ROT.RNG.setSeed(floorSeed(state.seed,1));$('seed-display').textContent=state.daily?`${state.seed} · DAILY`:String(state.seed);Object.assign(state,{floorsCleared:0,runRooms:0,floor1Seconds:0,stillRoomClears:0,slowTriples:0,slowKills:0,tripleFlag:false,noHitFloors:0,floorHit:false,roomMove:0,lastPos:null,bossKilled:false,bossPistol:false,lastHitType:null,timeCredit:0,freezeT:0,loopStacks:0,loopT:0,stillFor:0,outcome:null,boss:null,doorMarkers:[],freqOffers:[],freqThen:null});
  state.cacheOpen=false;state.cachePickup=null;$('cache-panel').hidden=true;$('cache-panel').setAttribute('aria-hidden','true');state.mode='play';state.paused=false;state.merchantOpen=false;state.merchantRoom=null;state.pendingGunPickup=null;$('weapon-pickup').hidden=true;$('weapon-pickup').setAttribute('aria-hidden','true');state.running=true;state.paidOut=false;state.elapsed=0;state.realElapsed=0;state.calmTimer=0;state.notify={};state.lastMagWarn={};state.extractionOpen=false;state.objTimer=0;state.time=0;state.kills=0;state.scrap=runStats().startScrap;state.maxHealth=runStats().maxHealth;state.health=state.maxHealth;state.armor=0;state.maxArmor=0;state.gear=null;state.weaponSlots=(kitById(state.progress.kit)||kitById('standard')).guns.map(id=>GUNS.findIndex(gun=>gun.id===id));state.activeSlot=0;state.carryCapacity=runStats().carryCapacity;state.weaponAmmo=GUNS.map(g=>g.mag);state.reserveAmmo=GUNS.map(g=>g.reserve);state.attachments=new Map(GUNS.map(gun=>[gun.id,new Map()]));state.throwables=kitThrowables(state.progress,state.progress.kit);state.throwableIndex=Math.max(0,THROWABLES.findIndex(item=>state.throwables[item.id]>0));state.shotgunShellId='buckshot';state.lastAction=0;state.lastActionKind='other';state.fireCooldown=0;state.weaponBurst=null;state.reloadTimer=0;state.invuln=0;state.shake=0;state.roomsCleared=0;state.roomToast='';$('merchant-panel').hidden=true;$('merchant-panel').setAttribute('aria-hidden','true');$('run-result').hidden=true;$('start-button').textContent='ENTER THE SECTOR ↗';$('meta-panel').hidden=true;$('overlay').classList.remove('show');toggleLoadout(false);$('vignette').style.background='';makeLevel();updateThrowableHud();toast('SHIFT + MOVE TO SPRINT · STOP TO SLOW',3200);setTimeout(()=>{const r=state.rooms[state.currentRoom];if(r&&state.mode==='play')roomBanner(r.name,state.enemies.filter(e=>e.alive&&e.roomIndex===state.currentRoom).length);},400);}
function resize(){view?.resize();}
function render(dt=1/60){
  if(!view)return;
  const p=state.player,gun=GUNS[state.weaponIndex];
  const events=state.events.splice(0);
  view.consume(events);
  view.render({dt,timeScale:state.timeScaleSmoothed,idleScale:runStats().idleScale,shake:scaledCameraShake(state.shake,visualSettings.shake),mouseX:input.mouseX,mouseY:input.mouseY,reloadFrac:state.reloadTimer>0&&state.reloadTotal>0?clamp(1-state.reloadTimer/state.reloadTotal,0,1):0,exitReady:!hasUnclearedRouteEnemies(state.rooms,state.enemies),bloom:state.bloom?.value||0,gun});
  void p;
}
function renderGameToText(){
  const gear=GEAR.find(item=>item.id===state.gear),room=state.rooms[state.currentRoom];
  const enemies=state.enemies.filter(enemy=>enemy.alive).map(enemy=>({id:enemy.id,type:enemy.def.name,roomIndex:enemy.roomIndex,x:Math.round(enemy.x),y:Math.round(enemy.y),health:Math.round(enemy.hp),aiming:enemy.aimTimer>0||enemy.meleeWindup>0,charging:enemy.meleeWindup>0,telegraphVisible:enemy.meleeWindup>0,reloading:enemy.reloadTimer>0,tactic:enemy.intent}));
  const roomEnemyCounts=Array(state.rooms.length).fill(0);
  for(const enemy of enemies)if(Number.isInteger(enemy.roomIndex)&&roomEnemyCounts[enemy.roomIndex]!==undefined)roomEnemyCounts[enemy.roomIndex]++;
  const pickups=state.pickups.filter(pickup=>pickup.available).map(pickup=>({type:pickup.kind,x:Math.round(pickup.x),y:Math.round(pickup.y),roomIndex:pickup.roomIndex,gun:pickup.kind==='gun'?GUNS[pickup.gunIndex].name:undefined,rarity:pickup.rarity||undefined}));
  return JSON.stringify({
    mode:state.mode,paused:state.paused,seed:state.seed,coordinateSystem:'world origin at top-left; +x right, +y down',
    player:state.player?{x:+state.player.x.toFixed(1),y:+state.player.y.toFixed(1),health:state.health,maxHealth:state.maxHealth,armor:state.armor,maxArmor:state.maxArmor,weapon:GUNS[state.weaponIndex].name,ammo:state.weaponAmmo[state.weaponIndex],reserve:state.reserveAmmo[state.weaponIndex],reloading:state.reloadTimer>0,shell:GUNS[state.weaponIndex].id==='shotgun'?shellForRun().id:undefined}:null,
    loadout:{slots:state.weaponSlots.map(index=>GUNS[index].name),ammunition:state.weaponSlots.map(index=>({weapon:GUNS[index].name,magazine:state.weaponAmmo[index],reserve:state.reserveAmmo[index]})),activeSlot:state.activeSlot,gear:gear?.name||null,weight:weaponLoadoutWeight(state.weaponSlots,GUNS)+(gear?.weight||0),capacity:state.carryCapacity,attachments:[...attachmentsFor(GUNS[state.weaponIndex]).keys()],attachmentTiers:Object.fromEntries(attachmentsFor(GUNS[state.weaponIndex]))},
    room:room?.name,roomIndex:state.currentRoom,roomRole:room?.role,
    roomProgress:state.rooms.map((entry,index)=>({index,name:entry.name,role:entry.role,visited:!!entry.visited,cleared:!!entry.cleared,livingEnemies:roomEnemyCounts[index]})),
    lockedDoors:state.lockedDoors.map(door=>({opened:door.opened,cost:door.cost,room:state.rooms[door.roomIndex]?.name,x:(door.x+.5)*TILE,y:(door.y+.5)*TILE,cells:door.cells.length,tiles:door.cells.map(cell=>({x:cell.x,y:cell.y}))})),
    merchant:room?.role==='merchant',merchantOpen:state.merchantOpen,cacheOpen:state.cacheOpen,
    weaponPickup:state.pendingGunPickup?{gun:GUNS[state.pendingGunPickup.gunIndex].name,availableSlots:weaponTargets().map(slot=>weaponReplacement(state.weaponSlots,slot,state.pendingGunPickup.gunIndex,GUNS,state.carryCapacity,gear?.weight||0).canCarry)}:null,
    enemyCount:enemies.length,enemies,
    bullets:state.bullets.map(bullet=>({owner:bullet.owner,enemyId:bullet.enemyId,x:bullet.x,y:bullet.y,vx:bullet.vx,vy:bullet.vy})),
    crates:state.crates.map(crate=>({x:Math.round(crate.x),y:Math.round(crate.y),health:crate.hp,radius:17})),
    cover:state.cover.filter(cover=>!cover.crate).map(({x,y,radius,kind})=>({x:Math.round(x),y:Math.round(y),radius,kind})),
    pickupCount:pickups.length,pickups,
    throwables:{selected:selectedThrowable().id,counts:state.throwables,projectiles:state.thrown.length,effects:state.effects.map(effect=>effect.id)},
    burstShotsRemaining:state.weaponBurst?.shotsRemaining||0,
    floor:state.floor,runModal:state.runModal,freq:state.freq,doorMarkers:state.doorMarkers.map(m=>({reward:m.reward,x:Math.round(m.x*TILE),y:Math.round(m.y*TILE)})),boss:state.boss?{hp:Math.round(state.boss.hp),max:state.boss.maxHp,phase:state.boss.boss?.phase,mode:state.boss.boss?.mode,alive:state.boss.alive}:null,floorsCleared:state.floorsCleared,runRooms:state.runRooms,
    kills:state.kills,scrap:state.scrap,coins:state.progress.coins,roomsCleared:state.roomsCleared,rooms:state.rooms.length,timeScale:getTimeScale().toFixed(2),timeScaleSmoothed:+state.timeScaleSmoothed.toFixed(3),bloom:+state.bloom.value.toFixed(3),recoil:+state.recoil.amount.toFixed(3),sprintBlend:+state.sprintBlend.toFixed(2),playerVelocity:{x:+state.playerVel.x.toFixed(1),y:+state.playerVel.y.toFixed(1)},pendingEvents:state.events.length,elapsed:Math.floor(state.elapsed),
  });
}
window.render_game_to_text=renderGameToText;
window.advanceTime=(ms)=>{const frames=Math.max(1,Math.ceil(ms/16.667));for(let i=0;i<frames;i++){update(1/60);if(i<frames-1)view?.consume(state.events.splice(0));}render(frames/60);};

function setupControls(){
  const volume=loadAudioSettings(localStorage);$('master-volume').value=String(Math.round(volume*100));$('master-volume-value').textContent=`${Math.round(volume*100)}%`;
  const syncMuteButton=()=>{const muted=isAudioMuted(),button=$('mute-audio');button.textContent=muted?'UNMUTE':'MUTE';button.setAttribute('aria-pressed',String(muted));};syncMuteButton();
  visualSettings=loadVisualSettings(localStorage);
  for(const [id,key] of [['shake-strength','shake'],['flash-strength','flash']]){
    const slider=$(id),output=$(`${id}-value`);slider.value=String(Math.round(visualSettings[key]*100));output.textContent=`${slider.value}%`;
    slider.addEventListener('input',event=>{visualSettings={...visualSettings,[key]:Number(event.currentTarget.value)/100};output.textContent=`${event.currentTarget.value}%`;try{saveVisualSettings(localStorage,visualSettings);}catch{toast('VISUAL SETTING CHANGED FOR THIS SESSION ONLY');}});
  }
  controls.bindings=loadKeyBindings(localStorage);renderKeyBindings();renderKeyGuide();updateThrowableHud();
  $('key-bindings').addEventListener('click',event=>{const button=event.target.closest('[data-bind-action]');if(!button)return;controls.waitingFor=button.dataset.bindAction;$('binding-status').textContent=`Press a key for ${KEY_BINDING_ACTIONS.find(action=>action.id===controls.waitingFor)?.label.toLowerCase()}. Escape cancels.`;renderKeyBindings(controls.waitingFor);});
  addEventListener('keydown',e=>{const key=normalizeKey(e.key);if(controls.waitingFor||key==='space'||key.startsWith('arrow')||Object.values(controls.bindings).includes(key))e.preventDefault();
    if(controls.waitingFor){
      if(key==='escape'){controls.waitingFor=null;$('binding-status').textContent='Binding cancelled.';renderKeyBindings();return;}
      const action=controls.waitingFor,result=rebindKey(controls.bindings,action,key);
      if(!result.ok){$('binding-status').textContent=result.reason==='in-use'?'That key is already assigned. Choose another key or press Escape.':'Use one letter, number, arrow, or Space. Shift is reserved for sprint.';return;}
      controls.bindings=result.bindings;controls.waitingFor=null;renderKeyBindings(action);renderKeyGuide();updateThrowableHud();
      try{saveKeyBindings(localStorage,controls.bindings);$('binding-status').textContent='Controls saved.';}catch{$('binding-status').textContent='Changed for this session only.';toast('CONTROL CHANGED FOR THIS SESSION ONLY');}
      return;
    }
    input.keys.add(resolveMovementKey(key,controls.bindings));
    if(e.repeat)return;
    if(state.runModal){runModalKey(e,key);return;}
    if(state.pendingLoadoutChange){
      if(key==='escape')closeLoadoutPreview();
      else if(key==='tab')trapDialogTab(e,$('loadout-confirm'),document.activeElement);
      return;
    }
    if(!$('meta-panel').hidden){
      if(key==='escape'){$('meta-panel').hidden=true;$('meta-button').focus();}
      else if(key==='tab')trapDialogTab(e,$('meta-panel'),document.activeElement);
      return;
    }
    if(state.loadoutOpen&&key==='tab'){trapDialogTab(e,$('loadout'),document.activeElement);return;}
    if(state.pendingGunPickup){if(key==='tab')trapDialogTab(e,$('weapon-pickup'),document.activeElement);else if(key===binding('weaponOne'))acceptWeaponPickup(0);else if(key===binding('weaponTwo'))acceptWeaponPickup(1);else if(key===binding('weaponThree'))acceptWeaponPickup(2);else if(key==='escape')closeWeaponPickup(true);return;}
    if(state.cacheOpen){if(key==='tab')trapDialogTab(e,$('cache-panel'),document.activeElement);else if(key==='escape')closeCache();return;}
    if(state.merchantOpen){if(key==='tab')trapDialogTab(e,$('merchant-panel'),document.activeElement);else if(key==='escape')closeMerchant();return;}
    if(key==='tab'){e.preventDefault();if(!state.merchantOpen&&!state.cacheOpen)toggleLoadout();markAction();}
    if(key===binding('interact')){input.interact=true;markAction();}
    if(key===binding('throwableCycle')&&state.mode==='play'){state.throwableIndex=(state.throwableIndex+1)%THROWABLES.length;updateThrowableHud();markAction();}
    if(key===binding('shellCycle'))cycleShotgunShell();
    if(key===binding('throwableUse')&&state.mode==='play'&&!state.merchantOpen&&!state.cacheOpen&&!state.paused&&!state.loadoutOpen)throwThrowable();
    if(key==='r'&&(state.mode==='dead'||state.mode==='won')){newRun();return;}
    if(key==='escape'&&(e.repeat||performance.now()-dialogClosedAt<350))return;
    if(key==='escape'){if(state.merchantOpen)closeMerchant();else if(state.cacheOpen)closeCache();else if(state.loadoutOpen)toggleLoadout(false);else state.paused=!state.paused;toast(state.paused?'PAUSED':'BACK IN');}
    if(key===binding('weaponOne'))switchWeapon(0);
    if(key===binding('weaponTwo'))switchWeapon(1);
    if(key===binding('weaponThree'))switchWeapon(2);
    if(key==='f'){if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.();}
    if(key===binding('reload'))reload();
  });
  addEventListener('keyup',e=>input.keys.delete(resolveMovementKey(normalizeKey(e.key),controls.bindings)));
  addEventListener('blur',()=>{input.keys.clear();input.firing=false;if(state.mode==='play')state.paused=true;});
  addEventListener('mousemove',e=>{input.mouseX=e.clientX;input.mouseY=e.clientY;});
  addEventListener('mousedown',e=>{if(e.button===0){input.firing=true;markAction('fire');if(state.mode==='play'&&!state.paused&&!state.loadoutOpen&&!state.merchantOpen&&!state.cacheOpen&&!state.pendingGunPickup&&!state.runModal)playerShoot();}});addEventListener('mouseup',e=>{if(e.button===0)input.firing=false;});
  $('start-button').addEventListener('click',()=>{void unlockAudio();input.firing=false;input.interact=false;newRun();view.canvas.focus();});
  $('daily-button')?.addEventListener('click',()=>{void unlockAudio();input.firing=false;input.interact=false;newRun({daily:true});view.canvas.focus();});
  wireMacroUi();$('close-loadout').addEventListener('click',()=>toggleLoadout(false));
  $('master-volume').addEventListener('input',event=>{const volume=Number(event.currentTarget.value)/100;$('master-volume-value').textContent=`${Math.round(volume*100)}%`;if(!setMasterVolume(volume))toast('VOLUME CHANGED FOR THIS SESSION ONLY');});
  $('mute-audio').addEventListener('click',()=>{if(!setAudioMuted(!isAudioMuted()))toast('MUTE SETTING CHANGED FOR THIS SESSION ONLY');syncMuteButton();});
  $('meta-button').addEventListener('click',()=>{renderMeta();$('meta-panel').hidden=false;$('close-meta').focus();});$('close-meta').addEventListener('click',()=>{$('meta-panel').hidden=true;$('meta-button').focus();});$('reset-save').addEventListener('click',resetProgress);
  
  $('loadout').addEventListener('click',e=>{if(e.target===$('loadout')){toggleLoadout(false);return;}const gun=e.target.closest('[data-gun]');if(gun){const index=Number(gun.dataset.gun);if(state.weaponSlots.includes(index))equipWeapon(index);else previewLoadoutChange({type:'weapon',index});return;}const gear=e.target.closest('[data-gear]');if(gear){previewLoadoutChange({type:'gear',id:gear.dataset.gear});return;}const mod=e.target.closest('[data-mod]');if(mod)installMod(mod.dataset.mod);});
  $('loadout-confirm').addEventListener('click',event=>{if(event.target===$('loadout-confirm'))closeLoadoutPreview();});$('loadout-cancel').addEventListener('click',closeLoadoutPreview);$('loadout-accept').addEventListener('click',confirmLoadoutChange);
  $('weapon-pickup').addEventListener('click',event=>{if(event.target===$('weapon-pickup')){closeWeaponPickup(true);return;}const button=event.target.closest('[data-pickup-slot]');if(button)acceptWeaponPickup(Number(button.dataset.pickupSlot));});
  $('decline-weapon-pickup').addEventListener('click',()=>closeWeaponPickup(true));
  $('close-cache').addEventListener('click',closeCache);$('cache-panel').addEventListener('click',event=>{if(event.target===$('cache-panel')){closeCache();return;}const button=event.target.closest('[data-cache]');if(button)takeCacheReward(button.dataset.cache);});
  $('close-merchant').addEventListener('click',closeMerchant);$('merchant-panel').addEventListener('click',event=>{const button=event.target.closest('[data-merchant]');if(button)buyMerchantOffer(Number(button.dataset.merchant));});
  addEventListener('resize',resize);
}
async function boot(){
  await RAPIER.init();
  view=createRenderer($('game'),state);if(new URLSearchParams(location.search).has("debug"))window.__deadair={state,view,spawnEnemy,hitPlayer,fireBullet,reachExit,startFloor,openFreqPick,finishRun,pickFreq,decide,newRun,killEnemy,checkRoomClear,collect,dropPickup,freeRoomPoint,saveProgress,renderMeta};
  state.physics=physics;setupControls();renderMeta();resize();$('start-button').disabled=false;$('start-button').textContent='ENTER THE SECTOR ↗';
  let previous=performance.now();function loop(now){requestAnimationFrame(loop);const dt=Math.min(.05,(now-previous)/1000);previous=now;if(state.mode==='play')update(dt);render(dt);}requestAnimationFrame(loop);
}
boot().catch(error=>{console.error(error);$('start-button').disabled=true;$('start-button').textContent='GAME COULD NOT LOAD';$('overlay').classList.add('show');$('overlay').querySelector('p').textContent='The game could not load. Start a local web server and check that the three game libraries are reachable.';});
