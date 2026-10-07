import * as ROT from 'https://esm.sh/rot-js@2.1.3';
import {TILE} from '../catalog.js';
import {generateDungeon} from '../dungeon.js?locked-door-check-final3';
import {chooseRewardDoor, roomsAvoidableOnRoute, shortestFloorPath} from '../layout.js';
import {findRoomCratePosition, findRoomPropPosition} from '../room-props.js';
import {roomEnemyCount} from '../room-roles.js';

const result = document.querySelector('#result');
const seeds = Array.from({length: 64}, (_, index) => 1 + index * 3571);
const isFloor = (cells, x, y) => cells[y]?.[x] === 0;
const stableMap = dungeon => JSON.stringify({
  width: dungeon.width,
  height: dungeon.height,
  cells: dungeon.cells,
  doors: dungeon.doors,
  lockedDoors: dungeon.lockedDoors,
  rooms: dungeon.rooms.map(({cx, cy, x1, x2, y1, y2, index, pathLength, name, revealedName, shape, role, branch, secret}) => ({cx, cy, x1, x2, y1, y2, index, pathLength, name, revealedName, shape, role, branch, secret})),
});

try {
  let largestRoomCount = 0;
  let largestMap = '';
  let largestArea = 0;
  let floorsWithBranches = 0;
  let floorsWithRewardDoors = 0;
  let floorsWithGateableBranch = 0;
  let floorsWithScaledCombat = 0;
  let firstRewardGateSeed = null;
  for (const seed of seeds) {
    const dungeon = generateDungeon(ROT, seed);
    const secondRun = generateDungeon(ROT, seed);
    if (stableMap(dungeon) !== stableMap(secondRun)) throw new Error(`Seed ${seed} did not reproduce the same map`);
    if (dungeon.cells.length !== dungeon.height || dungeon.cells.some(row => row.length !== dungeon.width)) {
      throw new Error(`Seed ${seed} produced an invalid map boundary`);
    }
    if (dungeon.rooms.length < 6) throw new Error(`Seed ${seed} produced fewer than six reachable rooms`);
    if (!dungeon.rooms.some(room => room.shape !== 'rectangle')) throw new Error(`Seed ${seed} produced only rectangular rooms`);
    if (dungeon.rooms.some(room => !['rectangle','L','U','C'].includes(room.shape))) throw new Error(`Seed ${seed} has an unknown room shape`);

    const entry = dungeon.rooms[0];
    const exit = dungeon.rooms[dungeon.rooms.length - 1];
    let combatIndex=0;
    for(const room of dungeon.rooms.slice(1)){
      if(room.role==='merchant')continue;
      const count=roomEnemyCount(room.role,.99,combatIndex);
      if(room.role==='combat'){
        const expected=combatIndex<2?3:4;
        if(count!==expected)throw new Error(`Seed ${seed} combat room ${combatIndex} budget was ${count}, expected ${expected}`);
        combatIndex++;
      }else if(count!==roomEnemyCount(room.role,.99))throw new Error(`Seed ${seed} special room ${room.role} changed budget`);
    }
    if(combatIndex>2)floorsWithScaledCombat++;
    if(entry.role!=='entry'||exit.role!=='extraction')throw new Error(`Seed ${seed} did not reserve entry and extraction roles`);
    if(dungeon.rooms.filter(room=>room.role==='cache').length!==1)throw new Error(`Seed ${seed} did not generate exactly one cache room`);
    const bypassable=new Set(roomsAvoidableOnRoute(dungeon.cells,dungeon.rooms));
    if(bypassable.size)floorsWithBranches++;
    const cache=dungeon.rooms.find(room=>room.role==='cache');
    if(dungeon.rooms.some((room,index)=>room.branch&&chooseRewardDoor(dungeon.cells,dungeon.doors,dungeon.rooms.map(candidate=>({...candidate,secret:candidate.branch})),index)))floorsWithGateableBranch++;
    if(bypassable.size&&!bypassable.has(dungeon.rooms.indexOf(cache)))throw new Error(`Seed ${seed} did not place its cache on an optional branch room`);
    if(cache.secret!==bypassable.has(dungeon.rooms.indexOf(cache)))throw new Error(`Seed ${seed} secret status does not match the cache branch`);
    if(cache.secret&&(cache.name!=='UNMARKED ROOM'||cache.revealedName!=='SIDE SUPPLY'))throw new Error(`Seed ${seed} did not hide and name its secret cache consistently`);
    if(dungeon.lockedDoors.length>1)throw new Error(`Seed ${seed} generated more than one reward gate`);
    if(dungeon.lockedDoors.length){
      floorsWithRewardDoors++;
      firstRewardGateSeed??=seed;
      const gate=dungeon.lockedDoors[0],rewardRoom=dungeon.rooms[gate.roomIndex],blocked=new Set(gate.cells.map(({x,y})=>`${x},${y}`));
      if(!cache.secret||rewardRoom!==cache||gate.cost<=0||gate.opened)throw new Error(`Seed ${seed} assigned an invalid reward gate`);
      if(gate.cells.length<2||gate.cells.some(({x,y})=>!isFloor(dungeon.cells,x,y)))throw new Error(`Seed ${seed} gate does not cover walkable doorway tiles: ${JSON.stringify(gate)}`);
      const closedCanPass=(x,y)=>isFloor(dungeon.cells,x,y)&&!blocked.has(`${x},${y}`);
      if(shortestFloorPath(dungeon.cells,{x:entry.cx,y:entry.cy},{x:cache.cx,y:cache.cy},closedCanPass).length)throw new Error(`Seed ${seed} reward room remains reachable through its closed gate`);
      if(!shortestFloorPath(dungeon.cells,{x:entry.cx,y:entry.cy},{x:exit.cx,y:exit.cy},closedCanPass).length)throw new Error(`Seed ${seed} gate blocks the extraction route`);
      if(!shortestFloorPath(dungeon.cells,{x:entry.cx,y:entry.cy},{x:cache.cx,y:cache.cy}).length)throw new Error(`Seed ${seed} reward room cannot be reached after opening its gate`);
    }
    for(const [index,room] of dungeon.rooms.entries())if(Boolean(room.branch)!==bypassable.has(index))throw new Error(`Seed ${seed} has an incorrect branch marker`);
    if(dungeon.rooms.some(room=>!['entry','combat','cache','armory','clinic','hazard','elite','extraction'].includes(room.role)))throw new Error(`Seed ${seed} has an unknown room role`);
    if(dungeon.rooms.length>=7&&dungeon.rooms.filter(room=>room.role==='elite').length!==1)throw new Error(`Seed ${seed} did not assign its large-floor Warden encounter`);
    if(dungeon.rooms.some(room=>room.role==='elite'&&room.name!=='WARDEN'))throw new Error(`Seed ${seed} did not name the Warden encounter`);
    for(const room of dungeon.rooms){
      const reserved=[],placement={room,cells:dungeon.cells,doors:dungeon.doors,occupied:reserved,tileSize:TILE,random:()=>ROT.RNG.getUniform()};
      const crate=findRoomCratePosition(placement);
      if(!crate)throw new Error(`Seed ${seed} room ${room.index} has no safe guaranteed-crate tile`);
      if(dungeon.cells[Math.floor(crate.y/TILE)]?.[Math.floor(crate.x/TILE)]!==0)throw new Error(`Seed ${seed} placed a room crate off the floor`);
      reserved.push({...crate,radius:17});
      const rewardCount=['cache','elite'].includes(room.role)?2:['armory','clinic'].includes(room.role)?1:0;
      for(let reward=0;reward<rewardCount;reward++){
        const point=findRoomPropPosition({...placement,random:()=>ROT.RNG.getUniform()});
        if(!point||dungeon.cells[Math.floor(point.y/TILE)]?.[Math.floor(point.x/TILE)]!==0)throw new Error(`Seed ${seed} has no valid ${room.role} reward position`);
        reserved.push({...point,radius:18});
      }
      const prop=findRoomPropPosition({...placement,random:()=>ROT.RNG.getUniform()});
      if(prop&&reserved.some(point=>Math.hypot(prop.x-point.x,prop.y-point.y)<point.radius+22))throw new Error(`Seed ${seed} placed room cover over a crate or ${room.role} reward`);
    }
    for (const room of dungeon.rooms) {
      if (!isFloor(dungeon.cells, room.cx, room.cy)) throw new Error(`Seed ${seed} has a blocked room center`);
      const path = shortestFloorPath(dungeon.cells, {x: entry.cx, y: entry.cy}, {x: room.cx, y: room.cy});
      if (path.length === 0 || path.length !== room.pathLength) throw new Error(`Seed ${seed} has an unreachable or mismeasured room route`);
    }
    const exitPath = shortestFloorPath(dungeon.cells, {x: entry.cx, y: entry.cy}, {x: exit.cx, y: exit.cy});
    if (exitPath.length === 0) throw new Error(`Seed ${seed} has no route to its extraction room`);
    for (const door of dungeon.doors) {
      if (!isFloor(dungeon.cells, Math.floor(door.x), Math.floor(door.y))) throw new Error(`Seed ${seed} has a blocked door tile`);
    }
    largestRoomCount = Math.max(largestRoomCount, dungeon.rooms.length);
    if (dungeon.width * dungeon.height > largestArea) {
      largestArea = dungeon.width * dungeon.height;
      largestMap = `${dungeon.width}×${dungeon.height}`;
    }
  }
  if(floorsWithRewardDoors<Math.floor(seeds.length/3))throw new Error(`Only ${floorsWithRewardDoors} selected gates of ${seeds.length}; ${floorsWithGateableBranch} floors had a gateable branch`);
  if(!floorsWithScaledCombat)throw new Error('The selected maps did not reach a later ordinary combat room');
  const fallback = generateDungeon(ROT, 417, 48, 38);
  if (fallback.width !== 108 || fallback.height !== 82) throw new Error('A map with too few initial rooms did not retry at the larger size');
  if (fallback.rooms.length < 6 || shortestFloorPath(fallback.cells, {x:fallback.rooms[0].cx,y:fallback.rooms[0].cy}, {x:fallback.rooms.at(-1).cx,y:fallback.rooms.at(-1).cy}).length === 0) {
    throw new Error('The larger fallback map did not preserve the extraction route');
  }
  for(const room of fallback.rooms){
    const point=findRoomCratePosition({room,cells:fallback.cells,doors:fallback.doors,occupied:[],tileSize:TILE,random:()=>ROT.RNG.getUniform()});
    if(!point)throw new Error(`Fallback map room ${room.index} has no safe crate tile`);
  }
  result.className = 'pass';
  result.textContent = `PASS · ${seeds.length} seeds, each generated twice, plus the low-room-count fallback\nAll entry, room-center, extraction, and doorway routes are walkable; every room has a reserved crate tile clear of rewards and doors.\nOpening combat budgets scale by room distance; special-room budgets stay fixed. Later ordinary combat reached on ${floorsWithScaledCombat}/${seeds.length} floors.\nOptional-branch floors: ${floorsWithBranches}/${seeds.length}; selected gates: ${floorsWithRewardDoors}/${seeds.length}; gateable branches: ${floorsWithGateableBranch}/${seeds.length}.\nUse seed ${firstRewardGateSeed} to try a run with a locked cache gate.\nLargest room count: ${largestRoomCount}\nLargest tested map: ${largestMap}; fallback: ${fallback.width}×${fallback.height}`;
} catch (error) {
  result.className = 'fail';
  result.textContent = `FAIL\n${error.stack || error.message}`;
}
