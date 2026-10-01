import * as THREE from 'https://esm.sh/three@0.180.0';
import RAPIER from 'https://esm.sh/@dimforge/rapier2d-compat@0.17.3';
import * as ROT from 'https://esm.sh/rot-js@2.1.3';
import {BASE_CARRY_CAPACITY, ENEMY_TYPES, GUNS, MODS, TAU, TILE, WALL_H} from './catalog.js';
import {canCarryWeapons, chooseEncounterTypes, damageDurability, reloadSeconds, timeScale, weaponLoadoutWeight, weaponStats} from './rules.js';

const $ = (id) => document.getElementById(id);
const magSize=(gun)=>weaponStats(gun,state.mods).magazine;

const state = {
  mode:'title', running:false, paused:false, loadoutOpen:false, time:0, elapsed:0, score:0, kills:0, scrap:0, roomsCleared:0,
  seed:Math.floor(Math.random()*0x7fffffff), tileMap:[], mapW:96, mapH:72, rooms:[], currentRoom:0,
  player:null, enemies:[], bullets:[], pickups:[], crates:[], particles:[], props:[], doors:[], colliders:[],
  weaponIndex:0, weaponSlots:[0,1], activeSlot:0, carryCapacity:BASE_CARRY_CAPACITY, weaponAmmo:GUNS.map(g=>g.mag), reserveAmmo:GUNS.map(g=>g.reserve), mods:new Set(), health:5, maxHealth:5,
  aim:{x:1,y:0}, lastAction:0, fireCooldown:0, reloadTimer:0, invuln:0, shake:0, hitstop:0, toastTimer:0, roomToast:'', sector:1,
  scene:null, camera:null, renderer:null, physics:null, floorMesh:null, walls:[], meshRoot:null, actorMeshes:new Map(), pickupMeshes:new Map(), bulletMeshes:new Map(),
};
const input = {keys:new Set(), mouseX:innerWidth/2, mouseY:innerHeight/2, firing:false, interact:false};

let renderer, scene, camera, physics, lighting;
const tempObj = new THREE.Object3D();
const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const aimPlane = new THREE.Plane(new THREE.Vector3(0,1,0),0);
const hitPoint = new THREE.Vector3();

