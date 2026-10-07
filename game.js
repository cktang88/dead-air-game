import {createRenderer,hexStr} from './render2d.js';
import {VIEW_HALF_HEIGHT as CAMERA_HALF_HEIGHT} from './camera2d.js';
import RAPIER from 'https://esm.sh/@dimforge/rapier2d-compat@0.17.3';
import * as ROT from 'https://esm.sh/rot-js@2.1.3';
import {playFootstep, playNearMiss, playShieldBlock, playSniperLock, isAudioMuted, loadAudioSettings, playArmorHit, playBruteWindup, playCrateBreak, playEmptyClick, playLowAmmo, playEnemyShot, playEnemyTell, playExplosion, playExtraction, playFlashbang, playFire, playGateUnlock, playGunshot, playHit, playKill, playPickup, playPlayerHurt, playReload, playReloadEnd, playRoomClear, playSlowmoEnter, playSlowmoExit, playSmoke, playUiClick, playWallImpact, setAudioMuted, setMasterVolume, setTimeScaleAudio, unlockAudio} from './audio.js';
import {armMusicOnGesture, getMusicBeat, loadMusicSettings, musicSting, musicSyncGame, setMasterMusicVolume, setMusicTimeScale} from './music.js';
import {ambienceSync, ambienceChatter} from './ambience.js';
import {ENEMY_TYPES, GEAR, GUNS, MODS, MOD_BY_ID, modFits, SHOTGUN_SHELLS, TAU, TILE, WALL_H} from './catalog.js';
import {drawIcon} from './icons.js';
import {HINTS_KEY, loadSeen, pickHint, saveSeen} from './hints.js';
import {collectInteractables, activeInteraction, ambientPrompt, collectPopup} from './interaction.js';
import {absorbArmorDamage, chooseEncounterTypes, crateDamageStage, damageDurability, distanceToRect, gunPickupPlan, minimapContactVisible, minimapPickupVisible, reloadSeconds, segmentCircleHitTime, segmentIntersectsCircle, segmentWallRuns, shotgunShellStats, swapSeconds, timeScale, unlockRewardGate, weaponPenetration, weaponStats, withinWorldView} from './rules.js';
import {META_UPGRADES, awardCoins, emptyProgress, progressionStats, purchaseUpgrade, recordDaily} from './progression.js';
import {FINAL_FLOOR, floorConfig, floorSeed, encounterDepth, settleRun, grossCoins, COIN_RATES, dateKey, dailySeed, dailyShareLine} from './run-loop.js';
import {kitById, kitThrowables, droppableGunIds, unlockedThrowableIds, unlockedFreqIds, purchaseUnlock, selectKit, UNLOCK_BY_ID} from './unlocks.js';
import {freqStats, pickFrequency, offerFrequencies, upgradeById, STATION_BY_ID, activeCrossfades, CROSSFADES} from './frequencies.js';
import {recordRun} from './goals.js';
import {assignRoomRewards, computeDoorLinks, doorPreviews} from './door-rewards.js';
import {collectTape, operatorLines, causeName} from './story.js';
import {interferenceStats, toggleInterference} from './interference.js';
import {spawnBoss, updateBossEnemy, bossDamageFor, bossLights, bossCamShift} from './boss-fight.js';
import {BOSS_ROOM_NAME} from './boss.js';
import {BOSS,BOSS_BULLET_FLOOR} from './boss.js';
import {decisionHtml, freqOfferHtml, buildStripHtml, bossBarHtml, metaPanelHtml, kitChipHtml, storyHtml} from './meta-ui.js';
import {clearSavedProgress, readSavedProgress, writeSavedProgress} from './progress-storage.js';
import {consumeThrowable, isWithinThrowableRadius, THROWABLES, throwableAffectsTarget, throwableById} from './tactical.js';
import {shapeDungeon} from './layout.js';
import {findRoomCratePosition as findGuaranteedRoomCratePosition, findRoomPropPosition} from './room-props.js';
import {paceEnemyCount} from './room-templates.js';
import {generateDungeon} from './dungeon.js';
import {createNav, stepEnemyBrain, brainState} from './enemy-brain.js';
import {SHOVE,DRY_DROP_VALUE,isAllDry,shoveOutcome,shoveReady,shoveTargets} from './shove.js';
import {choosePostures, damageModifier, deathCause, setConeScale, shotNoiseRadius} from './stealth.js';
import {noiseRayLengths} from './stealth2d.js';
import {ammoStatus,nextLoadedSlot,ammoPickupRounds,supplyDrop,clearHealAmount,clearAmmoDrop,cooldownReady,objectiveText} from './economy.js';
import {supplyOffers,offerStatus,offerCard,SUPPLY_MEDKIT_HP} from './supply.js';
import {hasUnclearedRouteEnemies, roomEnemyCount, roomEncounterTypes, roomHasEncounter, roomHasLivingEnemies, roomPickupKinds} from './room-roles.js';
import {MAX_RUN_SEED, parseRunSeed} from './seeds.js';
import {flashOverlayOpacity,loadVisualSettings,saveVisualSettings,scaledCameraShake} from './visual-settings.js';
import {particleBurstBudget} from './particles.js';
import {resolveProjectileImpacts} from './projectile-impacts.js';
import {pickGunIndex,pickModId} from './loot.js';
import {edgeView}from './timefx.js';
import {PLAYER_BULLET_CLOCK,TIME_RULE,addBeat,drainBeat,playerBulletDt,rateLabel,shotBeat,sprintNoiseStep,timeBand}from './time-rule.js';
import {showBanner,gunIcon,strokeIcon,statBarsHtml,categoryColor,hudOccludes,formatClock,pushFeed,roomBanner,roomClearBanner,updateLowHealth,pulseHurt,setPauseScreen,runEndHtml,keycap,feedTone,syncPips,tickNumber,flashEl,syncKeycaps,hintHtml,costHtml,animateCounts} from './hud-ui.js';
import {mergeBest,readBest,writeBest} from './best-run.js';
export {pushFeed};
import {bruteMeleeHits,shieldBlocks,stepBruteMelee,turnShield} from './enemy-attacks.js';
import {registerHitIndicator} from './threat-indicators.js';
import {trapDialogTab} from './dialog-focus.js';
import {KNOCK_DECAY,ENEMY_KNOCK_DECAY,MOVE_TUNING,PRESS_BUFFER,addRecoil,approach,clipBlockedVelocity,cornerNudge,easeTimeScale,effectiveSpread,enemyKnockback,fanAngles,gunFeel,hitstopFor,muzzlePoint,newBloom,nextFireTime,playerHitKnock,pushEvent,registerShot,reloadTime,stepBloom,stepRecoil,stepVelocity}from './feel.js';
import {advanceWeaponBurst,beginWeaponBurst} from './weapon-burst.js';
import {planDoors,createDoor,openDoor,closeDoor,stepDoorAnim,bumpOpens,enemyOpens,peekFocus,createPeekMachine,isClosed,doorCenterPx,PEEK_HOLD,DOOR_RANGE} from './doors.js';
import {buildSignalLayout,createSignalProgress,zoneOf,goalMet,idleHint,resetPlan,alcoveAt,roomStartPx,REWARD_INFO,SCRIPT as SIGNAL_SCRIPT} from './signal-check.js';
import {loadOnboarding,saveOnboarding,clearOnboarding,emptyOnboarding,shouldRunSignalCheck,nextCard,enemyCardId,manualTriggers,unlockManual,NAME_CARDS,SIGNAL_CARD_IDS} from './onboarding.js';
import {showNameCard,nameCardBusy,showManualChip,showSigHint,showSigCause,showSigComplete,setPeekChrome,renderManual,setPauseTab,wirePauseTabs} from './knowledge-ui.js';
import {DEFAULT_KEY_BINDINGS,KEY_BINDING_ACTIONS,keyLabel,loadKeyBindings,movementFromKeys,normalizeKey,rebindKey,resolveMovementKey,saveKeyBindings} from './keybindings.js';

const $ = (id) => document.getElementById(id);
const SPRINT_MULTIPLIER=1.45;
const modOf=(gun)=>state.gunMods[gun.id]||null;
const shellForRun=()=>SHOTGUN_SHELLS.find(shell=>shell.id===state.shotgunShellId)||SHOTGUN_SHELLS[0];
const magSize=(gun)=>weaponStats(gun,modOf(gun)).magazine;
const reloadDuration=(gun)=>reloadSeconds(gun,modOf(gun));

