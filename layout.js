const ROOM_MARGIN = 1;

const isWalkable = value => value === 0 || value === 2;

function inRoomBuffer(x, y, rooms) {
  return rooms.some(room => x >= room.x1 - ROOM_MARGIN && x <= room.x2 + ROOM_MARGIN &&
    y >= room.y1 - ROOM_MARGIN && y <= room.y2 + ROOM_MARGIN);
}

function carveDoor(cells, x, y, axis, kind, doors) {
  const [dx, dy] = axis === 'x' ? [1, 0] : [0, 1];
  const points = [{x, y}, {x: x + dx, y: y + dy}];
  for (const point of points) {
    if (cells[point.y]?.[point.x] !== undefined) cells[point.y][point.x] = 2;
  }
  doors.push({x: x + dx / 2, y: y + dy / 2, axis, kind});
}

function openCloseRoomLinks(cells, rooms, doors) {
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const a = rooms[i], b = rooms[j];
    const yStart = Math.max(a.y1 + 1, b.y1 + 1);
    const yEnd = Math.min(a.y2 - 1, b.y2 - 1);
    const xStart = Math.max(a.x1 + 1, b.x1 + 1);
    const xEnd = Math.min(a.x2 - 1, b.x2 - 1);
    const connect = (from, to, axis, tangentStart, tangentEnd, firstWall, lastWall) => {
      if (to - from < 2 || to - from > 4 || tangentEnd - tangentStart < 2) return;
      const line = Math.floor((tangentStart + tangentEnd) / 2), points = axis === 'y' ? [{x:firstWall,y:line},{x:lastWall,y:line}] : [{x:line,y:firstWall},{x:line,y:lastWall}];
      const low=Math.min(firstWall,lastWall),high=Math.max(firstWall,lastWall);
      for (let path=low;path<=high;path++) for (const side of [0,1]) {
        const x=axis==='y'?path:line+side,y=axis==='y'?line+side:path;
        if(cells[y]?.[x]===undefined)return;
      }
      for (let path=low;path<=high;path++) for (const side of [0,1]) {
        const x=axis==='y'?path:line+side,y=axis==='y'?line+side:path;
        cells[y][x]=0;
      }
      for(const point of points)doors.push({x:point.x+(axis==='x'?0.5:0),y:point.y+(axis==='y'?0.5:0),axis,kind:'room-link'});
      if(firstWall===lastWall)doors.pop();
    };
    if (a.x2 < b.x1 && yEnd - yStart >= 2) {
      connect(a.x2,b.x1,'y',yStart,yEnd,a.x2+1,b.x1-1);
    } else if (b.x2 < a.x1 && yEnd - yStart >= 2) {
      connect(b.x2,a.x1,'y',yStart,yEnd,b.x2+1,a.x1-1);
    }
    if (a.y2 < b.y1 && xEnd - xStart >= 2) {
      connect(a.y2,b.y1,'x',xStart,xEnd,a.y2+1,b.y1-1);
    } else if (b.y2 < a.y1 && xEnd - xStart >= 2) {
      connect(b.y2,a.y1,'x',xStart,xEnd,b.y2+1,a.y1-1);
    }
  }
}

function carveRoomOutlines(cells, rooms, doors, seed, start) {
  const roomShapes=[];
  for(const [roomOrder,room] of rooms.entries()){
    const index=room.index??roomOrder,cx=room.cx??Math.floor((room.x1+room.x2)/2),cy=room.cy??Math.floor((room.y1+room.y2)/2);
    let shape='rectangle';
    if(cx!==start.x||cy!==start.y){
      const variant=((seed>>>0)+index*3)%5;
      shape=variant<2?'rectangle':['L','U','C'][variant-2];
    }
    roomShapes.push({index,shape});
    if(shape==='rectangle')continue;
    const midX=Math.floor((room.x1+room.x2)/2),midY=Math.floor((room.y1+room.y2)/2);
    for(let y=room.y1;y<=room.y2;y++)for(let x=room.x1;x<=room.x2;x++){
      if(cells[y]?.[x]!==0||Math.hypot(x-midX,y-midY)<1.5)continue;
      if(doors.some(door=>Math.hypot(x-door.x,y-door.y)<2))continue;
      const cut=shape==='L'
        ?x>midX&&y>midY
        :shape==='U'
          ?Math.abs(x-midX)<=1&&y<midY
          :x>midX&&Math.abs(y-midY)<=1;
      if(cut)cells[y][x]=1;
    }
  }
  return roomShapes;
}