function rand(min,max){ return min+Math.random()*(max-min); }
function choose(list){ return list[Math.floor(Math.random()*list.length)]; }
function distance(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
function clamp(n,min,max){ return Math.max(min,Math.min(max,n)); }
function hud(){
  const gun=GUNS[state.weaponIndex];
  $('health').innerHTML=Array.from({length:state.maxHealth},(_,i)=>`<span class="heart ${i>=state.health?'empty':''}">♥</span>`).join('');
  $('gun-name').textContent=gun.name; $('gun-mods').textContent=state.mods.size?[...state.mods].map(id=>MODS.find(m=>m.id===id)?.name.split(' ')[0]).join(' + '):'BARE BONES';
  $('ammo').textContent=`${state.weaponAmmo[state.weaponIndex]} / ${magSize(gun)}`;
  $('weapon-note').textContent=gun.short; $('kills').textContent=String(state.kills).padStart(2,'0'); $('scrap').textContent=String(state.scrap).padStart(3,'0');
  $('sector-count').textContent=`${String(state.roomsCleared+1).padStart(2,'0')} / ${String(state.rooms.length).padStart(2,'0')}`;
  $('run-clock').textContent=`${String(Math.floor(state.elapsed/60)).padStart(2,'0')}:${String(Math.floor(state.elapsed%60)).padStart(2,'0')}`;
  $('room-name').textContent=state.roomToast||`FLOOR 01 · ${state.rooms[state.currentRoom]?.name||'ENTRY'}`;
  $('loadout-scrap').textContent=`${String(state.scrap).padStart(3,'0')} SCRAP`;
  if(state.loadoutOpen)renderLoadout();
}
function syncHudFrame(){
  const gun=GUNS[state.weaponIndex];$('ammo').textContent=`${state.weaponAmmo[state.weaponIndex]} / ${magSize(gun)}`;
  $('kills').textContent=String(state.kills).padStart(2,'0');$('scrap').textContent=String(state.scrap).padStart(3,'0');
  $('sector-count').textContent=`${String(state.roomsCleared+1).padStart(2,'0')} / ${String(state.rooms.length).padStart(2,'0')}`;
  $('run-clock').textContent=`${String(Math.floor(state.elapsed/60)).padStart(2,'0')}:${String(Math.floor(state.elapsed%60)).padStart(2,'0')}`;
  $('room-name').textContent=state.roomToast||`FLOOR 01 · ${state.rooms[state.currentRoom]?.name||'ENTRY'}`;
}
function renderLoadout(){
  if(!$('loadout-gun'))return;
  const weight=weaponLoadoutWeight(state.weaponSlots,GUNS);
  $('loadout-gun').innerHTML=GUNS.map((gun,i)=>{const slot=state.weaponSlots.indexOf(i),fits=slot>=0||canCarryWeapons([state.weaponSlots[0],i],GUNS,state.carryCapacity);return `<button class="loadout-weapon ${i===state.weaponIndex?'active':''}" data-gun="${i}" ${!fits?'disabled':''}><strong>${slot>=0?`${slot===state.activeSlot?'ACTIVE':'SLOT '+(slot+1)} · `:'SWAP SECONDARY · '}${gun.name}</strong><span>${gun.weight.toFixed(1)} wt · ${state.weaponAmmo[i]} / ${magSize(gun)} · ${state.reserveAmmo[i]} reserve</span></button>`}).join('');
  $('carry-readout').textContent=`WEIGHT ${weight.toFixed(1)} / ${state.carryCapacity.toFixed(1)} · 2 SLOTS`;
  $('mod-list').innerHTML=MODS.map(mod=>{const has=state.mods.has(mod.id);return `<div class="mod-row"><span>${mod.name}<br><small style="color:#8e8896">${mod.info}</small></span><button data-mod="${mod.id}" ${has||state.scrap<mod.cost?'disabled':''}>${has?'INSTALLED':`${mod.cost} SCRAP`}</button></div>`}).join('');
}
function toast(message,duration=1700){const el=$('toast');el.textContent=message;el.classList.add('show');state.toastTimer=duration;}
function makeBody(position,radius,fixed=false){
  const desc=fixed?RAPIER.RigidBodyDesc.fixed():RAPIER.RigidBodyDesc.dynamic().setLinearDamping(1.5).setAngularDamping(1);
  const body=physics.createRigidBody(desc.setTranslation(position.x,position.y));
  const collider=RAPIER.ColliderDesc.ball(radius).setDensity(fixed?1:0.7).setRestitution(0.02).setFriction(0.5);
  physics.createCollider(collider,body); return body;
}
function makeFixedBox(x,y,halfW,halfH){
  const body=physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x,y));
  physics.createCollider(RAPIER.ColliderDesc.cuboid(halfW,halfH),body);state.colliders.push({body});
}
function createRoomMap(){
  state.seed=Math.floor(Math.random()*0x7fffffff); ROT.RNG.setSeed(state.seed);
  const generator=new ROT.Map.Digger(state.mapW,state.mapH,{roomWidth:[10,22],roomHeight:[9,18],corridorLength:[3,8], dugPercentage:0.29});
  const cells=Array.from({length:state.mapH},()=>Array(state.mapW).fill(1));
  generator.create((x,y,value)=>{cells[y][x]=value;}); state.tileMap=cells;
  let rooms=generator.getRooms().map((room,index)=>{
    const [cx,cy]=room.getCenter();
    return {cx,cy,x1:room.getLeft(),x2:room.getRight(),y1:room.getTop(),y2:room.getBottom(),index,name:['ENTRY','FURNACE','THE GALLERY','COLD STORAGE','RED HALL','MOTOR POOL','THE VAULT','NIGHT SHIFT'][index%8],cleared:false,visited:false};
  }).filter(r=>r.index===0||r.index>0);
  if(rooms.length<6){state.mapW=108;state.mapH=82;return createRoomMap();}
  // Keep the best connected component of generously sized rooms.
  const start=rooms.reduce((best,r,i)=>i===0||Math.hypot(r.cx-state.mapW/2,r.cy-state.mapH/2)<Math.hypot(best.cx-state.mapW/2,best.cy-state.mapH/2)?r:best,rooms[0]);
  rooms.sort((a,b)=>Math.hypot(a.cx-start.cx,a.cy-start.cy)-Math.hypot(b.cx-start.cx,b.cy-start.cy));
  state.rooms=rooms.slice(0,Math.min(10,rooms.length));
  state.rooms[0].name='ENTRY'; state.rooms[0].visited=true; state.currentRoom=0;
  for(let y=0;y<state.mapH;y++)for(let x=0;x<state.mapW;x++){
    if(cells[y][x]!==0)continue;
    const inRoom=state.rooms.find(r=>x>=r.x1&&x<=r.x2&&y>=r.y1&&y<=r.y2);
    if(!inRoom){
      const near=state.rooms.some(r=>Math.abs(x-r.cx)+Math.abs(y-r.cy)<16);
      if(!near)cells[y][x]=1;
    }
  }
  state.tileMap=cells;
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
  const pillarGeo=new THREE.CylinderGeometry(7,8,11,6);const pillarMat=new THREE.MeshStandardMaterial({color:0x36313f,roughness:.8});
  for(const room of state.rooms){
    const center={x:(room.cx+.5)*TILE,y:(room.cy+.5)*TILE};
    spawnCrate((room.x1+1)*TILE+TILE/2,(room.y1+1)*TILE+TILE/2);
    for(let i=0;i<Math.floor((room.x2-room.x1)*(room.y2-room.y1)/95);i++){
      const px=rand(room.x1+1,room.x2)*TILE,pz=rand(room.y1+1,room.y2)*TILE;if(Math.hypot(px-center.x,pz-center.y)<60)continue;
      if(Math.random()<.25){const p=new THREE.Mesh(pillarGeo,pillarMat);p.position.set(Math.round(px/TILE)*TILE,5.5,Math.round(pz/TILE)*TILE);scene.add(p);state.props.push(p);state.colliders.push({body:makeBody({x:p.position.x,y:p.position.z},7,true)});}
      else if(Math.random()<.78)spawnCrate(Math.round(px/TILE)*TILE+TILE/2,Math.round(pz/TILE)*TILE+TILE/2);
    }
  }
  for(const [i,room] of state.rooms.entries()){
    if(i===0)continue;
    const count=2+Math.floor(Math.random()*3),encounter=chooseEncounterTypes(count,state.seed+i*7919);
    for(let j=0;j<count;j++){
      const x=rand(room.x1+2,room.x2-2)*TILE,y=rand(room.y1+2,room.y2-2)*TILE;
      spawnEnemy(encounter[j],x,y);
    }
    if(i%2===1){dropPickup('scrap',rand(room.x1+2,room.x2-2)*TILE,rand(room.y1+2,room.y2-2)*TILE,10+Math.floor(Math.random()*21));}
    if(i%3===0){const kind=choose(['gun','mod','heal']);dropPickup(kind,rand(room.x1+2,room.x2-2)*TILE,rand(room.y1+2,room.y2-2)*TILE);}
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
  state.player=null;state.enemies=[];state.bullets=[];state.pickups=[];state.crates=[];state.particles=[];state.props=[];state.actorMeshes.clear();state.pickupMeshes.clear();state.bulletMeshes.clear();state.colliders=[];state.doors=[];state.walls=[];
  for(const obj of [...scene.children])if(obj!==camera&&obj!==lighting){scene.remove(obj);obj.traverse(child=>{child.geometry?.dispose();if(Array.isArray(child.material))child.material.forEach(material=>material.dispose());else child.material?.dispose();});}
  physics=new RAPIER.World({x:0,y:0});state.physics=physics;
  state.floorMesh=null;
}
function createActorMesh(type,colorHex=0xffffff,radius=8){
  const color=type==='player'?0x62e1ad:(ENEMY_TYPES[type]?.color||colorHex);
  const mesh=new THREE.Group();
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(radius*1.22,16),new THREE.MeshBasicMaterial({color:0x080710,transparent:true,opacity:.47,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.11;mesh.add(shadow);
  const body=new THREE.Mesh(new THREE.CylinderGeometry(radius*.68,radius,radius*1.1,8),new THREE.MeshStandardMaterial({color,roughness:.55,emissive:color,emissiveIntensity:.05}));body.position.y=radius*.55;body.castShadow=true;mesh.add(body);
  const face=new THREE.Mesh(new THREE.ConeGeometry(radius*.45,radius*.55,3),new THREE.MeshBasicMaterial({color:0xf8ecda}));face.rotation.x=Math.PI/2;face.position.set(0,radius*.75,radius*.8);mesh.add(face);
  mesh.userData.body=body;mesh.userData.radius=radius;scene.add(mesh);state.actorMeshes.set(type==='player'?'player':mesh,mesh);return mesh;
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
function spawnCrate(x,y){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(24,14,24),new THREE.MeshStandardMaterial({color:0x76543f,roughness:.88}));
  mesh.position.set(x,7,y);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);state.props.push(mesh);
  const body=physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x,y));
  physics.createCollider(RAPIER.ColliderDesc.cuboid(12,12),body);state.colliders.push({body});
  const crate={x,y,hp:60,maxHp:60,mesh,body,cracked:false};state.crates.push(crate);return crate;
}
function crackCrate(crate){
  const points=[new THREE.Vector3(-8,7,-12),new THREE.Vector3(-2,7,-2),new THREE.Vector3(-6,7,3),new THREE.Vector3(1,7,12)];
  const crack=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x211a19}));
  crack.position.copy(crate.mesh.position);scene.add(crack);state.props.push(crack);crate.crack=crack;
}
function breakCrate(crate){
  physics.removeRigidBody(crate.body);scene.remove(crate.mesh);crate.mesh.geometry.dispose();crate.mesh.material.dispose();
  if(crate.crack){scene.remove(crate.crack);crate.crack.geometry.dispose();crate.crack.material.dispose();}
  state.props=state.props.filter(prop=>prop!==crate.mesh&&prop!==crate.crack);state.colliders=state.colliders.filter(item=>item.body!==crate.body);state.crates=state.crates.filter(item=>item!==crate);
  state.shake=Math.max(state.shake,1.8);burst(crate.x,crate.y,0xb98258,11,1.1);
  if(Math.random()<.35)dropPickup('scrap',crate.x,crate.y,8+Math.floor(Math.random()*13));
}
function spawnEnemy(type,x,y){
  const def=ENEMY_TYPES[type],body=makeBody({x,y},type==='brute'?10:8,false);body.lockRotations(true,true);body.setLinearDamping(3.4);
  const mesh=createActorMesh(type);mesh.position.set(x,0,y);
  state.enemies.push({type,def,body,mesh,x,y,hp:def.hp,maxHp:def.hp,fire:rand(.4,2.1),stun:0,knock:{x:0,y:0},alive:true,id:Math.random()});
}
function dropPickup(kind,x,y,value=0){
  if(state.tileMap[Math.floor(y/TILE)]?.[Math.floor(x/TILE)]!==0)return;
  const colors={scrap:0xf4c66d,gun:0x74c9ed,mod:0xd38ff5,heal:0x74dfab,exit:0xff5969};
  const geometry=kind==='exit'?new THREE.TorusGeometry(16,3,6,20):new THREE.OctahedronGeometry(kind==='gun'?9:kind==='heal'?8:6,0);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:colors[kind],emissive:colors[kind],emissiveIntensity:.4,roughness:.45,metalness:.1}));mesh.position.set(x,kind==='exit'?1:5,y);mesh.castShadow=true;scene.add(mesh);
  const pickup={kind,x,y,value,mesh,available:true};state.pickups.push(pickup);state.pickupMeshes.set(pickup,mesh);
}
function makeBulletMesh(color){const mesh=new THREE.Mesh(new THREE.SphereGeometry(2.4,8,6),new THREE.MeshBasicMaterial({color}));mesh.material.toneMapped=false;scene.add(mesh);return mesh;}
function fireBullet(owner,x,y,dx,dy,gun,damageScale=1){
  const stats=owner==='player'?weaponStats(gun,state.mods):null;
  const speed=stats?.projectileSpeed??gun.speed;
  const body=makeBody({x:x+dx*13,y:y+dy*13},2.3,false);body.enableCcd(true);body.setLinearDamping(0);body.setGravityScale(0,true);body.setLinvel({x:dx*speed,y:dy*speed},true);
  const color=owner==='player'?gun.color:0xff6a64;const mesh=makeBulletMesh(color);mesh.position.set(x+dx*13,.85,y+dy*13);
  const bullet={owner,body,mesh,x:x+dx*13,y:y+dy*13,vx:dx*speed,vy:dy*speed,damage:(stats?.damage??gun.damage)*damageScale,life:1.7,pierce:state.mods.has('longbarrel')&&owner==='player'?1:0,hit:new Set()};
  state.bullets.push(bullet);state.bulletMeshes.set(bullet,mesh);
  if(owner==='player'){state.shake=Math.max(state.shake,gun.id==='shotgun'?3.6:2.2);state.hitstop=.025;burst(x+dx*15,y+dy*15,0xffd08a,4);}
}
function playerShoot(){
  const p=state.player;if(!p||state.reloadTimer>0)return;
  if(state.weaponAmmo[state.weaponIndex]<=0){if(state.reserveAmmo[state.weaponIndex]>0){state.reloadTimer=reloadSeconds(state.mods);toast('RELOADING',750);}else toast('DRY CLICK · FIND AMMO',650);return;}
  const gun=GUNS[state.weaponIndex],stats=weaponStats(gun,state.mods),now=state.time;if(now<state.fireCooldown)return;
  state.fireCooldown=now+stats.fireRate;state.weaponAmmo[state.weaponIndex]--;
  const aim=Math.atan2(state.aim.y,state.aim.x),spread=stats.spread;
  const count=gun.count||1;
  for(let i=0;i<count;i++){const angle=aim+(Math.random()-.5)*spread+(count>1?(i-(count-1)/2)*.08:0);fireBullet('player',p.x,p.y,Math.cos(angle),Math.sin(angle),gun);}
  hud();state.lastAction=performance.now()/1000;
}
function enemyShoot(enemy){
  const dx=state.player.x-enemy.x,dy=state.player.y-enemy.y,len=Math.hypot(dx,dy)||1;
  fireBullet('enemy',enemy.x,enemy.y,dx/len,dy/len,{speed:340,damage:enemy.def.damage,color:0xff6a64},1);
}
function burst(x,y,color,count=10,power=1){
  for(let i=0;i<count;i++){const angle=Math.random()*TAU,speed=(2+Math.random()*8)*power,life=.18+Math.random()*.4;const mesh=new THREE.Mesh(new THREE.BoxGeometry(rand(1.1,3.3),rand(1,3),rand(1,3)),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.95}));mesh.position.set(x,rand(1,5),y);scene.add(mesh);state.particles.push({mesh,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life,max:life,color});}
}
function disposeObject(object){scene.remove(object);object.traverse(child=>{child.geometry?.dispose();if(Array.isArray(child.material))child.material.forEach(material=>material.dispose());else child.material?.dispose();});}
function killEnemy(enemy,bullet){
  if(!enemy.alive)return;enemy.alive=false;enemy.corpseTimer=3.5;enemy.body.setLinvel({x:bullet.vx*.17,y:bullet.vy*.17},true);enemy.hp=0;
  enemy.mesh.userData.body.rotation.z=Math.PI/2;enemy.mesh.userData.body.material.color.setHex(0x542d42);enemy.mesh.userData.body.material.emissive.setHex(0x260d1a);enemy.mesh.userData.body.material.transparent=true;enemy.mesh.userData.body.material.opacity=.76;
  state.kills++;state.scrap+=6+Math.floor(Math.random()*8);state.shake=Math.max(state.shake,3.8);state.hitstop=.045;burst(enemy.x,enemy.y,enemy.def.color,17,1.4);
  if(Math.random()<.2)dropPickup(Math.random()<.55?'scrap':'mod',enemy.x,enemy.y,12+Math.floor(Math.random()*10));
  hud();checkRoomClear();
}
function hitPlayer(damage,x,y){
  if(state.invuln>0||state.mode!=='play')return;
  state.health=Math.max(0,state.health-damage);state.invuln=.85;state.shake=5.5;state.hitstop=.075;state.lastAction=performance.now()/1000;burst(state.player.x,state.player.y,0xff4e63,12,1.1);toast(damage>1?'BRUTAL HIT':'YOU GOT TAGGED',900);hud();
  const dx=state.player.x-x,dy=state.player.y-y,len=Math.hypot(dx,dy)||1;state.player.body.setLinvel({x:dx/len*95,y:dy/len*95},true);
  if(state.health<=0){state.mode='dead';toast('RUN OVER · PRESS R TO RESTART',4000);$('vignette').style.background='radial-gradient(ellipse,rgba(95,15,30,.25),rgba(10,6,13,.85))';}
}
function reload(){if(state.reloadTimer>0||state.weaponAmmo[state.weaponIndex]>=magSize(GUNS[state.weaponIndex])||state.reserveAmmo[state.weaponIndex]<=0)return;state.reloadTimer=reloadSeconds(state.mods);toast('RELOADING',700);}
function switchWeapon(slot){if(slot<0||slot>=state.weaponSlots.length)return;state.reloadTimer=0;state.activeSlot=slot;state.weaponIndex=state.weaponSlots[slot];state.lastAction=performance.now()/1000;hud();}
function equipWeapon(index){const currentSlot=state.weaponSlots.indexOf(index);if(currentSlot>=0){switchWeapon(currentSlot);return;}if(!canCarryWeapons([state.weaponSlots[0],index],GUNS,state.carryCapacity)){toast('TOO HEAVY · UPGRADE YOUR CARRY RIG');return;}state.weaponSlots[1]=index;state.weaponAmmo[index]=Math.min(state.weaponAmmo[index],GUNS[index].mag);if(state.activeSlot===1)state.weaponIndex=index;toast(`SECONDARY · ${GUNS[index].name}`);hud();}
function installMod(id){const mod=MODS.find(m=>m.id===id);if(!mod||state.mods.has(id)||state.scrap<mod.cost)return;state.scrap-=mod.cost;state.mods.add(id);if(id==='extended'){const i=state.weaponIndex;state.weaponAmmo[i]=Math.min(magSize(GUNS[i]),state.weaponAmmo[i]+Math.ceil(GUNS[i].mag*.5));}toast(`${mod.name} INSTALLED`);hud();}
function collect(pickup){if(!pickup.available)return false;const d=distance(state.player,pickup);if(d>28)return false;pickup.available=false;scene.remove(pickup.mesh);state.pickupMeshes.delete(pickup);burst(pickup.x,pickup.y,pickup.mesh.material.color.getHex(),8);
  switch(pickup.kind){
    case'scrap':state.scrap+=pickup.value||12;toast(`+${pickup.value||12} SCRAP`);break;
    case'gun':{const candidate=GUNS.findIndex((_,i)=>!state.weaponSlots.includes(i)&&canCarryWeapons([state.weaponSlots[0],i],GUNS,state.carryCapacity));if(candidate<0){toast('NO GUN FITS YOUR CARRY RIG');pickup.available=true;scene.add(pickup.mesh);state.pickupMeshes.set(pickup,pickup.mesh);}else{state.weaponSlots[1]=candidate;state.weaponAmmo[candidate]=GUNS[candidate].mag;state.reserveAmmo[candidate]+=GUNS[candidate].mag;toast(`SECONDARY · ${GUNS[candidate].name}`);renderLoadout();}break;}
    case'mod':{const unowned=MODS.filter(m=>!state.mods.has(m.id));if(unowned.length)installMod(choose(unowned).id);else state.scrap+=30;break;}
    case'heal':state.health=Math.min(state.maxHealth,state.health+2);toast('PATCHED UP · +2 VITALS');break;
    case'exit':if(state.enemies.some(e=>e.alive)){toast('CLEAR THE SECTOR FIRST');pickup.available=true;scene.add(pickup.mesh);return false;}winRun();break;
  }if(!pickup.available){pickup.mesh.geometry.dispose();pickup.mesh.material.dispose();}hud();return true;
}
function winRun(){state.mode='won';toast('SECTOR CLEARED · PRESS R FOR A NEW RUN',4500);}
function checkRoomClear(){for(const [i,r] of state.rooms.entries()){
  if(r.cleared||!r.visited)continue;
  const hasEnemy=state.enemies.some(e=>e.alive&&e.x/TILE>=r.x1&&e.x/TILE<=r.x2&&e.y/TILE>=r.y1&&e.y/TILE<=r.y2);
  if(!hasEnemy){r.cleared=true;state.roomsCleared++;if(i>0){state.scrap+=20;toast(`ROOM CLEAR · +20 SCRAP`,1800);for(let n=0;n<6;n++)dropPickup('scrap',rand(r.x1+1,r.x2-1)*TILE,rand(r.y1+1,r.y2-1)*TILE,4);hud();}}
}}
function updateRoom(){
  const px=state.player.x/TILE,py=state.player.y/TILE;let found=state.rooms.findIndex(r=>px>=r.x1-1&&px<=r.x2+1&&py>=r.y1-1&&py<=r.y2+1);
  if(found<0){const nearest=state.rooms.reduce((best,r,i)=>Math.hypot(px-r.cx,py-r.cy)<best.d?{i,d:Math.hypot(px-r.cx,py-r.cy)}:best,{i:state.currentRoom,d:Infinity});found=nearest.i;}
  if(found!==state.currentRoom){state.currentRoom=found;const room=state.rooms[found];room.visited=true;state.roomToast=`FLOOR 01 · ${room.name}`;state.toastTimer=1100;checkRoomClear();hud();}
  if(state.roomToast&&state.toastTimer<=0)state.roomToast='';
}
function interact(){
  const close=state.pickups.filter(p=>p.available&&distance(state.player,p)<36).sort((a,b)=>distance(state.player,a)-distance(state.player,b))[0];
  if(close){collect(close);return;}
  if(distance(state.player,{x:state.rooms[0].cx*TILE,y:state.rooms[0].cy*TILE})<110){toggleLoadout();return;}
  toast('NOTHING IN REACH',650);
}
function toggleLoadout(force){state.loadoutOpen=force??!state.loadoutOpen;if(state.loadoutOpen)renderLoadout();$('loadout').classList.toggle('show',state.loadoutOpen);$('loadout').setAttribute('aria-hidden',String(!state.loadoutOpen));}
function getTimeScale(){return timeScale({mode:state.mode,paused:state.paused,loadoutOpen:state.loadoutOpen,moving:['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright'].some(key=>input.keys.has(key)),firing:input.firing,now:performance.now()/1000,lastAction:state.lastAction});}
function updatePlayer(dt){
  const p=state.player;if(!p)return;
  const left=input.keys.has('a')||input.keys.has('arrowleft'),right=input.keys.has('d')||input.keys.has('arrowright'),up=input.keys.has('w')||input.keys.has('arrowup'),down=input.keys.has('s')||input.keys.has('arrowdown');let vx=(right?1:0)-(left?1:0),vy=(down?1:0)-(up?1:0),len=Math.hypot(vx,vy);if(len>0){vx/=len;vy/=len;state.lastAction=performance.now()/1000;}
  const speed=112;p.body.setLinvel({x:vx*speed,y:vy*speed},true);const pos=p.body.translation();p.x=pos.x;p.y=pos.y;
  pointer.set(input.mouseX/innerWidth*2-1,-input.mouseY/innerHeight*2+1);raycaster.setFromCamera(pointer,camera);raycaster.ray.intersectPlane(aimPlane,hitPoint);
  if(hitPoint){const dx=hitPoint.x-p.x,dy=hitPoint.z-p.y,d=Math.hypot(dx,dy)||1;state.aim.x=dx/d;state.aim.y=dy/d;}
  const mesh=state.actorMeshes.get('player');mesh.position.set(p.x,.2,p.y);mesh.rotation.y=Math.atan2(-state.aim.x,-state.aim.y);
  state.invuln=Math.max(0,state.invuln-dt);mesh.visible=state.invuln<=0||Math.floor(state.time*18)%2===0;
  if(state.reloadTimer>0){state.reloadTimer-=dt;if(state.reloadTimer<=0){const gun=GUNS[state.weaponIndex],needed=magSize(gun)-state.weaponAmmo[state.weaponIndex],take=Math.min(needed,state.reserveAmmo[state.weaponIndex]);state.weaponAmmo[state.weaponIndex]+=take;state.reserveAmmo[state.weaponIndex]-=take;hud();}}
  if(input.firing)playerShoot();if(input.interact){input.interact=false;interact();}
  for(const pickup of state.pickups)if(pickup.available&&distance(p,pickup)<19)collect(pickup);
  const stationNear=distance(p,{x:state.rooms[0].cx*TILE,y:state.rooms[0].cy*TILE})<110;$('interaction-hint').classList.toggle('show',stationNear&&!state.loadoutOpen);
  updateRoom();
}
function updateEnemies(dt){
  const player=state.player;
  for(const e of state.enemies){if(!e.alive)continue;const dx=player.x-e.x,dy=player.y-e.y,d=Math.hypot(dx,dy)||1,nx=dx/d,ny=dy/d;e.fire-=dt;e.stun=Math.max(0,e.stun-dt);
    let vx=0,vy=0;
    if(e.def.brain==='rush'&&d>e.def.range){vx=nx*e.def.speed;vy=ny*e.def.speed;}
    else if(e.def.brain==='shoot'&&d<e.def.range){if(d<140){vx=-nx*e.def.speed*.75;vy=-ny*e.def.speed*.75;}if(e.fire<=0){enemyShoot(e);e.fire=rand(1.1,2.2);}}
    else if(e.def.brain==='guard'){if(d>e.def.range*.78){vx=nx*e.def.speed;vy=ny*e.def.speed;}else if(d<e.def.range*.46){vx=-nx*e.def.speed*.65;vy=-ny*e.def.speed*.65;}if(d<e.def.range&&e.fire<=0){enemyShoot(e);e.fire=rand(1.7,2.7);}}
    if(e.stun>0){vx=0;vy=0;}
    for(const other of state.enemies){if(other===e||!other.alive)continue;const ox=e.x-other.x,oy=e.y-other.y,od=Math.hypot(ox,oy);if(od>0&&od<23){vx+=ox/od*3;vy+=oy/od*3;}}
    e.body.setLinvel({x:vx+e.knock.x,y:vy+e.knock.y},true);e.knock.x*=Math.pow(.1,dt);e.knock.y*=Math.pow(.1,dt);
    const pos=e.body.translation();e.x=pos.x;e.y=pos.y;e.mesh.position.set(e.x,.2,e.y);e.mesh.rotation.y=Math.atan2(-nx,-ny);e.mesh.userData.body.scale.setScalar(e.type==='brute'?1.22:1);
    if(d<e.def.range&&e.def.brain==='rush'&&Math.random()<dt*1.2)hitPlayer(e.def.damage,e.x,e.y);
  }
}
function updateBullets(dt){
  for(let i=state.bullets.length-1;i>=0;i--){const b=state.bullets[i];b.life-=dt;if(b.life<=0){removeBullet(i);continue;}const pos=b.body.translation();b.x=pos.x;b.y=pos.y;b.mesh.position.set(b.x,.7,b.y);
    if(b.owner==='player'){
      let hit=false;
      for(const e of state.enemies){if(!e.alive||b.hit.has(e))continue;if(distance(b,e)<(e.type==='brute'?13:11)){
        b.hit.add(e);e.hp-=b.damage;e.stun=.1;const len=Math.hypot(b.vx,b.vy)||1;e.knock.x=b.vx/len*(e.type==='brute'?7:13);e.knock.y=b.vy/len*(e.type==='brute'?7:13);burst(e.x,e.y,0xffd3aa,6,.72);state.hitstop=.018;
        if(e.hp<=0)killEnemy(e,b);else{e.mesh.userData.body.material.emissiveIntensity=.5;setTimeout(()=>{if(e.mesh?.userData.body)e.mesh.userData.body.material.emissiveIntensity=.05;},80);}
        if(b.pierce>0)b.pierce--;else hit=true;break;
      }}if(hit){removeBullet(i);continue;}
    }
    const crate=state.crates.find(item=>Math.abs(b.x-item.x)<15&&Math.abs(b.y-item.y)<15);
    if(crate){crate.hp=damageDurability(crate.hp,b.damage);burst(crate.x,crate.y,0xb98258,4,.65);if(!crate.cracked){crate.cracked=true;crackCrate(crate);}if(crate.hp===0)breakCrate(crate);removeBullet(i);continue;}
    if(b.owner==='enemy'&&distance(b,state.player)<10){hitPlayer(b.damage,b.x,b.y);removeBullet(i);continue;}
    const tx=Math.floor(b.x/TILE),ty=Math.floor(b.y/TILE);if(state.tileMap[ty]?.[tx]!==0||Math.abs(b.x)>state.mapW*TILE||Math.abs(b.y)>state.mapH*TILE){burst(b.x,b.y,b.owner==='player'?0xf0c986:0xfa7068,3,.5);removeBullet(i);}
  }
}
function removeBullet(i){const b=state.bullets[i];physics.removeRigidBody(b.body);disposeObject(b.mesh);state.bulletMeshes.delete(b);state.bullets.splice(i,1);}
function updateParticles(dt){for(let i=state.particles.length-1;i>=0;i--){const p=state.particles[i];p.life-=dt;p.mesh.position.x+=p.vx*dt;p.mesh.position.z+=p.vy*dt;p.mesh.rotation.x+=dt*8;p.mesh.rotation.z+=dt*5;p.mesh.material.opacity=Math.max(0,p.life/p.max);if(p.life<=0){scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();state.particles.splice(i,1);}}}
function updateCorpses(dt){for(const e of state.enemies){if(e.alive||!e.corpseTimer)continue;e.corpseTimer-=dt;const p=e.body.translation();e.x=p.x;e.y=p.y;e.mesh.position.set(e.x,.2,e.y);if(e.corpseTimer<=0){physics.removeRigidBody(e.body);disposeObject(e.mesh);e.corpseTimer=0;}}}
function update(dt){
  if(state.mode!=='play'||state.paused||state.loadoutOpen)return;
  const scale=getTimeScale();const step=dt*scale;if(state.hitstop>0){state.hitstop-=dt;if(state.hitstop<=0)physics.step();}else{physics.timestep=Math.min(step,1/30);physics.step();}
  state.time+=step;state.elapsed+=step;updatePlayer(step);updateEnemies(step);updateBullets(step);updateCorpses(step);updateParticles(step);state.shake=Math.max(0,state.shake-dt*14);state.toastTimer=Math.max(0,state.toastTimer-dt*1000);if(state.toastTimer<=0){$('toast').classList.remove('show');if(state.roomToast){state.roomToast='';hud();}}
  const active=scale>.5;const ratio=clamp(scale/1.32,0,1);$('tempo-label').textContent=active?'IN MOTION':'LISTENING';$('tempo-speed').textContent=`${scale.toFixed(2)}×`;$('tempo-fill').style.width=`${Math.round(ratio*100)}%`;$('tempo-fill').parentElement.classList.toggle('fast',active);$('tempo').querySelector('.tempo-dot').style.background=active?'#fe5669':'#65dca8';
  const p=state.player;if(p){camera.position.set(p.x,90,p.y);camera.lookAt(p.x,0,p.y);camera.position.x+=rand(-state.shake,state.shake);camera.position.z+=rand(-state.shake,state.shake);}
  drawMinimap();syncHudFrame();
}
function makeMinimap(){const c=$('minimap'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);}
function drawMinimap(){const c=$('minimap'),ctx=c.getContext('2d'),sx=c.width/state.mapW,sy=c.height/state.mapH;ctx.fillStyle='#171420';ctx.fillRect(0,0,c.width,c.height);
  for(const r of state.rooms){ctx.fillStyle=r.visited?'#45404e':'#282430';ctx.fillRect(r.x1*sx,r.y1*sy,(r.x2-r.x1+1)*sx,(r.y2-r.y1+1)*sy);}
  ctx.fillStyle='#ed5a68';for(const e of state.enemies)if(e.alive)ctx.fillRect(e.x/TILE*sx-1,e.y/TILE*sy-1,3,3);
  for(const p of state.pickups)if(p.available&&p.kind==='exit'){ctx.fillStyle='#f5cb76';ctx.fillRect(p.x/TILE*sx-1,p.y/TILE*sy-1,3,3);}
  if(state.player){ctx.fillStyle='#70e5b2';ctx.beginPath();ctx.arc(state.player.x/TILE*sx,state.player.y/TILE*sy,3,0,TAU);ctx.fill();}
}
function newRun(){
  state.mode='play';state.paused=false;state.running=true;state.elapsed=0;state.time=0;state.kills=0;state.scrap=40;state.health=5;state.maxHealth=5;state.weaponSlots=[0,1];state.activeSlot=0;state.weaponIndex=state.weaponSlots[0];state.carryCapacity=BASE_CARRY_CAPACITY;state.weaponAmmo=GUNS.map(g=>g.mag);state.reserveAmmo=GUNS.map(g=>g.reserve);state.mods=new Set();state.lastAction=0;state.fireCooldown=0;state.reloadTimer=0;state.invuln=0;state.shake=0;state.roomsCleared=0;state.roomToast='';$('overlay').classList.remove('show');toggleLoadout(false);$('vignette').style.background='';makeLevel();toast('MOVE TO SPEED UP · STAND STILL TO THINK',2600);}
