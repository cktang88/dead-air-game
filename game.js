import * as THREE from 'https://esm.sh/three@0.180.0';
import RAPIER from 'https://esm.sh/@dimforge/rapier2d-compat@0.17.3';
import * as ROT from 'https://esm.sh/rot-js@2.1.3';
import {isAudioMuted, loadAudioSettings, playCrateBreak, playEnemyTell, playExtraction, playGunshot, playPickup, playReload, playRoomClear, setAudioMuted, setMasterVolume, unlockAudio} from './audio.js';
import {BASE_CARRY_CAPACITY, ENEMY_TYPES, GEAR, GUNS, MODS, SHOTGUN_SHELLS, TAU, TILE, WALL_H} from './catalog.js';
import {absorbArmorDamage, chooseEncounterTypes, chooseWeaponReplacementSlot, compatibleAttachments, consumePenetration, crateDamageStage, damageDurability, distanceToRect, minimapContactVisible, minimapPickupVisible, reloadSeconds, segmentCircleHitTime, segmentIntersectsCircle, segmentWallRuns, shotgunShellStats, timeScale, unlockRewardGate, weaponLoadoutWeight, weaponPenetration, weaponReplacement, weaponStats} from './rules.js';
import {META_UPGRADES, awardCoins, emptyProgress, progressionStats, purchaseUpgrade, runCoinPayout} from './progression.js';
import {clearSavedProgress, readSavedProgress, writeSavedProgress} from './progress-storage.js';
import {consumeThrowable, isWithinThrowableRadius, THROWABLES, throwableAffectsTarget, throwableById} from './tactical.js';
import {shapeDungeon, shortestFloorPath} from './layout.js';
import {findRoomCratePosition as findGuaranteedRoomCratePosition, findRoomPropPosition} from './room-props.js';
import {generateDungeon} from './dungeon.js?v=room-names-3';
import {chooseEnemyTactic, hasIncomingProjectile} from './enemy-tactics.js';
import {hasUnclearedRouteEnemies, roomEnemyCount, roomEncounterTypes, roomHasEncounter, roomHasLivingEnemies, roomPickupKinds} from './room-roles.js';
import {MAX_RUN_SEED, parseRunSeed} from './seeds.js';
import {flashOverlayOpacity,loadVisualSettings,saveVisualSettings,scaledCameraShake} from './visual-settings.js';
import {particleBurstBudget} from './particles.js';
import {lootTier,lootTierForRoll} from './loot.js';
import {cacheRewardAvailable} from './cache-rewards.js';
import {bruteMeleeHits,stepBruteMelee} from './enemy-attacks.js';
import {DEFAULT_KEY_BINDINGS,KEY_BINDING_ACTIONS,keyLabel,loadKeyBindings,movementFromKeys,normalizeKey,rebindKey,resolveMovementKey,saveKeyBindings} from './keybindings.js';

const $ = (id) => document.getElementById(id);
const attachmentsFor=(gun)=>state.attachments.get(gun.id)||new Map();
const shellForRun=()=>SHOTGUN_SHELLS.find(shell=>shell.id===state.shotgunShellId)||SHOTGUN_SHELLS[0];
const magSize=(gun)=>weaponStats(gun,attachmentsFor(gun)).magazine;
const reloadDuration=(gun)=>reloadSeconds(attachmentsFor(gun),gun,GEAR.find(item=>item.id===state.gear)?.reloadMultiplier||1);

const state = {
  mode:'title', running:false, paused:false, loadoutOpen:false, time:0, elapsed:0, score:0, kills:0, scrap:0, roomsCleared:0,
  seed:0, tileMap:[], mapW:96, mapH:72, rooms:[], currentRoom:0,
  player:null, enemies:[], bullets:[], pickups:[], crates:[], cover:[], particles:[], props:[], doors:[], lockedDoors:[], solidMap:[], colliders:[], thrown:[], effects:[],
  weaponSlots:[0,1], activeSlot:0, get weaponIndex(){return this.weaponSlots[this.activeSlot];}, gear:null, carryCapacity:BASE_CARRY_CAPACITY, weaponAmmo:GUNS.map(g=>g.mag), reserveAmmo:GUNS.map(g=>g.reserve), attachments:new Map(), health:5, maxHealth:5, armor:0, maxArmor:0,
  progress:loadProgress(), paidOut:false,
  aim:{x:1,y:0}, lastAction:0, lastActionKind:'other', fireCooldown:0, reloadTimer:0, invuln:0, shake:0, flashTimer:0, hitstop:0, toastTimer:0, roomToast:'', sector:1,
  throwableIndex:2, throwables:{smoke:1,flash:1,frag:2,incendiary:1}, shotgunShellId:'buckshot', merchantOpen:false, merchantRoom:null, cacheOpen:false, cachePickup:null, pendingGunPickup:null, pendingLoadoutChange:null,
  scene:null, camera:null, renderer:null, physics:null, floorMesh:null, walls:[], meshRoot:null, actorMeshes:new Map(), pickupMeshes:new Map(), bulletMeshes:new Map(),
};
const input = {keys:new Set(), mouseX:innerWidth/2, mouseY:innerHeight/2, firing:false, interact:false};
const controls={bindings:{...DEFAULT_KEY_BINDINGS},waitingFor:null};

let renderer, scene, camera, physics, lighting;
const tempObj = new THREE.Object3D();
const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const MINIMAP_LOOT_COLORS={scrap:'#f4c66d',gun:'#74c9ed',mod:'#d38ff5',heal:'#74dfab',cache:'#f4c66d'};
let visualSettings={shake:1,flash:1};
function binding(action){return controls.bindings[action];}
function weaponSlotLabel(slot){return ['PRIMARY','SECONDARY','TERTIARY'][slot]||`SLOT ${slot+1}`;}
function maxWeaponSlots(){return progressionStats(state.progress).maxWeaponSlots;}
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
  $('key-guide').innerHTML=`<span>${movement}<i>MOVE</i></span><span>MOUSE<i>AIM / FIRE</i></span><span>${keyLabel(binding('interact'))}<i>INTERACT</i></span><span>${keyLabel(binding('reload'))}<i>RELOAD</i></span><span>${weaponKeys}<i>WEAPONS</i></span><span>TAB<i>LOADOUT</i></span>`;
  renderer?.domElement.setAttribute('aria-label',`DEAD AIR game. Use ${movement} to move and the mouse to aim and fire.`);
}
function markAction(kind='other'){state.lastAction=performance.now()/1000;state.lastActionKind=kind;}
const aimPlane = new THREE.Plane(new THREE.Vector3(0,1,0),0);
const hitPoint = new THREE.Vector3();