function widenCorridors(cells, rooms) {
  const source = cells.map(row => row.slice());
  const height = cells.length, width = cells[0]?.length || 0;
  const open = (x, y) => source[y]?.[x] === 0;
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    if (!open(x, y) || inRoomBuffer(x, y, rooms)) continue;
    const horizontal = open(x - 1, y) && open(x + 1, y);
    const vertical = open(x, y - 1) && open(x, y + 1);
    if (horizontal && !vertical) {
      for (const ny of [y - 1, y + 1]) if (cells[ny][x] === 1 && !inRoomBuffer(x, ny, rooms)) cells[ny][x] = 0;
    } else if (vertical && !horizontal) {
      for (const nx of [x - 1, x + 1]) if (cells[y][nx] === 1 && !inRoomBuffer(nx, y, rooms)) cells[y][nx] = 0;
    }
  }
}

function reachableCells(cells, start) {
  const seen = new Set(), queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const {x, y} = queue[head], key = `${x},${y}`;
    if (seen.has(key) || !isWalkable(cells[y]?.[x])) continue;
    seen.add(key);
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) queue.push({x:x+dx,y:y+dy});
  }
  return seen;
}

export function shapeDungeon(input, rooms, start, seed=0) {
  const cells = input.map(row => row.slice());
  const doors = [];
  const originalDoors = [];
  for (let y = 0; y < cells.length; y++) for (let x = 0; x < cells[y].length; x++) {
    if (input[y][x] !== 2) continue;
    originalDoors.push({x,y});
  }
  for (const {x,y} of originalDoors) {
    const horizontal = isWalkable(cells[y][x-1]) || isWalkable(cells[y][x+1]);
    carveDoor(cells, x, y, horizontal ? 'y' : 'x', 'corridor', doors);
  }
  openCloseRoomLinks(cells, rooms, doors);
  const roomShapes=carveRoomOutlines(cells,rooms,doors,seed,start);
  widenCorridors(cells, rooms);
  const reachable = reachableCells(cells, start);
  for (let y = 0; y < cells.length; y++) for (let x = 0; x < cells[y].length; x++) {
    if (isWalkable(cells[y][x]) && !reachable.has(`${x},${y}`)) cells[y][x] = 1;
    else if (cells[y][x] === 2) cells[y][x] = 0;
  }
  const usableDoors = doors.filter(door => reachable.has(`${Math.floor(door.x)},${Math.floor(door.y)}`));
  return {cells, doors:usableDoors, roomShapes};
}

export function shortestFloorPath(cells, start, goal, canPass = (x, y) => isWalkable(cells[y]?.[x])) {
  const key = point => `${point.x},${point.y}`;
  const queue = [start], parent = new Map([[key(start), null]]);
  for (let head = 0; head < queue.length; head++) {
    const point = queue[head];
    if (point.x === goal.x && point.y === goal.y) break;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const next = {x:point.x+dx,y:point.y+dy}, nextKey = key(next);
      if (parent.has(nextKey) || !canPass(next.x, next.y)) continue;
      parent.set(nextKey, key(point)); queue.push(next);
    }
  }
  let cursor = key(goal);
  if (!parent.has(cursor)) return [];
  const path = [];
  while (cursor !== null) {
    const [x, y] = cursor.split(',').map(Number);
    path.push({x, y}); cursor = parent.get(cursor);
  }
  return path.reverse();
}