function resize(){if(!renderer)return;renderer.setSize(innerWidth,innerHeight);const aspect=innerWidth/innerHeight,halfH=260;camera.left=-aspect*halfH;camera.right=aspect*halfH;camera.top=halfH;camera.bottom=-halfH;camera.updateProjectionMatrix();}
function render(){renderer.render(scene,camera);}
function renderGameToText(){return JSON.stringify({mode:state.mode,coordinateSystem:'world origin at top-left; +x right, +y down',player:state.player?{x:Math.round(state.player.x),y:Math.round(state.player.y),health:state.health,weapon:GUNS[state.weaponIndex].name,ammo:state.weaponAmmo[state.weaponIndex],reserve:state.reserveAmmo[state.weaponIndex]}:null,room:state.rooms[state.currentRoom]?.name,enemies:state.enemies.filter(e=>e.alive).map(e=>({type:e.def.name,x:Math.round(e.x),y:Math.round(e.y),health:Math.round(e.hp)})).slice(0,12),pickups:state.pickups.filter(p=>p.available).map(p=>({type:p.kind,x:Math.round(p.x),y:Math.round(p.y)})).slice(0,8),kills:state.kills,scrap:state.scrap,roomsCleared:state.roomsCleared,rooms:state.rooms.length,timeScale:getTimeScale().toFixed(2),elapsed:Math.floor(state.elapsed)});}
window.render_game_to_text=renderGameToText;
window.advanceTime=(ms)=>{const frames=Math.max(1,Math.ceil(ms/16.667));for(let i=0;i<frames;i++)update(1/60);render();};

