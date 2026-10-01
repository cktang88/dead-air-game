// Place room props and required crates on open tiles without blocking doorways.
export function findRoomPropPosition({room, cells, doors, occupied, tileSize, random, attempts = 48, centerClearance = 60}) {
  const centerX=(room.cx+.5)*tileSize,centerY=(room.cy+.5)*tileSize;
  const clear=(tx,ty)=>{
    if(cells[ty]?.[tx]!==0)return null;
    const x=(tx+.5)*tileSize,y=(ty+.5)*tileSize;
    if(Math.hypot(x-centerX,y-centerY)<centerClearance)return null;
    if(doors.some(door=>Math.hypot(x-(door.x+.5)*tileSize,y-(door.y+.5)*tileSize)<tileSize*1.6))return null;
    if(occupied.some(item=>Math.hypot(x-item.x,y-item.y)<item.radius+22))return null;
    return {x,y};
  };
  for(let attempt=0;attempt<attempts;attempt++){
    const tx=Math.floor(room.x1+1+random()*(room.x2-room.x1)),ty=Math.floor(room.y1+1+random()*(room.y2-room.y1)),point=clear(tx,ty);
    if(point)return point;
  }
  for(let ty=room.y1+1;ty<=room.y2;ty++)for(let tx=room.x1+1;tx<=room.x2;tx++){
    const point=clear(tx,ty);if(point)return point;
  }
  return null;
}

export function findRoomCratePosition(options) {
  return findRoomPropPosition(options)||findRoomPropPosition({...options,centerClearance:options.tileSize});
}
