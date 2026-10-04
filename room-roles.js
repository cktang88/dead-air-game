const UTILITY_ROLES=['armory','clinic','hazard','elite'];

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

export function assignRoomRoles(rooms,seed,gateableCacheIndexes=[]){
  if(!rooms.length)return [];
  const roles=rooms.map((room,index)=>({...room,role:index===0?'entry':index===rooms.length-1?'extraction':'combat'}));
  const middle=shuffled(roles.map((_,index)=>index).slice(1,-1),seed);
  if(!middle.length)return roles;
  const utilityCount=Math.min(UTILITY_ROLES.length,Math.floor(Math.max(0,middle.length-2)/2));
  const availableRoles=shuffled(UTILITY_ROLES,seed);
  const selectedUtilities=middle.length>=5?['elite',...availableRoles.filter(role=>role!=='elite').slice(0,utilityCount-1)]:availableRoles.slice(0,utilityCount);
  const selectedRoles=['cache',...selectedUtilities];
  const branchRooms=middle.filter(index=>roles[index].branch),gateable=new Set(gateableCacheIndexes),gateableBranches=branchRooms.filter(index=>gateable.has(index));
  const cacheChoices=gateableBranches.length?gateableBranches:branchRooms,cacheIndex=cacheChoices.length?shuffled(cacheChoices,seed)[0]:middle[0];
  const roleRooms=[cacheIndex,...middle.filter(index=>index!==cacheIndex).slice(0,utilityCount)];
  selectedRoles.forEach((role,index)=>{roles[roleRooms[index]].role=role;});
  roles[cacheIndex].secret=Boolean(roles[cacheIndex].branch);
  return roles;
}

export function roomEnemyCount(role,roll=0.5,combatIndex=Infinity){
  if(role==='entry'||role==='clinic'||role==='merchant')return 0;
  if(role==='cache')return 2;
  if(role==='armory')return 3;
  if(role==='elite')return 2;
  const boundedRoll=Math.max(0,Math.min(1-Number.EPSILON,roll));
  if(role==='hazard')return 4+Math.floor(boundedRoll*2);
  const count=2+Math.floor(boundedRoll*3);
  // Only ordinary combat rooms consume this ordinal; specials keep fixed budgets.
  return role==='combat'&&combatIndex<2?Math.min(count,3):count;
}

export function roomPickupKinds(role){
  if(role==='cache')return ['cache'];
  if(role==='clinic')return ['heal'];
  if(role==='armory')return ['gun'];
  if(role==='elite')return ['scrap','mod'];
  return [];
}

export function roomEncounterTypes(role,ordinaryTypes){
  return role==='elite'?['brute','guard']:ordinaryTypes;
}

export function roomHasLivingEnemies(roomIndex,enemies){
  return enemies.some(enemy=>enemy.alive&&enemy.roomIndex===roomIndex);
}

export function hasUnclearedRouteEnemies(rooms,enemies){
  return enemies.some(enemy=>enemy.alive&&rooms[enemy.roomIndex]?.branch!==true);
}

export function roomHasEncounter(room){
  return room.index>0&&room.hadEncounter===true;
}
