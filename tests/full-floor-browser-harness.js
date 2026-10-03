import * as ROT from 'https://esm.sh/rot-js@2.1.3';
import {generateDungeon} from '../dungeon.js?v=room-names-3';
import {shortestFloorPath} from '../layout.js';
import {hasIncomingProjectile} from '../enemy-tactics.js';
import {parseRunSeed} from '../seeds.js';

const result = document.querySelector('#result');
const frame = document.querySelector('#game');
const seed = parseRunSeed(new URLSearchParams(location.search).get('seed')) ?? 213838321;
let topology;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const frameDoc = () => frame.contentDocument;
const frameWin = () => frame.contentWindow;
const gameState = () => JSON.parse(frameWin().render_game_to_text());
const browserErrors = [];
addEventListener('error', event => browserErrors.push(event.message));
addEventListener('unhandledrejection', event => browserErrors.push(String(event.reason)));
const savedStorage = Object.fromEntries(Array.from({length: localStorage.length}, (_, index) => localStorage.key(index))
  .filter(key => key !== null).map(key => [key, localStorage.getItem(key)]));

function restoreStorage() {
  localStorage.clear();
  for (const [key, value] of Object.entries(savedStorage)) localStorage.setItem(key, value);
}

function key(name, type = 'keydown') {
  const win = frameWin();
  for(const keyName of Array.isArray(name)?name:[name])
    win.dispatchEvent(new win.KeyboardEvent(type, {key:keyName, bubbles: true, cancelable: true}));
}

function clickIfVisible(selector) {
  const element = frameDoc().querySelector(selector);
  if (element && !element.hidden && element.offsetParent !== null) {
    element.click();
    return true;
  }
  return false;
}

function serviceDialogs() {
  const doc = frameDoc();
  const snapshot = gameState();
  if (snapshot.weaponPickup) {
    const choice = doc.querySelector('#weapon-pickup [data-pickup-slot]:not(:disabled)');
    if (choice) choice.click();
    else clickIfVisible('#decline-weapon-pickup');
  }
  if (!doc.querySelector('#loadout-confirm').hidden) clickIfVisible('#loadout-accept');
  else if (doc.querySelector('#loadout').classList.contains('show')) doc.querySelector('#close-loadout').click();
  if (!doc.querySelector('#merchant-panel').hidden) {
    const medkit = [...doc.querySelectorAll('#merchant-stock [data-merchant]')].find(button =>
      button.parentElement?.textContent.includes('FIELD MEDKIT') && !button.disabled);
    if (medkit && snapshot.player?.health < 5) medkit.click();
    clickIfVisible('#close-merchant');
  }
  return snapshot;
}

function advance(frames = 1) {
  for (let index = 0; index < frames; index++) {
    frameWin().advanceTime(16.667);
    serviceDialogs();
  }
}