const state = {
  noises:[], nav:null, mode:'title', running:false, paused:false, loadoutOpen:false, time:0, elapsed:0, realElapsed:0, calmTimer:0, notify:{}, lastMagWarn:{}, extractionOpen:false, objTimer:0, score:0, kills:0, scrap:0, roomsCleared:0,
  seed:0, tileMap:[], mapW:96, mapH:72, rooms:[], currentRoom:0,
  player:null, enemies:[], bullets:[], pickups:[], crates:[], cover:[], particles:[], props:[], doors:[], lockedDoors:[], solidMap:[], colliders:[], thrown:[], effects:[],
  weaponSlots:[0,1], activeSlot:0, get weaponIndex(){return this.weaponSlots[this.activeSlot];}, gear:null, weaponAmmo:GUNS.map(g=>g.mag), reserveAmmo:GUNS.map(g=>g.reserve), gunMods:{}, gunTouched:new Set(), swapUntil:0, quickdrawFor:-1, health:5, maxHealth:5, armor:0, maxArmor:0,
  progress:loadProgress(), paidOut:false,
  aim:{x:1,y:0}, lastAction:0, lastActionKind:'other', fireCooldown:0, weaponBurst:null, reloadTimer:0, invuln:0, shake:0, flashTimer:0, hitstop:0, toastTimer:0, roomToast:'', sector:1,
  throwableIndex:2, throwables:{smoke:1,flash:1,frag:2}, shotgunShellId:'buckshot', supplyOpen:false, supplyPickup:null,
  physics:null,
  doorProps:[], glass:[], peek:null, signal:null, signalLayout:null,
  onboarding:(()=>{try{return loadOnboarding(localStorage);}catch{return emptyOnboarding();}})(),
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
Object.assign(state,{floor:1,floorCfg:floorConfig(1),freq:{},daily:false,runModal:null,timeCredit:0,stillFor:0,floorHit:false,floorsCleared:0,runRooms:0,floor1Seconds:0,stillRoomClears:0,slowTriples:0,slowKills:0,tripleFlag:false,noHitFloors:0,roomMove:0,lastPos:null,bossKilled:false,bossPistol:false,lastHitType:null,echoes:[],flourishT:0,shotGroup:null,shotExtra:null,doorMarkers:[],doorLinks:[],boss:null,metaTab:'unlocks',shotDamageMult:1,levelSeed:0,freqOffers:[],freqThen:null,outcome:null,events:[],timeScaleSmoothed:1,timeScaleTarget:1,frameDt:1/60,recoil:{x:0,y:0,amount:0},sprintBlend:0,bloom:newBloom(),pressUntil:-1,wasFiring:false,playerVel:{x:0,y:0},playerKnock:{x:0,y:0},lastPhysicsStep:0,cmdVel:{x:0,y:0},stepHitstop:false,reloadTotal:0,dryTimer:0});
const emit=(type,x,y,extra)=>pushEvent(state.events,{type,t:state.time,x,y,...extra});
const input = {keys:new Set(), mouseX:innerWidth/2, mouseY:innerHeight/2, firing:false, interact:false};
const controls={bindings:{...DEFAULT_KEY_BINDINGS},waitingFor:null};

let view, physics;
const MINIMAP_LOOT_COLORS={scrap:'#f4c66d',gun:'#74c9ed',mod:'#d38ff5',heal:'#74dfab',supply:'#f4c66d'};
let visualSettings={shake:1,flash:1};
function binding(action){return controls.bindings[action];}
function weaponSlotLabel(slot){return ['PRIMARY','SECONDARY','TERTIARY'][slot]||`SLOT ${slot+1}`;}
function runStats(){return progressionStats(state.progress,state.freq);}
function maxWeaponSlots(){return runStats().maxWeaponSlots;}
function weaponRpm(gun){const shots=gun.burst?.shots||1,cycle=gun.burst?Math.max(gun.rate,(shots-1)*gun.burst.interval):gun.rate;return Math.round(60*shots/cycle);}
function hasMovementInput(){return ['moveUp','moveDown','moveLeft','moveRight'].some(action=>input.keys.has(binding(action)));}
function renderKeyBindings(focusAction=null){
  const list=$('key-bindings');if(!list)return;
  list.innerHTML=KEY_BINDING_ACTIONS.map(({id,label})=>`<div class="key-binding-row"><span>${label}</span><button type="button" data-bind-action="${id}" aria-label="${label}: ${keyLabel(binding(id))}" aria-pressed="${controls.waitingFor===id}">${controls.waitingFor===id?'PRESS A KEY':keyLabel(binding(id))}</button></div>`).join('');
  if(focusAction)list.querySelector(`[data-bind-action="${focusAction}"]`)?.focus();
  syncKeycapLabels();
}
function syncKeycapLabels(){syncKeycaps(action=>controls?.bindings&&action in controls.bindings?keyLabel(binding(action)):undefined);}
function renderKeyGuide(){
  const movement=`${keyLabel(binding('moveUp'))} ${keyLabel(binding('moveLeft'))} ${keyLabel(binding('moveDown'))} ${keyLabel(binding('moveRight'))}`;
  const weaponKeys=maxWeaponSlots()>2?`${keyLabel(binding('weaponOne'))} ${keyLabel(binding('weaponTwo'))} ${keyLabel(binding('weaponThree'))}`:`${keyLabel(binding('weaponOne'))} ${keyLabel(binding('weaponTwo'))}`;
  const caps=text=>text.split(' ').map(keycap).join('');
  $('key-guide').innerHTML=[[movement,'MOVE'],['SHIFT','SPRINT'],['MOUSE','AIM / FIRE'],[keyLabel(binding('interact')),'INTERACT'],[keyLabel(binding('reload')),'RELOAD'],[weaponKeys,'WEAPONS'],['TAB','LOADOUT'],[keyLabel(binding('throwableUse')),'THROW'],['C','SHELL']].map(([k,l])=>`<div class="kg-row"><span class="kg-keys">${caps(k)}</span><i>${l}</i></div>`).join('');
  syncKeycapLabels();
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
  state.progress=emptyProgress();clearOnboarding(localStorage);state.onboarding=emptyOnboarding();renderMeta();toast('SAFEHOUSE SAVE RESET');
}
function renderSlotStrip(){
  const strip=$('slot-strip');if(!strip)return;
  strip.innerHTML=state.weaponSlots.map((gi,slot)=>{const g=GUNS[gi];return `<div class="slot ${slot===state.activeSlot?'active':''}" style="--cat:${categoryColor(g.category)}" title="${g.verb} · ${modOf(g)?MOD_BY_ID.get(modOf(g)).name:'NO MOD'}">${keycap(keyLabel(binding(['weaponOne','weaponTwo','weaponThree'][slot])))}${gunIcon(g,'gun-ico sm')}<span class="slot-name">${g.name}</span><span class="slot-ammo">${state.weaponAmmo[gi]}<i>/${state.reserveAmmo[gi]}</i></span></div>`;}).join('');
}
// Per-frame HUD writes go through these: the DOM is only touched when the value actually changed.
function setText(el,v){if(el._t!==v){el._t=v;el.textContent=v;}}
function setHtml(el,v){if(el._h!==v){el._h=v;el.innerHTML=v;}}
function syncWeaponPanel(){
  const gun=GUNS[state.weaponIndex],mag=magSize(gun),cur=state.weaponAmmo[state.weaponIndex],reloading=state.reloadTimer>0;
  const low=cur<=Math.ceil(mag*.25);{const ammoEl=$('ammo'),changed=ammoEl._cur!==undefined&&ammoEl._cur!==cur;ammoEl._cur=cur;setHtml(ammoEl,`<b class="${cur===0?'empty':low?'low':''}">${cur}</b><i>/ ${mag}</i>`);if(changed)ammoEl.firstElementChild?.classList.add('tick');}
  {const res=state.reserveAmmo[state.weaponIndex],st=ammoStatus({mag:cur,reserve:res,magSize:mag});setText($('ammo-reserve'),st==='dry'?'NO AMMO':st==='last'?`LAST MAG · RES ${res}`:`RES ${res}`);const el=$('ammo-reserve');if(el._st!==st){el._st=st;el.classList.toggle('low',st==='last');el.classList.toggle('dry',st==='dry');}}
  const pips=$('ammo-pips');if(pips.dataset.mag!==String(mag)){pips.dataset.mag=String(mag);pips.innerHTML=Array.from({length:mag},()=>'<i></i>').join('');pips.classList.toggle('dense',mag>24);pips._on=-1;}
  if(pips._on!==cur){const was=pips._on;pips._on=cur;const kids=pips.children;for(let i=0;i<kids.length;i++){const k=kids[i],lit=i<cur;if(was>cur&&i>=cur&&i<was&&k.classList.contains('on')){k.classList.remove('eject');void k.offsetWidth;k.classList.add('eject');}k.classList.toggle('on',lit);}}
  const track=$('reload-track');if(track._a!==reloading){track._a=reloading;track.classList.toggle('active',reloading);}
  if(reloading){const fill=$('reload-fill'),w=`${Math.round(clamp(1-state.reloadTimer/Math.max(.01,reloadDuration(gun)),0,1)*100)}%`;if(fill._w!==w){fill._w=w;fill.style.width=w;}}
  setText($('weapon-note'),reloading?'RELOADING':state.realElapsed<state.swapUntil?'DRAWING':gun.id==='shotgun'?`${shellForRun().name} · C TO CYCLE`:gun.short);
  const icon=$('gun-icon'),key=`${gun.id}`;if(icon.dataset.g!==key){icon.dataset.g=key;icon.innerHTML=gunIcon(gun,'gun-ico lg');icon.style.setProperty('--cat',categoryColor(gun.category));}
}
// Hostile route rooms only: the same denominator the objective line counts ("N ROOMS LEFT" = total - cleared).
function routeStats(){let total=0,cleared=0;for(const r of state.rooms){if(r.branch===true||!roomHasEncounter(r))continue;total++;if(r.cleared)cleared++;}return {total,cleared};}
function syncRunStats(){
  tickNumber($('kills'),state.kills,2);tickNumber($('scrap'),state.scrap,3);
  {const r=routeStats(),stat=$('sector-count').parentElement;if(stat)stat.hidden=signalOn();setText($('sector-count'),`${r.cleared} / ${r.total}`);}   // Signal Check has its own N / 5 chip: the route counter would read 0 / 0
  setText($('run-clock'),`RUN ${formatClock(state.realElapsed)}`);
  setText($('room-name'),state.roomToast||(signalOn()?`SIGNAL CHECK · ${state.rooms[state.currentRoom]?.name||'BREATH'}`:`FLOOR ${String(state.floor).padStart(2,'0')} · ${state.rooms[state.currentRoom]?.name||'ENTRY'}`));
}
function hud(){
  const gun=GUNS[state.weaponIndex];
  syncPips($('health'),state.health,state.maxHealth,{cls:'heart pip'});$('health').classList.toggle('low',state.health>0&&state.health<=1);updateLowHealth(state.health,state.maxHealth);
  {const hn=$('health-num');hn.innerHTML=`${state.health}<i>/ ${state.maxHealth}</i>`;hn.classList.toggle('low',state.health<=1);}
  $('armor-meter').hidden=state.maxArmor===0;$('armor-value').textContent=`${state.armor} / ${state.maxArmor}`;syncPips($('armor-pips'),state.armor,state.maxArmor,{tag:'i'});
  $('gun-name').textContent=gun.name; $('gun-mods').textContent=modOf(gun)?MOD_BY_ID.get(modOf(gun)).name:'NO MOD';
  renderSlotStrip();syncWeaponPanel();syncRunStats();updateThrowableHud();setHtml($('build-strip'),buildStripHtml(state.freq));
  $('loadout-scrap').innerHTML=`${costHtml(String(state.scrap).padStart(3,'0'))} <span>SCRAP</span>`;
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
// Loadout (TAB): your carried guns, the mod on the active one, and the extras. Nothing is bought here: guns and mods
// come from pickups and supply drops, so this screen is for reading and for drawing a gun.
function modChipHtml(modId){const mod=MOD_BY_ID.get(modId);return mod?`<em class="chip" style="--c:#${mod.color.toString(16).padStart(6,'0')}">${mod.name}</em>`:'<em class="chip dim">NO MOD</em>';}
function renderLoadout(){
  if(!$('loadout-gun'))return;
  $('loadout-gun').innerHTML=state.weaponSlots.map((index,slot)=>{const gun=GUNS[index],active=slot===state.activeSlot,swap=swapSeconds(gun,modOf(gun),maxWeaponSlots());
    return `<button class="loadout-weapon held ${active?'active':''}" style="--cat:${categoryColor(gun.category)}" data-slot="${slot}"><div class="lw-icon">${gunIcon(gun,'gun-ico')}</div><div class="lw-body"><div class="lw-head"><strong>${gun.name}</strong><em class="slot-badge ${active?'active':''}">${active?'ACTIVE · ':''}${weaponSlotLabel(slot)}</em></div><span class="lw-meta">${gun.short} · ${state.weaponAmmo[index]} / ${magSize(gun)} · ${state.reserveAmmo[index]} RESERVE</span>${statBarsHtml(gun,null,GUNS,{compact:true})}<span class="lw-result">${modChipHtml(modOf(gun))} · DRAW ${swap===0?'INSTANT':swap.toFixed(2)+' S'}</span></div></button>`;
  }).join('');
  const shotgun=state.weaponSlots.some(i=>GUNS[i].id==='shotgun');
  $('extras-list').innerHTML=(shotgun?SHOTGUN_SHELLS.map(shell=>`<div class="mod-row ${shell.id===state.shotgunShellId?'equipped':''}"><span><span class="nm">${shell.name}</span><small>${shell.description}</small></span><button data-shell="${shell.id}" ${shell.id===state.shotgunShellId?'disabled':''}>${shell.id===state.shotgunShellId?'LOADED':'LOAD'}</button></div>`).join(''):'')
    +`<div class="mod-row"><span><span class="nm">THROWABLES</span><small>${THROWABLES.map(item=>`${item.name} x${state.throwables[item.id]||0}`).join(' · ')}</small></span></div>`;
  const gun=GUNS[state.weaponIndex],worn=modOf(gun);
  $('mod-list').innerHTML=MODS.map(mod=>{const fits=modFits(gun,mod.id),on=worn===mod.id;
    return `<div class="mod-row ${on?'equipped':''} ${fits?'':'off'}">${strokeIcon(mod.id,'ico')}<span><span class="nm">${mod.name}</span>${on?' <em class="chip on">FITTED</em>':''}<small>${mod.info}</small>${fits?'':'<span class="why">DOES NOT FIT THIS GUN</span>'}</span></div>`;}).join('')
    +`<div class="mod-row"><span><small>One mod per gun, no upgrades to buy. Walk up to a mod on the floor to see where it fits and what it replaces; fitting a new one drops the old one so you can swap back.</small></span></div>`;
  {const co=$('carry-readout');co.innerHTML=`<span class="term" data-tip="Two guns in hand. Picking up a third swaps the one you are holding. The Third Slot upgrade adds a slot, but every swap gets slower.">GUNS</span> ${state.weaponSlots.length} / ${maxWeaponSlots()}`;}
  updateThrowableHud();
}
let dialogClosedAt=-1e9;
function renderMeta(){
  $('meta-balance').textContent=String(state.progress.coins);
  $('meta-coins').innerHTML=`${strokeIcon('coin','ico')}<span>AVAILABLE</span><b>${state.progress.coins}</b><span>COINS</span>`;
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
  // Deeper floors turn more ordinary rooms into WARDEN rooms.
  const wardenPool=state.rooms.map((room,index)=>({room,index})).filter(item=>item.index>=2&&item.index<state.rooms.length-1&&item.room.role==='combat'&&!item.room.branch);
  for(let n=0;n<cfg.eliteRooms&&wardenPool.length;n++){const {room}=wardenPool.splice(Math.floor(random()*wardenPool.length),1)[0];room.role='elite';room.name='WARDEN';}
  assignRoomRewards(state.rooms,random);
  state.doorLinks=computeDoorLinks({cells:state.tileMap,rooms:state.rooms,doors:state.doors});state.doorMarkers=[];
}
function makeLevel(){
  clearLevel(); if(state.signal?.active)createSignalMap(); else createRoomMap();
  const wallRuns=[];
  for(let y=0;y<state.mapH;y++){
    let run=-1;
    for(let x=0;x<=state.mapW;x++){
      const wall=x<state.mapW&&state.tileMap[y][x]!==0&&state.tileMap[y][x]!==4;
      if(!wall&&run>=0){wallRuns.push({x:run,y,len:x-run});run=-1;}
      else if(wall&&run<0)run=x;
    }
  }
  for(const run of wallRuns){const width=run.len*TILE;makeFixedBox(run.x*TILE+width/2,run.y*TILE+TILE/2,width/2,TILE/2);}
  makeRewardDoorGates();buildGlassBodies();const sig=signalOn();
  // Room templates (room-templates.js) already stamped hard cover into the tile map; crates are the destructible low cover.
  for(const room of sig?[]:state.rooms){
    for(const crate of room.crates||[])spawnCrate((crate.x+.5)*TILE,(crate.y+.5)*TILE);
    if(!(room.crates||[]).length){
      const point=findRoomCratePosition(room);
      if(!point)throw new Error(`Room ${room.index} has no safe crate position`);
      spawnCrate(point.x,point.y);
    }
    placeRoleRewards(room);
  }
  let combatIndex=0;
  for(const [i,room] of (sig?[]:state.rooms).entries()){
    if(i===0)continue;
    if(state.floorCfg.boss&&i===state.rooms.length-1)continue;
    const baseCount=paceEnemyCount(room,roomEnemyCount(room.role,random(),combatIndex)),count=baseCount+(room.role==='combat'||room.role==='hazard'?state.floorCfg.countBonus:0),depth=encounterDepth(i/Math.max(1,state.rooms.length-1),state.floor),encounter=roomEncounterTypes(room.role,chooseEncounterTypes(count,state.levelSeed+i*7919,depth),depth);
    if(room.role==='combat')combatIndex++;
    const spawned=[];
    for(let j=0;j<count;j++){
      const elite=room.role==='elite'&&encounter[j]==='brute',point=findEnemySpawn(room,encounter[j],elite);
      if(point)spawned.push(spawnEnemy(encounter[j],point.x,point.y,i,elite));
    }
    applyPostures(i,spawned);
    if(!roomPickupKinds(room.role).length){
      if(i%2===1){dropPickup('scrap',...freeRoomPoint(room),10+Math.floor(random()*21));}
      if(i%3===0){const kind=choose(['gun','mod','heal']);dropPickup(kind,...freeRoomPoint(room));}
    }
  }
  if(sig)buildSignalDoors();else buildDoorProps();
  const start=state.rooms[0],sp=sig?roomStartPx(0):null;const sx=sp?sp.x:(start.cx+.5)*TILE,sy=sp?sp.y:(start.cy+.5)*TILE;
  const body=makeBody({x:sx,y:sy},8,false);body.lockRotations(true,true);body.setLinearDamping(4);body.collider(0).setFriction(0);Object.assign(state,{playerVel:{x:0,y:0},playerKnock:{x:0,y:0},cmdVel:{x:0,y:0},recoil:{x:0,y:0,amount:0},bloom:newBloom(),events:[],sprintBlend:0,pressUntil:-1,cornerStuck:0,cornerSign:1});
  state.player={body,x:sx,y:sy,hp:state.health};
  if(!sig){const exit=state.rooms.at(-1);dropPickup('exit',(exit.cx+.5)*TILE,(exit.cy+.5)*TILE);}
  state.boss=!sig&&state.floorCfg.boss?spawnBoss(bossApi,state.rooms.at(-1),interferenceStats(state.progress).bossHpMult):null;
  if(state.boss)state.rooms.at(-1).name=BOSS_ROOM_NAME;state.stageLights=[];state.camFocus={x:0,y:0};
  state.currentRoom=0;state.roomsCleared=0;if(sig)spawnSignalRoom(0);updateRoom();makeMinimap();hud();view.setLevel();
}
function clearLevel(){
  state.player=null;state.enemies=[];state.bullets=[];state.echoes=[];state.pickups=[];state.crates=[];state.cover=[];state.thrown=[];state.effects=[];state.colliders=[];state.doors=[];state.lockedDoors=[];state.solidMap=[];state.doorProps=[];state.glass=[];state.peek=null;peekMachine.cancel();setPeekChrome(false);
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
// Noise: every entry is {x,y,radius,kind}. The brain hears it (walls cut it to 55%, sleepers hear 70%), and
// updateEnemies turns it into a visible ring shaped by the same wall rule (stealth2d.noiseRayLengths).
function emitNoise(x,y,radius,kind='shot'){state.noises.push({x,y,radius,kind});}
// Starting postures (stealth.js): patrol walks a loop, guard holds a post facing the doors, sleep has no cone,
// gather stands in a ring facing the middle. Enemies without a posture (boss adds) stay aware-on-sight.
function openSpot(x,y,r=10){return state.solidMap[Math.floor(y/TILE)]?.[Math.floor(x/TILE)]===0&&!state.cover.some(c=>Math.hypot(x-c.x,y-c.y)<c.radius+r)&&!state.crates.some(c=>Math.hypot(x-c.x,y-c.y)<r+17);}
function moveEnemyTo(e,x,y){e.x=x;e.y=y;e.body.setTranslation({x,y},true);}
function applyPostures(roomIndex,list){
  if(!list.length)return;const room=state.rooms[roomIndex],kinds=choosePostures(list.map(e=>e.type),{floor:state.floor,role:room.role,rng:random});
  const gatherers=list.filter((e,i)=>kinds[i]==='gather');
  if(gatherers.length>=2){const c={x:gatherers[0].x,y:gatherers[0].y};gatherers.forEach((e,i)=>{const a=i/gatherers.length*TAU+random()*.4,x=c.x+Math.cos(a)*30,y=c.y+Math.sin(a)*30;if(openSpot(x,y)&&!state.enemies.some(o=>o!==e&&o.alive&&Math.hypot(o.x-x,o.y-y)<18))moveEnemyTo(e,x,y);});
    const mid={x:gatherers.reduce((t,e)=>t+e.x,0)/gatherers.length,y:gatherers.reduce((t,e)=>t+e.y,0)/gatherers.length};for(const e of gatherers)e.gatherFocus=mid;}
  const center={x:(room.cx+.5)*TILE,y:(room.cy+.5)*TILE};
  list.forEach((e,i)=>{
    let kind=kinds[i];if(kind==='gather'&&!e.gatherFocus)kind='guard';
    const home={x:e.x,y:e.y};let base,route=null;
    const door=state.doors.map(d=>({x:(d.x+.5)*TILE,y:(d.y+.5)*TILE})).filter(d=>Math.hypot(d.x-e.x,d.y-e.y)<300).sort((a,b)=>Math.hypot(a.x-e.x,a.y-e.y)-Math.hypot(b.x-e.x,b.y-e.y))[0]||center;
    const toward=t=>{const l=Math.hypot(t.x-e.x,t.y-e.y)||1;return {x:(t.x-e.x)/l,y:(t.y-e.y)/l};};
    if(kind==='gather'){base=Math.hypot(e.gatherFocus.x-e.x,e.gatherFocus.y-e.y)>4?toward(e.gatherFocus):toward(center);}
    else if(kind==='sleep'){const a=random()*TAU;base={x:Math.cos(a),y:Math.sin(a)};}
    else if(kind==='patrol'){route=[home];for(let k=0;k<14&&route.length<3;k++){const a=random()*TAU,r=80+random()*110,pt={x:e.x+Math.cos(a)*r,y:e.y+Math.sin(a)*r};if(openSpot(pt.x,pt.y,12)&&!lineBlocked(e.x,e.y,pt.x,pt.y)&&route.every(q=>Math.hypot(q.x-pt.x,q.y-pt.y)>60))route.push(pt);}
      if(route.length<2){kind='guard';route=null;base=toward(door);}else base=toward(route[1]);}
    else base=toward(door);
    e.posture=kind;e.post={home,base,route};e.face={...base};e.aim={...base};e.aware=false;e.suspicion=0;
  });
}
function spawnEnemy(type,x,y,roomIndex,elite=false){
  const base=ENEMY_TYPES[type],ih=interferenceStats(state.progress),cfg=state.floorCfg,def0=elite?{...base,name:'WARDEN',hp:140,speed:26,damage:2,color:0xff9566}:base,hpMul=type==='boss'?1:cfg.hpMult*ih.enemyHpMult,def=type==='boss'?def0:{...def0,hp:Math.round(def0.hp*hpMul),speed:def0.speed*cfg.speedMult*ih.enemySpeedMult},radius=type==='boss'?22:elite?13:type==='brute'||type==='riot'?10:8,body=makeBody({x,y},radius,false);body.lockRotations(true,true);body.setLinearDamping(3.4);
  const mag=type==='gunner'?5:type==='guard'?3:type==='sniper'?3:0;state.rooms[roomIndex].hadEncounter=true;const enemy={type,def,body,elite,x,y,roomIndex,radius,hp:def.hp,maxHp:def.hp,fire:rand(.55,1.7),aimTimer:0,aim:{x:1,y:0},meleeWindup:0,meleeCooldown:0,mag,ammo:mag,reloadTimer:0,stun:0,knock:{x:0,y:0},alive:true,id:random(),side:random()<.5?-1:1,tacticTimer:rand(0,.25),intent:'hold',intentGoal:null,navGoal:null,shieldAng:0,shieldFlash:0,locked:false};state.enemies.push(enemy);return enemy;
}
function possiblePickupGuns(){
  const pool=droppableGunIds(state.progress);return GUNS.map((gun,index)=>index).filter(index=>pool.has(GUNS[index].id)&&!state.weaponSlots.includes(index));
}
function dropPickup(kind,x,y,value=0,roomIndex=null,extra={}){
  if(state.solidMap[Math.floor(y/TILE)]?.[Math.floor(x/TILE)]!==0)return null;
  let gunIndex,modId;
  if(kind==='gun'){gunIndex=extra.gunIndex??pickGunIndex(possiblePickupGuns(),random(),runStats().luckyFindLevel);if(!Number.isInteger(gunIndex))return null;}
  if(kind==='mod')modId=extra.modId??pickModId(random());
  const variant=kind==='gun'&&!!GUNS[gunIndex].variantOf;
  const colors={freq:0x9ad8ff,scrap:0xf4c66d,gun:variant?0xffd27a:0x74c9ed,mod:MOD_BY_ID.get(modId)?.color??0xd38ff5,heal:0x74dfab,ammo:0x8fe0ff,armor:0x75cfe0,supply:0xf4c66d,exit:0xff5969};
  const pickup={kind,x,y,value,color:hexStr(colors[kind]),gunIndex,modId,variant,roomIndex,available:true};state.pickups.push(pickup);return pickup;
}

function fireBullet(owner,x,y,dx,dy,gun,damageScale=1,projectile={}){
  const mod=owner==='player'?modOf(gun):null,stats=owner==='player'?weaponStats(gun,mod):null;
  const speed=stats?.projectileSpeed??gun.speed;
  // Player rounds (and their tracer mesh) leave exactly at the muzzle; the swept test starts at the
  // shooter's centre (ox,oy) so a muzzle poking through a wall cannot let a round slip past it.
  const start=owner==='player'?muzzlePoint(x,y,dx,dy,gun):{x:x+dx*13,y:y+dy*13};
  const color=owner==='player'?gun.color:0xff6a64;
  const bullet={owner,enemyId:owner==='enemy'?projectile.enemyId:null,body:null,color,x:start.x,y:start.y,ox:x,oy:y,vx:dx*speed,vy:dy*speed,damage:projectile.damage??(stats?.damage??gun.damage)*damageScale,life:(projectile.range??stats?.range??gun.range??speed*1.7)/speed,penetration:owner==='player'&&!projectile.lob?weaponPenetration(gun,mod):{enemies:0,crates:0,walls:0},hitEnemies:new Set(),hitCrates:new Set(),insideWall:false,style:projectile.lob?'lob':projectile.style||null,lob:projectile.lob?gun.lob:null,missed:false,boss:!!projectile.boss};
  if(owner==='player'){const f=freqStats(state.freq),sx=state.shotExtra||{};bullet.burn=stats.burn;bullet.stun=stats.stun;bullet.maxBounces=f.ricochet+stats.bounces;bullet.bounces=0;bullet.bounceSeek=f.bounceSeek;bullet.penetration={...bullet.penetration,enemies:bullet.penetration.enemies+f.pierce+(sx.pierce||0),crates:bullet.penetration.crates+(f.crateThru?9:0)};bullet.homing=f.homing;bullet.homingRange=f.homingRange||280;bullet.damage*=state.shotDamageMult;
    if(!projectile.noShot){bullet.power=sx.power||1;bullet.rageBlast=sx.rageBlast||0;if(state.shotGroup){bullet.shot=state.shotGroup;state.shotGroup.n++;}}}
  if(owner==='player')bullet.sneak=new Map(state.enemies.filter(e=>e.alive&&!e.aware&&e.type!=='boss').map(e=>[e,{x:e.face?.x??1,y:e.face?.y??0,asleep:e.posture==='sleep'}]));// stealth: who was unaware (and facing where) when the trigger was pulled; the shot's own noise must not cancel a sneak hit
  state.bullets.push(bullet);
}
function playerMoveRatio(){const ratio=Math.hypot(state.playerVel.x,state.playerVel.y)/(runStats().moveSpeed||112);return ratio>.2?clamp(ratio,0,1):0;}
// Each shot lets a beat of world time through (time-rule.js shotBeat). The bank is drained as a burst of 1x flow in update().
function addShotBeat(gun,stats){const pellets=gun.id==='shotgun'?(shellForRun().pellets||1):(gun.count||1),beat=shotBeat({damage:stats.damage,fireInterval:stats.fireRate,pellets});state.beatBank=addBeat(state.beatBank||0,beat);state.beatPulse=1;state.shotsFired=(state.shotsFired||0)+1;state.beatLast=beat;}
function firePlayerRound(gun,stats){
  const p=state.player;
  if(!p)return;
  playGunshot(gun,{suppressed:modOf(gun)==='suppressor'});
  addShotBeat(gun,stats);
  const fq=freqStats(state.freq);
  {// Per-shot modifiers: RED LINE (damage, size, pierce, burst), HELD BREATH (charged shot), noise (DEAD MIC defers it until the shot's fate is known).
    const missing=Math.max(0,state.maxHealth-state.health),extra={pierce:0,power:1,rageBlast:0};let mult=runStats().damageMult*(1+fq.missingHpDamage*missing);
    if(fq.missingHpDamage>0){extra.power=1+.3*missing;if(fq.ragePierce&&state.health<=2)extra.pierce+=1;if(fq.rageBlast&&state.health<=1)extra.rageBlast=fq.rageBlast;}
    state.heldSilent=false;
    if(fq.heldBreath>0&&state.stillFor>=.6){mult*=1+fq.heldBreath;state.stillFor=0;if(fq.heldPierce)extra.pierce+=9;extra.power=Math.max(extra.power,1.5);view.fx.ring(p.x,p.y,6,26,'#ffd27a',.35,2);view.fx.floater(p.x,p.y-20,fq.heldBreathSilent?'HELD BREATH · SILENT':'HELD BREATH','#ffd27a',13,1);state.heldSilent=fq.heldBreathSilent;}
    state.shotDamageMult=mult;state.shotExtra=extra;
    const sup=modOf(gun)==='suppressor',noise={x:p.x,y:p.y,radius:shotNoiseRadius({mult:stats.noise*fq.noiseMult,silent:state.heldSilent}),kind:sup?'suppressed':'shot'};
    state.shotGroup=fq.quietKill&&noise.radius>0?{n:0,noise,quiet:false,loud:false,flushed:false}:null;
    if(!state.shotGroup)emitNoise(noise.x,noise.y,noise.radius,noise.kind);}
  if(state.quickdrawFor===state.weaponIndex){state.quickdrawFor=-1;state.shotDamageMult*=MOD_BY_ID.get('quickdraw').firstShotMult;view.fx.floater(p.x,p.y-26,'QUICK-DRAW x2','#ffd27a',13,1);}
  const feel=gunFeel(gun),first=registerShot(state.bloom,feel);
  const aim=Math.atan2(state.aim.y,state.aim.x),shell=gun.id==='shotgun'?shotgunShellStats(shellForRun(),stats):null;
  const count=shell?.pellets??gun.count??1,baseSpread=shell?.spread??stats.spread;
  const spread=effectiveSpread(baseSpread,state.bloom,feel,playerMoveRatio(),first);
  // Single rounds: random aim error inside the spread cone. Multi-pellet: an even fan (so the tracers show
  // where the pellets go) with only a small whole-fan wobble; extra pellets of non-shotguns keep their .08 fan.
  const angles=count>1?fanAngles(aim,count,shell?spread:Math.max(spread,(count-1)*.08),(random()-.5)*spread*.18):[aim+(random()-.5)*spread];
  if(gun.lob){const target=view.screenToWorld(input.mouseX,input.mouseY),reach=clamp(distance(p,target),70,stats.range);fireBullet('player',p.x,p.y,Math.cos(aim),Math.sin(aim),gun,1,{lob:true,range:reach});}
  else for(const angle of angles)fireBullet('player',p.x,p.y,Math.cos(angle),Math.sin(angle),gun,1,shell?{damage:shell.damage,range:shell.range}:{});
  if(state.shotGroup&&state.shotGroup.n===0)flushShotNoise(state.shotGroup);
  if(fq.echoCount&&state.health<=2&&!gun.lob)for(let k=1;k<=fq.echoCount;k++)state.echoes.push({t:.2*k,x:p.x,y:p.y,angles,gun,scale:fq.echoDmg,stats});
  const muzzle=muzzlePoint(p.x,p.y,state.aim.x,state.aim.y,gun);
  state.recoil=addRecoil(state.recoil,state.aim.x,state.aim.y,feel.kick);
  state.playerKnock.x-=state.aim.x*feel.nudge;state.playerKnock.y-=state.aim.y*feel.nudge;
  state.shake=Math.max(state.shake,feel.shake);burst(muzzle.x,muzzle.y,0xffd08a,4);
  emit('shot',muzzle.x,muzzle.y,{dx:state.aim.x,dy:state.aim.y,gun:gun.id,pellets:count,kick:feel.kick,shake:feel.shake,spread,first});
}
// DEAD MIC rank 2: the shot's noise is held back until its fate is known. A shot that kills an unaware enemy (and never
// hurts an aware one) is silent; any other shot makes its noise when its last bullet is gone.
function flushShotNoise(group){if(group.flushed)return;group.flushed=true;if(!group.quiet||group.loud)emitNoise(group.noise.x,group.noise.y,group.noise.radius,group.noise.kind);}
function stepEchoes(dt){
  for(let i=state.echoes.length-1;i>=0;i--){const e=state.echoes[i];e.t-=dt;if(e.t>0)continue;state.echoes.splice(i,1);if(!state.player||state.mode!=='play')continue;
    state.shotExtra={pierce:0,power:1,rageBlast:0};for(const angle of e.angles){fireBullet('player',e.x,e.y,Math.cos(angle),Math.sin(angle),e.gun,e.scale,{noShot:true});const b=state.bullets.at(-1);if(b){b.color=0xff7a8a;b.echo=true;b.power=1.25;}}
    view.fx.ring(e.x,e.y,4,18,'#ff7a8a',.3,2);}
}
// SHOVE (shove.js): the melee fallback when both guns are dry, and the way to take a quiet enemy down without a gun.
const RIOT_SHIELD_TURN=1.05;// rad/s: slow enough that circling a riot (or a shove that drops its shield) gets you behind it
function playerShove(){
  const p=state.player;if(!p||state.mode!=='play'||state.peek||state.paused||state.loadoutOpen||state.supplyOpen||state.runModal)return;
  if(!shoveReady(state.realElapsed,state.shoveReadyAt||0))return;
  state.shoveReadyAt=state.realElapsed+SHOVE.cooldown;
  const aim=state.aim,hits=shoveTargets(p,aim,state.enemies,{hitRadius:e=>e.def.hitRadius||(e.type==='brute'?13:11)}),ang=Math.atan2(aim.y,aim.x);
  view.fx.spark(p.x+aim.x*20,p.y+aim.y*20,ang,6,.9,[120,260],'#e8f4ff');view.fx.ring(p.x+aim.x*16,p.y+aim.y*16,6,26,'#e8f4ff',.22,3);
  state.playerKnock.x+=aim.x*SHOVE.lunge;state.playerKnock.y+=aim.y*SHOVE.lunge;
  state.beatBank=addBeat(state.beatBank||0,SHOVE.beat);state.beatPulse=Math.max(state.beatPulse||0,.5);markAction('fire');
  let loud=false;
  for(const {enemy,dir} of hits){
    const out=shoveOutcome({type:enemy.type,hp:enemy.hp,aware:!!enemy.aware,asleep:enemy.posture==='sleep'&&!enemy.aware,elite:!!enemy.elite,facing:enemy.face,dir,shieldFacing:enemy.def.shield?enemy.shieldFacing:null});
    if(out.kind==='ignored'){view.fx.spark(enemy.x,enemy.y,Math.atan2(-dir.y,-dir.x),5,1);continue;}
    if(enemy.type==='boss'){const d=bossDamageFor(enemy,out.damage);loud=true;enemy.stun=0;if(d>0){enemy.hp-=d;view.fx.hitEnemy(enemy,d,dir.x,dir.y,enemy.hp<=0);view.fx.floater(enemy.x,enemy.y-34,out.label,'#ffd27a',14,1.1);state.shake=Math.max(state.shake,3);state.hitstop=Math.max(state.hitstop,.05);if(enemy.hp<=0)killEnemy(enemy,{vx:dir.x*300,vy:dir.y*300,damage:30,owner:'shove'});else playHit();}else view.fx.spark(enemy.x,enemy.y,Math.atan2(-dir.y,-dir.x),5,1);continue;}
    if(out.kind!=='takedown')loud=true;
    enemy.stun=Math.max(enemy.stun||0,out.stagger);enemy.knock.x=dir.x*out.knock;enemy.knock.y=dir.y*out.knock;
    if(out.kind==='blocked'){enemy.shieldFlash=.28;playShieldBlock({distance:distance(enemy,p),pan:(enemy.x-p.x)/480});view.fx.spark(enemy.x-dir.x*8,enemy.y-dir.y*8,Math.atan2(-dir.y,-dir.x),6,1);view.fx.floater(enemy.x,enemy.y-26,out.label,'#bfd4e4',14,1.1);state.shake=Math.max(state.shake,3);continue;}
    enemy.hp-=out.damage;view.fx.hitEnemy(enemy,out.damage,dir.x,dir.y,enemy.hp<=0);
    if(out.label)view.fx.floater(enemy.x,enemy.y-30,out.label,out.kind==='takedown'?'#b49bff':'#ffd27a',out.kind==='takedown'?20:14,1.2);
    state.shake=Math.max(state.shake,3);state.hitstop=Math.max(state.hitstop,.05);
    if(enemy.hp<=0)killEnemy(enemy,{vx:dir.x*300,vy:dir.y*300,damage:30,owner:'shove'});else playHit();
    if(out.kind==='takedown'){state.takedowns=(state.takedowns||0)+1;}
  }
  if(loud)emitNoise(p.x,p.y,SHOVE.noise*freqStats(state.freq).noiseMult,'shove');
  if(!hits.length)playFootstep();
}
function startReload(){
  const gun=GUNS[state.weaponIndex],ammo=state.weaponAmmo[state.weaponIndex];
  state.reloadTimer=state.reloadTotal=reloadTime(reloadDuration(gun),ammo);state.weaponBurst=null;
  state.beatBank=addBeat(state.beatBank||0,TIME_RULE.beat.reload);state.beatPulse=Math.max(state.beatPulse||0,.6);
  playReload();emit('reloadStart',state.player.x,state.player.y,{gun:gun.id,duration:state.reloadTotal,empty:ammo<=0});
  const fsb=freqStats(state.freq),bloom=fsb.smokeReload;if(bloom>0){const item={...throwableById('smoke'),radius:bloom,duration:fsb.smokeTime};state.effects.push({id:'smoke',item,x:state.player.x,y:state.player.y,remaining:fsb.smokeTime,elapsed:0,nextTick:0});view.fx.explode('smoke',state.player.x,state.player.y,bloom);}
}
function notifyReady(key,gap){return cooldownReady(state.notify,key,performance.now()/1000,gap);}
function supplyCtx(){const gi=state.weaponIndex,g=GUNS[gi],low=ammoStatus({mag:state.weaponAmmo[gi],reserve:state.reserveAmmo[gi],magSize:magSize(g)})!=='ok'||state.weaponSlots.some(i=>ammoStatus({mag:state.weaponAmmo[i],reserve:state.reserveAmmo[i],magSize:magSize(GUNS[i])})==='dry');return {health:state.health,maxHealth:state.maxHealth,ammoLow:low,armorUseful:!(state.maxArmor>0&&state.armor>=state.maxArmor)};}
function rollSupplyDrop(source,x,y){const kind=supplyDrop(random(),source,supplyCtx());if(!kind)return;dropPickup(kind,x,y,kind==='ammo'?(source==='crate'?.4:.3):1);}
function playerShoot(){
  const p=state.player;if(!p||state.reloadTimer>0||state.weaponBurst)return;
  if(state.weaponAmmo[state.weaponIndex]<=0){
    if(state.reserveAmmo[state.weaponIndex]>0){startReload();if(notifyReady('reload',1.5))toast('RELOADING',750);}
    else{
      const next=nextLoadedSlot(state.weaponSlots,state.activeSlot,state.weaponAmmo,state.reserveAmmo);
      if(next>=0){switchWeapon(next);state.fireCooldown=Math.max(state.fireCooldown,state.realElapsed+.12);playUiClick();kn.autoSwapped=true;pushFeed(`SWAPPED TO ${GUNS[state.weaponIndex].name} · OUT OF AMMO`,'warn');}
      else if(state.dryTimer<=0){state.dryTimer=.35;emit('empty',p.x,p.y,{gun:GUNS[state.weaponIndex].id,dry:true});playEmptyClick();if(notifyReady('dry',2.5))toast(`NO AMMO · SHOVE [${keyLabel(binding('shove'))}] · THE NEXT KILL DROPS AMMO`,2200);}
    }
    return;
  }
  const weaponIndex=state.weaponIndex,gun=GUNS[weaponIndex],stats=weaponStats(gun,modOf(gun)),now=state.realElapsed;if(now<state.fireCooldown)return;
  state.pressUntil=-1;state.fireCooldown=nextFireTime(now,state.fireCooldown,stats.fireRate,state.frameDt||1/60);state.weaponAmmo[weaponIndex]--;firePlayerRound(gun,stats);
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
  state.objTimer-=dt;if(state.objTimer<=0){state.objTimer=.2;updateObjective();state.doorMarkers=signalOn()?signalMarkers():doorPreviews({rooms:state.rooms,doors:state.doors,links:state.doorLinks,currentRoom:state.currentRoom}).map(m=>({...m,info:m.info}));}
}
function updateObjective(){
  const el=$('objective');if(!el||!state.player)return;
  if(signalOn()){const t=`SIGNAL CHECK · ${state.signal.room+1} / 5`;if(el.textContent!==t)el.textContent=t;el.dataset.tone='seek';return;}
  const route=state.rooms.filter((r,i)=>r.branch!==true&&roomHasLivingEnemies(i,state.enemies));
  const exit=state.pickups.find(p=>p.kind==='exit'&&p.available),routeHostiles=state.enemies.filter(e=>e.alive&&state.rooms[e.roomIndex]?.branch!==true).length;
  const o=objectiveText({routeRoomsLeft:route.length,routeHostiles,here:state.enemies.filter(e=>e.alive&&e.roomIndex===state.currentRoom).length,exitReady:routeHostiles===0,exitMeters:exit?distance(state.player,exit)/TILE:null});
  if(el.textContent!==o.text){const had=el.textContent;el.textContent=o.text;if(had)flashEl(el);}if(el.dataset.tone!==o.tone)el.dataset.tone=o.tone;
}
function updateWeaponBurst(){
  if(!state.weaponBurst)return;
  const weaponIndex=state.weaponIndex,ammo=state.weaponAmmo[weaponIndex];
  const result=advanceWeaponBurst(state.weaponBurst,{weaponIndex,now:state.realElapsed,ammo});
  state.weaponBurst=result.burst;
  if(!result.shots)return;
  const gun=GUNS[weaponIndex],stats=weaponStats(gun,modOf(gun));
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

// The guaranteed dry-ammo drop must never be lost in a wall: try the corpse, then points toward the player, then the player's feet.
function dropAmmoNear(enemy){
  const p=state.player;
  for(const t of [0,.35,.7,1]){const x=enemy.x+(p.x-enemy.x)*t,y=enemy.y+(p.y-enemy.y)*t;if(dropPickup('ammo',x,y,DRY_DROP_VALUE))return;}
}
function killEnemy(enemy,bullet){
  if(!enemy.alive)return;enemy.alive=false;enemy.corpseTimer=enemy.type==='boss'?1.3:3.5;enemy.aimTimer=0;enemy.meleeWindup=0;for(let i=0;i<enemy.body.numColliders();i++)enemy.body.collider(i).setEnabled(false);{const bl=Math.hypot(bullet.vx,bullet.vy)||1,kv=enemyKnockback((bullet.damage||0)*1.6,enemy.type)*1.4;enemy.body.setLinvel({x:bullet.vx/bl*kv,y:bullet.vy/bl*kv},true);}enemy.hp=0;
  view.fx.kill(enemy,bullet.vx,bullet.vy);
  state.kills++;pushFeed(`DOWNED · ${enemy.def.name}`,'kill');state.scrap+=scrapGain(6+Math.floor(random()*8));state.shake=Math.max(state.shake,3.8);state.hitstop=Math.max(state.hitstop,hitstopFor({kill:true,damage:bullet.damage||0}));burst(enemy.x,enemy.y,enemy.def.color,17,1.4);{const bl=Math.hypot(bullet.vx,bullet.vy)||1;emit('kill',enemy.x,enemy.y,{dx:bullet.vx/bl,dy:bullet.vy/bl,damage:bullet.damage||0,enemyType:enemy.type});}
  if(!signalOn()){if(random()<.2)dropPickup(random()<.55?'scrap':'mod',enemy.x,enemy.y,12+Math.floor(random()*10));
  if(isAllDry(state.weaponSlots,state.weaponAmmo,state.reserveAmmo)){dropAmmoNear(enemy);pushFeed('OUT OF AMMO · AMMO DROPPED','loot');}else rollSupplyDrop('kill',enemy.x+rand(-10,10),enemy.y+rand(-10,10));}
  playKill();onEnemyKilled(enemy,bullet);hud();checkRoomClear();
}
function hitPlayer(damage,x,y,srcAng=null,srcName=null){const before=state.health+state.armor,wasPlay=state.mode==='play'&&state.invuln<=0;hitPlayerBase(damage,x,y,srcAng,srcName);if(wasPlay&&state.health+state.armor<before)onPlayerDamaged();}
function hitPlayerBase(damage,x,y,srcAng=null,srcName=null){
  if(state.invuln>0||state.mode!=='play')return;if(srcName)state.lastHitBy=srcName;
  {const p=state.player;if(p){(state.hitIndicators??=[]);registerHitIndicator(state.hitIndicators,srcAng??Math.atan2(y-p.y,x-p.x),damage>1?1.25:1);}}
  const impact=absorbArmorDamage(state.armor,damage);state.armor=impact.armor;state.health=Math.max(0,state.health-impact.healthDamage);state.invuln=.85;state.calmTimer=0;pulseHurt();state.shake=impact.healthDamage>0?5.5:2.8;state.hitstop=Math.max(state.hitstop,.1);(impact.healthDamage>0?playPlayerHurt:playArmorHit)();markAction();emit('playerHurt',state.player.x,state.player.y,{damage:damage,armorOnly:impact.healthDamage===0,health:state.health,sx:x,sy:y});burst(state.player.x,state.player.y,impact.healthDamage>0?0xff4e63:0x75cfe0,12,1.1);
  const message=impact.healthDamage===0?state.armor===0?'PLATE BROKEN · HEALTH HELD':`PLATE HIT · ${state.armor} LEFT`:impact.absorbed>0?'PLATE HIT · VITALS DAMAGED':damage>1?'BRUTAL HIT':'YOU GOT TAGGED';toast(message,900);hud();
  {const kn=playerHitKnock(state.player.x-x,state.player.y-y,impact.healthDamage);state.playerKnock.x+=kn.x;state.playerKnock.y+=kn.y;}
  if(state.health<=0){if(signalOn()){signalRoomFail();return;}finishRun('dead');$('vignette').style.background='radial-gradient(ellipse,rgba(95,15,30,.25),rgba(10,6,13,.85))';}
}
function reload(){const gun=GUNS[state.weaponIndex];if(!state.player||state.weaponBurst||state.reloadTimer>0||state.weaponAmmo[state.weaponIndex]>=magSize(gun)||state.reserveAmmo[state.weaponIndex]<=0)return;startReload();toast('RELOADING',700);}
function switchWeapon(slot){if(slot<0||slot>=state.weaponSlots.length)return;if(slot===state.activeSlot)return;if(state.reloadTimer>0&&state.player){emit('reloadEnd',state.player.x,state.player.y,{gun:GUNS[state.weaponIndex].id,cancelled:true});}state.weaponBurst=null;state.reloadTimer=0;state.activeSlot=slot;state.bloom=newBloom();beginDraw();markAction();hud();}
function cycleShotgunShell(){if(state.mode!=='play'||GUNS[state.weaponIndex].id!=='shotgun')return;const index=SHOTGUN_SHELLS.findIndex(shell=>shell.id===state.shotgunShellId);state.shotgunShellId=SHOTGUN_SHELLS[(index+1)%SHOTGUN_SHELLS.length].id;hud();toast(`${shellForRun().name} · ${shellForRun().description}`);markAction();}
function equipWeapon(index){const slot=state.weaponSlots.indexOf(index);if(slot>=0)switchWeapon(slot);}
// Drawing a gun costs world time (swapSeconds): instant with QUICK-DRAW, slower on every gun with a third slot.
function beginDraw(){
  const gun=GUNS[state.weaponIndex],seconds=swapSeconds(gun,modOf(gun),maxWeaponSlots());
  state.swapUntil=state.realElapsed+seconds;state.fireCooldown=Math.max(state.fireCooldown,state.realElapsed+seconds);
  state.quickdrawFor=modOf(gun)==='quickdraw'?state.weaponIndex:-1;
}
// Drop a gun or mod on the floor at your feet (nudged off the wall) so a swap can always be swapped back.
function dropNearPlayer(kind,extra){
  const p=state.player;if(!p)return null;
  const ax=state.aim.x,ay=state.aim.y;
  for(const [dx,dy] of [[-ax,-ay],[ay,-ax],[-ay,ax],[ax,ay],[0,0]]){const pk=dropPickup(kind,p.x+dx*22,p.y+dy*22,0,state.currentRoom,extra);if(pk)return pk;}
  return null;
}
/** Take a gun: free slot adds it, full hands swap with the gun in hand (which drops where you stand). */
function takeGunIndex(index){kn.gunPickup=true;
  const plan=gunPickupPlan(state.weaponSlots,index,maxWeaponSlots(),state.activeSlot);if(!plan)return null;
  const gun=GUNS[index],old=plan.replaces!=null?GUNS[plan.replaces]:null;
  if(old){if(state.reloadTimer>0&&state.player)emit('reloadEnd',state.player.x,state.player.y,{gun:old.id,cancelled:true});dropNearPlayer('gun',{gunIndex:plan.replaces});}
  state.weaponSlots=state.weaponSlots.slice();state.weaponSlots[plan.slot]=index;state.activeSlot=plan.slot;state.weaponBurst=null;state.reloadTimer=0;state.bloom=newBloom();
  // A gun you have never held this run arrives with a fresh magazine; one you dropped and re-take keeps what it had.
  if(!state.gunTouched.has(index)){state.gunTouched.add(index);state.weaponAmmo[index]=magSize(gun);state.reserveAmmo[index]=Math.min(gun.reserve,state.reserveAmmo[index]+gun.mag);}
  beginDraw();
  toast(old?`${gun.name} · ${gun.verb} · REPLACED ${old.name}`:`${gun.name} · ${gun.verb} · ${weaponSlotLabel(plan.slot)}`);hud();renderLoadout();
  return {gun,old};
}
function takeGunPickup(pickup){
  const result=takeGunIndex(pickup.gunIndex);if(!result)return false;
  pickup.available=false;view.fx.pickup(pickup.x,pickup.y,pickup.color);playPickup('gun');return true;
}
/** Fit a mod on the gun in hand. The old mod (if any) drops at your feet, so swapping a mod is a choice you can undo. */
function fitMod(modId){
  const index=state.weaponIndex,gun=GUNS[index],mod=MOD_BY_ID.get(modId);
  if(!mod)return false;
  if(!modFits(gun,modId)){toast(`${mod.name} DOES NOT FIT ${gun.name}`);return false;}
  const old=modOf(gun);if(old===modId)return false;
  const before=magSize(gun);state.gunMods[gun.id]=modId;const after=magSize(gun);
  state.weaponAmmo[index]=Math.min(after,state.weaponAmmo[index]+Math.max(0,after-before));
  if(old)dropNearPlayer('mod',{modId:old});
  toast(`${mod.name} FITTED · ${gun.name}${old?` · ${MOD_BY_ID.get(old).name} DROPPED`:''}`);hud();return true;
}
function collect(pickup,manual=false){if(!pickup.available)return false;const d=distance(state.player,pickup);if(!manual&&d>28)return false;
  if(pickup.kind==='supply'){if(manual&&!pickup.claimed)openSupply(pickup);return false;}
  if(pickup.kind==='gun'){return manual?takeGunPickup(pickup):false;}
  if(pickup.kind==='mod'){if(!manual||!fitMod(pickup.modId))return false;pickup.available=false;view.fx.pickup(pickup.x,pickup.y,pickup.color);playPickup('mod');return true;}
  if(pickup.kind==='heal'&&state.health>=state.maxHealth)return false;
  if(pickup.kind==='armor'&&state.maxArmor>0&&state.armor>=state.maxArmor)return false;
  let ammoSlot=-1;
  if(pickup.kind==='ammo'){const order=[state.activeSlot,...state.weaponSlots.map((_,i)=>i).filter(i=>i!==state.activeSlot)];ammoSlot=order.find(i=>state.reserveAmmo[state.weaponSlots[i]]<GUNS[state.weaponSlots[i]].reserve);if(ammoSlot===undefined){if(notifyReady('ammofull',3))toast('AMMO FULL · KEEP IT FOR LATER',900);return false;}}
  pickup.available=false;kn.pick(pickup.kind);view.fx.pickup(pickup.x,pickup.y,pickup.color);
  switch(pickup.kind){
    case'ammo':{const gi=state.weaponSlots[ammoSlot],g=GUNS[gi],add=Math.min(g.reserve-state.reserveAmmo[gi],ammoPickupRounds(g.reserve,pickup.value||.2));state.reserveAmmo[gi]+=add;view.fx.floater(pickup.x,pickup.y-8,collectPopup('ammo',add),'#8fe0ff',14,1.1);toast(`+${add} AMMO · ${g.name}`);break;}
    case'armor':{const plate=GEAR.find(item=>item.id==='armor');if(state.maxArmor===0){state.gear='armor';state.maxArmor=plate.armorDurability;state.armor=plate.armorDurability;view.fx.floater(pickup.x,pickup.y-8,'ARMOR PLATE','#75cfe0',14,1.1);toast(`ARMOR PLATE · ABSORBS ${plate.armorDurability} DAMAGE`);}else{state.armor=Math.min(state.maxArmor,state.armor+1);view.fx.floater(pickup.x,pickup.y-8,'+1 PLATE','#75cfe0',14,1.1);toast('ARMOR PLATE PATCHED · +1');}break;}
    case'scrap':state.scrap+=scrapGain(pickup.value||12);view.fx.floater(pickup.x,pickup.y-8,collectPopup('scrap',pickup.value||12),'#ffd27a',13,1);toast(`+${pickup.value||12} SCRAP`);break;
    case'heal':{const amt=pickup.value||2,got=Math.min(amt,state.maxHealth-state.health);state.health+=got;view.fx.floater(pickup.x,pickup.y-8,collectPopup('heal',got),'#74dfab',15,1.1);toast(`PATCHED UP · +${got} VITALS`);break;}
    case'freq':openFreqPick(pickup.elite?'elite':'door');break;
    case'exit':if(hasUnclearedRouteEnemies(state.rooms,state.enemies)){toast('CLEAR THE MAIN ROUTE FIRST');pickup.available=true;return false;}reachExit();break;
  }if(!pickup.available){if(pickup.kind!=='exit')playPickup(pickup.kind);}hud();return true;
}
/* ---------- SUPPLY DROP: one pickup, three visible options, take one (replaces merchant, locker and cache) */
function supplyContext(){return {scrap:state.scrap,ammoNeed:state.weaponSlots.some(i=>state.weaponAmmo[i]<magSize(GUNS[i])||state.reserveAmmo[i]<GUNS[i].reserve),health:state.health,maxHealth:state.maxHealth,activeModId:modOf(GUNS[state.weaponIndex]),hasGunInHand:true};}
function renderSupply(){
  const pickup=state.supplyPickup;if(!pickup?.offers)return;
  const ctx=supplyContext(),hand=GUNS[state.weaponIndex],full=state.weaponSlots.length>=maxWeaponSlots();
  $('supply-options').innerHTML=pickup.offers.map((offer,i)=>{
    const status=offerStatus(offer,ctx),card=offerCard(offer,{activeGun:hand,activeModId:ctx.activeModId,handGun:full?hand:null});
    const icon=offer.kind==='gun'?gunIcon(GUNS[offer.gunIndex],'gun-ico md'):strokeIcon(card.icon,'ico big');
    return `<div class="merchant-row cache-row ${offer.kind} ${status.ok?'':'poor'}" data-kind="${offer.kind}"><div class="mr-icon">${icon}</div><span><strong>${keycap(String(i+1))} ${card.title}</strong><small>${card.text}</small>${status.ok?'':`<span class="why">${status.reason}</span>`}</span><button data-supply="${i}" ${status.ok?'':'disabled'}>${status.ok?(offer.cost?costHtml(offer.cost):'TAKE'):'UNAVAILABLE'}</button></div>`;
  }).join('');
}
function openSupply(pickup){
  if(roomHasLivingEnemies(pickup.roomIndex,state.enemies)){toast('CLEAR THE ROOM FIRST');return;}
  if(!pickup.offers){
    const ctx=supplyContext();
    pickup.offers=supplyOffers({rng:random,ammoNeed:ctx.ammoNeed,health:state.health,maxHealth:state.maxHealth,gunCandidates:possiblePickupGuns(),activeGun:GUNS[state.weaponIndex],activeModId:ctx.activeModId,luckyFindLevel:runStats().luckyFindLevel});
    if(interferenceStats(state.progress).noHeals)pickup.offers=pickup.offers.map(offer=>offer.kind==='heal'?{slot:'sustain',kind:'ammo',cost:0}:offer);
  }
  state.supplyPickup=pickup;state.supplyOpen=true;input.keys.clear();input.firing=false;renderSupply();$('supply-panel').hidden=false;$('supply-panel').setAttribute('aria-hidden','false');$('close-supply').focus();
}
function closeSupply(){dialogClosedAt=performance.now();state.supplyOpen=false;state.supplyPickup=null;input.keys.clear();input.firing=false;$('supply-panel').hidden=true;$('supply-panel').setAttribute('aria-hidden','true');view.canvas.focus();}
function takeSupply(index){
  const pickup=state.supplyPickup,offer=pickup?.offers?.[index];if(!offer)return;
  const status=offerStatus(offer,supplyContext());if(!status.ok){toast(status.reason||'NOT AVAILABLE');return;}
  if(offer.kind==='ammo'){for(const gi of state.weaponSlots){state.weaponAmmo[gi]=magSize(GUNS[gi]);state.reserveAmmo[gi]=GUNS[gi].reserve;}toast('SUPPLY DROP · EVERY GUN RESTOCKED');view.fx.floater(pickup.x,pickup.y-10,'AMMO RESTOCKED','#8fe0ff',14,1.2);}
  else if(offer.kind==='heal'){const healed=Math.min(SUPPLY_MEDKIT_HP,state.maxHealth-state.health);state.health+=healed;toast(`SUPPLY DROP · +${healed} HEALTH`);view.fx.floater(pickup.x,pickup.y-10,collectPopup('heal',healed),'#74dfab',15,1.2);}
  else if(offer.kind==='mod'){if(!fitMod(offer.modId))return;}
  else if(offer.kind==='gun'){if(!takeGunIndex(offer.gunIndex))return;}
  else if(offer.kind==='freq'){state.scrap-=offer.cost;pickup.claimed=true;view.fx.pickup(pickup.x,pickup.y,pickup.color);playPickup('cache');closeSupply();hud();openFreqPick('supply');return;}
  pickup.claimed=true;view.fx.pickup(pickup.x,pickup.y,pickup.color);playPickup('cache');closeSupply();hud();
}
function finishRun(result,cause){if(state.paidOut)return;finishRunImpl(result,cause);}
function winRun(){finishRun('won');}
/* ============================================================ macro loop: floors, decisions, frequencies, run end */
const bossApi={speedRatio:()=>playerSpeedRatio(),playerDry:()=>isAllDry(state.weaponSlots,state.weaponAmmo,state.reserveAmmo)||state.weaponSlots.reduce((n,i)=>n+state.weaponAmmo[i]+state.reserveAmmo[i],0)<=14,musicBeat:()=>getMusicBeat(),get state(){return state;},get fx(){return view.fx;},spawnEnemy,findEnemySpawn,fireBullet,hitPlayer:(damage,x,y)=>{state.lastHitType='boss';state.lastHitKind='boss';hitPlayer(damage,x,y,null,'THE CONDUCTOR');},dropPickup,freeRoomPoint,random,toast,banner:(title,sub)=>showBanner(title,sub,'room'),feed:pushFeed,removeBody:body=>physics.removeRigidBody(body),onBossBar:setBossBar};
const scrapGain=amount=>Math.max(1,Math.round(amount*interferenceStats(state.progress).scrapMult));
function setBossBar(init,e){
  const bar=$('boss-bar');if(!bar)return;
  if(init){bar.innerHTML=bossBarHtml(BOSS.name,e.boss.phase);bar.hidden=false;}
  if(bar.hidden)return;
  const fill=$('boss-fill'),ghost=$('boss-ghost');if(!fill)return;
  fill.style.width=`${Math.max(0,e.hp/e.maxHp*100)}%`;ghost.style.width=`${Math.max(0,(e.shownHp??e.hp)/e.maxHp*100)}%`;
  bar.dataset.phase=String(e.boss.phase);bar.classList.toggle('exposed',e.boss.exposed>0);bar.classList.toggle('shielded',!!e.boss.invuln);
  const label=bar.querySelector('.boss-name small'),text=`FLOOR ${FINAL_FLOOR} · PHASE ${['','I','II · TEMPO','III · BEATDROP'][e.boss.phase]}`;if(label&&label.textContent!==text)label.textContent=text;
}
function trackRunClock(dt){
  state.timeCredit=Math.max(0,state.timeCredit-dt);state.freezeT=Math.max(0,(state.freezeT||0)-dt);
  const moving=playerSpeedRatio()>TIME_RULE.deadSpeed;state.stillFor=moving?0:state.stillFor+dt;
  if(moving){state.slowKills=0;state.tripleFlag=false;}
  const p=state.player;if(p){if(state.lastPos)state.roomMove+=Math.hypot(p.x-state.lastPos.x,p.y-state.lastPos.y);state.lastPos={x:p.x,y:p.y};}
}
// A shockwave ring (DEAD CHANNEL, BACKLASH, BORROWED PULSE): jams enemies in reach, optionally erases enemy bullets and shoves.
function stunBurst(x,y,radius,seconds,{wipe=false,knock=false,color='#9ad8ff'}={}){
  view.fx.pickup(x,y,color);view.fx.ring(x,y,8,radius,color,.45,3);view.fx.ring(x,y,4,radius*.6,'#ffffff',.3,2);
  for(const other of state.enemies){if(!other.alive||other.type==='boss')continue;const d=Math.hypot(other.x-x,other.y-y);if(d>=radius)continue;other.stun=Math.max(other.stun||0,seconds);if(knock){const dx=other.x-x,dy=other.y-y,l=Math.hypot(dx,dy)||1;other.knock.x+=dx/l*150;other.knock.y+=dy/l*150;}}
  if(wipe)for(let i=state.bullets.length-1;i>=0;i--){const bl=state.bullets[i];if(bl.owner==='enemy'&&Math.hypot(bl.x-x,bl.y-y)<radius){view.fx.spark(bl.x,bl.y,0,4,Math.PI,[40,140],color);removeBullet(i);}}
}
// Jammed enemies cannot shoot and their bullets in the air vanish (JAMMER).
function jamEnemy(enemy,seconds,{splash=0,fromFreq=true}={}){
  if(!enemy.alive||enemy.type==='boss'||seconds<=0)return;
  const wasJammed=enemy.stun>.2;enemy.stun=Math.max(enemy.stun||0,seconds);
  if(!wasJammed)view.fx.floater(enemy.x,enemy.y-20,'JAMMED','#9ad8ff',11,.8);
  for(let i=state.bullets.length-1;i>=0;i--){const bl=state.bullets[i];if(bl.owner==='enemy'&&bl.enemyId===enemy.id){view.fx.spark(bl.x,bl.y,0,4,Math.PI,[40,140],'#9ad8ff');removeBullet(i);}}
  if(splash>0)for(const other of state.enemies)if(other.alive&&other!==enemy&&other.type!=='boss'&&Math.hypot(other.x-enemy.x,other.y-enemy.y)<splash&&!lineBlocked(enemy.x,enemy.y,other.x,other.y)){other.stun=Math.max(other.stun||0,seconds*.5);view.fx.bolt(enemy.x,enemy.y,other.x,other.y,'#9ad8ff',.25,1.6);}
}
function bubbleZapped(b){const f=freqStats(state.freq),p=state.player;return f.bubbleZap>0&&p&&Math.hypot(b.x-p.x,b.y-p.y)<f.bubbleZap;}
function bubbleFactor(b){const f=freqStats(state.freq),p=state.player;if(!(f.bubble>0)||!p)return 1;const d=Math.hypot(b.x-p.x,b.y-p.y);return d<f.bubble?f.bubbleSlow:1;}
function steerBullet(b,dt){
  let best=null,bestScore=Infinity;const heading=Math.atan2(b.vy,b.vx);
  for(const e of state.enemies){if(!e.alive)continue;const dx=e.x-b.x,dy=e.y-b.y,d=Math.hypot(dx,dy);if(d>(b.homingRange||280)||d<8)continue;let diff=Math.atan2(dy,dx)-heading;while(diff>Math.PI)diff-=TAU;while(diff<-Math.PI)diff+=TAU;if(Math.abs(diff)>.75)continue;if(d<bestScore){bestScore=d;best={diff};}}
  if(!best)return;const turn=Math.sign(best.diff)*Math.min(Math.abs(best.diff),b.homing*dt),speed=Math.hypot(b.vx,b.vy),a=heading+turn;b.vx=Math.cos(a)*speed;b.vy=Math.sin(a)*speed;
}
// Burning (INCENDIARY mod, KINDLING frequency): damage over time in world time, and the target panics: it cannot aim
// or shoot, and runs a jittery path instead of its plan. Bosses are immune.
function igniteEnemy(enemy,seconds,dps){
  if(!enemy.alive||enemy.type==='boss')return;
  if(!enemy.burn)view.fx.floater(enemy.x,enemy.y-18,'ON FIRE','#ff9a50',12,1);
  enemy.burn={t:Math.max(seconds,enemy.burn?.t||0),dps,tick:enemy.burn?.tick??.5,dirT:0,dx:0,dy:0};
}
function burnStep(e,out,dt){
  const b=e.burn;b.t-=dt;b.tick-=dt;b.dirT-=dt;
  if(b.dirT<=0){const a=random()*TAU;b.dx=Math.cos(a);b.dy=Math.sin(a);b.dirT=.35+random()*.35;}
  out.fire=false;out.aiming=false;out.windup=0;out.moveX=b.dx*1.15;out.moveY=b.dy*1.15;
  if(random()<.35)view.fx.flames(e.x,e.y,9);
  if(b.tick<=0){b.tick+=.5;const dmg=b.dps*.5;e.hp-=dmg;view.fx.hitEnemy(e,dmg,0,-1,e.hp<=0);if(e.hp<=0){killEnemy(e,{vx:0,vy:0,damage:dmg});return;}}
  if(b.t<=0)e.burn=null;
}
// The launcher's shell: lands where you aimed (or bursts on a wall) and blasts everything with a clear line to it.
function detonateShell(b){
  const {radius,damage}=b.lob,x=b.x,y=b.y,p=state.player;
  playExplosion({distance:p?distance(b,p):0,pan:p?(x-p.x)/480:0});view.fx.explode('frag',x,y,radius);state.shake=Math.max(state.shake,6.5);
  state.noises.push({x,y,radius:420*freqStats(state.freq).noiseMult});
  for(const enemy of state.enemies){
    if(!enemy.alive)continue;const d=distance({x,y},enemy);if(d>radius||lineBlocked(x,y,enemy.x,enemy.y))continue;
    const dealt=bossDamageFor(enemy,damage*(1-d/radius*.48)*state.shotDamageMult),dx=enemy.x-x,dy=enemy.y-y,len=Math.hypot(dx,dy)||1;
    enemy.hp-=dealt;enemy.stun=Math.max(enemy.stun||0,.3);view.fx.hitEnemy(enemy,dealt,dx,dy,enemy.hp<=0);enemy.knock.x=dx/len*70;enemy.knock.y=dy/len*70;
    if(enemy.hp<=0)killEnemy(enemy,{vx:dx/len*600,vy:dy/len*600,damage:dealt});
  }
  for(const crate of state.crates.slice()){if(distance({x,y},crate)>radius||lineBlocked(x,y,crate.x,crate.y))continue;crate.hp=damageDurability(crate.hp,damage*.8);updateCrateDamageVisual(crate);if(crate.hp===0)breakCrate(crate);}
  if(p&&distance({x,y},p)<radius&&!lineBlocked(x,y,p.x,p.y)){state.lastHitType='self';hitPlayer(1,x,y,null,'your own shell');}
}
function onEnemyKilled(enemy,bullet){
  const f=freqStats(state.freq),unaware=!enemy.aware,p=state.player,mine=bullet?.owner==='player';
  if(f.creditPerKill){state.timeCredit+=f.creditPerKill;view.fx.floater(enemy.x,enemy.y-26,`+${f.creditPerKill} s TIME`,'#ffd27a',12,1);}
  if(f.hangKill&&p&&playerSpeedRatio()<=TIME_RULE.deadSpeed+.04){
    let hung=0;for(const bl of state.bullets)if(bl.owner==='enemy'&&(bl.enemyId===enemy.id||(f.hangAll&&Math.hypot(bl.x-enemy.x,bl.y-enemy.y)<f.hangAll))){bl.hang={until:state.realElapsed+f.hangKill,untilMove:!!f.hangUntilMove};hung++;}
    if(hung){view.fx.ring(enemy.x,enemy.y,6,f.hangAll||48,'#ffd27a',.5,2);view.fx.floater(enemy.x,enemy.y-34,'HANG FIRE','#ffd27a',12,1.1);}
  }
  if(f.shards&&mine&&!bullet.shard){
    const gun=GUNS[state.weaponIndex],near=state.enemies.filter(o=>o.alive&&o!==enemy&&distance(o,enemy)<260).sort((a,c)=>distance(a,enemy)-distance(c,enemy)),base=Math.atan2(bullet.vy,bullet.vx);
    for(let n=0;n<f.shards;n++){const target=near[n%Math.max(1,near.length)],angle=target?Math.atan2(target.y-enemy.y,target.x-enemy.x):base+(n-(f.shards-1)/2)*.6;fireBullet('player',enemy.x,enemy.y,Math.cos(angle),Math.sin(angle),gun,.45,{range:200,noShot:true});const shard=state.bullets.at(-1);if(shard){shard.shard=true;shard.homing=2.5;shard.penetration={enemies:f.shardPierce?1:0,crates:0,walls:0};shard.maxBounces=f.shardBounce?1:0;shard.bounceSeek=0;}}
  }
  if(f.stunKillCredit&&enemy.stun>.25){state.timeCredit+=f.stunKillCredit;view.fx.floater(enemy.x,enemy.y-38,'DEAD AIR +1 s','#9ad8ff',12,1);}
  if(unaware&&mine){
    if(bullet.shot&&f.quietKill){bullet.shot.quiet=true;view.fx.floater(enemy.x,enemy.y-30,'QUIET','#b49bff',12,1);}
    if(f.ammoBack){const gi=state.weaponIndex,max=magSize(GUNS[gi]);if(state.weaponAmmo[gi]<max){state.weaponAmmo[gi]++;view.fx.floater(p.x,p.y-24,'+1 ROUND','#b49bff',12,.9);}}
  }
  if(unaware&&f.unawareHeal&&state.health<=state.maxHealth/2&&state.health<state.maxHealth){state.health++;view.fx.floater(enemy.x,enemy.y-28,'DEAD DROP +1','#74dfab',13,1.1);}
  if(f.pulse)stunBurst(enemy.x,enemy.y,f.pulse,1,{wipe:!!f.pulseWipe,knock:!!f.pulseKnock});
  if(f.lowPulse&&state.health<=2){stunBurst(enemy.x,enemy.y,f.lowPulse,1,{color:'#ff7a8a'});view.fx.floater(enemy.x,enemy.y-34,'BORROWED PULSE','#ff7a8a',12,1);}
  if(f.burnKill){for(const other of state.enemies)if(other.alive&&other!==enemy&&distance(other,enemy)<f.burnKill&&!lineBlocked(enemy.x,enemy.y,other.x,other.y))igniteEnemy(other,3,7);}
  if(state.timeScaleTarget<.2&&enemy.type!=='boss'){state.slowKills++;if(state.slowKills>=3&&!state.tripleFlag){state.tripleFlag=true;state.slowTriples++;toast('THREE IN ONE BREATH',1600);pushFeed('THREE IN ONE BREATH','good');}}
  if(enemy.type==='boss')onBossKilled(enemy);
}
function onPlayerDamaged(){
  kn.hits++;state.floorHit=true;const f=freqStats(state.freq),p=state.player;
  if(f.hitCredit){state.timeCredit+=f.hitCredit;if(p)view.fx.floater(p.x,p.y-26,`+${f.hitCredit} s TIME`,'#ffd27a',12,1);}
  if(f.hitPulse&&p){stunBurst(p.x,p.y,f.hitPulse,1.2,{wipe:!!f.hitWipe,knock:!!f.hitKnock,color:'#ff7a8a'});view.fx.floater(p.x,p.y-34,'BACKLASH','#ff7a8a',12,1);}
}
function playerHitDamage(b,enemy){
  if(b.owner!=='player')return b.damage;
  const f=freqStats(state.freq);let dmg=b.damage;
  {const snap=b.sneak?.get(enemy),mod=damageModifier({type:enemy.type,aware:!snap&&!!enemy.aware,asleep:!!snap?.asleep,facing:snap??enemy.face,bulletDir:{x:b.vx,y:b.vy},bruteRecovering:enemy.type==='brute'&&(enemy.meleeCooldown>0||enemy.ai?.brute?.phase==='recover')});
    if(mod.mult>1){if(mod.label==='SILENT')kn.silentHit=true;dmg*=mod.mult;view.fx.floater(enemy.x,enemy.y-30,mod.label,mod.label==='SILENT'?'#b49bff':'#ffd27a',mod.label==='SILENT'?26:22,1.2);}}
  if(!enemy.aware&&enemy.type!=='boss'){dmg*=1+f.unawareDamage;if(f.ambush&&!['brute','riot','boss'].includes(enemy.type)&&!enemy.elite&&dmg<enemy.hp){dmg=enemy.hp+1;view.fx.floater(enemy.x,enemy.y-34,'AMBUSH','#b49bff',13,1);}}
  if((b.bounces||0)>0)dmg*=1+f.bounceDamage;
  return bossDamageFor(enemy,dmg);
}
function playerStunBonus(enemy){const f=freqStats(state.freq);return enemy.type==='boss'?0:f.jam*(!enemy.aware?f.unawareStunMult:1);}
const ARC_RANGE=128;
// A lightning bolt from `from` to the nearest unvisited enemy in reach and line of sight. Returns the struck enemy (or null).
function arcStrike(from,damage,visited,{stun=0,color='#9ad8ff'}={}){
  const target=state.enemies.filter(o=>o.alive&&o.type!=='boss'&&!visited.has(o)&&distance(o,from)<ARC_RANGE&&!lineBlocked(from.x,from.y,o.x,o.y)).sort((a,c)=>distance(a,from)-distance(c,from))[0];
  if(!target)return null;
  visited.add(target);target.hp-=damage;target.stun=Math.max(target.stun||0,.3+stun);
  view.fx.bolt(from.x,from.y,target.x,target.y,color);view.fx.hitEnemy(target,damage,target.x-from.x,target.y-from.y,target.hp<=0);view.fx.spark(target.x,target.y,Math.atan2(target.y-from.y,target.x-from.x),7,1.2,undefined,color);playHit();
  if(stun>0)jamEnemy(target,stun);
  if(target.hp<=0)killEnemy(target,{vx:target.x-from.x,vy:target.y-from.y,damage});
  return target;
}
function afterPlayerHit(b,enemy,dealt){
  if(enemy.type==='boss'&&dealt===0)view.fx.spark(b.x,b.y,Math.atan2(-b.vy,-b.vx),5,1);
  if(b.owner!=='player')return;
  const f=freqStats(state.freq);
  if(f.jam>0&&enemy.type!=='boss'&&enemy.hp>0)jamEnemy(enemy,f.jam*(!enemy.aware?f.unawareStunMult:1),{splash:f.jamSplash});
  if(b.rageBlast&&!b.blasted){b.blasted=true;view.fx.explode('incendiary',enemy.x,enemy.y,b.rageBlast);view.fx.ring(enemy.x,enemy.y,6,b.rageBlast*1.3,'#ff7a8a',.35,3);
    for(const o of state.enemies)if(o.alive&&o!==enemy&&o.type!=='boss'&&distance(o,enemy)<b.rageBlast*1.3){o.hp-=dealt*.5;view.fx.hitEnemy(o,dealt*.5,o.x-enemy.x,o.y-enemy.y,o.hp<=0);if(o.hp<=0)killEnemy(o,{vx:o.x-enemy.x,vy:o.y-enemy.y,damage:dealt*.5});}}
  if(!f.chain)return;
  let from=enemy;const visited=new Set([enemy]);
  for(let hop=0;hop<f.chainTargets;hop++){const hit=arcStrike(from,dealt*f.chain,visited,{stun:f.arcStun});if(!hit)break;from=hit;}
}
function ricochetBullet(b,previous){
  const sx=Math.sign(b.vx),sy=Math.sign(b.vy),solid=(x,y)=>state.solidMap[Math.floor(y/TILE)]?.[Math.floor(x/TILE)]!==0;
  const hitX=solid(b.x+sx*5,b.y),hitY=solid(b.x,b.y+sy*5);
  if(hitX||!hitY)b.vx=-b.vx;if(hitY||!hitX)b.vy=-b.vy;
  b.x=previous.x;b.y=previous.y;b.insideWall=false;b.bounces=(b.bounces||0)+1;b.life=Math.max(b.life,.25);
  view.fx.spark(b.x,b.y,Math.atan2(b.vy,b.vx),5,1);
  const f=freqStats(state.freq);
  if(b.bounceSeek){// MULTIPATH: the bounce bends toward the nearest enemy it can see
    const t=state.enemies.filter(o=>o.alive&&!b.hitEnemies.has(o)&&distance(o,b)<300&&!lineBlocked(b.x,b.y,o.x,o.y)).sort((a,c)=>distance(a,b)-distance(c,b))[0];
    if(t){const sp=Math.hypot(b.vx,b.vy),a=Math.atan2(t.y-b.y,t.x-b.x);b.vx=Math.cos(a)*sp;b.vy=Math.sin(a)*sp;view.fx.ring(b.x,b.y,3,14,'#74dfab',.25,2);}
  }
  if(f.bounceDamage>0)b.color=0xff5a68;
  if(f.bounceArc){const hit=arcStrike(b,b.damage*.5,new Set(),{color:'#74dfab'});if(hit)view.fx.floater(b.x,b.y-14,'SIGNAL BOOST','#9ad8ff',11,.8);}
  return true;
}
// The boss-death moment: the world nearly stops, he shatters into pink shards, a ring per phase colour rolls out, the music resolves.
function onBossKilled(enemy){
  state.bossKilled=true;state.bossPistol=GUNS[state.weaponIndex].category==='PISTOL';
  $('boss-bar').hidden=true;state.shake=14;state.hitstop=Math.max(state.hitstop,.35);state.flourishT=2.4;
  showBanner('THE CONDUCTOR FALLS','THE EXIT IS OPEN','clear');pushFeed('THE CONDUCTOR · DOWN','good');playExplosion();playRoomClear();musicSting('win');
  const fx=view.fx;fx.explode('frag',enemy.x,enemy.y,90);
  ['#8a2f7a','#c13a6a','#ff6a58','#ffffff'].forEach((c,n)=>fx.ring(enemy.x,enemy.y,10,90+n*70,c,.7+n*.25,4-n*.6));
  for(let n=0;n<26;n++){const a=n/26*TAU;fx.spark(enemy.x,enemy.y,a,3,.2,[140,520],n%2?'#ff7aa8':'#e8c58c');}
  fx.chips(enemy.x,enemy.y,0,['#8a2f7a','#e9dfe8','#ff7aa8','#e8c58c'],34,Math.PI,[60,320],[2,5],[.8,1.6]);
  for(const other of state.enemies)if(other.alive&&other!==enemy){other.hp=0;killEnemy(other,{vx:0,vy:0,damage:0});}
}
function roomRewardDrop(room){
  const kind=room.reward;if(!kind||room.rewardTaken)return;room.rewardTaken=true;
  const [x,y]=freeRoomPoint(room),builtIn=roomPickupKinds(room.role);
  if(kind==='freq'||kind==='elite'){dropPickup('freq',x,y,0,state.rooms.indexOf(room));const pk=state.pickups.at(-1);if(pk?.kind==='freq'&&kind==='elite')pk.elite=true;pushFeed(kind==='elite'?'ELITE DOWN · A FREQUENCY IS BROADCASTING':'A FREQUENCY IS BROADCASTING HERE','loot');}
  else if(kind==='scrap'){for(let n=0;n<4;n++)dropPickup('scrap',...freeRoomPoint(room),14);}
  else if(kind==='gun'&&!builtIn.includes('gun'))dropPickup('gun',x,y,0,state.rooms.indexOf(room));
  else if(kind==='heal'&&!builtIn.includes('heal')&&!interferenceStats(state.progress).noHeals)dropPickup('heal',x,y,2);
  else if(kind==='supply')dropPickup('supply',x,y,0,state.rooms.indexOf(room));
}
function roomClearTracking(room){
  if(state.roomMove<=96&&state.rooms.indexOf(room)>0&&!room.stillCounted){room.stillCounted=true;state.stillRoomClears++;toast('STILL LIFE · CLEARED WITHOUT MOVING',2200);pushFeed('STILL LIFE · GOAL PROGRESS','good');}
}

/* ---------- run modal (decision + frequency pick) */
let runModalClear=0;
function setRunModal(kind,html){
  state.runModal=kind;input.keys.clear();input.firing=false;
  const el=$('run-modal');clearTimeout(runModalClear);el.innerHTML=html;el.hidden=false;el.setAttribute('aria-hidden','false');el.querySelector('button')?.focus();
}
function closeRunModal(){
  state.runModal=null;const el=$('run-modal');el.hidden=true;el.setAttribute('aria-hidden','true');runModalClear=setTimeout(()=>{if(el.hidden)el.innerHTML='';},320);dialogClosedAt=performance.now();view?.canvas.focus();
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
  const meta={floor:['TUNE IN.','FLOOR REWARD · PICK ONE FREQUENCY'],elite:['ELITE SIGNAL.','ELITE CLEARED · PICK ONE FREQUENCY'],door:['TUNE IN.','FREQUENCY FOUND · PICK ONE'],supply:['TUNE IN.','SUPPLY DROP · PICK ONE FREQUENCY']}[source]||['TUNE IN.','PICK ONE'];
  setRunModal('freq',freqOfferHtml({offers,owned:state.freq,title:meta[0],eyebrow:meta[1]}));
}
// A crossfade unlocking is a moment: name card, a beat of near-frozen time, a chord, and a ring from the player in both station colors.
function crossfadeFlourish(cf){
  state.flourishT=1.5;pushFeed(`CROSSFADE · ${cf.name}`,'good');showBanner(cf.name,cf.desc,'clear');playRoomClear();playSlowmoEnter();
  const p=state.player;if(p){cf.stations.forEach((id,n)=>view.fx.ring(p.x,p.y,10+n*6,70+n*34,STATION_BY_ID.get(id).color,.9,3));view.fx.floater(p.x,p.y-34,`CROSSFADE · ${cf.name}`,'#ffffff',14,1.6);}
}
function pickFreq(id){
  const offer=state.freqOffers.find(item=>item.id===id);if(!offer||state.runModal!=='freq')return;
  const before=new Set(activeCrossfades(state.freq).map(c=>c.id));
  state.freq=pickFrequency(state.freq,id);
  const fresh=activeCrossfades(state.freq).filter(c=>!before.has(c.id));
  kn.freqPicked=true;closeRunModal();playPickup('mod');toast(`${offer.name} · ${offer.isNew?'NEW':`RANK ${offer.rank}`}`,1700);
  if(fresh.length)crossfadeFlourish(fresh[0]);
  hud();const then=state.freqThen;state.freqThen=null;then?.();
}
function runModalKey(e,key){
  if(key==='tab'){trapDialogTab(e,$('run-modal'),document.activeElement);return;}
  if(state.runModal==='decision'){if(key==='1')decide('extract');else if(key==='2')decide('descend');}
  else if(state.runModal==='freq'){const n=Number(key);if(n>=1&&n<=state.freqOffers.length)pickFreq(state.freqOffers[n-1].id);}
}
function startFloor(n){
  state.floor=n;state.floorCfg=floorConfig(n);state.extractionOpen=false;state.floorHit=false;state.lastPos=null;state.roomMove=0;state.noises=[];state.noiseRings=[];state.alertPulses=[];state.hitIndicators=[];state.doorMarkers=[];
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
  const rs=routeStats(),run={won:result!=='dead',rooms:state.runRooms,kills:state.kills,seconds:state.realElapsed,coins:settle.kept};
  let merged;try{merged=mergeBest(readBest(localStorage),run);if(merged.isNew)writeBest(localStorage,merged.best);}catch{merged=mergeBest(null,run);}
  const killedBy=result==='dead'&&state.lastHitBy?deathCause({name:state.lastHitBy,kind:state.lastHitKind||'shot',type:state.lastHitType||'',spotted:!!state.lastHitSpotted}):'';
  const showEnd=()=>{
    if(state.mode==='play')return;
    const el=$('run-result');el.hidden=false;
    el.innerHTML=runEndHtml({won:result!=='dead',boss:result==='won',rooms:state.runRooms,totalRooms:0,kills:state.kills,seconds:state.realElapsed,payout:settle.kept,seed:state.seed,scrap:state.scrap,balance:progress.coins,best:merged.best,isNewBest:merged.isNew&&!!merged.previous,cause:killedBy})+storyHtml({lines,goals:rec.completed,unlocks:newUnlocks,tape:tape.tape,share,payout});
    el.dataset.result=result==='dead'?'dead':'won';el.dataset.kind=result==='won'?'boss':result;$('how-to')?.classList.toggle('compact',progress.stats.runs>1);$('start-button').innerHTML='<span>RUN AGAIN</span><kbd>R</kbd>';$('start-button').classList.add('again');$('game-shell')?.classList.remove('dying');$('overlay').classList.add('show');$('meta-panel').hidden=true;renderMeta();$('start-button').focus({preventScroll:true});animateCounts(el);
  };
  toast(result==='won'?'THE CONDUCTOR IS DOWN':result==='extract'?'EXTRACTED':'RUN OVER',3500);
  if(result!=='dead'||matchMedia('(prefers-reduced-motion: reduce)').matches)showEnd();else{$('game-shell')?.classList.add('dying');setTimeout(showEnd,1100);}
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
  $('how-to')?.addEventListener('click',event=>{const hw=$('how-to');if(hw.classList.contains('compact')&&event.target.closest('.eyebrow'))hw.classList.toggle('open');});
  $('run-result').addEventListener('click',event=>{if(event.target.closest('[data-act="share"]')&&state.shareLine){try{navigator.clipboard?.writeText(state.shareLine);}catch{}event.target.textContent='COPIED';}});
  $('kit-chip')?.addEventListener('click',()=>{state.metaTab='unlocks';renderMeta();$('meta-panel').hidden=false;$('close-meta').focus();});
}

function checkRoomClear(){if(signalOn())return;for(const [i,r] of state.rooms.entries()){
  if(r.cleared||!r.visited)continue;
  const hasEnemy=roomHasLivingEnemies(i,state.enemies);
  if(!hasEnemy){r.cleared=true;state.roomsCleared++;state.runRooms++;if(roomHasEncounter(r)){roomRewardDrop(r);roomClearTracking(r);const reward=scrapGain(runStats().roomClearScrap);state.scrap+=reward;playRoomClear();roomClearBanner(reward);{const cx=(r.cx+.5)*TILE,cy=(r.cy+.5)*TILE;view.fx.pickup(cx,cy,'#6dffb0');}for(let n=0;n<6;n++)dropPickup('scrap',rand(r.x1+1,r.x2-1)*TILE,rand(r.y1+1,r.y2-1)*TILE,4);roomClearSupplies(r);hud();}}
}
  checkExtractionOpen();
}
function roomClearSupplies(room){
  const heal=clearHealAmount({health:state.health,maxHealth:state.maxHealth});
  if(heal>0&&!interferenceStats(state.progress).noHeals){dropPickup('heal',...freeRoomPoint(room),heal);pushFeed('MEDKIT DROPPED · YOU ARE HURT','good');}
  if(room.role!=='entry'&&clearAmmoDrop({ammoLow:supplyCtx().ammoLow})){dropPickup('ammo',...freeRoomPoint(room),.35,room.index);pushFeed('AMMO DROPPED · YOU ARE RUNNING DRY','good');}
}
function checkExtractionOpen(){
  if(state.extractionOpen||state.mode!=='play')return;
  if(hasUnclearedRouteEnemies(state.rooms,state.enemies))return;
  state.extractionOpen=true;if(state.bossKilled)showBanner('THE CONDUCTOR FALLS','EXTRACTION OPEN · FOLLOW THE ARROW','clear');else showBanner('EXTRACTION OPEN','FOLLOW THE ARROW TO THE EXIT','clear');pushFeed('EXTRACTION OPEN · REACH THE EXIT','good');playExtraction();
}
function updateRoom(){
  const px=state.player.x/TILE,py=state.player.y/TILE;let found=state.rooms.findIndex(r=>px>=r.x1-1&&px<=r.x2+1&&py>=r.y1-1&&py<=r.y2+1);
  if(found<0){const nearest=state.rooms.reduce((best,r,i)=>Math.hypot(px-r.cx,py-r.cy)<best.d?{i,d:Math.hypot(px-r.cx,py-r.cy)}:best,{i:state.currentRoom,d:Infinity});found=nearest.i;}
  if(found!==state.currentRoom){state.currentRoom=found;state.roomMove=0;const room=state.rooms[found],discoveredSecret=room.secret&&!room.visited;room.visited=true;if(discoveredSecret)room.name=room.revealedName;if(signalOn())state.roomToast='';else{state.roomToast=discoveredSecret?'SECRET ROOM FOUND':`FLOOR ${String(state.floor).padStart(2,'0')} · ${room.name}`;state.toastTimer=1100;roomBanner(room.name,state.enemies.filter(e=>e.alive&&e.roomIndex===found).length,discoveredSecret);}checkRoomClear();hud();}
  if(state.roomToast&&state.toastTimer<=0)state.roomToast='';
}
function interactTargets(){return collectInteractables({doorProps:state.doorProps,peeking:!!state.peek,ammo:{reserve:state.reserveAmmo[state.weaponIndex],maxReserve:GUNS[state.weaponIndex].reserve},player:state.player,scrap:state.scrap,gates:state.lockedDoors,pickups:state.pickups,rooms:state.rooms,enemies:state.enemies,guns:GUNS,hand:{gun:GUNS[state.weaponIndex],modId:modOf(GUNS[state.weaponIndex]),weapons:state.weaponSlots,maxSlots:maxWeaponSlots(),activeSlot:state.activeSlot},tile:TILE});}
function interact(){
  const target=activeInteraction(interactTargets());
  if(!target)return;
  if(target.kind==='door')return;   // doors are driven by tap/hold in updateDoorInput
  if(target.kind==='gate'){const gate=target.ref,purchase=unlockRewardGate(gate,state.scrap);if(purchase.status==='insufficient'){toast(`VAULT LOCK · NEED ${purchase.missing} MORE SCRAP`);return;}if(purchase.status!=='opened')return;state.scrap=purchase.scrap;gate.opened=true;gate.openedAt=state.elapsed;for(const {x,y} of gate.cells){state.solidMap[y][x]=0;state.nav?.setSolid(x,y,0);}if(gate.body){physics.removeRigidBody(gate.body);state.colliders=state.colliders.filter(item=>item.body!==gate.body);gate.body=null;}view.fx.pickup((gate.x+.5)*TILE,(gate.y+.5)*TILE,'#ffb04a');view.fx.floater((gate.x+.5)*TILE,(gate.y+.5)*TILE-18,`GATE OPEN · -${gate.cost} SCRAP`,'#ffd27a',13,1.6);playGateUnlock();toast(`CACHE GATE OPEN · -${gate.cost} SCRAP`);hud();return;}
  if(target.kind==='supply'||target.kind==='mod'){collect(target.ref,true);return;}
  if(target.kind==='gun'){collect(target.ref,true);return;}
  if(target.kind==='exit'){if(hasUnclearedRouteEnemies(state.rooms,state.enemies)){toast('CLEAR THE MAIN ROUTE FIRST');return;}reachExit();return;}
}
function selectedThrowable(){return THROWABLES[state.throwableIndex];}
function throwThrowable(){const item=selectedThrowable(),inventory=consumeThrowable(state.throwables,item.id);if(!inventory.consumed){const n=THROWABLES.length;for(let k=1;k<n;k++){const j=(state.throwableIndex+k)%n;if((state.throwables[THROWABLES[j].id]||0)>0){state.throwableIndex=j;updateThrowableHud();markAction();return;}}toast('OUT OF GRENADES',800);return;}const p=state.player,body=makeBody({x:p.x+state.aim.x*12,y:p.y+state.aim.y*12},3,false);body.enableCcd(true);body.setLinearDamping(0);body.setGravityScale(0,true);const speed=item.range/(item.fuse+.28);body.setLinvel({x:state.aim.x*speed,y:state.aim.y*speed},true);state.thrown.push({id:item.id,item,body,fuse:item.fuse,x:p.x,y:p.y});state.throwables=inventory.inventory;markAction();updateThrowableHud();toast(`${item.name.toUpperCase()} OUT`,700);}
function detonateThrowable(projectile){({frag:playExplosion,flash:playFlashbang,smoke:playSmoke,incendiary:playFire})[projectile.id]?.({distance:distance(projectile,state.player),pan:(projectile.x-state.player.x)/480});physics.removeRigidBody(projectile.body);const {item,id,x,y}=projectile;const effect={id,item,x,y,remaining:item.duration,elapsed:0,nextTick:0};state.effects.push(effect);view.fx.explode(id,x,y,item.radius);if(id==='frag')state.shake=Math.max(state.shake,6);else if(id==='flash')state.shake=Math.max(state.shake,2);if(id==='flash'&&distance({x,y},state.player)<item.radius&&!lineBlocked(x,y,state.player.x,state.player.y))state.flashTimer=.24;
  if(id==='frag'||id==='flash'){for(const enemy of state.enemies){if(!enemy.alive)continue;const d=distance({x,y},enemy),blocked=lineBlocked(x,y,enemy.x,enemy.y);if(!throwableAffectsTarget(id,{distance:d,blockedByWall:blocked}))continue;if(id==='flash'){enemy.stun=Math.max(enemy.stun,item.duration);enemy.aimTimer=0;}else{const dmg=bossDamageFor(enemy,item.damage*(1-d/item.radius*.48));enemy.hp-=dmg;view.fx.hitEnemy(enemy,dmg,enemy.x-x,enemy.y-y,enemy.hp<=0);const dx=enemy.x-x,dy=enemy.y-y,len=Math.hypot(dx,dy)||1;enemy.knock.x=dx/len*54;enemy.knock.y=dy/len*54;if(enemy.hp<=0)killEnemy(enemy,{vx:dx/len*600,vy:dy/len*600});}}if(id==='frag'&&distance({x,y},state.player)<item.radius&&!lineBlocked(x,y,state.player.x,state.player.y)){state.lastHitKind='blast';state.lastHitType='frag';hitPlayer(1,x,y,null,'a frag grenade');}}
}
function updateThrown(dt){for(let i=state.thrown.length-1;i>=0;i--){const projectile=state.thrown[i];projectile.fuse-=dt;const p=projectile.body.translation();projectile.x=p.x;projectile.y=p.y;if(projectile.fuse<=0){detonateThrowable(projectile);state.thrown.splice(i,1);}}}
function updateEffects(dt){for(let i=state.effects.length-1;i>=0;i--){const effect=state.effects[i];effect.remaining-=dt;effect.elapsed+=dt;if(effect.id==='incendiary'&&effect.elapsed>=effect.nextTick){effect.nextTick=effect.elapsed+.48;for(const enemy of state.enemies){const d=distance(effect,enemy);if(enemy.alive&&isWithinThrowableRadius('incendiary',d)&&!lineBlocked(effect.x,effect.y,enemy.x,enemy.y)){enemy.hp-=effect.item.damage;enemy.stun=Math.max(enemy.stun,.12);view.fx.hitEnemy(enemy,effect.item.damage,0,-1,enemy.hp<=0);if(enemy.hp<=0)killEnemy(enemy,{vx:0,vy:0});}}}if(effect.remaining<=0){state.effects.splice(i,1);}}}
function updateThrowableHud(){const sel=selectedThrowable();$('throwable-readout').innerHTML=THROWABLES.map(item=>{const n=state.throwables[item.id]||0;return `<div class="chip-throw ${item.id===sel.id?'sel':''} ${n?'':'none'}" title="${item.name}">${strokeIcon(item.id,'ico')}<b>${n}</b></div>`;}).join('')+`<span class="throw-name">${sel.name.toUpperCase()}</span>`;$('throwable-hint').innerHTML=`${keycap(keyLabel(binding('throwableCycle')))} SELECT ${keycap(keyLabel(binding('throwableUse')))} THROW`;}
function toggleLoadout(force){state.loadoutOpen=force??!state.loadoutOpen;if(state.loadoutOpen)renderLoadout();$('loadout').classList.toggle('show',state.loadoutOpen);$('loadout').setAttribute('aria-hidden',String(!state.loadoutOpen));if(state.loadoutOpen)$('close-loadout').focus();else view.canvas.focus();}
function playerSpeedRatio(){const v=state.playerVel;if(!v)return 0;return Math.hypot(v.x,v.y)/(state.walkTop||runStats().moveSpeed||112);}
// THE TIME RULE (time-rule.js): world rate follows the player's actual speed. Perks/interference only ever pull the rate DOWN (or lift the still floor).
function getTimeScale(){if(state.peek)return 0;const base=timeScale({mode:state.mode,paused:state.paused||state.supplyOpen||!!state.runModal,loadoutOpen:state.loadoutOpen,speedRatio:playerSpeedRatio(),idleScale:runStats().idleScale});if(base>0&&(state.freezeT>0||state.flourishT>0))return Math.min(base,TIME_RULE.stillFloor);if(base>.5&&(state.timeCredit>0||(state.health<=1&&freqStats(state.freq).lastStand>0)))return .5;const ih=interferenceStats(state.progress);if(ih.lowHealthIdle&&state.health<=2&&base>0&&base<ih.lowHealthIdle&&playerSpeedRatio()<=TIME_RULE.deadSpeed)return ih.lowHealthIdle;return base;}
function updatePlayer(dt){
  const p=state.player;if(!p)return;
  const rd0=state.frameDt||dt,{x:vx,y:vy}=movementFromKeys(input.keys,controls.bindings);if(vx!==0||vy!==0)markAction('move');
  const sprinting=input.keys.has('shift')&&(vx!==0||vy!==0);
  {// Movement: velocity eases toward the wish direction (snappy accel, short weighty coast), loadout weight trims speed/accel,
    // dynamics run on the real frame clock so slow-mo never makes the player float. Knockback (hits, recoil) rides on top.
    const mob={speedMul:1,accelMul:1,frictionMul:1}; // no carry weight: the two-gun limit is the constraint
    state.walkTop=runStats().moveSpeed*mob.speedMul;const topSpeed=state.walkTop*(sprinting?SPRINT_MULTIPLIER:1),rdt=state.stepHitstop?0:state.frameDt;
    const here=p.body.translation();
    if(state.lastMoveDt>0)state.playerVel=clipBlockedVelocity(state.playerVel,{x:here.x-p.x,y:here.y-p.y},{x:state.cmdVel.x*state.lastMoveDt,y:state.cmdVel.y*state.lastMoveDt},state.lastMoveDt);
    state.playerVel=stepVelocity(state.playerVel,{x:vx,y:vy},{topSpeed,accelMul:mob.accelMul,frictionMul:mob.frictionMul,sprint:sprinting},rdt);
    if(vx===0&&vy===0&&Math.hypot(state.playerVel.x,state.playerVel.y)<2)state.playerVel={x:0,y:0};
    state.playerKnock.x=approach(state.playerKnock.x,0,KNOCK_DECAY,rdt);state.playerKnock.y=approach(state.playerKnock.y,0,KNOCK_DECAY,rdt);
    const expectLen=Math.hypot(state.cmdVel.x,state.cmdVel.y)*state.lastMoveDt,movedLen=Math.hypot(here.x-p.x,here.y-p.y),blockedRatio=expectLen>.4?movedLen/expectLen:1;
    state.cornerStuck=blockedRatio<.35&&(vx!==0||vy!==0)?state.cornerStuck+1:0;if(state.cornerStuck>8){state.cornerSign=-(state.cornerSign||1);state.cornerStuck=0;}
    const nudge=cornerNudge({x:vx,y:vy},blockedRatio,topSpeed,state.cornerSign||1);
    state.cmdVel={x:state.playerVel.x+state.playerKnock.x+nudge.x,y:state.playerVel.y+state.playerKnock.y+nudge.y};
    {const sn=sprintNoiseStep(state.sprintNoiseT||0,rd0,playerSpeedRatio());state.sprintNoiseT=sn.timer;if(sn.noise&&!freqStats(state.freq).sprintSilent)state.noises.push({x:p.x,y:p.y,radius:sn.noise.radius*freqStats(state.freq).noiseMult,kind:'sprint'});}
    state.sprintBlend=approach(state.sprintBlend,sprinting?1:0,12,rdt);state.recoil=stepRecoil(state.recoil,rdt);state.dryTimer=Math.max(0,state.dryTimer-rdt);
    stepBloom(state.bloom,rd0,gunFeel(GUNS[state.weaponIndex]));
    p.x=here.x;p.y=here.y;
  }
  const aimPoint=view.screenToWorld(input.mouseX,input.mouseY);
  {const dx=aimPoint.x-p.x,dy=aimPoint.y-p.y,d=Math.hypot(dx,dy)||1;if(d>2){state.aim.x=dx/d;state.aim.y=dy/d;}}
  state.invuln=Math.max(0,state.invuln-rd0);
  if(state.reloadTimer>0){state.reloadTimer-=rd0;if(state.reloadTimer<=0){const gun=GUNS[state.weaponIndex],needed=magSize(gun)-state.weaponAmmo[state.weaponIndex],take=Math.min(needed,state.reserveAmmo[state.weaponIndex]);state.weaponAmmo[state.weaponIndex]+=take;state.reserveAmmo[state.weaponIndex]-=take;playReloadEnd();hud();emit('reloadEnd',p.x,p.y,{gun:gun.id,cancelled:false});}}
  if(input.firing&&!state.wasFiring)state.pressUntil=state.realElapsed+PRESS_BUFFER;state.wasFiring=input.firing;if(input.firing||state.realElapsed<state.pressUntil)playerShoot();updateWeaponBurst();if(input.interact){input.interact=false;interact();}
  for(const pickup of state.pickups){if(state.supplyOpen||state.runModal)break;if(pickup.available&&distance(p,pickup)<19)collect(pickup);}
  {const blocked=state.loadoutOpen||state.supplyOpen||!!state.runModal,bossLive=!!(state.boss?.alive&&state.boss.boss?.active),targets=blocked?[]:interactTargets().filter(t=>!(bossLive&&t.kind==='exit'&&!t.enabled));state.interact={targets,active:activeInteraction(targets),ambient:state.boss?.alive&&state.boss.boss?.active?null:ambientPrompt(targets),key:keyLabel(binding('interact'))};}
  updateTutorHint(p);
  updateRoom();
}
const tutor={seen:(()=>{try{return loadSeen(localStorage);}catch{return new Set();}})(),done:new Set(),shownAt:-99,current:null,still:0,wasMoving:false};
function updateTutorHint(p){
  const el=$('tutor-hint');if(!el||signalOn())return;const dt=state.frameDt||1/60,moving=hasMovementInput();tutor.still=moving?0:tutor.still+dt;
  if(moving)tutor.done.add('moved');if(moving&&input.keys.has('shift'))tutor.done.add('sprinted');if(state.reloadTimer>0)tutor.done.add('reloaded');if(state.thrown.length)tutor.done.add('threw');if(state.loadoutOpen)tutor.done.add('loadout');if(state.shotsFired>0)tutor.done.add('fired');
  const clock=performance.now()/1000;
  if(tutor.current&&clock-tutor.shownAt>5){tutor.current=null;el.classList.remove('show');}
  if(tutor.current||clock-tutor.shownAt<2.5)return;
  const gi=state.weaponIndex,gun=GUNS[gi],others=state.weaponSlots.filter(i=>i!==gi);
  const centreBusy=!!document.querySelector('#room-banner.show,#toast.show');if(moving)tutor.moved=true;
  const ctx={shots:state.shotsFired||0,moved:!!tutor.moved,blocked:centreBusy||!!state.runModal||state.loadoutOpen||state.supplyOpen||state.paused||state.mode!=='play',seen:tutor.seen,done:tutor.done,inCombat:state.enemies.some(e=>e.alive&&(e.type==='boss'||distance(p,e)<460)),runTime:state.elapsed,moving,stillFor:tutor.still,magEmpty:state.weaponAmmo[gi]<=0&&state.reloadTimer<=0,reserve:state.reserveAmmo[gi],otherHasAmmo:others.some(i=>state.weaponAmmo[i]>0||state.reserveAmmo[i]>0),hostilesNear:state.enemies.filter(e=>e.alive&&distance(p,e)<360).length,grenades:Object.values(state.throwables).reduce((a,b)=>a+b,0),hasMod:true,scrap:state.scrap};
  const keys={reload:keyLabel(binding('reload')),throwableCycle:keyLabel(binding('throwableCycle')),throwableUse:keyLabel(binding('throwableUse')),loadout:'TAB',moveKeys:['moveUp','moveLeft','moveDown','moveRight'].map(a=>keyLabel(binding(a)))};
  const hint=pickHint(ctx,keys);if(!hint)return;
  tutor.current=hint;tutor.shownAt=clock;tutor.seen.add(hint.id);try{saveSeen(localStorage,tutor.seen);}catch{}
  el.innerHTML=hintHtml(hint.text);el.classList.add('show');
}
function lineBlocked(x1,y1,x2,y2){const start={x:x1,y:y1},end={x:x2,y:y2},length=Math.hypot(x2-x1,y2-y1),steps=Math.ceil(length/8);for(let i=1;i<steps;i++){const t=i/steps,tx=Math.floor((x1+(x2-x1)*t)/TILE),ty=Math.floor((y1+(y2-y1)*t)/TILE);{const v=state.solidMap[ty]?.[tx];if(v!==0&&v!==4)return true;}}return state.crates.some(crate=>segmentIntersectsCircle(start,end,crate,17))||state.cover.some(cover=>!cover.crate&&segmentIntersectsCircle(start,end,cover,cover.radius));}
function smokeBlocksLine(x1,y1,x2,y2){return state.effects.some(effect=>effect.id==='smoke'&&effect.remaining>0&&segmentIntersectsCircle({x:x1,y:y1},{x:x2,y:y2},effect,effect.item.radius));}
// Enemy navigation grid. Rebuilt when the level changes; crates and pillars are dynamic blockers.
function enemyNav(){
  if(!state.nav||state.navSolid!==state.solidMap){state.nav=createNav(state.tileMap,state.solidMap);state.navSolid=state.solidMap;for(const door of state.doorProps)for(const c of door.cells)state.nav.setSolid(c.x,c.y,0);state.navCrates=null;state.navCrateCount=-1;}
  if(state.navCrates!==state.crates||state.navCrateCount!==state.crates.length){
    state.navCrates=state.crates;state.navCrateCount=state.crates.length;
    state.nav.setBlockers(state.cover.map(cover=>({x:cover.x,y:cover.y,r:cover.crate?25:cover.radius+10})));
  }
  return state.nav;
}
// The brain's world view is reused between frames (objects and arrays mutated in place) instead of rebuilt every tick.
const enemyAlerts=[];
const enemyWorld={nav:null,player:{x:0,y:0,vx:0,vy:0,radius:8},los:(ax,ay,bx,by)=>!lineBlocked(ax,ay,bx,by),enemies:null,smoke:[],projectiles:[],noises:null,
  fireAllowed:e=>{const k=e.def.longSight?1.7:1;return withinWorldView(e,state.player,CAMERA_HALF_HEIGHT*innerWidth/innerHeight*k,CAMERA_HALF_HEIGHT*k);}};
function updateEnemies(dt){
  const player=state.player,nav=enemyNav(),pv=player.body.linvel(),world=enemyWorld;
  world.nav=nav;world.enemies=state.enemies;world.noises=state.noises;world.coverBudget=2;world.alerts=enemyAlerts;enemyAlerts.length=0;
  for(const n of state.noises){if(n.ring||!(n.radius>8))continue;n.ring=true;kn.noiseRing=true;(state.noiseRings??=[]).push({x:n.x,y:n.y,R:n.radius,kind:n.kind||'shot',age:0,radii:noiseRayLengths(state,n.x,n.y,n.radius)});}
  const wp=world.player;wp.x=player.x;wp.y=player.y;wp.vx=pv.x;wp.vy=pv.y;
  world.smoke.length=0;for(const effect of state.effects)if(effect.id==='smoke'&&effect.remaining>0)world.smoke.push({x:effect.x,y:effect.y,radius:effect.item.radius});
  world.projectiles.length=0;for(const b of state.bullets)if(b.owner==='player')world.projectiles.push(b);
  for(const e of state.enemies){if(!e.alive)continue;if(e.type==='boss'){updateBossEnemy(bossApi,e,dt);continue;}const dx=player.x-e.x,dy=player.y-e.y,d=Math.hypot(dx,dy)||1,nx=dx/d,ny=dy/d;e.stun=Math.max(0,e.stun-dt);if(e.reloadTimer>0){e.reloadTimer=Math.max(0,e.reloadTimer-dt);if(e.reloadTimer===0)e.ammo=e.mag;}
    const out=stepEnemyBrain(e,world,dt,random),canSee=out.sees;
    if(e.burn){burnStep(e,out,dt);if(!e.alive)continue;}
    e.intent=out.intent;e.face={x:out.aimX,y:out.aimY};e.aware=out.aware;e.role=out.role;e.navGoal=out.goal;e.suspicion=out.suspicion||0;e.spotted=!!out.spotted;e.dodging=!!out.dodging;if(out.dodging)e.dodgeDir=e.ai?.dodge;
    if(out.aiming&&!e.wasAiming)playEnemyTell();e.wasAiming=out.aiming;
    if(out.locked&&!e.locked&&e.type==='sniper')playSniperLock({distance:d,pan:(e.x-player.x)/480});e.locked=!!out.locked;
    if(e.def.shield){if(!e.shieldInit){e.shieldInit=true;e.shieldAng=Math.atan2(ny,nx);}e.shieldAng=turnShield(e.shieldAng,Math.atan2(out.aimY,out.aimX),dt,RIOT_SHIELD_TURN);e.shieldFacing={x:Math.cos(e.shieldAng),y:Math.sin(e.shieldAng)};e.shieldFlash=Math.max(0,e.shieldFlash-(state.frameDt||dt));}
    if(e.def.melee){
      if(e.stun>0){e.meleeWindup=0;}
      else{
        const evasive=['dodge','retreat','cover'].includes(e.intent);
        const attack=stepBruteMelee({windup:e.meleeWindup,cooldown:e.meleeCooldown},dt,d<e.def.range&&canSee&&!evasive&&!e.burn,evasive,{windup:e.def.melee.windup});
        e.meleeWindup=attack.windup;e.meleeCooldown=attack.cooldown;
        if(attack.started)playBruteWindup({distance:d,pan:(e.x-state.player.x)/480}),e.aim={x:nx,y:ny};
        if(attack.strike&&bruteMeleeHits({canSee,distance:d,range:e.def.range,targetRadius:10,aim:e.aim,targetDirection:{x:nx,y:ny}})){state.lastHitType=e.type;state.lastHitKind='melee';state.lastHitSpotted=!!e.spotted;hitPlayer(e.def.damage,e.x,e.y,null,e.def.name);}
        if(attack.strike&&e.def.melee.lunge){e.knock.x+=nx*80;e.knock.y+=ny*80;}
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
  }
  if(enemyAlerts.length){const seen=new Set();(state.alertPulses??=[]);for(const a of enemyAlerts){state.alertPulses.push({from:a.from,to:a.to,age:0});if(!seen.has(a.from)){seen.add(a.from);try{ambienceChatter(a.from.id,Math.max(-1,Math.min(1,(a.from.x-player.x)/480)),.16);}catch{}}}enemyAlerts.length=0;}
  state.noises.length=0;
}
// Per-frame frequency upkeep on the real clock: queued echoes, the cone scale BLACKOUT applies to brain + renderer, and the DISTORTION ring.
// Boss arena staging: stage lights so he is always lit, and a camera nudge toward him while the fight is on.
function stageDirect(){
  const boss=state.boss,p=state.player,live=boss?.alive&&boss.boss?.active&&state.currentRoom===boss.roomIndex;
  state.stageLights=live||(boss&&!boss.alive&&boss.corpseTimer>0)?bossLights(state.rooms[boss.roomIndex],{...boss,alive:true}):[];
  const want=live?bossCamShift(p,boss):{x:0,y:0},cf=state.camFocus||(state.camFocus={x:0,y:0}),k=Math.min(1,(state.frameDt||1/60)*3);
  cf.x+=(want.x-cf.x)*k;cf.y+=(want.y-cf.y)*k;
}
function stepFrequencyFx(dt){stageDirect();
  const f=freqStats(state.freq),p=state.player;
  stepEchoes(dt);setConeScale({range:f.coneRange,half:f.coneHalf});enemyWorld.stillCloak=f.stillCloak;
  state.flourishT=Math.max(0,(state.flourishT||0)-dt);
  if(p&&f.bubble>0){state.bubbleT=(state.bubbleT||0)-dt;if(state.bubbleT<=0){state.bubbleT=.55;view.fx.ring(p.x,p.y,f.bubble*.82,f.bubble,'#9ad8ff',.55,1.5);if(f.bubbleZap>0)view.fx.ring(p.x,p.y,f.bubbleZap*.8,f.bubbleZap,'#ffffff',.4,1);}}
  if(p&&f.heldBreath>0&&state.stillFor>=.6&&!state.heldPing){state.heldPing=true;view.fx.ring(p.x,p.y,24,6,'#ffd27a',.3,2);}else if(state.stillFor<.6)state.heldPing=false;
}
function updateBullets(worldDt,realDt){
  for(let i=state.bullets.length-1;i>=0;i--){const b=state.bullets[i],dt=b.owner==='player'?playerBulletDt(worldDt,realDt,PLAYER_BULLET_CLOCK):b.boss?Math.max(worldDt,realDt*BOSS_BULLET_FLOOR):worldDt,previous=b.ox!==undefined?{x:b.ox,y:b.oy}:{x:b.x,y:b.y};
    if(b.hang){if(state.realElapsed>=b.hang.until||(b.hang.untilMove&&playerSpeedRatio()>.3))b.hang=null;else continue;}// HANG FIRE: frozen mid-air, harmless
    if(b.owner==='enemy'&&bubbleZapped(b)){view.fx.spark(b.x,b.y,0,5,Math.PI,[60,200],'#9ad8ff');view.fx.ring(b.x,b.y,2,12,'#9ad8ff',.25,2);removeBullet(i);continue;}
    b.ox=undefined;b.life-=dt;if(b.life<=0){if(b.lob)detonateShell(b);removeBullet(i);continue;}if(!state.stepHitstop){if(b.homing)steerBullet(b,dt);const k=b.owner==='enemy'?bubbleFactor(b):1;b.x+=b.vx*dt*k;b.y+=b.vy*dt*k;}
    const impacts=[];
    if(b.owner==='player'&&!b.lob)for(const enemy of state.enemies){if(!enemy.alive||b.hitEnemies.has(enemy))continue;const t=segmentCircleHitTime(previous,b,enemy,enemy.def.hitRadius||(enemy.type==='brute'?13:11));if(t!==null){const blocked=enemy.def.shield&&shieldBlocks({facing:enemy.shieldFacing,halfArc:enemy.def.shieldHalfArc,bulletVx:b.vx,bulletVy:b.vy,stun:enemy.stun});impacts.push({t,kind:blocked?'shield':'enemy',target:enemy});}}
    if(!b.lob)for(const crate of state.crates){if(b.hitCrates.has(crate))continue;const t=segmentCircleHitTime(previous,b,crate,17);if(t!==null)impacts.push({t,kind:'crate',target:crate});}
    if(!b.lob)for(const cover of state.cover){if(cover.crate)continue;const t=segmentCircleHitTime(previous,b,cover,cover.radius+2);if(t!==null)impacts.push({t,kind:'cover',target:cover});}
    if(b.owner==='enemy'&&state.player){const t=segmentCircleHitTime(previous,b,state.player,10);if(t!==null)impacts.push({t,kind:'player',target:state.player});}
    const wallState=segmentWallRuns(previous,b,state.solidMap,TILE,b.insideWall);b.insideWall=wallState.endsInsideWall;
    for(const wall of wallState.runs)impacts.push({...wall,kind:'wall'});
    const resolution=resolveProjectileImpacts(impacts,b.penetration);
    b.penetration=resolution.penetration;
    let removed=resolution.stopped;{const tail=resolution.impacts.at(-1);if(removed&&tail&&Number.isFinite(tail.t)){b.x=previous.x+(b.x-previous.x)*tail.t;b.y=previous.y+(b.y-previous.y)*tail.t;}}
    for(const impact of resolution.impacts){
      if(impact.kind==='enemy'){
        const enemy=impact.target;b.hitEnemies.add(enemy);if(b.shot&&enemy.aware)b.shot.loud=true;const dealt=playerHitDamage(b,enemy);enemy.hp-=dealt;enemy.stun=Math.max(enemy.stun||0,.1+playerStunBonus(enemy)+(enemy.type==='boss'?0:b.stun||0));afterPlayerHit(b,enemy,dealt);if(b.burn&&enemy.hp>0)igniteEnemy(enemy,b.burn.seconds,b.burn.dps);const len=Math.hypot(b.vx,b.vy)||1,kn=enemyKnockback(b.damage,enemy.type);enemy.knock.x=b.vx/len*kn;enemy.knock.y=b.vy/len*kn;view.fx.hitEnemy(enemy,b.damage,b.vx,b.vy,enemy.hp<=0);if(enemy.hp>0){state.hitstop=Math.max(state.hitstop,hitstopFor({damage:b.damage}));emit('hit',b.x,b.y,{dx:b.vx/len,dy:b.vy/len,damage:b.damage,target:'enemy',kill:false});}else emit('hit',b.x,b.y,{dx:b.vx/len,dy:b.vy/len,damage:b.damage,target:'enemy',kill:true});
        if(enemy.hp<=0)killEnemy(enemy,b);else{playHit();}
      }else if(impact.kind==='crate'){
        const crate=impact.target;kn.crateHit=true;b.hitCrates.add(crate);crate.hp=damageDurability(crate.hp,b.damage);emit('hit',b.x,b.y,{dx:b.vx/(Math.hypot(b.vx,b.vy)||1),dy:b.vy/(Math.hypot(b.vx,b.vy)||1),damage:b.damage,target:'crate',kill:crate.hp===0});updateCrateDamageVisual(crate);if(crate.hp>0)view.fx.hitCrate(crate,b.vx,b.vy);if(crate.hp===0)breakCrate(crate);
      }else if(impact.kind==='player'){
        {const shooter=b.enemyId!=null?state.enemies.find(en=>en.id===b.enemyId):null,pl=state.player;state.lastHitType=shooter?.type||null;state.lastHitKind=shooter?.type==='boss'?'boss':'shot';state.lastHitSpotted=!!shooter?.spotted;hitPlayer(b.damage,b.x,b.y,shooter&&pl?Math.atan2(shooter.y-pl.y,shooter.x-pl.x):Math.atan2(-b.vy,-b.vx),shooter?.def?.name||null);}
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
    if(removed){if(b.lob)detonateShell(b);removeBullet(i);continue;}
  }
}
function removeBullet(i){const b=state.bullets[i];if(b.body)physics.removeRigidBody(b.body);if(b.shot&&--b.shot.n<=0)flushShotNoise(b.shot);state.bullets.splice(i,1);}
function updateCorpses(dt,realDt=dt){for(let i=state.enemies.length-1;i>=0;i--){const e=state.enemies[i];if(e.alive||!e.corpseTimer)continue;e.corpseTimer-=e.type==='boss'?realDt:dt;const p=e.body.translation();e.x=p.x;e.y=p.y;if(e.corpseTimer<=0){if(e.type!=='boss')view.fx.decals.push({kind:'corpse',type:e.elite?'elite':e.type,x:e.x,y:e.y,a:(e.vis?.ang||0)+(e.vis?.spin||0)*.3,seed:Math.floor(e.id*1e6)});physics.removeRigidBody(e.body);state.enemies.splice(i,1);}}}
function syncPauseScreen(){const show=state.mode==='play'&&state.paused;syncPauseKnowledge(show);setPauseScreen(show,show?{'pause-room':state.rooms[state.currentRoom]?.name||'ENTRY','pause-time':formatClock(state.realElapsed),'pause-kills':String(state.kills),'pause-seed':String(state.seed)}:{});}
function update(dt){
  syncPauseScreen();state.flashTimer=Math.max(0,state.flashTimer-dt);$('flash-overlay').style.opacity=String(flashOverlayOpacity(state.flashTimer,visualSettings.flash));
  if(state.peek&&(state.paused||state.mode!=='play'))endPeek();
  if(state.mode!=='play'||state.paused||state.loadoutOpen||state.supplyOpen||state.runModal)return;
  updateDoorInput(dt);if(state.peek){peekFrame(dt);return;}
  trackRunClock(dt);state.timeScaleTarget=getTimeScale();const scale=state.timeScaleSmoothed=easeTimeScale(state.timeScaleSmoothed,state.timeScaleTarget,dt);setTimeScaleAudio(scale);setMusicTimeScale(scale);if(scale>0&&state.mode==='play'&&(scale<.6)!==!!state.audioSlow){state.audioSlow=scale<.6;(state.audioSlow?playSlowmoEnter:playSlowmoExit)();}state.frameDt=dt;
  // Beat: shots owe the world a burst of 1x flow on top of the speed-driven rate.
  const bd=drainBeat(state.beatBank||0,dt,scale);state.beatBank=bd.bank;state.beatPulse=Math.max(0,(state.beatPulse||0)-dt*6);
  const step=dt*scale+bd.extra;state.lastStep=step;state.worldRate=dt>0?step/dt:scale;
  state.stepHitstop=state.hitstop>0;state.lastPhysicsStep=0;state.lastMoveDt=0;
  const stepPhysics=()=>{const ts=Math.max(1e-4,Math.min(step,1/30));physics.timestep=ts;
    // The player is outside time: command the body at velocity*(real dt / physics step) so it covers cmdVel*dt on the real clock.
    if(state.player&&state.cmdVel){const k=Math.min(60,dt/ts);state.player.body.setLinvel({x:state.cmdVel.x*k,y:state.cmdVel.y*k},true);}
    physics.step();state.lastPhysicsStep=ts;state.lastMoveDt=dt;};
  if(state.hitstop>0){state.hitstop-=dt;if(state.hitstop<=0)stepPhysics();}else stepPhysics();
  state.time+=step;state.elapsed+=step;state.realElapsed+=dt;stepFrequencyFx(dt);updatePlayer(step);updateSurvival(dt);updateEnemies(step);updateDoors(dt);updateSignal(dt,step);updateBullets(step,dt);updateCrateVisuals(step);updateThrown(step);updateEffects(step);updateCorpses(step,dt);view.update(step);state.shake=Math.max(0,state.shake-dt*14);state.toastTimer=Math.max(0,state.toastTimer-dt*1000);if(state.toastTimer<=0){$('toast').classList.remove('show');if(state.roomToast){state.roomToast='';hud();}}
  pollKnowledge(dt);
  drawMinimap();syncHudFrame();
}
function makeMinimap(){const c=$('minimap'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);mm.key='';mm.lookup=null;}
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
    for(const r of rooms){if(!seen(r))continue;const x=(r.cx+.5)*sx,y=(r.cy+.5)*sy;if(r.role==='clinic')mark('pickup-heal',x,y,'#74dfab');}
    for(const p of state.pickups){if(!p.available)continue;if(p.kind==='supply'&&!p.claimed){const r=rooms[p.roomIndex];if(r&&seen(r)&&!(r.secret&&!r.visited))mark('station-cache',p.x/TILE*sx,p.y/TILE*sy,'#f4c66d');}}
    for(const g of state.lockedDoors)if(!g.opened&&anySeen)mark('lock-locked',(g.x+.5)*sx,(g.y+.5)*sy,'#ffb04a');
    for(const p of state.pickups)if(p.available&&p.kind==='exit'){const ready=!hasUnclearedRouteEnemies(rooms,state.enemies);mark('exit-extraction',p.x/TILE*sx,p.y/TILE*sy,ready?'#6dffb0':'#ff6a78');}}
  if(state.player){ctx.fillStyle='#70e5b2';ctx.beginPath();ctx.arc(state.player.x/TILE*sx,state.player.y/TILE*sy,3,0,TAU);ctx.fill();}
}
function newRun(opts={}){
  input.keys.clear();input.firing=false;input.interact=false;state.daily=!!opts.daily;state.freq={};state.shotsFired=0;state.beatBank=0;state.heldSilent=false;state.runModal=null;$('run-modal').hidden=true;$('boss-bar').hidden=true;const chosenSeed=state.daily?dailySeed():parseRunSeed($('seed-input').value);state.seed=chosenSeed??(1+Math.floor(Math.random()*MAX_RUN_SEED));state.floor=1;state.floorCfg=floorConfig(1);ROT.RNG.setSeed(floorSeed(state.seed,1));$('seed-display').textContent=state.daily?`${state.seed} · DAILY`:String(state.seed);Object.assign(state,{floorsCleared:0,runRooms:0,floor1Seconds:0,stillRoomClears:0,slowTriples:0,slowKills:0,tripleFlag:false,noHitFloors:0,floorHit:false,roomMove:0,lastPos:null,bossKilled:false,bossPistol:false,lastHitType:null,timeCredit:0,freezeT:0,flourishT:0,echoes:[],shotGroup:null,shotExtra:null,stillFor:0,outcome:null,boss:null,doorMarkers:[],freqOffers:[],freqThen:null});
  state.supplyOpen=false;state.supplyPickup=null;$('supply-panel').hidden=true;$('supply-panel').setAttribute('aria-hidden','true');state.mode='play';state.paused=false;state.running=true;state.paidOut=false;state.elapsed=0;state.realElapsed=0;state.calmTimer=0;state.notify={};state.lastMagWarn={};state.extractionOpen=false;state.objTimer=0;state.time=0;state.kills=0;state.scrap=runStats().startScrap;state.maxHealth=runStats().maxHealth;state.health=state.maxHealth;state.armor=0;state.maxArmor=0;state.gear=null;state.weaponSlots=(kitById(state.progress.kit)||kitById('standard')).guns.map(id=>GUNS.findIndex(gun=>gun.id===id));state.activeSlot=0;state.weaponAmmo=GUNS.map(g=>g.mag);state.reserveAmmo=GUNS.map(g=>g.reserve);state.gunMods={};state.gunTouched=new Set(state.weaponSlots);state.swapUntil=0;state.quickdrawFor=-1;state.throwables=kitThrowables(state.progress,state.progress.kit);state.throwableIndex=Math.max(0,THROWABLES.findIndex(item=>state.throwables[item.id]>0));state.shotgunShellId='buckshot';state.lastAction=0;state.lastActionKind='other';state.fireCooldown=0;state.weaponBurst=null;state.reloadTimer=0;state.invuln=0;state.shake=0;state.roomsCleared=0;state.roomToast='';$('run-result').hidden=true;$('start-button').innerHTML='<span>ENTER THE SECTOR</span><span class="arrow">↗</span>';$('start-button').classList.remove('again');$('game-shell')?.classList.remove('dying');state.lastHitBy=null;state.lastHitKind=null;state.lastHitSpotted=false;state.noiseRings=[];state.alertPulses=[];$('meta-panel').hidden=true;$('overlay').classList.remove('show');toggleLoadout(false);$('vignette').style.background='';kn.reset();state.peek=null;setPeekChrome(false);showSigHint(null);showSigComplete(false);{const want=!opts.fromSignal&&shouldRunSignalCheck(state.onboarding,state.progress,{daily:state.daily,forced:!!opts.signal});state.signal=want?createSignalProgress():null;if(want&&opts.signal){state.onboarding.cards=state.onboarding.cards.filter(id=>!SIGNAL_CARD_IDS.includes(id));}}makeLevel();updateThrowableHud();setTimeout(()=>{if(signalOn()){showBanner('SIGNAL CHECK','ROOM 1 OF 5','room');queueCard('time.breath');return;}const r=state.rooms[state.currentRoom];if(r&&state.mode==='play')roomBanner(r.name,state.enemies.filter(e=>e.alive&&e.roomIndex===state.currentRoom).length);},400);}
function resize(){view?.resize();}
let timeEdgeEl=null;
function render(dt=1/60){
  if(!view)return;
  const p=state.player,gun=GUNS[state.weaponIndex];
  const events=state.events.splice(0);
  view.consume(events);
  view.render({dt,timeScale:state.timeScaleSmoothed,worldRate:state.worldRate??state.timeScaleSmoothed,beatPulse:state.beatPulse||0,band:timeBand(playerSpeedRatio()),idleScale:runStats().idleScale,motion:visualSettings.shake,flash:visualSettings.flash,shake:scaledCameraShake(state.shake,visualSettings.shake),mouseX:input.mouseX,mouseY:input.mouseY,reloadFrac:state.reloadTimer>0&&state.reloadTotal>0?clamp(1-state.reloadTimer/state.reloadTotal,0,1):0,exitReady:!hasUnclearedRouteEnemies(state.rooms,state.enemies),bloom:state.bloom?.value||0,gun});
  {const el=timeEdgeEl||(timeEdgeEl=$('time-edge'));if(el&&view.timeFx){const ev=edgeView(view.timeFx.meter.rate,view.timeFx.meter.activity);el.style.opacity=ev.opacity.toFixed(2);if(ev.opacity>.02){el.style.setProperty('--edge-c',ev.color);const bar=el.firstElementChild;bar.style.width=ev.width.toFixed(1)+'%';el.children[1].style.left=(50-ev.walk/2).toFixed(1)+'%';el.children[2].style.left=(50+ev.walk/2).toFixed(1)+'%';}}}
  void p;
}
function renderGameToText(){
  const gear=GEAR.find(item=>item.id===state.gear),room=state.rooms[state.currentRoom];
  const enemies=state.enemies.filter(enemy=>enemy.alive).map(enemy=>({id:enemy.id,type:enemy.def.name,roomIndex:enemy.roomIndex,x:Math.round(enemy.x),y:Math.round(enemy.y),health:Math.round(enemy.hp),aiming:enemy.aimTimer>0||enemy.meleeWindup>0,charging:enemy.meleeWindup>0,telegraphVisible:enemy.meleeWindup>0,reloading:enemy.reloadTimer>0,tactic:enemy.intent,posture:enemy.posture,aware:!!enemy.aware,suspicion:+(enemy.suspicion||0).toFixed(2)}));
  const roomEnemyCounts=Array(state.rooms.length).fill(0);
  for(const enemy of enemies)if(Number.isInteger(enemy.roomIndex)&&roomEnemyCounts[enemy.roomIndex]!==undefined)roomEnemyCounts[enemy.roomIndex]++;
  const pickups=state.pickups.filter(pickup=>pickup.available).map(pickup=>({type:pickup.kind,x:Math.round(pickup.x),y:Math.round(pickup.y),roomIndex:pickup.roomIndex,gun:pickup.kind==='gun'?GUNS[pickup.gunIndex].name:undefined,mod:pickup.kind==='mod'?pickup.modId:undefined,variant:pickup.variant||undefined}));
  return JSON.stringify({
    mode:state.mode,paused:state.paused,seed:state.seed,coordinateSystem:'world origin at top-left; +x right, +y down',
    player:state.player?{x:+state.player.x.toFixed(1),y:+state.player.y.toFixed(1),health:state.health,maxHealth:state.maxHealth,armor:state.armor,maxArmor:state.maxArmor,weapon:GUNS[state.weaponIndex].name,ammo:state.weaponAmmo[state.weaponIndex],reserve:state.reserveAmmo[state.weaponIndex],reloading:state.reloadTimer>0,shell:GUNS[state.weaponIndex].id==='shotgun'?shellForRun().id:undefined}:null,
    loadout:{slots:state.weaponSlots.map(index=>GUNS[index].name),ammunition:state.weaponSlots.map(index=>({weapon:GUNS[index].name,magazine:state.weaponAmmo[index],reserve:state.reserveAmmo[index]})),activeSlot:state.activeSlot,gear:gear?.name||null,maxSlots:maxWeaponSlots(),mods:state.weaponSlots.map(index=>modOf(GUNS[index])||null),mod:modOf(GUNS[state.weaponIndex])||null,swapping:state.realElapsed<state.swapUntil},
    room:room?.name,roomIndex:state.currentRoom,roomRole:room?.role,
    roomProgress:state.rooms.map((entry,index)=>({index,name:entry.name,role:entry.role,visited:!!entry.visited,cleared:!!entry.cleared,livingEnemies:roomEnemyCounts[index]})),
    lockedDoors:state.lockedDoors.map(door=>({opened:door.opened,cost:door.cost,room:state.rooms[door.roomIndex]?.name,x:(door.x+.5)*TILE,y:(door.y+.5)*TILE,cells:door.cells.length,tiles:door.cells.map(cell=>({x:cell.x,y:cell.y}))})),
    supplyOpen:state.supplyOpen,supplyOffers:state.supplyPickup?.offers||null,
    enemyCount:enemies.length,enemies,
    bullets:state.bullets.map(bullet=>({owner:bullet.owner,enemyId:bullet.enemyId,x:bullet.x,y:bullet.y,vx:bullet.vx,vy:bullet.vy})),
    crates:state.crates.map(crate=>({x:Math.round(crate.x),y:Math.round(crate.y),health:crate.hp,radius:17})),
    cover:state.cover.filter(cover=>!cover.crate).map(({x,y,radius,kind})=>({x:Math.round(x),y:Math.round(y),radius,kind})),
    pickupCount:pickups.length,pickups,
    throwables:{selected:selectedThrowable().id,counts:state.throwables,projectiles:state.thrown.length,effects:state.effects.map(effect=>effect.id)},
    burstShotsRemaining:state.weaponBurst?.shotsRemaining||0,
    peek:state.peek?{room:state.peek.room,door:state.peek.door.id}:null,doors:state.doorProps.map(d=>({id:d.id,state:d.state,gate:!!d.gate,x:Math.round(d.x*TILE),y:Math.round(d.y*TILE),room:d.roomIndex})),glass:state.glass.filter(g=>!g.broken).length,signal:state.signal?{active:state.signal.active,room:state.signal.room,attempts:state.signal.attempts,picked:state.signal.picked,done:state.signal.done,idle:+(state.signal.idle||0).toFixed(1),props:state.signal.props.map(p=>({x:Math.round(p.x),y:Math.round(p.y)}))}:null,manual:state.onboarding.manual,cards:state.onboarding.cards,
    floor:state.floor,runModal:state.runModal,freq:state.freq,doorMarkers:state.doorMarkers.map(m=>({reward:m.reward,x:Math.round(m.x*TILE),y:Math.round(m.y*TILE)})),boss:state.boss?{hp:Math.round(state.boss.hp),max:state.boss.maxHp,phase:state.boss.boss?.phase,mode:state.boss.boss?.mode,alive:state.boss.alive}:null,floorsCleared:state.floorsCleared,runRooms:state.runRooms,
    kills:state.kills,scrap:state.scrap,coins:state.progress.coins,roomsCleared:state.roomsCleared,rooms:state.rooms.length,timeScale:getTimeScale().toFixed(2),timeScaleSmoothed:+state.timeScaleSmoothed.toFixed(3),bloom:+state.bloom.value.toFixed(3),recoil:+state.recoil.amount.toFixed(3),sprintBlend:+state.sprintBlend.toFixed(2),playerVelocity:{x:+state.playerVel.x.toFixed(1),y:+state.playerVel.y.toFixed(1)},pendingEvents:state.events.length,elapsed:Math.floor(state.elapsed),
  });
}
window.render_game_to_text=renderGameToText;
window.advanceTime=(ms)=>{const frames=Math.max(1,Math.ceil(ms/16.667));for(let i=0;i<frames;i++){update(1/60);if(i<frames-1)view?.consume(state.events.splice(0));}render(frames/60);};

function setupControls(){
  armMusicOnGesture();{const mv=loadMusicSettings(localStorage);$('music-volume').value=String(Math.round(mv*100));$('music-volume-value').textContent=`${Math.round(mv*100)}%`;}const volume=loadAudioSettings(localStorage);$('master-volume').value=String(Math.round(volume*100));$('master-volume-value').textContent=`${Math.round(volume*100)}%`;
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
    if(!$('meta-panel').hidden){
      if(key==='escape'){$('meta-panel').hidden=true;$('meta-button').focus();}
      else if(key==='tab')trapDialogTab(e,$('meta-panel'),document.activeElement);
      return;
    }
    if(state.loadoutOpen&&key==='tab'){trapDialogTab(e,$('loadout'),document.activeElement);return;}
    if(state.supplyOpen){if(key==='tab')trapDialogTab(e,$('supply-panel'),document.activeElement);else if(key==='escape')closeSupply();else if(key>='1'&&key<='3')takeSupply(Number(key)-1);return;}
    if(key==='tab'){e.preventDefault();if(!state.supplyOpen)toggleLoadout();markAction();}
    if(state.peek&&key!==binding('interact')&&key!=='escape')return;
    if(key===binding('interact')){input.interact=true;input.eHeld=true;input.eDown=true;markAction();}
    if(key==='m'&&state.paused&&state.mode==='play'){const to=document.querySelector('.pause-card')?.dataset.tab==='manual'?'pause':'manual';setPauseTab(to);if(to==='manual')onManualOpen();}
    if(key===binding('throwableCycle')&&state.mode==='play'){state.throwableIndex=(state.throwableIndex+1)%THROWABLES.length;updateThrowableHud();markAction();}
    if(key===binding('shellCycle'))cycleShotgunShell();
    if(key===binding('shove'))playerShove();
    if(key===binding('throwableUse')&&state.mode==='play'&&!state.peek&&!state.supplyOpen&&!state.paused&&!state.loadoutOpen)throwThrowable();
    if(key==='r'&&(state.mode==='dead'||state.mode==='won')){newRun();return;}
    if(key==='escape'&&(e.repeat||performance.now()-dialogClosedAt<350))return;
    if(key==='escape'){if(state.supplyOpen)closeSupply();else if(state.loadoutOpen)toggleLoadout(false);else state.paused=!state.paused;toast(state.paused?'PAUSED':'BACK IN');}
    if(key===binding('weaponOne'))switchWeapon(0);
    if(key===binding('weaponTwo'))switchWeapon(1);
    if(key===binding('weaponThree'))switchWeapon(2);
    if(key==='f'){if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.();}
    if(key===binding('reload'))reload();
  });
  addEventListener('keyup',e=>{const k=normalizeKey(e.key);input.keys.delete(resolveMovementKey(k,controls.bindings));if(k===binding('interact')){input.eHeld=false;input.eUp=true;}});
  addEventListener('blur',()=>{input.keys.clear();input.firing=false;input.eHeld=false;input.eUp=true;if(state.mode==='play')state.paused=true;});
  addEventListener('mousemove',e=>{input.mouseX=e.clientX;input.mouseY=e.clientY;});
  addEventListener('mousedown',e=>{if(e.button===2)playerShove();if(e.button===0){input.firing=true;markAction('fire');if(state.mode==='play'&&!state.peek&&!state.paused&&!state.loadoutOpen&&!state.supplyOpen&&!state.runModal)playerShoot();}});addEventListener('mouseup',e=>{if(e.button===0)input.firing=false;});addEventListener('contextmenu',e=>e.preventDefault());
  $('start-button').addEventListener('click',()=>{void unlockAudio();input.firing=false;input.interact=false;newRun();view.canvas.focus();});
  $('daily-button')?.addEventListener('click',()=>{void unlockAudio();input.firing=false;input.interact=false;newRun({daily:true});view.canvas.focus();});
  $('replay-signal')?.addEventListener('click',()=>{void unlockAudio();input.firing=false;input.interact=false;newRun({signal:true});view.canvas.focus();});
  $('skip-signal')?.addEventListener('click',()=>{skipSignal();view?.canvas.focus();});
  wirePauseTabs(onManualOpen);
  wireMacroUi();$('close-loadout').addEventListener('click',()=>toggleLoadout(false));
  $('music-volume').addEventListener('input',event=>{const volume=Number(event.currentTarget.value)/100;$('music-volume-value').textContent=`${Math.round(volume*100)}%`;if(!setMasterMusicVolume(volume))toast('MUSIC VOLUME CHANGED FOR THIS SESSION ONLY');});
  $('master-volume').addEventListener('input',event=>{const volume=Number(event.currentTarget.value)/100;$('master-volume-value').textContent=`${Math.round(volume*100)}%`;if(!setMasterVolume(volume))toast('VOLUME CHANGED FOR THIS SESSION ONLY');});
  $('mute-audio').addEventListener('click',()=>{if(!setAudioMuted(!isAudioMuted()))toast('MUTE SETTING CHANGED FOR THIS SESSION ONLY');syncMuteButton();});
  $('meta-button').addEventListener('click',()=>{renderMeta();$('meta-panel').hidden=false;$('close-meta').focus();});$('close-meta').addEventListener('click',()=>{$('meta-panel').hidden=true;$('meta-button').focus();});$('reset-save').addEventListener('click',resetProgress);
  
  $('loadout').addEventListener('click',e=>{if(e.target===$('loadout')){toggleLoadout(false);return;}const slot=e.target.closest('[data-slot]');if(slot){switchWeapon(Number(slot.dataset.slot));renderLoadout();return;}const shell=e.target.closest('[data-shell]');if(shell){state.shotgunShellId=shell.dataset.shell;hud();toast(`${shellForRun().name} · ${shellForRun().description}`);}});
  $('close-supply').addEventListener('click',closeSupply);$('supply-panel').addEventListener('click',event=>{if(event.target===$('supply-panel')){closeSupply();return;}const button=event.target.closest('[data-supply]');if(button)takeSupply(Number(button.dataset.supply));});
  addEventListener('resize',resize);
}
/* ======================================================================================================
   KNOWLEDGE LAYER: closable doors + peek (doors.js), the Signal Check (signal-check.js), name cards and the
   field manual (onboarding.js). Presentation lives in knowledge-ui.js / doors2d.js; rules are pure and tested.
   ====================================================================================================== */
const peekMachine=createPeekMachine(PEEK_HOLD);
const signalOn=()=>!!state.signal?.active;
const saveOnboard=()=>{saveOnboarding(localStorage,state.onboarding);};
const kn={t:0,chipAt:-1e9,cardAt:-1e9,fresh:new Set(),hits:0,moved:false,silentHit:false,crateHit:false,reloaded:false,autoSwapped:false,noiseRing:false,calmRegen:false,gunPickup:false,modPickup:false,freqPicked:false,picked:new Set(),pauseShown:false,
  pick(kind){if(['heal','armor','ammo','scrap'].includes(kind))this.picked.add(kind);if(kind==='mod')this.modPickup=true;},
  reset(){this.hits=0;this.moved=false;this.silentHit=this.crateHit=this.reloaded=this.autoSwapped=this.noiseRing=this.calmRegen=this.gunPickup=this.modPickup=this.freqPicked=false;this.picked=new Set();}};
function queueCard(id){const card=NAME_CARDS[id];if(!card||state.onboarding.cards.includes(id))return false;state.onboarding.cards.push(id);saveOnboard();showNameCard(card);kn.cardAt=performance.now();return true;}

// ---------------------------------------------------------------------------------------- doors
function installDoor(door){
  for(const c of door.cells)state.solidMap[c.y][c.x]=1;
  const vertical=door.axis==='y',span=door.cells.length*TILE;
  const body=physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(door.x*TILE,door.y*TILE));
  physics.createCollider(RAPIER.ColliderDesc.cuboid(vertical?4:span/2,vertical?span/2:4),body);state.colliders.push({body});door.body=body;
}
// Doors go on the entrances of combat rooms that still hold enemies. They never lock: the nav grid treats them as passable.
function buildDoorProps(){
  const eligible=new Set(state.rooms.map((room,index)=>({room,index})).filter(({room,index})=>index>0&&index<state.rooms.length-1&&['combat','hazard','elite'].includes(room.role)&&roomHasLivingEnemies(index,state.enemies)).map(item=>item.index));
  const plans=planDoors({cells:state.tileMap,rooms:state.rooms,doors:state.doors,links:state.doorLinks,eligible,blocked:state.lockedDoors.flatMap(gate=>gate.cells)});
  state.doorProps=plans.map(createDoor);for(const door of state.doorProps)installDoor(door);
}
function openDoorProp(door,how='tap'){
  const result=openDoor(door,how);if(!result.opened)return false;
  for(const c of door.cells)state.solidMap[c.y][c.x]=0;
  if(door.body){physics.removeRigidBody(door.body);state.colliders=state.colliders.filter(item=>item.body!==door.body);door.body=null;}
  const c=doorCenterPx(door,TILE);
  if(result.noise)emitNoise(c.x,c.y,result.noise.radius*freqStats(state.freq).noiseMult,result.noise.kind);
  if(how==='kick'){playCrateBreak();state.shake=Math.max(state.shake,2.4);}else if(how==='script')playGateUnlock();else playUiClick();
  view.fx.pickup(c.x,c.y,'#cfd8e8');
  return true;
}
function startPeek(door){
  state.peek={door,room:door.roomIndex,focus:peekFocus(door),t:0};setPeekChrome(true);playUiClick();
}
function endPeek(){if(!state.peek)return;state.peek=null;peekMachine.cancel();setPeekChrome(false);playUiClick();}
// E at a closed door: a tap opens it, holding (PEEK_HOLD) freezes the world and looks through it until released.
function updateDoorInput(dt){
  if(input.eDown){input.eDown=false;if(!state.peek){const t=state.interact?.active;if(t?.kind==='door')peekMachine.press(t.ref);}}
  const held=peekMachine.state;
  if(held.door){
    const c=doorCenterPx(held.door,TILE),near=!!state.player&&Math.hypot(state.player.x-c.x,state.player.y-c.y)<DOOR_RANGE+14;
    const r=peekMachine.tick(dt,near);
    if(r.peeking&&!state.peek)startPeek(r.door);else if(!r.peeking&&state.peek)endPeek();
  }
  if(input.eUp){input.eUp=false;const rel=peekMachine.release();if(rel){if(rel.action==='open')openDoorProp(rel.door,'tap');else endPeek();}else if(state.peek)endPeek();}
}
// While peeking the world is frozen completely: only the camera, fog and the grade move.
function peekFrame(dt){
  state.timeScaleTarget=0;state.timeScaleSmoothed=easeTimeScale(state.timeScaleSmoothed,0,dt);state.worldRate=0;setTimeScaleAudio(state.timeScaleSmoothed);setMusicTimeScale(state.timeScaleSmoothed);state.peek.t+=dt;
}
function updateDoors(dt){
  for(const door of state.doorProps){
    stepDoorAnim(door,dt);
    if(door.state==='closed'&&!door.gate)for(const e of state.enemies)if(enemyOpens(door,e)){openDoorProp(door,'enemy');break;}
  }
  const p=state.player;if(!p||state.peek)return;
  const {x:vx,y:vy}=movementFromKeys(input.keys,controls.bindings);
  if(vx!==0||vy!==0){
    const sprint=input.keys.has('shift'),speed=(state.walkTop||112)*(sprint?SPRINT_MULTIPLIER:1),vel={x:vx*speed,y:vy*speed};
    for(const door of state.doorProps){if(door.gate||!isClosed(door))continue;const how=bumpOpens(door,p,vel,{speedRatio:sprint?SPRINT_MULTIPLIER:1});if(how)openDoorProp(door,how);}
  }
}

// ---------------------------------------------------------------------------------------- Signal Check
function createSignalMap(){
  const layout=buildSignalLayout();
  state.signalLayout=layout;state.tileMap=layout.cells;state.solidMap=layout.cells.map(row=>row.slice());state.lockedDoors=[];state.doors=[];state.doorLinks=[];state.doorMarkers=[];
  state.mapW=layout.width;state.mapH=layout.height;state.rooms=layout.rooms;state.currentRoom=0;state.levelSeed=state.seed;
  state.glass=layout.glass.map(tile=>({...tile,broken:false,body:null}));
}
function buildGlassBodies(){
  for(const g of state.glass){const body=physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation((g.x+.5)*TILE,(g.y+.5)*TILE));physics.createCollider(RAPIER.ColliderDesc.cuboid(TILE/2,TILE/2),body);g.body=body;}
}
function buildSignalDoors(){state.doorProps=state.signalLayout.doorPlans.map(createDoor);for(const door of state.doorProps)installDoor(door);}
function spawnSignalRoom(index){
  const script=SIGNAL_SCRIPT[index],sg=state.signal;
  for(const spec of script.enemies){
    const e=spawnEnemy(spec.type,spec.x*TILE,spec.y*TILE,index);
    e.posture=spec.posture;e.post={home:{x:e.x,y:e.y},base:{...spec.face},route:null};e.face={...spec.face};e.aim={...spec.face};e.aware=false;e.suspicion=0;
    if(spec.fixed){e.fixed=true;e.def={...e.def,speed:0,range:spec.range||e.def.range};const ai=brainState(e,random);ai.aware=true;ai.suspicion=1;ai.cd=.05;ai.reaction=.1;}   // a turret: always on watch, fires the moment you are in its lane
  }
  sg.props=script.props.map(p=>({kind:p.kind,x:p.x*TILE,y:p.y*TILE,vx:p.vx,vy:p.vy,resetX:p.resetX*TILE,endX:p.endX*TILE}));
  if(script.flash){state.throwables.flash=Math.max(state.throwables.flash||0,script.flash);const i=THROWABLES.findIndex(item=>item.id==='flash');if(i>=0)state.throwableIndex=i;updateThrowableHud();}
}
function enterSignalRoom(index){
  const sg=state.signal;sg.room=index;sg.idle=0;sg.roomTime=0;sg.shotsAtEntry=state.shotsFired||0;
  for(const e of state.enemies.filter(en=>en.roomIndex<index))physics.removeRigidBody(e.body);state.enemies=state.enemies.filter(en=>en.roomIndex>=index);   // earlier rooms are behind you
  spawnSignalRoom(index);
  queueCard(SIGNAL_SCRIPT[index].card.id);hud();
}
function shatterGlass(){
  for(const g of state.glass){
    if(g.broken)continue;g.broken=true;state.tileMap[g.y][g.x]=0;state.solidMap[g.y][g.x]=0;state.nav?.setSolid(g.x,g.y,0);
    if(g.body){physics.removeRigidBody(g.body);g.body=null;}
    const x=(g.x+.5)*TILE,y=(g.y+.5)*TILE;for(let k=0;k<3;k++)view.fx.spark(x+rand(-4,4),y+rand(-10,10),rand(0,TAU),6,1.3);
  }
  playCrateBreak();state.shake=Math.max(state.shake,4.5);
}
function unlockSignal(id){
  const sg=state.signal;sg.opened.add(id);
  if(id==='glass')shatterGlass();
  else{const door=state.doorProps.find(d=>d.id===id);if(door)openDoorProp(door,'script');}
}
function signalMarkers(){
  const sg=state.signal;if(!sg||sg.room!==4||sg.picked)return [];
  return state.signalLayout.alcoves.map(a=>({x:a.rect.x1+.1,y:(a.rect.y1+a.rect.y2+1)/2,room:4,reward:a.reward,info:REWARD_INFO[a.reward]}));
}
function pickAlcove(alcove){
  const sg=state.signal;if(sg.picked)return;
  sg.picked=alcove.reward;sg.done=true;state.doorMarkers=[];
  state.onboarding.signalDone=true;saveOnboard();showSigComplete(true);playRoomClear();view.fx.pickup(state.player.x,state.player.y,REWARD_INFO[alcove.reward].color);
  setTimeout(()=>{if(state.signal===sg)finishSignal(alcove.reward);},2100);
}
// The check is over: start the real run (fresh seed and kit), carrying the one reward picked at the alcoves.
function finishSignal(reward){
  if(!state.signal?.done)return;
  showSigComplete(false);showSigHint(null);state.signal=null;newRun({fromSignal:true});
  if(reward==='scrap'){state.scrap+=60;pushFeed('+60 SCRAP','loot');}
  else if(reward==='supply'){state.throwables.frag=Math.min(3,(state.throwables.frag||0)+1);state.throwables.flash=Math.min(3,(state.throwables.flash||0)+1);updateThrowableHud();pushFeed('+1 FRAG · +1 FLASH','loot');}
  else if(reward==='freq')openFreqPick('door');
  hud();
}
function skipSignal(){
  if(!signalOn())return;
  state.onboarding.signalDone=true;saveOnboard();showSigHint(null);showSigComplete(false);state.signal=null;newRun({fromSignal:true});
}
// Every failure resets only the room you are in, instantly: same enemies, same door, full health.
function resetSignalRoom(index){
  const plan=resetPlan(index),p=state.player;
  while(state.bullets.length)removeBullet(0);
  for(const t of state.thrown){try{physics.removeRigidBody(t.body);}catch{}}state.thrown=[];state.effects=[];state.pickups=[];state.noises.length=0;state.noiseRings=[];state.alertPulses=[];state.hitIndicators=[];
  for(const e of state.enemies.filter(en=>en.roomIndex===index))physics.removeRigidBody(e.body);
  state.enemies=state.enemies.filter(en=>en.roomIndex!==index);
  if(plan.closePeekDoor){const door=state.doorProps.find(d=>d.id==='door:peek');if(door&&door.state!=='closed'){closeDoor(door);installDoor(door);}}
  spawnSignalRoom(index);
  p.body.setTranslation(plan.start,true);p.body.setLinvel({x:0,y:0},true);p.x=plan.start.x;p.y=plan.start.y;
  Object.assign(state,{playerVel:{x:0,y:0},playerKnock:{x:0,y:0},cmdVel:{x:0,y:0},health:state.maxHealth,armor:0,invuln:.8,reloadTimer:0,weaponBurst:null,hitstop:0,lastHitBy:null});
  state.weaponAmmo=GUNS.map(g=>g.mag);state.reserveAmmo=GUNS.map(g=>g.reserve);
  if(state.peek)endPeek();
  state.signal.idle=0;state.signal.roomTime=0;state.signal.shotsAtEntry=state.shotsFired||0;
  hud();
}
function signalRoomFail(){
  const sg=state.signal,plan=resetPlan(sg.room);sg.attempts[sg.room]++;
  const cause=plan.cause||deathCause({name:state.lastHitBy||'',kind:state.lastHitKind||'shot',type:state.lastHitType||'',spotted:!!state.lastHitSpotted});
  resetSignalRoom(sg.room);showSigCause(cause);state.flashTimer=Math.max(state.flashTimer,.18);
}
function updateSignal(dt,step){
  const sg=state.signal;if(!sg?.active||!state.player)return;const p=state.player;
  for(const prop of sg.props)if(prop.kind==='ghost-round'){prop.x+=prop.vx*step;prop.y+=prop.vy*step;if(prop.x>=prop.endX){view.fx.spark(prop.x,prop.y,Math.PI,6,1);prop.x=prop.resetX;}}
  if(sg.done)return;
  const zone=zoneOf(p.x);if(zone>sg.room)enterSignalRoom(zone);
  const living=state.enemies.filter(e=>e.alive&&e.roomIndex===sg.room).length,goal=goalMet({room:sg.room,player:p,living,picked:sg.picked});
  if(goal.unlock&&!sg.opened.has(goal.unlock))unlockSignal(goal.unlock);
  if(sg.room===4){const a=alcoveAt(p.x,p.y);if(a)pickAlcove(a);}
  sg.roomTime=(sg.roomTime||0)+dt;
  const moving=hasMovementInput()||(state.shotsFired||0)>(sg.lastShots||0);sg.lastShots=state.shotsFired||0;sg.idle=moving?0:sg.idle+dt;
  const spec=SIGNAL_SCRIPT[sg.room].idleHint,secs=spec?.keys==='fire'?sg.roomTime:sg.idle;
  showSigHint(idleHint(sg.room,secs,(state.shotsFired||0)-(sg.shotsAtEntry||0)),{move:['moveUp','moveLeft','moveDown','moveRight'].map(a=>keyLabel(binding(a))),fire:'CLICK'});
}

// ---------------------------------------------------------------------------------------- name cards + field manual
function onScreen(x,y,k=1){const c=view?.cam;if(!c)return false;const hh=CAMERA_HALF_HEIGHT*k,hw=hh*innerWidth/innerHeight;return Math.abs(x-c.x)<hw&&Math.abs(y-c.y)<hh;}
function canSeeEnemy(e){const p=state.player;if(!p||!onScreen(e.x,e.y))return false;return(state.peek&&e.roomIndex===state.peek.room)||!lineBlocked(p.x,p.y,e.x,e.y);}
function knowledgeCtx(){
  const p=state.player,near=(x,y,tiles)=>Math.hypot(p.x-x,p.y-y)<tiles*TILE,ratio=playerSpeedRatio(),gun=GUNS[state.weaponIndex];
  if(ratio>.2)kn.moved=true;if(state.reloadTimer>0)kn.reloaded=true;
  const enemies=state.enemies.filter(e=>e.alive&&e.type!=='boss').map(e=>({type:e.type,aware:!!e.aware,suspicion:e.suspicion||0,posture:e.posture,stun:e.stun||0,visible:canSeeEnemy(e),windup:e.meleeWindup||0,locked:!!e.locked}));
  return {speedRatio:ratio,moved:kn.moved,shots:state.shotsFired||0,runSeconds:state.realElapsed,hits:kn.hits,armor:state.armor,bloom:state.bloom?.value||0,reloaded:kn.reloaded,autoSwapped:kn.autoSwapped,crateHit:kn.crateHit,
    noiseRing:kn.noiseRing,silentHit:kn.silentHit,thrown:state.thrown.length>0||state.effects.length>0,glassSeen:state.glass.some(g=>!g.broken&&near((g.x+.5)*TILE,(g.y+.5)*TILE,7)),shotCategory:gun.category,
    enemies,offscreenThreat:state.enemies.some(e=>e.alive&&(e.aimTimer>0||e.meleeWindup>0)&&!onScreen(e.x,e.y)),pickedUp:kn.picked,doorSeen:state.doorProps.some(d=>!d.gate&&near(d.x*TILE,d.y*TILE,7)),roomsCleared:state.roomsCleared,calmRegen:kn.calmRegen,
    startScrap:runStats().startScrap,rewardDoors:state.doorMarkers.length>0,minimapEnemies:state.enemies.some(e=>e.alive&&state.rooms[e.roomIndex]?.visited),scrap:state.scrap,gateSeen:state.lockedDoors.some(g=>!g.opened&&near((g.x+.5)*TILE,(g.y+.5)*TILE,8)),
    supplySeen:state.pickups.some(pk=>pk.available&&pk.kind==='supply'&&near(pk.x,pk.y,6)),freqPicked:kn.freqPicked,exitOpen:state.extractionOpen,gunPickup:kn.gunPickup,modPickup:kn.modPickup,coinsBanked:(state.progress.stats?.runs||0)>0};
}
function wantedCards(ctx){
  const list=[];
  if(ctx.doorSeen)list.push('mech.door');
  if(kn.silentHit)list.push('mech.silent');
  if(ctx.thrown&&state.thrown.concat(state.effects).some(t=>t.id==='flash'))list.push('mech.flash');
  if(ctx.enemies.some(e=>e.visible&&e.posture==='sleep'&&!e.aware))list.push('mech.sleeper');
  if(ctx.glassSeen)list.push('mech.glass');
  for(const e of ctx.enemies)if(e.visible&&e.type!=='boss')list.push(enemyCardId(e.type));
  return list;
}
function pollKnowledge(dt){
  kn.t+=dt;if(kn.t<.25||!state.player||state.mode!=='play')return;kn.t=0;
  const ctx=knowledgeCtx(),r=unlockManual(state.onboarding.manual,manualTriggers(ctx));
  if(r.fresh.length){state.onboarding.manual=r.unlocked;for(const id of r.fresh)kn.fresh.add(id);saveOnboard();if(performance.now()-kn.chipAt>6000){kn.chipAt=performance.now();showManualChip();}}
  const now=performance.now();
  if(!nameCardBusy()&&now-kn.cardAt>700){const card=nextCard(wantedCards(ctx),new Set(state.onboarding.cards));if(card)queueCard(card.id);}
}
function onManualOpen(){renderManual(state.onboarding.manual,kn.fresh);kn.fresh=new Set();}
function syncPauseKnowledge(show){
  if(show&&!kn.pauseShown){setPauseTab('pause');renderManual(state.onboarding.manual,kn.fresh);const skip=$('skip-signal');if(skip)skip.hidden=!signalOn();}
  kn.pauseShown=show;
}

async function boot(){
  await RAPIER.init();
  view=createRenderer($('game'),state);if(new URLSearchParams(location.search).has("debug"))window.__deadair={playerShove,PLAYER_BULLET_CLOCK,state,view,fitMod,takeGunIndex,openSupply,takeSupply,switchWeapon,igniteEnemy,detonateShell,playerShoot,spawnEnemy,hitPlayer,fireBullet,reachExit,startFloor,openFreqPick,finishRun,pickFreq,decide,newRun,killEnemy,checkRoomClear,collect,dropPickup,freeRoomPoint,saveProgress,renderMeta,kn,openDoorProp,enterSignalRoom,signalRoomFail,resetSignalRoom,finishSignal,pickAlcove,lineBlocked,startPeek,endPeek};
  state.physics=physics;setupControls();renderMeta();resize();$('start-button').disabled=false;$('start-button').innerHTML='<span>ENTER THE SECTOR</span><span class="arrow">↗</span>';
  let previous=performance.now();function loop(now){requestAnimationFrame(loop);const dt=Math.min(.05,(now-previous)/1000);previous=now;musicSyncGame(state,dt);ambienceSync(state,dt);if(state.mode==='play')update(dt);else if(state.toastTimer>0){state.toastTimer=Math.max(0,state.toastTimer-dt*1000);if(state.toastTimer<=0)$('toast').classList.remove('show');}render(dt);}requestAnimationFrame(loop);
}
boot().catch(error=>{console.error(error);$('start-button').disabled=true;$('start-button').textContent='GAME COULD NOT LOAD';$('overlay').classList.add('show');$('overlay').querySelector('p').textContent='The game could not load. Start a local web server and check that the three game libraries are reachable.';});
