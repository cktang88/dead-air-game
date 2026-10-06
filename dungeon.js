import {chooseRewardDoor, roomsAvoidableOnRoute, shapeDungeon, shortestFloorPath} from './layout.js';
import {rebuildCorridors} from './floor-topology.js';
import {stampRoomTemplates} from './room-templates.js';
import {assignRoomRoles} from './room-roles.js';

// Digger parameters: wide size ranges give real room variety (closets to halls); short corridors keep floors tight.
const DIGGER={roomWidth:[6,22],roomHeight:[6,15],corridorLength:[2,4],dugPercentage:0.26};
const ROOM_NAMES = ['FURNACE', 'THE GALLERY', 'COLD STORAGE', 'RED HALL', 'MOTOR POOL', 'THE VAULT', 'NIGHT SHIFT'];

export function nameDungeonRooms(rooms){
  return rooms.map((room,index)=>{
    if(index===0)return {...room,name:'ENTRY'};
    if(index===rooms.length-1)return {...room,name:'EXTRACTION'};
    const name=ROOM_NAMES[(index-1)%ROOM_NAMES.length],floor=Math.floor((index-1)/ROOM_NAMES.length);
    return {...room,name:floor?`${name} ${floor+1}`:name};
  });
}

export function generateDungeon(ROT, seed, width = 96, height = 72) {
  const attempts = [[width, height], [Math.max(width, 108), Math.max(height, 82)]];
  for (const [mapWidth, mapHeight] of attempts) {
    ROT.RNG.setSeed(seed);
    const generator = new ROT.Map.Digger(mapWidth, mapHeight, {
      roomWidth: DIGGER.roomWidth, roomHeight: DIGGER.roomHeight, corridorLength: DIGGER.corridorLength, dugPercentage: DIGGER.dugPercentage,
    });
    const cells = Array.from({length: mapHeight}, () => Array(mapWidth).fill(1));
    generator.create((x, y, value) => { cells[y][x] = value; });
    const generatedRooms = generator.getRooms().map((room, index) => {
      const [cx, cy] = room.getCenter();
      return {
        cx, cy, x1: room.getLeft(), x2: room.getRight(), y1: room.getTop(), y2: room.getBottom(),
        index, cleared: false, visited: false,
      };
    });
    if (!generatedRooms.length) continue;
    const {loops} = rebuildCorridors(cells, generatedRooms, seed, 2);

    const start = generatedRooms.reduce((best, room) =>
      Math.hypot(room.cx - mapWidth / 2, room.cy - mapHeight / 2) < Math.hypot(best.cx - mapWidth / 2, best.cy - mapHeight / 2) ? room : best,
    generatedRooms[0]);
    const shaped = shapeDungeon(cells, generatedRooms, {x: start.cx, y: start.cy}, seed);
    const roomShapes=new Map(shaped.roomShapes.map(item=>[item.index,item.shape]));
    const rooms = generatedRooms
      .filter(room => shaped.cells[room.cy]?.[room.cx] === 0)
      .map(room => ({
        ...room,
        shape:roomShapes.get(room.index)||'rectangle',
        pathLength: shortestFloorPath(shaped.cells, {x: start.cx, y: start.cy}, {x: room.cx, y: room.cy}).length,
      }))
      .filter(room => room.pathLength > 0)
      .sort((a, b) => a.pathLength - b.pathLength);

    if (rooms.length < 6) continue;
    const branchRooms=new Set(roomsAvoidableOnRoute(shaped.cells,rooms));
    const roleInputs=rooms.map((room,index)=>({...room,branch:branchRooms.has(index)})),gateCheckRooms=roleInputs.map(room=>({...room,secret:room.branch}));
    const gateableCacheIndexes=roleInputs.map((room,index)=>room.branch&&chooseRewardDoor(shaped.cells,shaped.doors,gateCheckRooms,index)?index:-1).filter(index=>index>=0);
    const roleRooms=nameDungeonRooms(assignRoomRoles(roleInputs,seed,gateableCacheIndexes));
    const cacheIndex=roleRooms.findIndex(room=>room.role==='cache'&&room.secret),lockedDoor=cacheIndex>=0?chooseRewardDoor(shaped.cells,shaped.doors,roleRooms,cacheIndex):null;
    roleRooms[0].visited = true;
    for(const room of roleRooms.slice(1,-1))if(room.role!=='combat'){
      room.name=room.secret?'UNMARKED ROOM':({cache:'CONTRABAND CACHE',armory:'ARMORY',clinic:'FIELD CLINIC',hazard:'KILLBOX',elite:'WARDEN'})[room.role];
      if(room.secret)room.revealedName='SIDE CACHE';
    }
    // Stamp cover layouts, themes, spawn plans and pacing; hard cover becomes solid tiles in `cells`.
    stampRoomTemplates({cells: shaped.cells, rooms: roleRooms, start: {cx: start.cx, cy: start.cy}, seed});
    for (const room of roleRooms) room.pathLength = shortestFloorPath(shaped.cells, {x: start.cx, y: start.cy}, {x: room.cx, y: room.cy}).length;
    return {cells: shaped.cells, doors: shaped.doors, lockedDoors:lockedDoor?[lockedDoor]:[], rooms:roleRooms, loops, start: roleRooms[0], width: mapWidth, height: mapHeight};
  }
  throw new Error(`ROT.js could not generate six reachable rooms for seed ${seed}`);
}
