import {chooseRewardDoor, roomsAvoidableOnRoute, shapeDungeon, shortestFloorPath} from './layout.js';
import {assignRoomRoles} from './room-roles.js';

const ROOM_NAMES = ['ENTRY', 'FURNACE', 'THE GALLERY', 'COLD STORAGE', 'RED HALL', 'MOTOR POOL', 'THE VAULT', 'NIGHT SHIFT'];

export function generateDungeon(ROT, seed, width = 96, height = 72) {
  const attempts = [[width, height], [Math.max(width, 108), Math.max(height, 82)]];
  for (const [mapWidth, mapHeight] of attempts) {
    ROT.RNG.setSeed(seed);
    const generator = new ROT.Map.Digger(mapWidth, mapHeight, {
      roomWidth: [10, 22], roomHeight: [9, 18], corridorLength: [3, 8], dugPercentage: 0.29,
    });
    const cells = Array.from({length: mapHeight}, () => Array(mapWidth).fill(1));
    generator.create((x, y, value) => { cells[y][x] = value; });
    const generatedRooms = generator.getRooms().map((room, index) => {
      const [cx, cy] = room.getCenter();
      return {
        cx, cy, x1: room.getLeft(), x2: room.getRight(), y1: room.getTop(), y2: room.getBottom(),
        index, name: ROOM_NAMES[index % ROOM_NAMES.length], cleared: false, visited: false,
      };
    });
    if (!generatedRooms.length) continue;

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
    const roleInputs=rooms.map((room,index)=>({...room,branch:branchRooms.has(index)})),withSecretBranches=roleInputs.map(room=>({...room,secret:room.branch}));
    const gateableCacheIndexes=roleInputs.map((room,index)=>room.branch&&chooseRewardDoor(shaped.cells,shaped.doors,withSecretBranches,index)?index:-1).filter(index=>index>=0);
    const roleRooms=assignRoomRoles(roleInputs,seed,gateableCacheIndexes);
    const cacheIndex=roleRooms.findIndex(room=>room.role==='cache'&&room.secret),lockedDoor=cacheIndex>=0?chooseRewardDoor(shaped.cells,shaped.doors,roleRooms,cacheIndex):null;
    roleRooms[0].name = 'ENTRY';
    roleRooms[0].visited = true;
    for(const room of roleRooms.slice(1,-1))if(room.role!=='combat'){
      room.name=room.secret?'UNMARKED ROOM':({cache:'CONTRABAND CACHE',armory:'ARMORY',clinic:'FIELD CLINIC',hazard:'KILLBOX',elite:'WARDEN'})[room.role];
      if(room.secret)room.revealedName='SIDE CACHE';
    }
    roleRooms.at(-1).name='EXTRACTION';
    return {cells: shaped.cells, doors: shaped.doors, lockedDoors:lockedDoor?[lockedDoor]:[], rooms:roleRooms, start: roleRooms[0], width: mapWidth, height: mapHeight};
  }
  throw new Error(`ROT.js could not generate six reachable rooms for seed ${seed}`);
}