function random(){return ROT.RNG.getUniform();}
function rand(min,max){ return min+random()*(max-min); }
function choose(list){ return list[Math.floor(random()*list.length)]; }
function distance(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
function clamp(n,min,max){ return Math.max(min,Math.min(max,n)); }
function loadProgress(){try{return readSavedProgress(localStorage);}catch{return emptyProgress();}}
function saveProgress(){try{writeSavedProgress(localStorage,state.progress);}catch{toast('PROGRESS COULD NOT BE SAVED');}}
function resetProgress(){
  if(!window.confirm('Reset all saved coins and permanent upgrades? This cannot be undone.'))return;
  try{clearSavedProgress(localStorage);}catch{toast('SAVE COULD NOT BE RESET');return;}
  state.progress=emptyProgress();renderMeta();toast('SAFEHOUSE SAVE RESET');
}
function hud(){
  const gun=GUNS[state.weaponIndex];
  $('health').innerHTML=Array.from({length:state.maxHealth},(_,i)=>`<span class="heart ${i>=state.health?'empty':''}">♥</span>`).join('');
  $('armor-meter').hidden=state.maxArmor===0;$('armor-value').textContent=`${state.armor} / ${state.maxArmor}`;
  const mods=attachmentsFor(gun);$('gun-name').textContent=gun.name; $('gun-mods').textContent=mods.size?[...mods].map(([id,tier])=>`${MODS.find(m=>m.id===id)?.name.split(' ')[0]} · ${lootTier(tier).label}`).join(' + '):'BARE BONES';
  $('ammo').textContent=`${state.weaponAmmo[state.weaponIndex]} / ${magSize(gun)}`;
  $('weapon-note').textContent=state.reloadTimer>0?'RELOADING':gun.id==='shotgun'?`${shellForRun().name} · C TO CYCLE`:gun.short; $('kills').textContent=String(state.kills).padStart(2,'0'); $('scrap').textContent=String(state.scrap).padStart(3,'0');
  $('sector-count').textContent=`${String(state.roomsCleared+1).padStart(2,'0')} / ${String(state.rooms.length).padStart(2,'0')}`;
  $('run-clock').textContent=`${String(Math.floor(state.elapsed/60)).padStart(2,'0')}:${String(Math.floor(state.elapsed%60)).padStart(2,'0')}`;
  $('room-name').textContent=state.roomToast||`FLOOR 01 · ${state.rooms[state.currentRoom]?.name||'ENTRY'}`;
  $('loadout-scrap').textContent=`${String(state.scrap).padStart(3,'0')} SCRAP`;
  if(state.loadoutOpen)renderLoadout();
}
function syncHudFrame(){
  const gun=GUNS[state.weaponIndex];$('ammo').textContent=`${state.weaponAmmo[state.weaponIndex]} / ${magSize(gun)}`;$('weapon-note').textContent=state.reloadTimer>0?'RELOADING':gun.id==='shotgun'?`${shellForRun().name} · C TO CYCLE`:gun.short;
  $('kills').textContent=String(state.kills).padStart(2,'0');$('scrap').textContent=String(state.scrap).padStart(3,'0');
  $('sector-count').textContent=`${String(state.roomsCleared+1).padStart(2,'0')} / ${String(state.rooms.length).padStart(2,'0')}`;
  $('run-clock').textContent=`${String(Math.floor(state.elapsed/60)).padStart(2,'0')}:${String(Math.floor(state.elapsed%60)).padStart(2,'0')}`;
  $('room-name').textContent=state.roomToast||`FLOOR 01 · ${state.rooms[state.currentRoom]?.name||'ENTRY'}`;
}
function renderLoadout(){
  if(!$('loadout-gun'))return;
  const gear=GEAR.find(item=>item.id===state.gear),gearWeight=gear?.weight||0,weight=weaponLoadoutWeight(state.weaponSlots,GUNS)+gearWeight;
  $('loadout-gun').innerHTML=GUNS.map((gun,index)=>{
    const slot=state.weaponSlots.indexOf(index),target=weaponTargetSlot(index),plan=weaponReplacement(state.weaponSlots,target,index,GUNS,state.carryCapacity,gearWeight);
    const eligible=slot>=0||plan.canCarry;
    const status=slot>=0?`${slot===state.activeSlot?'ACTIVE · ':''}${weaponSlotLabel(slot)} · `:plan.canCarry?`PREVIEW ${target===state.weaponSlots.length?'ADD':'REPLACE'} ${weaponSlotLabel(target)} · `:'UNAVAILABLE · ';
    const result=slot>=0?`CURRENT RIG ${weight.toFixed(1)} / ${state.carryCapacity.toFixed(1)} WT`:plan.canCarry?`AFTER ${target===state.weaponSlots.length?'ADD':'SWAP'} ${plan.totalWeight.toFixed(1)} / ${state.carryCapacity.toFixed(1)} WT`:plan.totalWeight>state.carryCapacity?`TOO HEAVY · ${plan.totalWeight.toFixed(1)} / ${state.carryCapacity.toFixed(1)} WT`:'ALREADY IN OTHER SLOT';
    return `<button class="loadout-weapon ${index===state.weaponIndex?'active':''}" data-gun="${index}" ${eligible?'':`disabled title="${result}"`}><strong>${status}${gun.name}</strong><span>${gun.weight.toFixed(1)} WT · ${state.weaponAmmo[index]} / ${magSize(gun)} · ${state.reserveAmmo[index]} RESERVE<br>${result}</span></button>`;
  }).join('');
  $('gear-list').innerHTML=GEAR.map(item=>{
    const equipped=state.gear===item.id,repairing=equipped&&item.armorDurability&&state.armor<state.maxArmor,afterWeight=weaponLoadoutWeight(state.weaponSlots,GUNS)+(equipped?0:item.weight),tooHeavy=!equipped&&afterWeight>state.carryCapacity,cost=repairing?item.repairCost:item.cost,shortOnScrap=state.scrap<cost;
    const reason=equipped?item.armorDurability?`PLATE ${state.armor} / ${state.maxArmor} · CURRENT RIG ${weight.toFixed(1)} / ${state.carryCapacity.toFixed(1)} WT`:`CURRENT RIG ${weight.toFixed(1)} / ${state.carryCapacity.toFixed(1)} WT`:tooHeavy?`TOO HEAVY · ${afterWeight.toFixed(1)} / ${state.carryCapacity.toFixed(1)} WT`:shortOnScrap?`NEED ${cost-state.scrap} MORE SCRAP`:`AFTER SWAP ${afterWeight.toFixed(1)} / ${state.carryCapacity.toFixed(1)} WT`;
    const disabled=repairing?shortOnScrap:!equipped&&(tooHeavy||shortOnScrap),buttonLabel=repairing?`PREVIEW REPAIR · ${cost} SCRAP`:equipped?'PREVIEW UNEQUIP':`${item.cost} SCRAP`;
    return `<div class="mod-row"><span>${item.name}<br><small style="color:#8e8896">${item.description} · ${item.weight.toFixed(1)} WT · ${reason}</small></span><button data-gear="${item.id}" ${disabled?'disabled':''}>${buttonLabel}</button></div>`;
  }).join('');
  $('carry-readout').textContent=`WEIGHT ${weight.toFixed(1)} / ${state.carryCapacity.toFixed(1)} · ${state.weaponSlots.length}/${maxWeaponSlots()} SLOTS`;
  const gun=GUNS[state.weaponIndex],installed=attachmentsFor(gun),available=compatibleAttachments(gun,MODS);
  $('mod-list').innerHTML=available.map(mod=>{const tier=installed.get(mod.id);return `<div class="mod-row"><span>${mod.name}<br><small style="color:#8e8896">${mod.info}</small></span><button data-mod="${mod.id}" ${tier||state.scrap<mod.cost?'disabled':''}>${tier?`INSTALLED · ${lootTier(tier).label}`:`${mod.cost} SCRAP`}</button></div>`}).join('')||'<div class="mod-row"><span>No compatible attachments for this weapon.</span></div>';
  const item=THROWABLES[state.throwableIndex];if($('throwable-readout'))$('throwable-readout').textContent=`${item.name.toUpperCase()} · ${state.throwables[item.id]||0}`;
}
function previewLoadoutChange(change){
  if(change.type==='weapon'){
    const next=GUNS[change.index],slot=change.slot??weaponTargetSlot(change.index),current=GUNS[state.weaponSlots[slot]],gearWeight=GEAR.find(item=>item.id===state.gear)?.weight||0;
    if(!next||state.weaponSlots.includes(change.index))return;
    const plan=weaponReplacement(state.weaponSlots,slot,change.index,GUNS,state.carryCapacity,gearWeight);if(!plan.canCarry)return;
    change.slot=slot;
    $('loadout-change-title').textContent=`${slot===state.weaponSlots.length?'ADD':'REPLACE'} ${weaponSlotLabel(slot)} · ${next.name}`;
    $('loadout-change-copy').textContent=`${next.category} · ${next.damage} DAMAGE · ${Math.round(60/next.rate)} RPM · ${next.mag} ROUND MAG · ${next.weight.toFixed(1)} WT`;
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
  renderer?.domElement.focus();
}
function renderWeaponPickup(){
  const pickup=state.pendingGunPickup;if(!pickup)return;
  const gun=GUNS[pickup.gunIndex],gearWeight=GEAR.find(item=>item.id===state.gear)?.weight||0;
  $('weapon-pickup-name').textContent=gun.name;
  $('weapon-pickup-stats').textContent=`${gun.category} · ${gun.damage} DAMAGE · ${Math.round(60/gun.rate)} RPM · ${gun.mag} ROUND MAG · ${gun.weight.toFixed(1)} WT`;
  $('weapon-swap-options').innerHTML=weaponTargets().map(slot=>{
    const plan=weaponReplacement(state.weaponSlots,slot,pickup.gunIndex,GUNS,state.carryCapacity,gearWeight),oldGun=GUNS[state.weaponSlots[slot]];
    const adding=slot===state.weaponSlots.length,label=`${adding?'ADD':'SWAP'} ${weaponSlotLabel(slot)} · ${oldGun?`${oldGun.name} → `:''}${gun.name}`;
    const weight=plan.canCarry?`${plan.totalWeight.toFixed(1)} / ${state.carryCapacity.toFixed(1)} WT`:plan.totalWeight>state.carryCapacity?`TOO HEAVY · ${plan.totalWeight.toFixed(1)} / ${state.carryCapacity.toFixed(1)} WT`:'ALREADY CARRYING THIS GUN';
    const reason=plan.totalWeight>state.carryCapacity?`Exceeds carry capacity by ${(plan.totalWeight-state.carryCapacity).toFixed(1)} weight`:'This gun is already equipped';
    return `<button type="button" data-pickup-slot="${slot}" ${plan.canCarry?'':`disabled title="${reason}"`}><strong>${label}</strong><span>${weight} · FRESH MAGAZINE</span></button>`;
  }).join('');
  $('weapon-pickup').hidden=false;$('weapon-pickup').setAttribute('aria-hidden','false');
}
function showWeaponPickup(pickup){
  if(state.pendingGunPickup)return;
  state.pendingGunPickup=pickup;input.keys.clear();input.firing=false;renderWeaponPickup();$('weapon-pickup').querySelector('[data-pickup-slot]:not(:disabled)')?.focus();
}
function closeWeaponPickup(declined=false){
  if(declined&&state.pendingGunPickup)state.pendingGunPickup.declined=true;
  state.pendingGunPickup=null;$('weapon-pickup').hidden=true;$('weapon-pickup').setAttribute('aria-hidden','true');renderer?.domElement.focus();
}
function acceptWeaponPickup(slot){
  const pickup=state.pendingGunPickup;if(!pickup?.available)return;
  if(!weaponTargets().includes(slot))return;
  const gearWeight=GEAR.find(item=>item.id===state.gear)?.weight||0;
  const plan=weaponReplacement(state.weaponSlots,slot,pickup.gunIndex,GUNS,state.carryCapacity,gearWeight);
  if(!plan.canCarry)return;
  const gun=GUNS[pickup.gunIndex],color=pickup.mesh.material.color.getHex();
  state.weaponSlots=plan.weapons;state.activeSlot=slot;state.weaponAmmo[pickup.gunIndex]=gun.mag;state.reserveAmmo[pickup.gunIndex]+=gun.mag;
  pickup.available=false;state.pickupMeshes.delete(pickup);scene.remove(pickup.mesh);burst(pickup.x,pickup.y,color,8);pickup.mesh.geometry.dispose();pickup.mesh.material.dispose();
  closeWeaponPickup();hud();toast(`${gun.name} · ${weaponSlotLabel(slot)} EQUIPPED`);renderLoadout();
}
function renderMeta(){
  $('meta-balance').textContent=String(state.progress.coins);
  $('meta-coins').textContent=`AVAILABLE · ${state.progress.coins} COINS`;
  $('meta-list').innerHTML=META_UPGRADES.map(item=>{const level=state.progress.upgrades[item.id],cost=item.costs[level];return `<div class="meta-row"><div><strong>${item.name} · ${level}/${item.costs.length}</strong><small>${item.description}</small></div><button data-upgrade="${item.id}" ${cost===undefined||state.progress.coins<cost?'disabled':''}>${cost===undefined?'MAX':`${cost} COINS`}</button></div>`}).join('');
  renderKeyGuide();
}
function toast(message,duration=1700){const el=$('toast');el.textContent=message;el.classList.add('show');state.toastTimer=duration;}
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
function makeDoorFrames(){
  const postGeo=new THREE.BoxGeometry(5,14,7),headerGeo=new THREE.BoxGeometry(1,5,7);
  const frameMat=new THREE.MeshStandardMaterial({color:0x8b6745,metalness:.55,roughness:.5,emissive:0x28170a});
  for(const door of state.doors){
    const x=(door.x+.5)*TILE,z=(door.y+.5)*TILE,horizontal=door.axis==='x';
    for(const offset of [-TILE,TILE]){
      const post=new THREE.Mesh(postGeo,frameMat);post.position.set(x+(horizontal?offset:0),7,z+(horizontal?0:offset));scene.add(post);state.props.push(post);
    }
    const lintel=new THREE.Mesh(headerGeo,frameMat);lintel.scale.x=horizontal?TILE*2+5:5;lintel.scale.z=horizontal?7:TILE*2+5;lintel.position.set(x,WALL_H-2,z);scene.add(lintel);state.props.push(lintel);
  }
}
function makeRewardDoorGates(){
  for(const door of state.lockedDoors){
    const wideAlongZ=door.axis==='y',span=door.cells.length*TILE,x=(door.cells.reduce((sum,cell)=>sum+cell.x,0)/door.cells.length+.5)*TILE,z=(door.cells.reduce((sum,cell)=>sum+cell.y,0)/door.cells.length+.5)*TILE;
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(wideAlongZ?8:span,19,wideAlongZ?span:8),new THREE.MeshStandardMaterial({color:0xc78a45,emissive:0x693614,emissiveIntensity:.7,metalness:.65,roughness:.4}));
    mesh.position.set(x,9.5,z);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);state.props.push(mesh);
    const body=physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x,z));
    const halfWidth=wideAlongZ?4:span/2,halfDepth=wideAlongZ?span/2:4;
    physics.createCollider(RAPIER.ColliderDesc.cuboid(halfWidth,halfDepth),body);state.colliders.push({body});
    door.mesh=mesh;door.body=body;
    for(const {x:tileX,y:tileY} of door.cells)state.solidMap[tileY][tileX]=1;
  }
}
function placeRoleRewards(room){
  const reserved=[];
  for(const kind of roomPickupKinds(room.role)){
    const point=findRoomPropPosition({room,cells:state.tileMap,doors:state.doors,occupied:[...state.cover,...reserved],tileSize:TILE,random});
    if(!point)continue;
    dropPickup(kind,point.x,point.y,kind==='scrap'?30+Math.floor(random()*21):0,room.index);
    reserved.push({...point,radius:18});
  }
}
function findRoomCratePosition(room){
  const occupied=[...state.cover,...state.pickups.map(pickup=>({...pickup,radius:18}))];
  return findGuaranteedRoomCratePosition({room,cells:state.tileMap,doors:state.doors,occupied,tileSize:TILE,random});
}
function createRoomMap(){
  const dungeon=generateDungeon(ROT,state.seed);
  state.tileMap=dungeon.cells;state.solidMap=dungeon.cells.map(row=>row.slice());state.lockedDoors=dungeon.lockedDoors;state.doors=[...dungeon.doors,...state.lockedDoors];
  state.mapW=dungeon.width;state.mapH=dungeon.height;
  state.rooms=dungeon.rooms;state.currentRoom=0;
  state.rooms.forEach(room=>room.merchant=false);
  const merchantRooms=state.rooms.map((room,index)=>({room,index})).filter(item=>item.index>=2&&item.index<state.rooms.length-1&&item.room.role==='combat');
  if(merchantRooms.length&&random()<.18){const {room}=choose(merchantRooms);room.merchant=true;room.role='merchant';room.name='BLACK MARKET';room.stock=[];}
}
function makeLevel(){
  clearLevel(); createRoomMap();
  state.meshRoot=new THREE.Group();scene.add(state.meshRoot);
  const floors=[];const wallRuns=[];
  for(let y=0;y<state.mapH;y++){
    let run=-1;
    for(let x=0;x<=state.mapW;x++){
      const wall=x<state.mapW&&state.tileMap[y][x]!==0;
      if(!wall&&run>=0){wallRuns.push({x:run,y,len:x-run});run=-1;}
      else if(wall&&run<0)run=x;
      if(x<state.mapW&&state.tileMap[y][x]===0)floors.push({x,y});
    }
  }
  const floorGeo=new THREE.PlaneGeometry(TILE*.98,TILE*.98);
  const floorMat=new THREE.MeshStandardMaterial({color:0x282430,roughness:1,metalness:0});
  const floorMesh=new THREE.InstancedMesh(floorGeo,floorMat,floors.length);floorMesh.position.y=0;floorMesh.receiveShadow=true;
  const color=new THREE.Color();
  floors.forEach((tile,i)=>{tempObj.position.set((tile.x+.5)*TILE,0,(tile.y+.5)*TILE);tempObj.rotation.set(-Math.PI/2,0,0);tempObj.scale.set(1,1,1);tempObj.updateMatrix();floorMesh.setMatrixAt(i,tempObj.matrix);const noise=(Math.imul(tile.x*92821+tile.y*68917+state.seed,19349663)>>>0)%23;color.setHex(0x282430).offsetHSL(0,0,(noise-11)*.002);floorMesh.setColorAt(i,color);});
  floorMesh.instanceMatrix.needsUpdate=true;if(floorMesh.instanceColor)floorMesh.instanceColor.needsUpdate=true;scene.add(floorMesh);state.floorMesh=floorMesh;
  const wallGeo=new THREE.BoxGeometry(1,1,1),wallMat=new THREE.MeshStandardMaterial({color:0x494252,roughness:.93});
  const wallMesh=new THREE.InstancedMesh(wallGeo,wallMat,wallRuns.length);wallMesh.receiveShadow=true;wallMesh.castShadow=true;
  wallRuns.forEach((run,i)=>{
    const width=run.len*TILE;tempObj.position.set(run.x*TILE+width/2,WALL_H/2,run.y*TILE+TILE/2);tempObj.scale.set(width,WALL_H,TILE);tempObj.rotation.set(0,0,0);tempObj.updateMatrix();wallMesh.setMatrixAt(i,tempObj.matrix);
    makeFixedBox(run.x*TILE+width/2,run.y*TILE+TILE/2,width/2,TILE/2);
  });wallMesh.instanceMatrix.needsUpdate=true;scene.add(wallMesh);state.walls.push(wallMesh);
  makeDoorFrames();makeRewardDoorGates();
  const pillarGeo=new THREE.CylinderGeometry(7,8,11,6);const pillarMat=new THREE.MeshStandardMaterial({color:0x36313f,roughness:.8});
  for(const room of state.rooms){
    const point=findRoomCratePosition(room);
    if(!point)throw new Error(`Room ${room.index} has no safe crate position`);
    spawnCrate(point.x,point.y);placeRoleRewards(room);
  }
  for(const room of state.rooms){
    const pickRoomProp=()=>findRoomPropPosition({room,cells:state.tileMap,doors:state.doors,occupied:[...state.cover,...state.pickups.map(pickup=>({...pickup,radius:18}))],tileSize:TILE,random});
    for(let i=0;i<Math.floor((room.x2-room.x1)*(room.y2-room.y1)/52);i++){
      const position=pickRoomProp();if(!position)continue;
      if(random()<.3){const p=new THREE.Mesh(pillarGeo,pillarMat);p.position.set(position.x,5.5,position.y);scene.add(p);state.props.push(p);state.colliders.push({body:makeBody({x:position.x,y:position.y},7,true)});state.cover.push({x:position.x,y:position.y,radius:9,kind:'pillar'});}
      else if(random()<.9)spawnCrate(position.x,position.y);
    }
  }
  const merchantRoom=state.rooms.find(room=>room.merchant);if(merchantRoom)makeMerchantVisual((merchantRoom.cx+.5)*TILE,(merchantRoom.cy+.5)*TILE);
  let combatIndex=0;
  for(const [i,room] of state.rooms.entries()){
    if(i===0)continue;
    if(room.merchant)continue;
    const count=roomEnemyCount(room.role,random(),combatIndex),encounter=roomEncounterTypes(room.role,chooseEncounterTypes(count,state.seed+i*7919));
    if(room.role==='combat')combatIndex++;
    for(let j=0;j<count;j++){
      const elite=room.role==='elite'&&encounter[j]==='brute',point=findEnemySpawn(room,encounter[j],elite);
      if(point)spawnEnemy(encounter[j],point.x,point.y,i,elite);
    }
    if(!roomPickupKinds(room.role).length){
      if(i%2===1){dropPickup('scrap',rand(room.x1+2,room.x2-2)*TILE,rand(room.y1+2,room.y2-2)*TILE,10+Math.floor(random()*21));}
      if(i%3===0){const kind=choose(['gun','mod','heal']);dropPickup(kind,rand(room.x1+2,room.x2-2)*TILE,rand(room.y1+2,room.y2-2)*TILE);}
    }
    const tint=[0xff5367,0xeaaa66,0x79d6ae,0xa888e8][i%4];
  const floorGlow=new THREE.Mesh(new THREE.CircleGeometry(Math.min(room.x2-room.x1,room.y2-room.y1)*TILE*.31,32),new THREE.MeshBasicMaterial({color:tint,transparent:true,opacity:.025,depthWrite:false}));floorGlow.rotation.x=-Math.PI/2;floorGlow.position.set((room.cx+.5)*TILE,.04,(room.cy+.5)*TILE);scene.add(floorGlow);state.props.push(floorGlow);
  }
  const start=state.rooms[0];const sx=(start.cx+.5)*TILE,sy=(start.cy+.5)*TILE;
  const body=makeBody({x:sx,y:sy},8,false);body.lockRotations(true,true);body.setLinearDamping(4);
  state.player={body,x:sx,y:sy,hp:state.health};createActorMesh('player');makeWorkbench(sx+76,sy);
  const exit=state.rooms.at(-1);dropPickup('exit',(exit.cx+.5)*TILE,(exit.cy+.5)*TILE);
  state.currentRoom=0;state.roomsCleared=0;updateRoom();makeMinimap();hud();
}
function clearLevel(){
  state.player=null;state.enemies=[];state.bullets=[];state.pickups=[];state.crates=[];state.cover=[];state.particles=[];state.thrown=[];state.effects=[];state.props=[];state.actorMeshes.clear();state.pickupMeshes.clear();state.bulletMeshes.clear();state.colliders=[];state.doors=[];state.lockedDoors=[];state.solidMap=[];state.walls=[];
  for(const obj of [...scene.children])if(obj!==camera&&obj!==lighting){scene.remove(obj);obj.traverse(child=>{child.geometry?.dispose();if(Array.isArray(child.material))child.material.forEach(material=>material.dispose());else child.material?.dispose();});}
  physics?.free();
  physics=new RAPIER.World({x:0,y:0});state.physics=physics;
  state.floorMesh=null;
}
function createActorMesh(type,radius=8,colorHex){
  const color=type==='player'?0x62e1ad:(colorHex??ENEMY_TYPES[type]?.color??0xffffff);
  const mesh=new THREE.Group();
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(radius*1.22,16),new THREE.MeshBasicMaterial({color:0x080710,transparent:true,opacity:.47,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.11;mesh.add(shadow);
  const body=new THREE.Mesh(new THREE.CylinderGeometry(radius*.68,radius,radius*1.1,8),new THREE.MeshStandardMaterial({color,roughness:.55,emissive:color,emissiveIntensity:.05}));body.position.y=radius*.55;body.castShadow=true;mesh.add(body);
  const face=new THREE.Mesh(new THREE.ConeGeometry(radius*.45,radius*.55,3),new THREE.MeshBasicMaterial({color:0xf8ecda}));face.rotation.x=Math.PI/2;face.position.set(0,radius*.75,radius*.8);mesh.add(face);
  const weapon=new THREE.Group();weapon.position.set(0,radius*.63,radius*.62);
  const gunMaterial=new THREE.MeshStandardMaterial({color:type==='player'?0xd4d0c9:0x39333b,roughness:.45,metalness:.55,emissive:type==='player'?0x15221e:0x210c0e,emissiveIntensity:.5});
  const gunBody=new THREE.Mesh(new THREE.BoxGeometry(radius*.34,radius*.28,radius*1.5),gunMaterial);gunBody.position.z=radius*.36;weapon.add(gunBody);
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(radius*.075,radius*.075,radius*.52,8),new THREE.MeshStandardMaterial({color:0x8e8b86,metalness:.75,roughness:.3}));barrel.rotation.x=Math.PI/2;barrel.position.z=radius*1.28;weapon.add(barrel);
  const sight=new THREE.Mesh(new THREE.BoxGeometry(radius*.22,radius*.09,radius*.25),gunMaterial);sight.position.set(0,radius*.19,radius*.45);weapon.add(sight);
  mesh.add(weapon);mesh.userData.weapon=weapon;mesh.userData.weaponBody=gunBody;mesh.userData.body=body;mesh.userData.radius=radius;scene.add(mesh);state.actorMeshes.set(type==='player'?'player':mesh,mesh);return mesh;
}
function makeWorkbench(x,y){
  const group=new THREE.Group();group.position.set(x,0,y);
  const metal=new THREE.MeshStandardMaterial({color:0x423847,roughness:.62,metalness:.3});
  const neon=new THREE.MeshStandardMaterial({color:0xff6076,emissive:0xff355e,emissiveIntensity:1.5,roughness:.3});
  const table=new THREE.Mesh(new THREE.BoxGeometry(42,8,28),metal);table.position.y=9;table.castShadow=true;group.add(table);
  const screen=new THREE.Mesh(new THREE.BoxGeometry(19,16,3),neon);screen.position.set(0,21,-6);group.add(screen);
  for(const xLeg of [-15,15])for(const zLeg of [-9,9]){const leg=new THREE.Mesh(new THREE.BoxGeometry(4,10,4),metal);leg.position.set(xLeg,3,zLeg);group.add(leg);}
  const ring=new THREE.Mesh(new THREE.TorusGeometry(29,1.3,6,32),neon);ring.rotation.x=Math.PI/2;ring.position.y=.3;group.add(ring);scene.add(group);state.props.push(group);
}
function makeMerchantVisual(x,y){
  const group=new THREE.Group();group.position.set(x,0,y);const coat=new THREE.MeshStandardMaterial({color:0x82543e,roughness:.8}),glow=new THREE.MeshStandardMaterial({color:0xffc46b,emissive:0xff713d,emissiveIntensity:1.2});
  const body=new THREE.Mesh(new THREE.CylinderGeometry(9,11,20,7),coat);body.position.y=12;body.castShadow=true;group.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(7,10,8),new THREE.MeshStandardMaterial({color:0xc7a17c,roughness:.8}));head.position.y=26;group.add(head);
  const hood=new THREE.Mesh(new THREE.ConeGeometry(9,10,7),glow);hood.position.y=34;group.add(hood);
  const sign=new THREE.Mesh(new THREE.BoxGeometry(40,12,3),glow);sign.position.set(0,44,-2);group.add(sign);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(42,1.7,6,36),glow);ring.rotation.x=Math.PI/2;ring.position.y=.5;group.add(ring);scene.add(group);state.props.push(group);
}
function spawnCrate(x,y){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(24,14,24),new THREE.MeshStandardMaterial({color:0x76543f,roughness:.88}));
  mesh.position.set(x,7,y);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);state.props.push(mesh);
  const healthBar=new THREE.Group();healthBar.position.set(x,15.2,y-22);healthBar.visible=false;
  const back=new THREE.Mesh(new THREE.BoxGeometry(28,1,6),new THREE.MeshBasicMaterial({color:0x211820}));
  const fill=new THREE.Mesh(new THREE.BoxGeometry(24,1.2,3.5),new THREE.MeshBasicMaterial({color:0x83ddae}));fill.position.y=.7;
  healthBar.add(back,fill);scene.add(healthBar);
  const body=physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x,y));
  physics.createCollider(RAPIER.ColliderDesc.cuboid(12,12),body);state.colliders.push({body});
  const crate={x,y,hp:60,maxHp:60,mesh,body,healthBar,healthFill:fill,healthBarTimer:0,damageStage:0,cracks:[]};state.crates.push(crate);state.cover.push({x,y,radius:17,kind:'crate',crate});return crate;
}
function findEnemySpawn(room,type,elite=false){
  const radius=elite?13:type==='brute'?10:8;
  const clear=(x,y)=>state.solidMap[Math.floor(y/TILE)]?.[Math.floor(x/TILE)]===0&&
    state.doors.every(door=>Math.hypot(x-(door.x+.5)*TILE,y-(door.y+.5)*TILE)>=TILE*1.2)&&
    !state.cover.some(cover=>Math.hypot(x-cover.x,y-cover.y)<cover.radius+radius+3)&&
    !state.pickups.some(pickup=>pickup.available&&Math.hypot(x-pickup.x,y-pickup.y)<radius+18)&&
    !state.enemies.some(enemy=>enemy.alive&&Math.hypot(x-enemy.x,y-enemy.y)<radius+enemy.radius+4);
  for(let attempt=0;attempt<48;attempt++){
    const x=rand(room.x1+2,room.x2-2)*TILE,y=rand(room.y1+2,room.y2-2)*TILE;
    if(clear(x,y))return {x,y};
  }
  for(let ty=room.y1+1;ty<=room.y2;ty++)for(let tx=room.x1+1;tx<=room.x2;tx++){
    const x=(tx+.5)*TILE,y=(ty+.5)*TILE;if(clear(x,y))return {x,y};
  }
  return null;
}
function crackCrate(crate,stage){
  const patterns=[
    [[-9,7.15,-10],[0,7.15,0],[0,7.15,0],[7,7.15,9],[0,7.15,0],[-5,7.15,5]],
    [[8,7.2,-10],[0,7.2,0],[0,7.2,0],[-9,7.2,9],[0,7.2,0],[4,7.2,7]],
  ];
  for(let i=crate.cracks.length;i<stage;i++){
    const points=patterns[i].map(([x,y,z])=>new THREE.Vector3(x,y,z));
    const crack=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:i?0x180f13:0x211a19}));
    crack.position.copy(crate.mesh.position);scene.add(crack);state.props.push(crack);crate.cracks.push(crack);
  }
}
function updateCrateDamageVisual(crate){
  const ratio=crate.hp/crate.maxHp,stage=crateDamageStage(crate.hp,crate.maxHp);
  crate.healthBarTimer=2.4;crate.healthBar.visible=true;crate.healthFill.scale.x=ratio;crate.healthFill.position.x=-12*(1-ratio);
  crate.healthFill.material.color.setHex(stage===2?0xff5266:stage===1?0xf2a45f:0x83ddae);
  if(stage>crate.damageStage){crackCrate(crate,stage);crate.damageStage=stage;crate.mesh.material.color.setHex(stage===2?0x4d3330:0x654634);}
}
function updateCrateVisuals(dt){
  for(const crate of state.crates){if(crate.healthBarTimer<=0)continue;crate.healthBarTimer=Math.max(0,crate.healthBarTimer-dt);if(crate.healthBarTimer===0)crate.healthBar.visible=false;}
}
function breakCrate(crate){
  playCrateBreak();
  physics.removeRigidBody(crate.body);scene.remove(crate.mesh);crate.mesh.geometry.dispose();crate.mesh.material.dispose();
  for(const crack of crate.cracks){disposeObject(crack);state.props=state.props.filter(prop=>prop!==crack);}
  disposeObject(crate.healthBar);state.props=state.props.filter(prop=>prop!==crate.mesh);state.colliders=state.colliders.filter(item=>item.body!==crate.body);state.crates=state.crates.filter(item=>item!==crate);state.cover=state.cover.filter(item=>item.crate!==crate);
  state.shake=Math.max(state.shake,1.8);burst(crate.x,crate.y,0xb98258,11,1.1);
  if(random()<progressionStats(state.progress).crateDropChance)dropPickup('scrap',crate.x,crate.y,8+Math.floor(random()*13));
}
function spawnEnemy(type,x,y,roomIndex,elite=false){
  const base=ENEMY_TYPES[type],def=elite?{...base,name:'WARDEN',hp:200,speed:26,damage:2,color:0xff9566}:base,radius=elite?13:type==='brute'?10:8,body=makeBody({x,y},radius,false);body.lockRotations(true,true);body.setLinearDamping(3.4);
  const mesh=createActorMesh(type,radius,def.color);mesh.position.set(x,0,y);
  let healthBar=null,healthFill=null;
  if(elite){healthBar=new THREE.Group();healthBar.visible=true;const back=new THREE.Mesh(new THREE.BoxGeometry(38,1,5),new THREE.MeshBasicMaterial({color:0x211820}));healthFill=new THREE.Mesh(new THREE.BoxGeometry(34,1.4,3),new THREE.MeshBasicMaterial({color:0xff9566}));healthFill.position.y=.8;healthBar.add(back,healthFill);scene.add(healthBar);}
  const points=[new THREE.Vector3(),new THREE.Vector3()];const aimLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:type==='brute'?0xffb15e:0xff4d61,transparent:true,opacity:.82,depthWrite:false}));aimLine.visible=false;scene.add(aimLine);
  const meleeTelegraph=type==='brute'?new THREE.Mesh(new THREE.BoxGeometry(12,1.5,42),new THREE.MeshBasicMaterial({color:0xffad57,transparent:true,opacity:.88,depthWrite:false})):null;
  if(meleeTelegraph){meleeTelegraph.position.set(x,1.1,y+21);meleeTelegraph.visible=false;meleeTelegraph.renderOrder=4;scene.add(meleeTelegraph);}
  const mag=type==='gunner'?5:type==='guard'?3:0;state.enemies.push({type,def,body,mesh,aimLine,meleeTelegraph,healthBar,healthFill,x,y,roomIndex,radius,hp:def.hp,maxHp:def.hp,fire:rand(.55,1.7),aimTimer:0,aim:{x:1,y:0},meleeWindup:0,meleeCooldown:0,mag,ammo:mag,reloadTimer:0,stun:0,knock:{x:0,y:0},alive:true,id:random(),side:random()<.5?-1:1,tacticTimer:rand(0,.25),intent:'hold',intentGoal:null,navGoal:null});
}
function possiblePickupGuns(){
  return GUNS.map((gun,index)=>index).filter(index=>!state.weaponSlots.includes(index)&&canEquipGun(index));
}
function dropPickup(kind,x,y,value=0,roomIndex=null){
  if(state.solidMap[Math.floor(y/TILE)]?.[Math.floor(x/TILE)]!==0)return;
  const gunIndex=kind==='gun'?choose(possiblePickupGuns()):undefined;if(kind==='gun'&&!Number.isInteger(gunIndex))return;
  const rarity=kind==='mod'?lootTierForRoll(random(),progressionStats(state.progress).luckyFindLevel):null;
  const colors={scrap:0xf4c66d,gun:0x74c9ed,mod:lootTier(rarity).color,heal:0x74dfab,cache:0xf4c66d,exit:0xff5969};
  const geometry=kind==='exit'?new THREE.TorusGeometry(16,3,6,20):kind==='cache'?new THREE.BoxGeometry(13,10,13):new THREE.OctahedronGeometry(kind==='gun'?9:kind==='heal'?8:6,0);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:colors[kind],emissive:colors[kind],emissiveIntensity:.4,roughness:.45,metalness:.1}));mesh.position.set(x,kind==='exit'?1:5,y);mesh.castShadow=true;scene.add(mesh);
  const pickup={kind,x,y,value,mesh,gunIndex,rarity,roomIndex,available:true,declined:false};state.pickups.push(pickup);state.pickupMeshes.set(pickup,mesh);
}
function makeBulletMesh(color){const mesh=new THREE.Mesh(new THREE.SphereGeometry(2.4,8,6),new THREE.MeshBasicMaterial({color}));mesh.material.toneMapped=false;scene.add(mesh);return mesh;}
function fireBullet(owner,x,y,dx,dy,gun,damageScale=1,projectile={}){
  const stats=owner==='player'?weaponStats(gun,attachmentsFor(gun)):null;
  const speed=stats?.projectileSpeed??gun.speed;
  const body=makeBody({x:x+dx*13,y:y+dy*13},2.3,false,true);body.enableCcd(true);body.setLinearDamping(0);body.setGravityScale(0,true);body.setLinvel({x:dx*speed,y:dy*speed},true);
  const color=owner==='player'?gun.color:0xff6a64;const mesh=makeBulletMesh(color);mesh.position.set(x+dx*13,.85,y+dy*13);
  const mods=owner==='player'?attachmentsFor(gun):new Set();
  const bullet={owner,body,mesh,x:x+dx*13,y:y+dy*13,vx:dx*speed,vy:dy*speed,damage:projectile.damage??(stats?.damage??gun.damage)*damageScale,life:(projectile.range??stats?.range??gun.range??speed*1.7)/speed,penetration:owner==='player'?weaponPenetration(gun,mods):{enemies:0,crates:0,walls:0},hitEnemies:new Set(),hitCrates:new Set(),insideWall:false};
  state.bullets.push(bullet);state.bulletMeshes.set(bullet,mesh);
  if(owner==='player'){state.shake=Math.max(state.shake,gun.id==='shotgun'?3.6:2.2);state.hitstop=.025;burst(x+dx*15,y+dy*15,0xffd08a,4);}
}
function playerShoot(){
  const p=state.player;if(!p||state.reloadTimer>0)return;
  if(state.weaponAmmo[state.weaponIndex]<=0){if(state.reserveAmmo[state.weaponIndex]>0){state.reloadTimer=reloadDuration(GUNS[state.weaponIndex]);playReload();toast('RELOADING',750);}else toast('DRY CLICK · FIND AMMO',650);return;}
  const gun=GUNS[state.weaponIndex],stats=weaponStats(gun,attachmentsFor(gun)),now=state.time;if(now<state.fireCooldown)return;
  state.fireCooldown=now+stats.fireRate;state.weaponAmmo[state.weaponIndex]--;playGunshot(gun);
  const aim=Math.atan2(state.aim.y,state.aim.x),shell=gun.id==='shotgun'?shotgunShellStats(shellForRun(),stats):null;
  const count=shell?.pellets??gun.count??1,spread=shell?.spread??stats.spread;
  for(let i=0;i<count;i++){const angle=aim+(random()-.5)*spread+(shell?0:count>1?(i-(count-1)/2)*.08:0);fireBullet('player',p.x,p.y,Math.cos(angle),Math.sin(angle),gun,1,shell?{damage:shell.damage,range:shell.range}:{});}
  hud();markAction(hasMovementInput()?'move':'fire');
}
function enemyShoot(enemy,dx,dy){
  fireBullet('enemy',enemy.x,enemy.y,dx,dy,{speed:enemy.def.projectileSpeed,range:enemy.def.range,damage:enemy.def.damage,color:0xff6a64},1);
}
function burst(x,y,color,count=10,power=1){
  const budget=particleBurstBudget(state.particles.length,count);
  for(let i=0;i<budget.evict;i++){const oldest=state.particles.shift();if(oldest)disposeObject(oldest.mesh);}
  for(let i=0;i<budget.spawn;i++){const angle=random()*TAU,speed=(2+random()*8)*power,life=.18+random()*.4;const mesh=new THREE.Mesh(new THREE.BoxGeometry(rand(1.1,3.3),rand(1,3),rand(1,3)),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.95}));mesh.position.set(x,rand(1,5),y);scene.add(mesh);state.particles.push({mesh,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life,max:life,color});}
}
function disposeObject(object){scene.remove(object);object.traverse(child=>{child.geometry?.dispose();if(Array.isArray(child.material))child.material.forEach(material=>material.dispose());else child.material?.dispose();});}
function killEnemy(enemy,bullet){
  if(!enemy.alive)return;enemy.alive=false;enemy.corpseTimer=3.5;enemy.aimTimer=0;enemy.aimLine.visible=false;disposeObject(enemy.aimLine);if(enemy.meleeTelegraph){disposeObject(enemy.meleeTelegraph);enemy.meleeTelegraph=null;}if(enemy.healthBar)disposeObject(enemy.healthBar);for(let i=0;i<enemy.body.numColliders();i++)enemy.body.collider(i).setEnabled(false);enemy.body.setLinvel({x:bullet.vx*.17,y:bullet.vy*.17},true);enemy.hp=0;
  enemy.mesh.userData.body.rotation.z=Math.PI/2;enemy.mesh.userData.body.material.color.setHex(0x542d42);enemy.mesh.userData.body.material.emissive.setHex(0x260d1a);enemy.mesh.userData.body.material.transparent=true;enemy.mesh.userData.body.material.opacity=.76;
  state.kills++;state.scrap+=6+Math.floor(random()*8);state.shake=Math.max(state.shake,3.8);state.hitstop=.045;burst(enemy.x,enemy.y,enemy.def.color,17,1.4);
  if(random()<.2)dropPickup(random()<.55?'scrap':'mod',enemy.x,enemy.y,12+Math.floor(random()*10));
  hud();checkRoomClear();
}
function hitPlayer(damage,x,y){
  if(state.invuln>0||state.mode!=='play')return;
  const impact=absorbArmorDamage(state.armor,damage);state.armor=impact.armor;state.health=Math.max(0,state.health-impact.healthDamage);state.invuln=.85;state.shake=impact.healthDamage>0?5.5:2.8;state.hitstop=.075;markAction();burst(state.player.x,state.player.y,impact.healthDamage>0?0xff4e63:0x75cfe0,12,1.1);
  const message=impact.healthDamage===0?state.armor===0?'PLATE BROKEN · HEALTH HELD':`PLATE HIT · ${state.armor} LEFT`:impact.absorbed>0?'PLATE HIT · VITALS DAMAGED':damage>1?'BRUTAL HIT':'YOU GOT TAGGED';toast(message,900);hud();
  const dx=state.player.x-x,dy=state.player.y-y,len=Math.hypot(dx,dy)||1;state.player.body.setLinvel({x:dx/len*95,y:dy/len*95},true);
  if(state.health<=0){finishRun('dead');$('vignette').style.background='radial-gradient(ellipse,rgba(95,15,30,.25),rgba(10,6,13,.85))';}
}
function reload(){const gun=GUNS[state.weaponIndex];if(state.reloadTimer>0||state.weaponAmmo[state.weaponIndex]>=magSize(gun)||state.reserveAmmo[state.weaponIndex]<=0)return;state.reloadTimer=reloadDuration(gun);playReload();toast('RELOADING',700);}
function switchWeapon(slot){if(slot<0||slot>=state.weaponSlots.length)return;state.reloadTimer=0;state.activeSlot=slot;markAction();hud();}
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
function collect(pickup,manual=false){if(!pickup.available)return false;const d=distance(state.player,pickup);if(d>28)return false;if(pickup.kind==='cache'){if(manual)openCache(pickup);return false;}if(pickup.kind==='gun'){if(pickup.declined&&!manual)return false;showWeaponPickup(pickup);return false;}pickup.available=false;scene.remove(pickup.mesh);state.pickupMeshes.delete(pickup);burst(pickup.x,pickup.y,pickup.mesh.material.color.getHex(),8);
  switch(pickup.kind){
    case'scrap':state.scrap+=pickup.value||12;toast(`+${pickup.value||12} SCRAP`);break;
    case'mod':{const gun=GUNS[state.weaponIndex],unowned=compatibleAttachments(gun,MODS).filter(mod=>!attachmentsFor(gun).has(mod.id));if(unowned.length)installMod(choose(unowned).id,state.weaponIndex,true,pickup.rarity);else state.scrap+=30;break;}
    case'heal':state.health=Math.min(state.maxHealth,state.health+2);toast('PATCHED UP · +2 VITALS');break;
    case'exit':if(hasUnclearedRouteEnemies(state.rooms,state.enemies)){toast('CLEAR THE MAIN ROUTE FIRST');pickup.available=true;scene.add(pickup.mesh);return false;}winRun();break;
  }if(!pickup.available){pickup.mesh.geometry.dispose();pickup.mesh.material.dispose();if(pickup.kind!=='exit')playPickup(pickup.kind);}hud();return true;
}
function cacheMods(){const gun=GUNS[state.weaponIndex];return compatibleAttachments(gun,MODS).filter(mod=>!attachmentsFor(gun).has(mod.id));}
function cacheChoiceStatus(choice){const gun=GUNS[state.weaponIndex],mods=cacheMods();
  return cacheRewardAvailable(choice,{health:state.health,maxHealth:state.maxHealth,ammo:state.weaponAmmo[state.weaponIndex],magazine:magSize(gun),reserve:state.reserveAmmo[state.weaponIndex],maxReserve:gun.reserve,hasUpgrade:mods.length>0});
}
function renderCache(){
  const choices=[['ammo','AMMUNITION','Refill this weapon and add reserve rounds.'],['health','FIELD MEDKIT','Restore up to two health.'],['upgrade','FIELD TUNING','Install a random compatible attachment at a Lucky Find quality.'],['prototype','PROTOTYPE DRAW','Install a prototype attachment, but lose one health.'],['scrap','SCRAP STASH','Take 35 scrap for the run.']];
  $('cache-options').innerHTML=choices.map(([id,name,description])=>`<div class="merchant-row"><span><strong>${name}</strong><small>${description}</small></span><button data-cache="${id}" ${cacheChoiceStatus(id)?'':'disabled'}>TAKE</button></div>`).join('');
}
function openCache(pickup){
  if(roomHasLivingEnemies(pickup.roomIndex,state.enemies)){toast('CLEAR THE CACHE ROOM FIRST');return;}
  state.cachePickup=pickup;state.cacheOpen=true;input.keys.clear();input.firing=false;renderCache();$('cache-panel').hidden=false;$('cache-panel').setAttribute('aria-hidden','false');$('close-cache').focus();
}
function closeCache(){state.cacheOpen=false;state.cachePickup=null;input.keys.clear();input.firing=false;$('cache-panel').hidden=true;$('cache-panel').setAttribute('aria-hidden','true');renderer.domElement.focus();}
function takeCacheReward(choice){
  const pickup=state.cachePickup;if(!pickup||!cacheChoiceStatus(choice))return;
  const gun=GUNS[state.weaponIndex];
  if(choice==='ammo'){
    state.weaponAmmo[state.weaponIndex]=magSize(gun);
    state.reserveAmmo[state.weaponIndex]=Math.min(gun.reserve,state.reserveAmmo[state.weaponIndex]+Math.max(12,Math.ceil(gun.reserve*.25)));
    toast('CACHE · AMMO RESTOCKED');
  }else if(choice==='health'){
    const healed=Math.min(2,state.maxHealth-state.health);state.health+=healed;toast(`CACHE · +${healed} HEALTH`);
  }else if(choice==='scrap'){
    state.scrap+=35;toast('CACHE · +35 SCRAP');
  }else{
    const mod=choose(cacheMods()),tier=choice==='prototype'?'prototype':lootTierForRoll(random(),progressionStats(state.progress).luckyFindLevel);
    if(choice==='prototype')state.health--;
    if(!installMod(mod.id,state.weaponIndex,true,tier))return;
    toast(choice==='prototype'?'PROTOTYPE CACHE · -1 HEALTH':'FIELD CACHE · ATTACHMENT FOUND');
  }
  pickup.available=false;scene.remove(pickup.mesh);state.pickupMeshes.delete(pickup);disposeObject(pickup.mesh);burst(pickup.x,pickup.y,0xf4c66d,14,1.1);playPickup('cache');closeCache();hud();
}
function finishRun(result){if(state.paidOut)return;if(result==='won')playExtraction();state.mode=result;state.paidOut=true;const payout=runCoinPayout({won:result==='won',roomsCleared:state.roomsCleared,kills:state.kills});state.progress=awardCoins(state.progress,payout);saveProgress();$('run-result').hidden=false;$('run-result').textContent=`${result==='won'?'EXTRACTION COMPLETE':'RUN OVER'} · ${state.roomsCleared} ROOMS · ${state.kills} KILLS · +${payout} COINS`;$('start-button').textContent='RUN AGAIN ↗';$('overlay').classList.add('show');$('meta-panel').hidden=true;renderMeta();$('start-button').focus();toast(result==='won'?'SECTOR CLEARED':'RUN OVER',3500);}
function winRun(){finishRun('won');}
function checkRoomClear(){for(const [i,r] of state.rooms.entries()){
  if(r.cleared||!r.visited)continue;
  const hasEnemy=roomHasLivingEnemies(i,state.enemies);
  if(!hasEnemy){r.cleared=true;state.roomsCleared++;if(roomHasEncounter(i,state.enemies)){const reward=progressionStats(state.progress).roomClearScrap;state.scrap+=reward;playRoomClear();toast(`ROOM CLEAR · +${reward} SCRAP`,1800);for(let n=0;n<6;n++)dropPickup('scrap',rand(r.x1+1,r.x2-1)*TILE,rand(r.y1+1,r.y2-1)*TILE,4);hud();}}
}}
function updateRoom(){
  const px=state.player.x/TILE,py=state.player.y/TILE;let found=state.rooms.findIndex(r=>px>=r.x1-1&&px<=r.x2+1&&py>=r.y1-1&&py<=r.y2+1);
  if(found<0){const nearest=state.rooms.reduce((best,r,i)=>Math.hypot(px-r.cx,py-r.cy)<best.d?{i,d:Math.hypot(px-r.cx,py-r.cy)}:best,{i:state.currentRoom,d:Infinity});found=nearest.i;}
  if(found!==state.currentRoom){state.currentRoom=found;const room=state.rooms[found],discoveredSecret=room.secret&&!room.visited;room.visited=true;if(discoveredSecret)room.name=room.revealedName;state.roomToast=discoveredSecret?'SECRET ROOM FOUND':`FLOOR 01 · ${room.name}`;state.toastTimer=1100;checkRoomClear();hud();}
  if(state.roomToast&&state.toastTimer<=0)state.roomToast='';
}
function interact(){
  const gate=state.lockedDoors.find(door=>!door.opened&&distance(state.player,{x:(door.x+.5)*TILE,y:(door.y+.5)*TILE})<38);
  if(gate){const purchase=unlockRewardGate(gate,state.scrap);if(purchase.status==='insufficient'){toast(`VAULT LOCK · NEED ${purchase.missing} MORE SCRAP`);return;}if(purchase.status!=='opened')return;state.scrap=purchase.scrap;gate.opened=true;for(const {x,y} of gate.cells)state.solidMap[y][x]=0;if(gate.body){physics.removeRigidBody(gate.body);state.colliders=state.colliders.filter(item=>item.body!==gate.body);gate.body=null;}if(gate.mesh){disposeObject(gate.mesh);state.props=state.props.filter(item=>item!==gate.mesh);gate.mesh=null;}toast(`CACHE GATE OPEN · -${gate.cost} SCRAP`);hud();return;}
  const cache=state.pickups.find(pickup=>pickup.available&&pickup.kind==='cache'&&distance(state.player,pickup)<36);if(cache){collect(cache,true);return;}
  const market=state.rooms.find(room=>room.merchant&&distance(state.player,{x:(room.cx+.5)*TILE,y:(room.cy+.5)*TILE})<90);if(market){openMerchant(market);return;}
  const close=state.pickups.filter(p=>p.available&&distance(state.player,p)<36).sort((a,b)=>distance(state.player,a)-distance(state.player,b))[0];
  if(close){collect(close,true);return;}
  if(distance(state.player,{x:state.rooms[0].cx*TILE,y:state.rooms[0].cy*TILE})<110){toggleLoadout();return;}
  toast('NOTHING IN REACH',650);
}
function createMerchantStock(room){
  const attachmentOptions=compatibleAttachments(GUNS[state.weaponIndex],MODS).filter(mod=>!attachmentsFor(GUNS[state.weaponIndex]).has(mod.id));
  const gearWeight=GEAR.find(item=>item.id===state.gear)?.weight||0;
  const eligibleGuns=GUNS.filter((gun,index)=>!state.weaponSlots.includes(index)&&chooseWeaponReplacementSlot(state.weaponSlots,index,maxWeaponSlots(),state.activeSlot,GUNS,state.carryCapacity,gearWeight)!==undefined);
  const gear=choose(GEAR);
  const offers=[{type:'weapon',gunId:choose(eligibleGuns.length?eligibleGuns:GUNS).id,cost:42},{type:'gear',gearId:gear.id,cost:gear.cost+13},{type:'health',cost:24},{type:'throwable',throwableId:choose(THROWABLES).id,cost:22}];
  if(attachmentOptions.length){const mod=choose(attachmentOptions);offers.splice(1,0,{type:'attachment',modId:mod.id,gunIndex:state.weaponIndex,cost:mod.cost+12});}
  room.stock=offers.map(offer=>({...offer,sold:false}));
}
function merchantOfferName(offer){if(offer.type==='weapon')return GUNS.find(gun=>gun.id===offer.gunId)?.name||'WEAPON';if(offer.type==='attachment')return `${MODS.find(mod=>mod.id===offer.modId)?.name||'ATTACHMENT'} · ${GUNS[offer.gunIndex].name}`;if(offer.type==='gear')return GEAR.find(item=>item.id===offer.gearId)?.name||'GEAR';if(offer.type==='health')return 'FIELD MEDKIT';const item=throwableById(offer.throwableId);return `${item?.name||'THROWABLE'} REFILL`;}
function merchantCanBuy(offer){
  if(offer.sold||state.scrap<offer.cost)return false;
  if(offer.type==='weapon'){const index=GUNS.findIndex(gun=>gun.id===offer.gunId);return index>=0&&canEquipGun(index);}
  if(offer.type==='attachment'){const gun=GUNS[offer.gunIndex];return !!gun&&compatibleAttachments(gun,MODS).some(mod=>mod.id===offer.modId)&&!attachmentsFor(gun).has(offer.modId);}
  if(offer.type==='gear'){const item=GEAR.find(option=>option.id===offer.gearId);return !!item&&state.gear!==item.id&&weaponLoadoutWeight(state.weaponSlots,GUNS)+item.weight<=state.carryCapacity;}
  if(offer.type==='health')return state.health<state.maxHealth;
  if(offer.type==='throwable')return (state.throwables[offer.throwableId]||0)<throwableById(offer.throwableId).stack;
  return false;
}
function renderMerchant(){
  if(!state.merchantRoom)return;const room=state.merchantRoom;if(!room.stock?.length)createMerchantStock(room);
  $('merchant-stock').innerHTML=room.stock.map((offer,index)=>{const active=merchantCanBuy(offer),reason=(offer.type==='weapon'||offer.type==='gear')&&!active&&state.scrap>=offer.cost?(offer.type==='gear'&&state.gear===offer.gearId?' · EQUIPPED':' · TOO HEAVY'):offer.type==='health'&&!active?' · FULL HEALTH':'';const gear=offer.type==='gear'?GEAR.find(item=>item.id===offer.gearId):null;return `<div class="merchant-row"><span><strong>${merchantOfferName(offer)}</strong><small>${offer.type==='weapon'?`Add or replace a weapon slot (1–${maxWeaponSlots()})`:offer.type==='attachment'?'Permanent for this run · compatible with the named gun':gear?`${gear.description} · ${gear.weight.toFixed(1)} carry weight`:offer.type==='health'?'+2 health':'Refill to carry limit'}${reason}</small></span><button data-merchant="${index}" ${active?'':'disabled'}>${offer.sold?'SOLD':`${offer.cost} SCRAP`}</button></div>`;}).join('')+`<div class="merchant-footer">POCKETS · ${state.scrap} SCRAP</div>`;
}
function openMerchant(room){state.merchantRoom=room;state.merchantOpen=true;renderMerchant();$('merchant-panel').hidden=false;$('merchant-panel').setAttribute('aria-hidden','false');$('close-merchant').focus();}
function closeMerchant(){state.merchantOpen=false;$('merchant-panel').hidden=true;$('merchant-panel').setAttribute('aria-hidden','true');state.renderer.domElement.focus();}
function buyMerchantOffer(index){const offer=state.merchantRoom?.stock[index];if(!offer||!merchantCanBuy(offer))return;if(offer.type==='gear'){const item=GEAR.find(option=>option.id===offer.gearId);if(!item||!equipGear(offer.gearId))return;state.scrap-=Math.max(0,offer.cost-item.cost);offer.sold=true;hud();renderMerchant();return;}state.scrap-=offer.cost;
  if(offer.type==='weapon'){const weaponIndex=GUNS.findIndex(gun=>gun.id===offer.gunId),slot=weaponSlotForGun(weaponIndex);if(slot===undefined)return;state.weaponSlots[slot]=weaponIndex;state.weaponAmmo[weaponIndex]=GUNS[weaponIndex].mag;state.reserveAmmo[weaponIndex]=GUNS[weaponIndex].reserve;toast(`${weaponSlotLabel(slot)} · ${GUNS[weaponIndex].name}`);}
  else if(offer.type==='attachment'){state.scrap+=offer.cost;const mod=MODS.find(item=>item.id===offer.modId);if(!installMod(offer.modId,offer.gunIndex))return;state.scrap-=Math.max(0,offer.cost-mod.cost);}
  else if(offer.type==='health'){state.health=Math.min(state.maxHealth,state.health+2);toast('PATCHED UP · +2 VITALS');}
  else {const item=throwableById(offer.throwableId);state.throwables[offer.throwableId]=item.stack;toast(`${item.name.toUpperCase()} RESTOCKED`);}
  offer.sold=true;hud();renderMerchant();
}
function selectedThrowable(){return THROWABLES[state.throwableIndex];}
function throwThrowable(){const item=selectedThrowable(),inventory=consumeThrowable(state.throwables,item.id);if(!inventory.consumed){toast(`OUT OF ${item.name.toUpperCase()}`,800);return;}const p=state.player,body=makeBody({x:p.x+state.aim.x*12,y:p.y+state.aim.y*12},3,false);body.enableCcd(true);body.setLinearDamping(0);body.setGravityScale(0,true);const speed=item.range/(item.fuse+.28);body.setLinvel({x:state.aim.x*speed,y:state.aim.y*speed},true);const color={smoke:0xaaa8b3,flash:0xffe59b,frag:0xff704e,incendiary:0xff673d}[item.id],mesh=new THREE.Mesh(new THREE.SphereGeometry(4,8,6),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.8}));scene.add(mesh);state.thrown.push({id:item.id,item,body,mesh,fuse:item.fuse,x:p.x,y:p.y});state.throwables=inventory.inventory;markAction();updateThrowableHud();toast(`${item.name.toUpperCase()} OUT`,700);}
function detonateThrowable(projectile){physics.removeRigidBody(projectile.body);disposeObject(projectile.mesh);const {item,id,x,y}=projectile,color={smoke:0xb2aeb9,flash:0xffe59b,frag:0xff704e,incendiary:0xff683d}[id];const mesh=new THREE.Mesh(new THREE.CircleGeometry(item.radius,32),new THREE.MeshBasicMaterial({color,transparent:true,opacity:id==='smoke'?.27:.17,depthWrite:false}));mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.22,y);scene.add(mesh);const effect={id,item,x,y,remaining:item.duration,elapsed:0,nextTick:0,mesh};state.effects.push(effect);burst(x,y,color,id==='frag'?22:12,id==='frag'?2:1);if(id==='flash'&&distance({x,y},state.player)<item.radius&&!lineBlocked(x,y,state.player.x,state.player.y))state.flashTimer=.24;
  if(id==='frag'||id==='flash'){for(const enemy of state.enemies){if(!enemy.alive)continue;const d=distance({x,y},enemy),blocked=lineBlocked(x,y,enemy.x,enemy.y);if(!throwableAffectsTarget(id,{distance:d,blockedByWall:blocked}))continue;if(id==='flash'){enemy.stun=Math.max(enemy.stun,item.duration);enemy.aimTimer=0;enemy.aimLine.visible=false;}else{enemy.hp-=item.damage*(1-d/item.radius*.48);const dx=enemy.x-x,dy=enemy.y-y,len=Math.hypot(dx,dy)||1;enemy.knock.x=dx/len*54;enemy.knock.y=dy/len*54;burst(enemy.x,enemy.y,0xffbb82,9,1.2);if(enemy.hp<=0)killEnemy(enemy,{vx:dx/len*600,vy:dy/len*600});}}if(id==='frag'&&distance({x,y},state.player)<item.radius&&!lineBlocked(x,y,state.player.x,state.player.y))hitPlayer(1,x,y);}
}
function updateThrown(dt){for(let i=state.thrown.length-1;i>=0;i--){const projectile=state.thrown[i];projectile.fuse-=dt;const p=projectile.body.translation();projectile.x=p.x;projectile.y=p.y;projectile.mesh.position.set(p.x,4+Math.sin(state.time*18)*2,p.y);if(projectile.fuse<=0){detonateThrowable(projectile);state.thrown.splice(i,1);}}}
function updateEffects(dt){for(let i=state.effects.length-1;i>=0;i--){const effect=state.effects[i];effect.remaining-=dt;effect.elapsed+=dt;effect.mesh.material.opacity=(effect.id==='smoke'?.27:.17)*Math.min(1,effect.remaining/.45);if(effect.id==='incendiary'&&effect.elapsed>=effect.nextTick){effect.nextTick=effect.elapsed+.48;for(const enemy of state.enemies){const d=distance(effect,enemy);if(enemy.alive&&isWithinThrowableRadius('incendiary',d)&&!lineBlocked(effect.x,effect.y,enemy.x,enemy.y)){enemy.hp-=effect.item.damage;enemy.stun=Math.max(enemy.stun,.12);burst(enemy.x,enemy.y,0xff6a35,3,.6);if(enemy.hp<=0)killEnemy(enemy,{vx:0,vy:0});}}}if(effect.remaining<=0){disposeObject(effect.mesh);state.effects.splice(i,1);}}}
function updateThrowableHud(){const item=selectedThrowable();$('throwable-readout').textContent=`${keyLabel(binding('throwableCycle'))} ${item.name.toUpperCase()} · ${state.throwables[item.id]||0}`;$('throwable-hint').textContent=`${keyLabel(binding('throwableCycle'))} SELECT · ${keyLabel(binding('throwableUse'))} THROW`;}
function toggleLoadout(force){state.loadoutOpen=force??!state.loadoutOpen;if(!state.loadoutOpen)closeLoadoutPreview();if(state.loadoutOpen)renderLoadout();$('loadout').classList.toggle('show',state.loadoutOpen);$('loadout').setAttribute('aria-hidden',String(!state.loadoutOpen));if(state.loadoutOpen)$('close-loadout').focus();else state.renderer.domElement.focus();}
function trapDialogTab(event,panel){
  const focusable=[...panel.querySelectorAll('button:not(:disabled)')].filter(button=>!button.closest('[hidden]'));
  const first=focusable[0],last=focusable.at(-1),focused=document.activeElement;
  if(!first)return;
  if(!panel.contains(focused)){event.preventDefault();first.focus();}
  else if(event.shiftKey&&focused===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&focused===last){event.preventDefault();first.focus();}
}
function getTimeScale(){return timeScale({mode:state.mode,paused:state.paused||state.merchantOpen||state.cacheOpen||!!state.pendingGunPickup,loadoutOpen:state.loadoutOpen,moving:hasMovementInput(),firing:input.firing,now:performance.now()/1000,lastAction:state.lastAction,lastActionKind:state.lastActionKind,idleScale:progressionStats(state.progress).idleScale});}
function updatePlayer(dt){
  const p=state.player;if(!p)return;
  const {x:vx,y:vy}=movementFromKeys(input.keys,controls.bindings);if(vx!==0||vy!==0)markAction('move');
  const speed=progressionStats(state.progress).moveSpeed;p.body.setLinvel({x:vx*speed,y:vy*speed},true);const pos=p.body.translation();p.x=pos.x;p.y=pos.y;
  pointer.set(input.mouseX/innerWidth*2-1,-input.mouseY/innerHeight*2+1);raycaster.setFromCamera(pointer,camera);raycaster.ray.intersectPlane(aimPlane,hitPoint);
  if(hitPoint){const dx=hitPoint.x-p.x,dy=hitPoint.z-p.y,d=Math.hypot(dx,dy)||1;state.aim.x=dx/d;state.aim.y=dy/d;}
  const mesh=state.actorMeshes.get('player'),gun=GUNS[state.weaponIndex],reloading=state.reloadTimer>0;mesh.position.set(p.x,.2,p.y);mesh.rotation.y=Math.atan2(state.aim.x,state.aim.y);mesh.userData.weapon.rotation.y=reloading?1.4:0;mesh.userData.weaponBody.material.color.setHex(reloading?0xffad63:0xd4d0c9);mesh.userData.weaponBody.material.emissive.setHex(reloading?0x8c3023:0x15221e);mesh.userData.weapon.scale.set(gun.visual.width/5,1,gun.visual.length/19);
  state.invuln=Math.max(0,state.invuln-dt);mesh.visible=state.invuln<=0||Math.floor(state.time*18)%2===0;
  if(state.reloadTimer>0){state.reloadTimer-=dt;if(state.reloadTimer<=0){const gun=GUNS[state.weaponIndex],needed=magSize(gun)-state.weaponAmmo[state.weaponIndex],take=Math.min(needed,state.reserveAmmo[state.weaponIndex]);state.weaponAmmo[state.weaponIndex]+=take;state.reserveAmmo[state.weaponIndex]-=take;hud();}}
  if(input.firing)playerShoot();if(input.interact){input.interact=false;interact();}
  for(const pickup of state.pickups){if(pickup.declined&&distance(p,pickup)>48)pickup.declined=false;if(state.pendingGunPickup)break;if(pickup.available&&distance(p,pickup)<19)collect(pickup);}
  const gateNear=state.lockedDoors.find(door=>!door.opened&&distance(p,{x:(door.x+.5)*TILE,y:(door.y+.5)*TILE})<38),cacheNear=state.pickups.find(pickup=>pickup.available&&pickup.kind==='cache'&&distance(p,pickup)<36),stationNear=distance(p,{x:state.rooms[0].cx*TILE,y:state.rooms[0].cy*TILE})<110,shopNear=state.rooms.some(room=>room.merchant&&distance(p,{x:(room.cx+.5)*TILE,y:(room.cy+.5)*TILE})<90),gunNear=state.pickups.filter(pickup=>pickup.available&&pickup.kind==='gun'&&distance(p,pickup)<36).sort((a,b)=>distance(p,a)-distance(p,b))[0];
  const interactKey=keyLabel(binding('interact'));$('interaction-hint').textContent=gateNear?`${interactKey} · UNLOCK CACHE · ${gateNear.cost} SCRAP`:cacheNear?`${interactKey} · ${roomHasLivingEnemies(cacheNear.roomIndex,state.enemies)?'CLEAR ROOM FOR CACHE':'OPEN ROOM CACHE'}`:gunNear?`${interactKey} · REVIEW ${GUNS[gunNear.gunIndex].name}`:shopNear?`${interactKey} · ENTER THE BLACK MARKET`:`${interactKey} · OPEN THE LOADOUT`;$('interaction-hint').classList.toggle('show',(gateNear||cacheNear||gunNear||stationNear||shopNear)&&!state.loadoutOpen&&!state.merchantOpen&&!state.cacheOpen&&!state.pendingGunPickup);
  updateRoom();
}
function lineBlocked(x1,y1,x2,y2){const start={x:x1,y:y1},end={x:x2,y:y2},length=Math.hypot(x2-x1,y2-y1),steps=Math.ceil(length/8);for(let i=1;i<steps;i++){const t=i/steps,tx=Math.floor((x1+(x2-x1)*t)/TILE),ty=Math.floor((y1+(y2-y1)*t)/TILE);if(state.solidMap[ty]?.[tx]!==0)return true;}return state.crates.some(crate=>segmentIntersectsCircle(start,end,crate,17))||state.cover.some(cover=>!cover.crate&&segmentIntersectsCircle(start,end,cover,cover.radius));}
function smokeBlocksLine(x1,y1,x2,y2){return state.effects.some(effect=>effect.id==='smoke'&&effect.remaining>0&&segmentIntersectsCircle({x:x1,y:y1},{x:x2,y:y2},effect,effect.item.radius));}
function enemyPassableTile(e,x,y){
  if(state.solidMap[y]?.[x]!==0)return false;
  const cx=(x+.5)*TILE,cy=(y+.5)*TILE,radius=e.radius;
  return !state.crates.some(crate=>Math.hypot(cx-crate.x,cy-crate.y)<25)&&
    !state.cover.some(cover=>!cover.crate&&Math.hypot(cx-cover.x,cy-cover.y)<cover.radius+radius+2);
}
function enemyCanMoveTo(e,goal){
  const tx=Math.floor(goal.x/TILE),ty=Math.floor(goal.y/TILE);
  if(!enemyPassableTile(e,tx,ty))return false;
  return shortestFloorPath(state.tileMap,{x:Math.floor(e.x/TILE),y:Math.floor(e.y/TILE)},{x:tx,y:ty},(x,y)=>enemyPassableTile(e,x,y)).length>0;
}
function routedEnemyGoal(e,goal){
  if(!goal)return null;
  const start={x:Math.floor(e.x/TILE),y:Math.floor(e.y/TILE)},end={x:Math.floor(goal.x/TILE),y:Math.floor(goal.y/TILE)};
  if(start.x===end.x&&start.y===end.y)return goal;
  const path=shortestFloorPath(state.tileMap,start,end,(x,y)=>enemyPassableTile(e,x,y));
  if(path.length===0)return null;
  if(path.length===1)return goal;
  const next=path[1];return {x:(next.x+.5)*TILE,y:(next.y+.5)*TILE};
}
function updateEnemies(dt){
  const player=state.player;
  const playerShots=state.bullets.filter(b=>b.owner==='player');
  for(const e of state.enemies){if(!e.alive)continue;const dx=player.x-e.x,dy=player.y-e.y,d=Math.hypot(dx,dy)||1,nx=dx/d,ny=dy/d;e.fire-=dt;e.stun=Math.max(0,e.stun-dt);if(e.reloadTimer>0){e.reloadTimer=Math.max(0,e.reloadTimer-dt);if(e.reloadTimer===0)e.ammo=e.mag;}
    const ranged=e.def.brain==='shoot'||e.def.brain==='guard',actor={x:e.x,y:e.y,brain:e.def.brain,minRange:e.def.minRange,range:e.def.range,hp:e.hp,maxHp:e.maxHp,reloadTimer:e.reloadTimer,side:e.side,radius:e.radius};
    e.tacticTimer-=dt;
    if(e.tacticTimer<=0||hasIncomingProjectile(actor,playerShots)){
      const canSee=!lineBlocked(e.x,e.y,player.x,player.y)&&!smokeBlocksLine(e.x,e.y,player.x,player.y);
      const covers=state.cover.map(cover=>{
        const ox=cover.x-player.x,oy=cover.y-player.y,length=Math.hypot(ox,oy)||1,offset=cover.radius+14;
        const point={x:cover.x+ox/length*offset,y:cover.y+oy/length*offset};
        return {...point,protected:lineBlocked(player.x,player.y,point.x,point.y)};
      });
      const tactic=chooseEnemyTactic({actor,target:{x:player.x,y:player.y},canSee,projectiles:playerShots,covers,canMoveTo:goal=>enemyCanMoveTo(e,goal)});
      if(tactic.intent==='dodge'||e.tacticTimer<=0){e.intent=tactic.intent;e.intentGoal=tactic.goal;e.navGoal=tactic.intent==='dodge'?tactic.goal:routedEnemyGoal(e,tactic.goal);e.tacticTimer=tactic.intent==='dodge'?.14:.42;}
    }
    const canSee=!lineBlocked(e.x,e.y,player.x,player.y)&&!smokeBlocksLine(e.x,e.y,player.x,player.y),canAcquire=ranged&&d>=e.def.minRange&&d<e.def.range&&canSee&&e.reloadTimer<=0;
    if(e.type==='brute'){
      if(e.stun>0){e.meleeWindup=0;e.aimLine.visible=false;e.meleeTelegraph.visible=false;}
      else{
        const evasive=['dodge','retreat','cover'].includes(e.intent);
        const attack=stepBruteMelee({windup:e.meleeWindup,cooldown:e.meleeCooldown},dt,d<e.def.range&&canSee&&!evasive,evasive);
        e.meleeWindup=attack.windup;e.meleeCooldown=attack.cooldown;
        if(attack.started)e.aim={x:nx,y:ny};
        if(e.meleeWindup>0){e.aimLine.visible=false;e.meleeTelegraph.position.set(e.x+e.aim.x*21,1.1,e.y+e.aim.y*21);e.meleeTelegraph.rotation.y=Math.atan2(e.aim.x,e.aim.y);e.meleeTelegraph.visible=true;}
        else{e.aimLine.visible=false;e.meleeTelegraph.visible=false;}
        if(attack.strike&&bruteMeleeHits({canSee,distance:d,range:e.def.range,targetRadius:10,aim:e.aim,targetDirection:{x:nx,y:ny}}))hitPlayer(e.def.damage,e.x,e.y);
      }
    }
    let vx=0,vy=0;
    if(e.intentGoal&&e.navGoal&&Math.hypot(e.navGoal.x-e.x,e.navGoal.y-e.y)<=10){
      if(Math.hypot(e.intentGoal.x-e.x,e.intentGoal.y-e.y)<=14){e.intentGoal=null;e.navGoal=null;}
      else e.navGoal=routedEnemyGoal(e,e.intentGoal);
    }
    if(e.intentGoal&&!e.navGoal)e.navGoal=routedEnemyGoal(e,e.intentGoal);
    if(e.navGoal){const gx=e.navGoal.x-e.x,gy=e.navGoal.y-e.y,length=Math.hypot(gx,gy);if(length>9){vx=gx/length*e.def.speed;vy=gy/length*e.def.speed;}else if(!e.intentGoal)e.navGoal=null;}
    if(e.aimTimer>0){e.aimTimer-=dt;const endX=e.x+e.aim.x*Math.min(e.def.range,280),endY=e.y+e.aim.y*Math.min(e.def.range,280),line=e.aimLine.geometry.attributes.position;line.setXYZ(0,e.x,1.1,e.y);line.setXYZ(1,endX,1.1,endY);line.needsUpdate=true;e.aimLine.visible=true;if(e.aimTimer<=0){e.aimTimer=0;e.aimLine.visible=false;const fired=e.stun<=0&&d>=e.def.minRange&&d<e.def.range&&canSee;if(fired){enemyShoot(e,e.aim.x,e.aim.y);e.ammo--;}if(e.ammo<=0){e.reloadTimer=e.def.brain==='guard'?2.05:1.55;e.fire=0;playReload();}else e.fire=fired?(e.def.brain==='guard'?rand(1.7,2.7):rand(1.1,2.2)):.18;}}
    else if(canAcquire&&e.fire<=0&&e.stun<=0){e.aim={x:nx,y:ny};e.aimTimer=e.def.brain==='guard'?.62:.48;playEnemyTell();}
    if(e.stun>0){vx=0;vy=0;e.navGoal=null;e.aimTimer=0;e.aimLine.visible=false;}
    for(const other of state.enemies){if(other===e||!other.alive)continue;const ox=e.x-other.x,oy=e.y-other.y,od=Math.hypot(ox,oy);if(od>0&&od<23){vx+=ox/od*3;vy+=oy/od*3;}}
    e.body.setLinvel({x:vx+e.knock.x,y:vy+e.knock.y},true);e.knock.x*=Math.pow(.1,dt);e.knock.y*=Math.pow(.1,dt);
    const pos=e.body.translation();e.x=pos.x;e.y=pos.y;e.mesh.position.set(e.x,.2,e.y);if(e.healthBar){e.healthBar.position.set(e.x,e.radius*1.85,e.y-20);e.healthFill.scale.x=clamp(e.hp/e.maxHp,0,1);e.healthFill.position.x=-17*(1-e.healthFill.scale.x);}const charging=e.meleeWindup>0,facing=charging||e.aimTimer>0?e.aim:{x:nx,y:ny},reloading=e.reloadTimer>0;e.mesh.rotation.y=Math.atan2(facing.x,facing.y);e.mesh.userData.weapon.rotation.y=reloading?1.4:0;e.mesh.userData.weaponBody.material.color.setHex(reloading?0xff875b:0x39333b);e.mesh.userData.weaponBody.material.emissive.setHex(reloading?0x802921:charging?0x8f3215:0x210c0e);e.mesh.userData.weapon.rotation.x=e.aimTimer>0?.13:0;e.mesh.userData.body.material.emissive.setHex(charging?0xff7738:e.def.color);e.mesh.userData.body.material.emissiveIntensity=charging?.72:.05;e.mesh.userData.body.scale.setScalar(e.type==='brute'?(charging?1.42:1.22):1);
    if(e.type==='chaser'&&d<e.def.range&&random()<dt*1.2)hitPlayer(e.def.damage,e.x,e.y);
  }
}
function updateBullets(dt){
  for(let i=state.bullets.length-1;i>=0;i--){const b=state.bullets[i],previous={x:b.x,y:b.y};b.life-=dt;if(b.life<=0){removeBullet(i);continue;}const pos=b.body.translation();b.x=pos.x;b.y=pos.y;b.mesh.position.set(b.x,.7,b.y);
    const impacts=[];
    if(b.owner==='player')for(const enemy of state.enemies){if(!enemy.alive||b.hitEnemies.has(enemy))continue;const t=segmentCircleHitTime(previous,b,enemy,enemy.type==='brute'?13:11);if(t!==null)impacts.push({t,kind:'enemy',target:enemy});}
    for(const crate of state.crates){if(b.hitCrates.has(crate))continue;const t=segmentCircleHitTime(previous,b,crate,17);if(t!==null)impacts.push({t,kind:'crate',target:crate});}
    for(const cover of state.cover){if(cover.crate)continue;const t=segmentCircleHitTime(previous,b,cover,cover.radius+2);if(t!==null)impacts.push({t,kind:'cover',target:cover});}
    if(b.owner==='enemy'&&state.player){const t=segmentCircleHitTime(previous,b,state.player,10);if(t!==null)impacts.push({t,kind:'player',target:state.player});}
    const wallState=segmentWallRuns(previous,b,state.solidMap,TILE,b.insideWall);b.insideWall=wallState.endsInsideWall;
    for(const wall of wallState.runs)impacts.push({...wall,kind:'wall'});
    impacts.sort((a,b)=>a.t-b.t);
    let removed=false;
    for(const impact of impacts){
      if(impact.kind==='enemy'){
        const enemy=impact.target;b.hitEnemies.add(enemy);enemy.hp-=b.damage;enemy.stun=.1;const len=Math.hypot(b.vx,b.vy)||1;enemy.knock.x=b.vx/len*(enemy.type==='brute'?7:13);enemy.knock.y=b.vy/len*(enemy.type==='brute'?7:13);burst(enemy.x,enemy.y,0xffd3aa,6,.72);state.hitstop=.018;
        if(enemy.hp<=0)killEnemy(enemy,b);else{enemy.mesh.userData.body.material.emissiveIntensity=.5;setTimeout(()=>{if(enemy.mesh?.userData.body)enemy.mesh.userData.body.material.emissiveIntensity=.05;},80);}
      }else if(impact.kind==='crate'){
        const crate=impact.target;b.hitCrates.add(crate);crate.hp=damageDurability(crate.hp,b.damage);updateCrateDamageVisual(crate);burst(crate.x,crate.y,0xb98258,4,.65);if(crate.hp===0)breakCrate(crate);
      }else if(impact.kind==='player'){
        hitPlayer(b.damage,b.x,b.y);removed=true;
      }else if(impact.kind==='cover'){
        burst(b.x,b.y,b.owner==='player'?0xf0c986:0xfa7068,3,.5);removed=true;
      }else{
        // One connected run of solid map tiles counts as a single wall.
      }
      if(removed)break;
      const next=consumePenetration(b.penetration,impact.kind==='enemy'?'enemies':impact.kind==='crate'?'crates':impact.kind==='wall'?'walls':'cover');
      if(!next){burst(b.x,b.y,b.owner==='player'?0xf0c986:0xfa7068,3,.5);removed=true;break;}
      b.penetration=next;
    }
    if(removed){removeBullet(i);continue;}
  }
}
function removeBullet(i){const b=state.bullets[i];physics.removeRigidBody(b.body);disposeObject(b.mesh);state.bulletMeshes.delete(b);state.bullets.splice(i,1);}
function updateParticles(dt){for(let i=state.particles.length-1;i>=0;i--){const p=state.particles[i];p.life-=dt;p.mesh.position.x+=p.vx*dt;p.mesh.position.z+=p.vy*dt;p.mesh.rotation.x+=dt*8;p.mesh.rotation.z+=dt*5;p.mesh.material.opacity=Math.max(0,p.life/p.max);if(p.life<=0){scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();state.particles.splice(i,1);}}}
function updateCorpses(dt){for(const e of state.enemies){if(e.alive||!e.corpseTimer)continue;e.corpseTimer-=dt;const p=e.body.translation();e.x=p.x;e.y=p.y;e.mesh.position.set(e.x,.2,e.y);if(e.corpseTimer<=0){physics.removeRigidBody(e.body);disposeObject(e.mesh);e.corpseTimer=0;}}}
function update(dt){
  state.flashTimer=Math.max(0,state.flashTimer-dt);$('flash-overlay').style.opacity=String(flashOverlayOpacity(state.flashTimer,visualSettings.flash));
  if(state.mode!=='play'||state.paused||state.loadoutOpen||state.merchantOpen||state.cacheOpen||state.pendingGunPickup)return;
  const scale=getTimeScale();const step=dt*scale;if(state.hitstop>0){state.hitstop-=dt;if(state.hitstop<=0)physics.step();}else{physics.timestep=Math.min(step,1/30);physics.step();}
  state.time+=step;state.elapsed+=step;updatePlayer(step);updateEnemies(step);updateBullets(step);updateCrateVisuals(step);updateThrown(step);updateEffects(step);updateCorpses(step);updateParticles(step);state.shake=Math.max(0,state.shake-dt*14);state.toastTimer=Math.max(0,state.toastTimer-dt*1000);if(state.toastTimer<=0){$('toast').classList.remove('show');if(state.roomToast){state.roomToast='';hud();}}
  const now=performance.now()/1000,recent=now-state.lastAction<.35,hasMoveInput=hasMovementInput(),moving=hasMoveInput||(!input.firing&&recent&&state.lastActionKind==='move'),firing=input.firing||(!hasMoveInput&&recent&&state.lastActionKind==='fire');
  const tempoLabel=firing?(moving?'MOVE + FIRE · BLENDED':'FIRE · BLENDED'):moving?'MOVE · NORMAL':'STILL · SLOW';const meter=$('tempo-fill').parentElement;
  $('tempo-label').textContent=tempoLabel;$('tempo-speed').textContent=`${scale.toFixed(2)}×`;$('tempo-fill').style.width=`${Math.round(clamp(scale,0,1)*100)}%`;meter.classList.toggle('fast',moving&&!firing);meter.classList.toggle('firing',firing);$('tempo').querySelector('.tempo-dot').style.background=firing?'#e4b267':moving?'#fe5669':'#65dca8';
  const p=state.player;if(p){camera.position.set(p.x,90,p.y);camera.lookAt(p.x,0,p.y);const shake=scaledCameraShake(state.shake,visualSettings.shake);camera.position.x+=rand(-shake,shake);camera.position.z+=rand(-shake,shake);}
  drawMinimap();syncHudFrame();
}
function makeMinimap(){const c=$('minimap'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);}
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
function drawMinimap(){const c=$('minimap'),ctx=c.getContext('2d'),sx=c.width/state.mapW,sy=c.height/state.mapH;ctx.fillStyle='#171420';ctx.fillRect(0,0,c.width,c.height);
  const scanRange=progressionStats(state.progress).scannerRange,player=state.player;
  for(const r of state.rooms){const roomDistance=player?distanceToRect(player,{left:r.x1*TILE,top:r.y1*TILE,right:(r.x2+1)*TILE,bottom:(r.y2+1)*TILE}):Infinity;if(!minimapContactVisible({visited:r.visited,distance:roomDistance,scanRange,secret:r.secret}))continue;ctx.fillStyle=r.visited?'#45404e':'#34303a';for(let y=r.y1;y<=r.y2;y++)for(let x=r.x1;x<=r.x2;x++)if(state.tileMap[y]?.[x]===0)ctx.fillRect(x*sx, y*sy, sx+.2, sy+.2);}
  ctx.fillStyle='#ed5a68';for(const e of state.enemies){if(!e.alive)continue;const ex=e.x/TILE,ey=e.y/TILE,spawnRoom=state.rooms[e.roomIndex],room=state.rooms.find(r=>ex>=r.x1&&ex<=r.x2&&ey>=r.y1&&ey<=r.y2),enemyDistance=state.player?distance(state.player,e):Infinity;if(minimapContactVisible({visited:!!room?.visited,distance:enemyDistance,scanRange,secret:spawnRoom?.secret&&!spawnRoom.visited}))ctx.fillRect(ex*sx-1,ey*sy-1,3,3);}
  for(const p of state.pickups)if(p.available&&p.kind==='exit'){ctx.fillStyle='#f5cb76';ctx.fillRect(p.x/TILE*sx-1,p.y/TILE*sy-1,3,3);}
  drawLootScannerPings(ctx,sx,sy,player);
  if(state.player){ctx.fillStyle='#70e5b2';ctx.beginPath();ctx.arc(state.player.x/TILE*sx,state.player.y/TILE*sy,3,0,TAU);ctx.fill();}
}
function newRun(){
  input.keys.clear();input.firing=false;input.interact=false;const chosenSeed=parseRunSeed($('seed-input').value);state.seed=chosenSeed??(1+Math.floor(Math.random()*MAX_RUN_SEED));ROT.RNG.setSeed(state.seed);$('seed-display').textContent=String(state.seed);
  state.cacheOpen=false;state.cachePickup=null;$('cache-panel').hidden=true;$('cache-panel').setAttribute('aria-hidden','true');state.mode='play';state.paused=false;state.merchantOpen=false;state.merchantRoom=null;state.pendingGunPickup=null;$('weapon-pickup').hidden=true;$('weapon-pickup').setAttribute('aria-hidden','true');state.running=true;state.paidOut=false;state.elapsed=0;state.time=0;state.kills=0;state.scrap=40;state.health=5;state.maxHealth=5;state.armor=0;state.maxArmor=0;state.gear=null;state.weaponSlots=[0,1];state.activeSlot=0;state.carryCapacity=progressionStats(state.progress).carryCapacity;state.weaponAmmo=GUNS.map(g=>g.mag);state.reserveAmmo=GUNS.map(g=>g.reserve);state.attachments=new Map(GUNS.map(gun=>[gun.id,new Map()]));state.throwables={smoke:1,flash:1,frag:2,incendiary:1};state.throwableIndex=2;state.shotgunShellId='buckshot';state.lastAction=0;state.lastActionKind='other';state.fireCooldown=0;state.reloadTimer=0;state.invuln=0;state.shake=0;state.roomsCleared=0;state.roomToast='';$('merchant-panel').hidden=true;$('merchant-panel').setAttribute('aria-hidden','true');$('run-result').hidden=true;$('start-button').textContent='ENTER THE SECTOR ↗';$('meta-panel').hidden=true;$('overlay').classList.remove('show');toggleLoadout(false);$('vignette').style.background='';makeLevel();updateThrowableHud();toast('MOVE ALONE AT 1× · FIRE STAYS BLENDED · STOP TO PLAN',3200);}