function setupControls(){
  addEventListener('keydown',e=>{const key=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key))e.preventDefault();input.keys.add(key);
    if(key==='tab'){e.preventDefault();toggleLoadout();state.lastAction=performance.now()/1000;}
    if(key==='e'||key===' '){input.interact=true;state.lastAction=performance.now()/1000;}
    if(key==='r'&&(state.mode==='dead'||state.mode==='won'))newRun();
    if(key==='escape'){if(state.loadoutOpen)toggleLoadout(false);else state.paused=!state.paused;toast(state.paused?'PAUSED':'BACK IN');}
    if(key==='1'||key==='2')switchWeapon(Number(key)-1);
    if(key==='f'){if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.();}
    if(key==='shift')reload();
  });
  addEventListener('keyup',e=>input.keys.delete(e.key.toLowerCase()));
  addEventListener('blur',()=>{input.keys.clear();input.firing=false;});
  addEventListener('mousemove',e=>{input.mouseX=e.clientX;input.mouseY=e.clientY;});
  addEventListener('mousedown',e=>{if(e.button===0){input.firing=true;state.lastAction=performance.now()/1000;}});addEventListener('mouseup',e=>{if(e.button===0)input.firing=false;});
  $('start-button').addEventListener('click',()=>{input.firing=false;input.interact=false;newRun();renderer.domElement.focus();});$('close-loadout').addEventListener('click',()=>{toggleLoadout(false);renderer.domElement.focus();});
  $('loadout').addEventListener('click',e=>{if(e.target===$('loadout'))toggleLoadout(false);const gun=e.target.closest('[data-gun]');if(gun)equipWeapon(Number(gun.dataset.gun));const mod=e.target.closest('[data-mod]');if(mod)installMod(mod.dataset.mod);});
  addEventListener('resize',resize);
}
async function boot(){
  await RAPIER.init();
  scene=new THREE.Scene();scene.background=new THREE.Color(0x171420);scene.fog=new THREE.Fog(0x171420,300,1900);
  camera=new THREE.OrthographicCamera(-260,260,260,-260,.1,240);camera.position.set(0,90,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.28;renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','DEAD AIR game. Use WASD to move and the mouse to aim and fire.');$('game').appendChild(renderer.domElement);
  lighting=new THREE.Group();lighting.add(new THREE.HemisphereLight(0xbab6d2,0x35313d,2.1));const key=new THREE.DirectionalLight(0xffe9cc,2.2);key.position.set(-30,70,10);key.castShadow=true;key.shadow.mapSize.set(1024,1024);lighting.add(key);
  const ambient=new THREE.PointLight(0xff556e,55,220);ambient.position.set(0,25,0);lighting.add(ambient);scene.add(lighting);
  state.scene=scene;state.camera=camera;state.renderer=renderer;state.physics=physics;setupControls();resize();
  let previous=performance.now();function loop(now){requestAnimationFrame(loop);const dt=Math.min(.05,(now-previous)/1000);previous=now;if(state.mode==='play')update(dt);render();}requestAnimationFrame(loop);
}
boot().catch(error=>{console.error(error);$('overlay').classList.add('show');$('overlay').querySelector('p').textContent='The game could not load. Start a local web server and check that the three game libraries are reachable.';});
