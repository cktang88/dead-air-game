const UTILITY_ROLES=['armory','clinic','hazard'];

function shuffled(values,seed){
  let value=seed>>>0;
  const result=values.slice();
  for(let index=result.length-1;index>0;index--){
    value=(Math.imul(value,1664525)+1013904223)>>>0;
    const other=Math.floor(value/0x100000000*(index+1));
    [result[index],result[other]]=[result[other],result[index]];
  }
  return result;
}

export function assignRoomRoles(rooms,seed){
  if(!rooms.length)return [];
  const roles=rooms.map((room,index)=>({...room,role:index===0?'entry':index===rooms.length-1?'extraction':'combat'}));
  const middle=shuffled(roles.map((_,index)=>index).slice(1,-1),seed);
  if(!middle.length)return roles;
  const utilityCount=Math.min(UTILITY_ROLES.length,Math.floor(Math.max(0,middle.length-2)/2));
  const selectedRoles=['cache',...shuffled(UTILITY_ROLES,seed).slice(0,utilityCount)];
  const branchRooms=middle.filter(index=>roles[index].branch),cacheIndex=branchRooms.length?shuffled(branchRooms,seed)[0]:middle[0];
  const roleRooms=[cacheIndex,...middle.filter(index=>index!==cacheIndex).slice(0,utilityCount)];
  selectedRoles.forEach((role,index)=>{roles[roleRooms[index]].role=role;});
  roles[cacheIndex].secret=Boolean(roles[cacheIndex].branch);
  return roles;
}

export function roomEnemyCount(role,roll=0.5){
  if(role==='entry'||role==='clinic'||role==='merchant')return 0;
  if(role==='cache')return 2;
  if(role==='armory')return 3;
  const boundedRoll=Math.max(0,Math.min(1-Number.EPSILON,roll));
  if(role==='hazard')return 4+Math.floor(boundedRoll*2);
  return 2+Math.floor(boundedRoll*3);
}

export function roomPickupKinds(role){
  if(role==='cache')return ['scrap','mod'];
  if(role==='clinic')return ['heal'];
  if(role==='armory')return ['gun'];
  return [];
}

export function roomHasLivingEnemies(roomIndex,enemies){
  return enemies.some(enemy=>enemy.alive&&enemy.roomIndex===roomIndex);
}