function resize(){if(!renderer)return;renderer.setSize(innerWidth,innerHeight);const aspect=innerWidth/innerHeight,halfH=260;camera.left=-aspect*halfH;camera.right=aspect*halfH;camera.top=halfH;camera.bottom=-halfH;camera.updateProjectionMatrix();}
function render(){renderer.render(scene,camera);}
function renderGameToText(){
  const gear=GEAR.find(item=>item.id===state.gear),room=state.rooms[state.currentRoom];
  const enemies=state.enemies.filter(enemy=>enemy.alive).map(enemy=>({type:enemy.def.name,roomIndex:enemy.roomIndex,x:Math.round(enemy.x),y:Math.round(enemy.y),health:Math.round(enemy.hp),aiming:enemy.aimTimer>0||enemy.meleeWindup>0,charging:enemy.meleeWindup>0,telegraphVisible:!!enemy.meleeTelegraph?.visible,reloading:enemy.reloadTimer>0,tactic:enemy.intent}));
  const roomEnemyCounts=Array(state.rooms.length).fill(0);
  for(const enemy of enemies)if(Number.isInteger(enemy.roomIndex)&&roomEnemyCounts[enemy.roomIndex]!==undefined)roomEnemyCounts[enemy.roomIndex]++;
  const pickups=state.pickups.filter(pickup=>pickup.available).map(pickup=>({type:pickup.kind,x:Math.round(pickup.x),y:Math.round(pickup.y),gun:pickup.kind==='gun'?GUNS[pickup.gunIndex].name:undefined,rarity:pickup.rarity||undefined}));
  return JSON.stringify({
    mode:state.mode,paused:state.paused,seed:state.seed,coordinateSystem:'world origin at top-left; +x right, +y down',
    player:state.player?{x:Math.round(state.player.x),y:Math.round(state.player.y),health:state.health,armor:state.armor,maxArmor:state.maxArmor,weapon:GUNS[state.weaponIndex].name,ammo:state.weaponAmmo[state.weaponIndex],reserve:state.reserveAmmo[state.weaponIndex],reloading:state.reloadTimer>0,shell:GUNS[state.weaponIndex].id==='shotgun'?shellForRun().id:undefined}:null,
    loadout:{slots:state.weaponSlots.map(index=>GUNS[index].name),activeSlot:state.activeSlot,gear:gear?.name||null,weight:weaponLoadoutWeight(state.weaponSlots,GUNS)+(gear?.weight||0),capacity:state.carryCapacity,attachments:[...attachmentsFor(GUNS[state.weaponIndex]).keys()],attachmentTiers:Object.fromEntries(attachmentsFor(GUNS[state.weaponIndex]))},
    room:room?.name,roomIndex:state.currentRoom,roomRole:room?.role,
    roomProgress:state.rooms.map((entry,index)=>({index,name:entry.name,role:entry.role,visited:!!entry.visited,cleared:!!entry.cleared,livingEnemies:roomEnemyCounts[index]})),
    lockedDoors:state.lockedDoors.map(door=>({opened:door.opened,cost:door.cost,room:state.rooms[door.roomIndex]?.name,x:(door.x+.5)*TILE,y:(door.y+.5)*TILE,cells:door.cells.length,tiles:door.cells.map(cell=>({x:cell.x,y:cell.y}))})),
    merchant:!!room?.merchant,merchantOpen:state.merchantOpen,cacheOpen:state.cacheOpen,
    weaponPickup:state.pendingGunPickup?{gun:GUNS[state.pendingGunPickup.gunIndex].name,availableSlots:weaponTargets().map(slot=>weaponReplacement(state.weaponSlots,slot,state.pendingGunPickup.gunIndex,GUNS,state.carryCapacity,gear?.weight||0).canCarry)}:null,
    enemyCount:enemies.length,enemies,
    bullets:state.bullets.map(bullet=>({owner:bullet.owner,x:Math.round(bullet.x),y:Math.round(bullet.y),vx:Math.round(bullet.vx),vy:Math.round(bullet.vy)})),
    crates:state.crates.map(crate=>({x:Math.round(crate.x),y:Math.round(crate.y),health:crate.hp,radius:17})),
    cover:state.cover.filter(cover=>!cover.crate).map(({x,y,radius,kind})=>({x:Math.round(x),y:Math.round(y),radius,kind})),
    pickupCount:pickups.length,pickups,
    throwables:{selected:selectedThrowable().id,counts:state.throwables,projectiles:state.thrown.length,effects:state.effects.map(effect=>effect.id)},
    kills:state.kills,scrap:state.scrap,coins:state.progress.coins,roomsCleared:state.roomsCleared,rooms:state.rooms.length,timeScale:getTimeScale().toFixed(2),elapsed:Math.floor(state.elapsed),
  });
}
window.render_game_to_text=renderGameToText;
window.advanceTime=(ms)=>{const frames=Math.max(1,Math.ceil(ms/16.667));for(let i=0;i<frames;i++)update(1/60);render();};

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
      if(!result.ok){$('binding-status').textContent=result.reason==='in-use'?'That key is already assigned. Choose another key or press Escape.':'Use one letter, number, arrow, Space, or Shift.';return;}
      controls.bindings=result.bindings;controls.waitingFor=null;renderKeyBindings(action);renderKeyGuide();updateThrowableHud();
      try{saveKeyBindings(localStorage,controls.bindings);$('binding-status').textContent='Controls saved.';}catch{$('binding-status').textContent='Changed for this session only.';toast('CONTROL CHANGED FOR THIS SESSION ONLY');}
      return;
    }
    input.keys.add(resolveMovementKey(key,controls.bindings));
    if(e.repeat)return;
    if(state.pendingLoadoutChange){
      if(key==='escape')closeLoadoutPreview();
      else if(key==='tab'){
        e.preventDefault();const first=$('loadout-cancel'),last=$('loadout-accept'),focused=document.activeElement;
        (e.shiftKey?(focused===first?last:first):(focused===last?first:last)).focus();
      }
      return;
    }
    if(!$('meta-panel').hidden){
      if(key==='escape'){$('meta-panel').hidden=true;$('meta-button').focus();}
      else if(key==='tab')trapDialogTab(e,$('meta-panel'));
      return;
    }
    if(state.loadoutOpen&&key==='tab'){trapDialogTab(e,$('loadout'));return;}
    if(state.pendingGunPickup){if(key===binding('weaponOne'))acceptWeaponPickup(0);else if(key===binding('weaponTwo'))acceptWeaponPickup(1);else if(key===binding('weaponThree'))acceptWeaponPickup(2);else if(key==='escape')closeWeaponPickup(true);return;}
    if(state.cacheOpen){if(key==='escape')closeCache();return;}
    if(state.merchantOpen){if(key==='escape')closeMerchant();return;}
    if(key==='tab'){e.preventDefault();if(!state.merchantOpen&&!state.cacheOpen)toggleLoadout();markAction();}
    if(key===binding('interact')){input.interact=true;markAction();}
    if(key===binding('throwableCycle')&&state.mode==='play'){state.throwableIndex=(state.throwableIndex+1)%THROWABLES.length;updateThrowableHud();markAction();}
    if(key===binding('shellCycle'))cycleShotgunShell();
    if(key===binding('throwableUse')&&state.mode==='play'&&!state.merchantOpen&&!state.cacheOpen&&!state.paused&&!state.loadoutOpen)throwThrowable();
    if(key==='r'&&(state.mode==='dead'||state.mode==='won'))newRun();
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
  addEventListener('mousedown',e=>{if(e.button===0){input.firing=true;markAction('fire');if(state.mode==='play'&&!state.paused&&!state.loadoutOpen&&!state.merchantOpen&&!state.cacheOpen&&!state.pendingGunPickup)playerShoot();}});addEventListener('mouseup',e=>{if(e.button===0)input.firing=false;});
  $('start-button').addEventListener('click',()=>{void unlockAudio();input.firing=false;input.interact=false;newRun();renderer.domElement.focus();});$('close-loadout').addEventListener('click',()=>toggleLoadout(false));
  $('master-volume').addEventListener('input',event=>{const volume=Number(event.currentTarget.value)/100;$('master-volume-value').textContent=`${Math.round(volume*100)}%`;if(!setMasterVolume(volume))toast('VOLUME CHANGED FOR THIS SESSION ONLY');});
  $('mute-audio').addEventListener('click',()=>{if(!setAudioMuted(!isAudioMuted()))toast('MUTE SETTING CHANGED FOR THIS SESSION ONLY');syncMuteButton();});
  $('meta-button').addEventListener('click',()=>{renderMeta();$('meta-panel').hidden=false;$('close-meta').focus();});$('close-meta').addEventListener('click',()=>{$('meta-panel').hidden=true;$('meta-button').focus();});$('reset-save').addEventListener('click',resetProgress);
  $('meta-list').addEventListener('click',event=>{const button=event.target.closest('[data-upgrade]');if(!button)return;const result=purchaseUpgrade(state.progress,button.dataset.upgrade);if(result.purchased){state.progress=result.progress;saveProgress();}renderMeta();});
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
  scene=new THREE.Scene();scene.background=new THREE.Color(0x171420);scene.fog=new THREE.Fog(0x171420,300,1900);
  camera=new THREE.OrthographicCamera(-260,260,260,-260,.1,240);camera.position.set(0,90,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.28;renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','DEAD AIR game. Use WASD to move and the mouse to aim and fire.');$('game').appendChild(renderer.domElement);
  lighting=new THREE.Group();lighting.add(new THREE.HemisphereLight(0xbab6d2,0x35313d,2.1));const key=new THREE.DirectionalLight(0xffe9cc,2.2);key.position.set(-30,70,10);key.castShadow=true;key.shadow.mapSize.set(1024,1024);lighting.add(key);
  const ambient=new THREE.PointLight(0xff556e,55,220);ambient.position.set(0,25,0);lighting.add(ambient);scene.add(lighting);
  state.scene=scene;state.camera=camera;state.renderer=renderer;state.physics=physics;setupControls();renderMeta();resize();$('start-button').disabled=false;$('start-button').textContent='ENTER THE SECTOR ↗';
  let previous=performance.now();function loop(now){requestAnimationFrame(loop);const dt=Math.min(.05,(now-previous)/1000);previous=now;if(state.mode==='play')update(dt);render();}requestAnimationFrame(loop);
}
boot().catch(error=>{console.error(error);$('start-button').disabled=true;$('start-button').textContent='GAME COULD NOT LOAD';$('overlay').classList.add('show');$('overlay').querySelector('p').textContent='The game could not load. Start a local web server and check that the three game libraries are reachable.';});