function releaseMovement() {
  for (const name of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd']) key(name, 'keyup');
  const win = frameWin();
  win.dispatchEvent(new win.MouseEvent('mouseup', {button: 0, bubbles: true}));
}

function press(name) { key(name); key(name, 'keyup'); }

function moveTo(target, tolerance = 16, skipFightRoomIndex = null) {
  let stagnant = 0, previous = Infinity;
  for (let step = 0; step < 1200; step++) {
    const state = serviceDialogs();
    if (state.mode !== 'play' || !state.player) return false;
    if (state.roomIndex!==skipFightRoomIndex&&fightInCurrentRoom(state)) { stagnant=0;previous=Infinity;continue; }
    const dx = target.x - state.player.x, dy = target.y - state.player.y;
    const distance = Math.hypot(dx, dy);
    if (distance < tolerance) { releaseMovement(); return true; }
    if (distance >= previous - 0.2) stagnant++; else stagnant = 0;
    if (stagnant > 40) { releaseMovement(); return false; }
    previous = distance;
    releaseMovement();
    key(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp'));
    advance();
  }
  releaseMovement();
  return false;
}

function movePath(path, finalTolerance = 16, skipFightRoomIndex = null) {
  if(!path.length)return false;
  const waypoints=[];
  let direction=null;
  for(let i=1;i<path.length;i++){
    const nextDirection={x:path[i].x-path[i-1].x,y:path[i].y-path[i-1].y};
    if(direction&& (nextDirection.x!==direction.x||nextDirection.y!==direction.y))waypoints.push(path[i-1]);
    direction=nextDirection;
  }
  waypoints.push(path.at(-1));
  for (const [index,cell] of waypoints.entries()) {
    const tolerance=index===waypoints.length-1?finalTolerance:16;
    if (!moveTo({x: (cell.x + 0.5) * 32, y: (cell.y + 0.5) * 32},tolerance,skipFightRoomIndex)) return false;
  }
  releaseMovement();
  return true;
}

function navigationPath(target){
  const state=gameState(),start={x:Math.floor(state.player.x/32),y:Math.floor(state.player.y/32)};
  const closedDoors=new Set(state.lockedDoors.filter(door=>!door.opened).flatMap(door=>door.tiles||[]).map(tile=>`${tile.x},${tile.y}`));
  const obstacles=[...state.crates,...(state.cover||[])];
  const canPass=(x,y)=>{
    if(x===start.x&&y===start.y)return true;
    if(topology.cells[y]?.[x]!==0||closedDoors.has(`${x},${y}`))return false;
    const cx=(x+.5)*32,cy=(y+.5)*32;
    return obstacles.every(obstacle=>Math.hypot(cx-obstacle.x,cy-obstacle.y)>=obstacle.radius+14);
  };
  return shortestFloorPath(topology.cells,start,target,canPass);
}

function roomNavigationPath(room){
  const state=gameState(),start={x:Math.floor(state.player.x/32),y:Math.floor(state.player.y/32)};
  const candidates=[];
  for(let y=room.y1+1;y<room.y2;y++)for(let x=room.x1+1;x<room.x2;x++){
    if(topology.cells[y]?.[x]===0)candidates.push({x,y,distance:(x-room.cx)**2+(y-room.cy)**2});
  }
  candidates.sort((a,b)=>a.distance-b.distance);
  for(const candidate of candidates){
    const path=navigationPath(candidate);
    if(path.length)return path;
  }
  return [];
}

function gateApproachPath(gate){
  const gx=gate.x/32,gy=gate.y/32,centerX=Math.floor(gx),centerY=Math.floor(gy);
  const candidates=[];
  for(let y=centerY-1;y<=centerY+1;y++)for(let x=centerX-1;x<=centerX+1;x++){
    const distance=Math.hypot((x+.5)*32-gate.x,(y+.5)*32-gate.y);
    if(distance<38)candidates.push({x,y,distance});
  }
  candidates.sort((a,b)=>a.distance-b.distance);
  for(const candidate of candidates){
    const path=navigationPath(candidate);
    if(path.length)return path;
  }
  return [];
}

function safeDodgeKey(state, threat){
  const towardX=threat.x-state.player.x,towardY=threat.y-state.player.y;
  const vx=Number.isFinite(threat.vx)?threat.vx:towardX,vy=Number.isFinite(threat.vy)?threat.vy:towardY,speed=Math.hypot(vx,vy)||1;
  const directions=[
    {keys:['ArrowUp'],dx:0,dy:-1},{keys:['ArrowDown'],dx:0,dy:1},
    {keys:['ArrowLeft'],dx:-1,dy:0},{keys:['ArrowRight'],dx:1,dy:0},
    {keys:['ArrowUp','ArrowLeft'],dx:-1,dy:-1},{keys:['ArrowUp','ArrowRight'],dx:1,dy:-1},
    {keys:['ArrowDown','ArrowLeft'],dx:-1,dy:1},{keys:['ArrowDown','ArrowRight'],dx:1,dy:1},
  ];
  const candidates=directions.sort((a,b)=>Math.abs(b.dx*vy-b.dy*vx)/speed-Math.abs(a.dx*vy-a.dy*vx)/speed);
  const startX=Math.floor(state.player.x/32),startY=Math.floor(state.player.y/32);
  const closedDoors=new Set(state.lockedDoors.filter(door=>!door.opened).flatMap(door=>door.tiles||[]).map(tile=>`${tile.x},${tile.y}`));
  const obstacles=[...state.crates,...(state.cover||[])];
  const canStand=(x,y)=>{
    const cx=(x+.5)*32,cy=(y+.5)*32;
    return topology.cells[y]?.[x]===0&&!closedDoors.has(`${x},${y}`)&&
      obstacles.every(obstacle=>Math.hypot(cx-obstacle.x,cy-obstacle.y)>=obstacle.radius+14);
  };
  return candidates.find(({dx,dy})=>[1,2].every(distance=>{
    const x=startX+dx*distance,y=startY+dy*distance;
    return canStand(x,y)&&(dx===0||dy===0||(canStand(x-dx,y)&&canStand(x,y-dy)));
  }))?.keys||null;
}

function dodgeIncomingProjectile(state=gameState()){
  const threat=state.bullets.find(bullet=>bullet.owner==='enemy'&&hasIncomingProjectile(
    {x:state.player.x,y:state.player.y,radius:10},[bullet]));
  if(!threat)return false;
  const dodge=safeDodgeKey(state,threat);
  if(!dodge)return false;
  key(dodge);advance(10);releaseMovement();return true;
}

function shootAt(target,state){
  const win=frameWin();
  win.dispatchEvent(new win.MouseEvent('mousemove',{
    clientX:win.innerWidth/2+(target.x-state.player.x)*win.innerHeight/520,
    clientY:win.innerHeight/2+(target.y-state.player.y)*win.innerHeight/520,bubbles:true}));
  win.dispatchEvent(new win.MouseEvent('mousedown',{button:0,bubbles:true}));
  advance();
  win.dispatchEvent(new win.MouseEvent('mouseup',{button:0,bubbles:true}));
}

function fightInCurrentRoom(state){
  const enemies=state.enemies.filter(enemy=>enemy.roomIndex===state.roomIndex);
  if(!enemies.length)return false;
  releaseMovement();
  if(state.player.reloading||state.player.ammo<=1&&state.player.reserve>0){
    if(!state.player.reloading)press('Shift');
    advance();
    return true;
  }
  enemies.sort((a,b)=>Math.hypot(a.x-state.player.x,a.y-state.player.y)-Math.hypot(b.x-state.player.x,b.y-state.player.y));
  shootAt(enemies[0],state);
  return true;
}

async function probeRangedDodge(roomIndex){
  const result={telegraphSeen:false,planningTimeScale:null,dodgeKey:null,movementTimeScale:null,
    enemyBulletSeen:false,stationaryPathMiss:null,wouldHitIfStill:false,
    healthBefore:null,healthAfter:null,armorBefore:null,armorAfter:null};
  releaseMovement();
  await wait(400);
  for(let frameIndex=0;frameIndex<1200;frameIndex++){
    let state=serviceDialogs();
    const enemies=state.enemies.filter(enemy=>enemy.roomIndex===roomIndex);
    const ranged=enemies.find(enemy=>['GUNNER','WARDEN'].includes(enemy.type));
    if(!ranged)return result;
    const nonRanged=enemies.find(enemy=>!['GUNNER','WARDEN'].includes(enemy.type));
    if(nonRanged){
      if(dodgeIncomingProjectile(state)){await wait(5);continue;}
      if(state.player.reloading||state.player.ammo<=1&&state.player.reserve>0){if(!state.player.reloading)press('Shift');advance();continue;}
      shootAt(nonRanged,state);advance();continue;
    }
    if(ranged.aiming){
      if(state.bullets.some(bullet=>bullet.owner==='enemy'&&bullet.enemyId===ranged.id)){
        advance();
        continue;
      }
      result.telegraphSeen=true;result.planningTimeScale=state.timeScale;
      result.shooterId=ranged.id;
      const target={x:state.player.x,y:state.player.y};
      let incoming=null;
      for(let step=0;step<360;step++){
        advance();
        const waiting=gameState();
        incoming=waiting.bullets.find(bullet=>bullet.owner==='enemy'&&bullet.enemyId===ranged.id)||null;
        if(incoming){state=waiting;break;}
      }
      if(!incoming)return result;
      result.enemyBulletSeen=true;
      result.incomingShot={x:incoming.x,y:incoming.y,vx:incoming.vx,vy:incoming.vy};
      const velocity=Math.hypot(incoming.vx,incoming.vy)||1,offsetX=target.x-incoming.x,offsetY=target.y-incoming.y;
      result.stationaryPathMiss=Math.abs(offsetX*incoming.vy-offsetY*incoming.vx)/velocity;
      result.wouldHitIfStill=(offsetX*incoming.vx+offsetY*incoming.vy)>0&&result.stationaryPathMiss<=10;
      result.dodgeKey=safeDodgeKey(state,incoming);
      if(!result.dodgeKey)return result;
      result.healthBefore=state.player.health;result.armorBefore=state.player.armor;
      result.playerBeforeDodge={x:state.player.x,y:state.player.y};
      key(result.dodgeKey);
      result.movementTimeScale=gameState().timeScale;
      const remainingDistance=Math.max(0,((target.x-incoming.x)*incoming.vx+(target.y-incoming.y)*incoming.vy)/velocity);
      const resolveFrames=Math.min(100,Math.max(1,Math.ceil(remainingDistance/velocity*60)+12));
      result.healthEvents=[];
      for(let step=0;step<resolveFrames;step++){
        const before=gameState();
        advance();
        const after=gameState();
        if(after.player.health!==before.player.health||after.player.armor!==before.player.armor){
          result.healthEvents.push({frame:step+1,health:after.player.health,armor:after.player.armor,
            player:{x:after.player.x,y:after.player.y},bullets:after.bullets.filter(bullet=>bullet.owner==='enemy')});
        }
      }
      key(result.dodgeKey,'keyup');releaseMovement();
      result.dodgeResolveFrames=resolveFrames;
      const after=gameState();
      result.healthAfter=after.player.health;result.armorAfter=after.player.armor;
      result.playerAfterDodge={x:after.player.x,y:after.player.y};
      result.otherShootersDuringDodge=[...new Set(after.bullets.filter(bullet=>bullet.owner==='enemy').map(bullet=>bullet.enemyId))];
      return result;
    }
    const melee=enemies.find(enemy=>enemy.charging);
    if(melee){
      const dodge=safeDodgeKey(state,melee);
      if(dodge){key(dodge);advance(26);key(dodge,'keyup');releaseMovement();await wait(400);continue;}
    }
    advance();
    if(frameIndex%30===29)await wait(5);
  }
  return result;
}

function sample(state) {
  return {room: state.room, health: state.player?.health ?? null, armor: state.player?.armor ?? null,
    scrap: state.scrap, kills: state.kills, ammo: state.player?.ammo ?? null, reserve: state.player?.reserve ?? null,
    elapsed: state.elapsed, mode: state.mode};
}

async function waitForGame() {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const button = frameDoc()?.querySelector('#start-button');
    if (button && !button.disabled && typeof frameWin().advanceTime === 'function') return;
    await wait(100);
  }
  throw new Error('Game did not finish loading within 45 seconds');
}

async function run() {
  const report = {seed, rooms: [], events: [], errors: []};
  try {
    frame.src = '../index.html?two-room-browser-harness&v=route-audit-35';
    await new Promise((resolve, reject) => {
      frame.addEventListener('load', resolve, {once: true});
      setTimeout(() => reject(new Error('Game page load timed out')), 45000);
    });
    frameWin().addEventListener('error', event => browserErrors.push(event.message));
    frameWin().addEventListener('unhandledrejection', event => browserErrors.push(String(event.reason)));
    await waitForGame();

    topology = generateDungeon(ROT, seed);
    frameDoc().querySelector('#seed-input').value = String(seed);
    frameDoc().querySelector('#start-button').click();
    await wait(100);
    let state = gameState();
    report.start = sample(state);
    if (state.mode !== 'play' || !state.player) throw new Error('Seeded run did not start');

    // Exercise the loadout confirmation once, then accept it through the normal UI.
    press('Tab');
    const armor = frameDoc().querySelector('#gear-list [data-gear="armor"]');
    if (armor && !armor.disabled) {
      armor.click();
      serviceDialogs();
      report.events.push({event: 'loadout-preview', resolved: frameDoc().querySelector('#loadout-confirm').hidden,
        gear: gameState().loadout.gear});
    }
    press('Tab');
    clickIfVisible('#close-loadout');

    const rooms = topology.rooms.map((room, index) => ({...room, index}));
    report.combatCandidates = rooms.filter(room => room.role === 'combat').map(({name,index,branch,cx,cy})=>({name,index,branch,cx,cy}));
    report.initialGates = state.lockedDoors;
    const combatRooms = rooms.filter((room, index) => index > 0 && index < rooms.length - 1 && room.role === 'combat')
      .sort((a, b) => shortestFloorPath(topology.cells, {x: rooms[0].cx, y: rooms[0].cy}, {x: a.cx, y: a.cy}).length -
        shortestFloorPath(topology.cells, {x: rooms[0].cx, y: rooms[0].cy}, {x: b.cx, y: b.cy}).length);
    if (!combatRooms.length) throw new Error('Seeded map did not have a combat room');
    for (const room of combatRooms) {
      state = serviceDialogs();
      const gate = state.lockedDoors.find(door => !door.opened && door.room === room.name);
      if (gate) {
        const gatePath = gateApproachPath(gate);
        if (!gatePath.length||!movePath(gatePath)) throw new Error(`Could not reach cache gate before ${room.name}`);
        press('e'); advance(2); state = serviceDialogs();
        if (state.lockedDoors.some(door => door.room === room.name && !door.opened)) {
          report.events.push({event: 'room-skipped', room: room.name, reason: 'gate could not be opened'});
          continue;
        }
      }
      const start = {...sample(state), livingEnemies: state.roomProgress[room.index]?.livingEnemies ?? 0};
      const enemyTypes=state.enemies.filter(enemy=>enemy.roomIndex===room.index).map(enemy=>enemy.type);
      const path = roomNavigationPath(room);
      const entered = path.length>0&&movePath(path,16,room.index);
      state = serviceDialogs();
      if ((!entered && state.room !== room.name) || state.mode !== 'play') {
        report.events.push({event: 'room-skipped', room: room.name, reason: 'could not reach'});
        if(state.mode!=='play')break;
        continue;
      }
      let fightSteps = 0,maxEnemyBullets=0,rangedTelegraphs=0;
      if(enemyTypes.some(type=>['GUNNER','WARDEN'].includes(type))){
        report.rangedDodge=await probeRangedDodge(room.index);
        if(report.rangedDodge.enemyBulletSeen)maxEnemyBullets=1;
      }
      for (; fightSteps < 1800; fightSteps++) {
        state = serviceDialogs();
        if (state.mode !== 'play' || !state.player) break;
        const enemies = state.enemies.filter(enemy => enemy.roomIndex === room.index);
        maxEnemyBullets=Math.max(maxEnemyBullets,state.bullets.filter(bullet=>bullet.owner==='enemy').length);
        if(enemies.some(enemy=>['GUNNER','WARDEN'].includes(enemy.type)&&enemy.aiming))rangedTelegraphs++;
        if (!enemies.length) break;
        if(dodgeIncomingProjectile(state))continue;
        const threat = enemies.find(enemy => enemy.charging);
        if (threat) {
          const dx = threat.x - state.player.x, dy = threat.y - state.player.y;
          releaseMovement(); key(Math.abs(dx) > Math.abs(dy) ? 'ArrowUp' : 'ArrowRight'); advance(26); releaseMovement();
          continue;
        }
        if (state.player.reloading || state.player.ammo <= 1 && state.player.reserve > 0) {
          if (!state.player.reloading) press('Shift');
          advance(); continue;
        }
        const target = enemies.sort((a, b) => Math.hypot(a.x - state.player.x, a.y - state.player.y) - Math.hypot(b.x - state.player.x, b.y - state.player.y))[0];
        shootAt(target,state);
      }
      releaseMovement(); advance(2); state = serviceDialogs();
      const livingEnemies = state.roomProgress[room.index]?.livingEnemies ?? 0;
      report.rooms.push({name: room.name, role: room.role, start, end: {...sample(state), livingEnemies}, fightSteps,
        enemyTypes,maxEnemyBullets,rangedTelegraphs,cleared: start.livingEnemies > 0 && livingEnemies === 0,
        markedCleared: !!state.roomProgress[room.index]?.cleared});
      if (state.mode !== 'play' || !state.player) break;

      // Exercise the market modal in a market room; serviceDialogs buys a medkit if useful.
      if (state.merchant) { press('e'); advance(); state = serviceDialogs(); }
      if(report.rooms.length===1){
        for(const gate of gameState().lockedDoors.filter(item=>!item.opened&&gameState().scrap>=item.cost)){
          const gatePath=gateApproachPath(gate);
          const reached=gatePath.length>0&&movePath(gatePath,2);
          if(!reached){report.events.push({event:'reward-gate-attempt',room:gate.room,pathLength:gatePath.length,reached:false,player:sample(gameState())});continue;}
          press('e');advance(2);state=serviceDialogs();
          const opened=gameState().lockedDoors.find(item=>item.x===gate.x&&item.y===gate.y)?.opened;
          if(opened){report.events.push({event:'reward-gate-opened',room:gate.room,cost:gate.cost});break;}
          report.events.push({event:'reward-gate-attempt',room:gate.room,pathLength:gatePath.length,reached:true,player:sample(gameState())});
        }
      }
      if(report.rooms.length>=1)break;
    }
    report.final = sample(gameState());
    if (report.rooms.length !== 1 || !report.rooms[0].cleared || report.rooms[0].end.kills<=report.rooms[0].start.kills) {
      report.error = 'The probe did not kill an enemy and clear its first encounter';
    }
    const affordableGate=report.initialGates.some(gate=>!gate.opened&&report.rooms[0]?.end.scrap>=gate.cost);
    if(!report.error&&affordableGate&&!report.events.some(event=>event.event==='reward-gate-opened')){
      report.error='The probe could not open an affordable scrap gate';
    }
    if(!report.error&&report.rangedDodge&&(!report.rangedDodge.telegraphSeen||report.rangedDodge.planningTimeScale!=='0.18'||
      report.rangedDodge.movementTimeScale!=='1.00'||!report.rangedDodge.enemyBulletSeen||!report.rangedDodge.wouldHitIfStill||
      report.rangedDodge.healthBefore!==report.rangedDodge.healthAfter||report.rangedDodge.armorBefore!==report.rangedDodge.armorAfter)){
      report.error='The ranged attack was not confirmed as a dodged real bullet';
    }
  } catch (error) {
    report.error = String(error?.stack || error);
  } finally {
    try {
      releaseMovement();
      if (gameState().mode === 'play') press('Escape');
    } catch (error) {
      browserErrors.push(String(error?.stack || error));
    }
    restoreStorage();
    report.localStorageRestored = true;
    report.errors = browserErrors;
    if (browserErrors.length && !report.error) report.error = 'The browser reported a runtime error';
    result.className = report.error ? 'fail' : 'pass';
    result.textContent = JSON.stringify(report, null, 2);
  }
}

void run();
