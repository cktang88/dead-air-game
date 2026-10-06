import {lootTier} from './loot.js';

export function weaponStats(gun, mods) {
  const compatible=new Set(gun.attachments||[]);
  const tierFor=id=>{
    if(!compatible.has(id))return null;
    const tier=mods.get(id);
    return tier?lootTier(tier):null;
  };
  const strength=id=>tierFor(id)?.strength||0;
  return {
    magazine: Math.ceil(gun.mag * (1 + .5*strength('extended'))),
    damage: gun.damage * (1 + .35*strength('hollow')),
    fireRate: gun.rate * (.82 - .18*(strength('stabilizer')-1)),
    projectileSpeed: gun.speed,
    range: gun.range * (1 + .35*strength('longbarrel')),
    spread: gun.spread * (1 - .3*strength('suppressor')),
    compatibleAttachments: gun.attachments||[],
  };
}

export function shotgunShellStats(shell, gunStats) {
  return {
    pellets:shell.pellets,
    damage:gunStats.damage*shell.damageMultiplier,
    spread:gunStats.spread*shell.spreadMultiplier,
    range:gunStats.range*shell.rangeMultiplier,
  };
}

export function weaponPenetration(gun, mods) {
  const compatible=new Set(gun.attachments||[]),tier=compatible.has('longbarrel')&&mods.has('longbarrel')?lootTier(mods.get('longbarrel')):null;
  const base=gun.penetration||{enemies:0,crates:0,walls:0};
  return {...base,enemies:base.enemies+(tier?Math.ceil(tier.strength):0)};
}

export function consumePenetration(budget, target) {
  if (!budget || !Number.isInteger(budget[target]) || budget[target]<=0) return null;
  return {...budget,[target]:budget[target]-1};
}

export function unlockRewardGate(gate,scrap) {
  if(gate.opened)return {status:'already-open',scrap};
  if(scrap<gate.cost)return {status:'insufficient',scrap,missing:gate.cost-scrap};
  return {status:'opened',scrap:scrap-gate.cost};
}

export function reloadSeconds(mods, gun, reloadMultiplier=1) {
  let seconds=1.65;
  const tierFor=id=>lootTier(mods.get(id));
  if (!gun) {
    if(mods.has('stabilizer'))seconds=1.25;
    else if(mods.has('extended'))seconds=1.85;
  } else {
    const compatible=new Set(gun.attachments||[]);
    if(mods.has('stabilizer')&&compatible.has('stabilizer'))seconds=1.25-(tierFor('stabilizer').strength-1)*.25;
    else if(mods.has('extended')&&compatible.has('extended'))seconds=(gun.reload??1.65)*(1.22-(tierFor('extended').strength-1)*.12);
    else seconds=gun.reload??1.65;
  }
  return seconds*reloadMultiplier;
}

export function compatibleAttachments(gun, attachments) {
  const allowed=new Set(gun.attachments||[]);
  return attachments.filter(attachment=>allowed.has(attachment.id));
}

export function damageDurability(current, damage) {
  return Math.max(0, current - Math.max(0, damage));
}

export function absorbArmorDamage(armor, damage) {
  const condition=Number.isFinite(armor)?Math.max(0,armor):0;
  const incoming=Number.isFinite(damage)?Math.max(0,damage):0;
  const absorbed=Math.min(condition,incoming);
  return {armor:condition-absorbed,healthDamage:incoming-absorbed,absorbed};
}

export function crateDamageStage(hp, maxHp) {
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) return 2;
  const ratio=Math.max(0,Math.min(1,hp/maxHp));
  return ratio<=.35?2:ratio<=.7?1:0;
}

export function minimapContactVisible({visited, distance, scanRange, secret=false}) {
  if (visited) return true;
  if (secret) return false;
  return Number.isFinite(distance) && Number.isFinite(scanRange) && scanRange > 0 && distance <= scanRange;
}

export function minimapPickupVisible({available,distance,scanRange,hiddenSecret=false}) {
  return available&&minimapContactVisible({visited:false,distance,scanRange,secret:hiddenSecret});
}

export function distanceToRect(point, rect) {
  const values=[point.x,point.y,rect.left,rect.top,rect.right,rect.bottom];
  if (!values.every(Number.isFinite) || rect.left>rect.right || rect.top>rect.bottom) return Infinity;
  const dx=Math.max(rect.left-point.x,0,point.x-rect.right),dy=Math.max(rect.top-point.y,0,point.y-rect.bottom);
  return Math.hypot(dx,dy);
}

export function withinWorldView(point,center,halfWidth,halfHeight) {
  if (![point.x,point.y,center.x,center.y,halfWidth,halfHeight].every(Number.isFinite)||
    halfWidth<0||halfHeight<0) return false;
  return Math.abs(point.x-center.x)<=halfWidth&&Math.abs(point.y-center.y)<=halfHeight;
}

export function segmentIntersectsCircle(start, end, center, radius) {
  if (![start.x,start.y,end.x,end.y,center.x,center.y,radius].every(Number.isFinite)||radius<0) return false;
  const dx=end.x-start.x,dy=end.y-start.y,lengthSquared=dx*dx+dy*dy;
  const projection=Math.max(0,Math.min(1,((center.x-start.x)*dx+(center.y-start.y)*dy)/(lengthSquared||1)));
  return Math.hypot(center.x-(start.x+dx*projection),center.y-(start.y+dy*projection))<=radius;
}

export function segmentCircleHitTime(start, end, center, radius) {
  if (![start.x,start.y,end.x,end.y,center.x,center.y,radius].every(Number.isFinite)||radius<0) return null;
  const dx=end.x-start.x,dy=end.y-start.y,fx=start.x-center.x,fy=start.y-center.y;
  const a=dx*dx+dy*dy,c=fx*fx+fy*fy-radius*radius;
  if (c<=0)return 0;
  if (a===0)return null;
  const b=2*(fx*dx+fy*dy),discriminant=b*b-4*a*c;
  if (discriminant<0)return null;
  const t=(-b-Math.sqrt(discriminant))/(2*a);
  return t>=0&&t<=1?t:null;
}

// Exact grid traversal (Amanatides-Woo): every tile the segment touches, in order, with the entry fraction t.
// Unlike point sampling this cannot skip a tile corner at any projectile speed.
export function segmentBlockedTiles(start, end, tileMap, tileSize) {
  const hits=[];
  const dx=end.x-start.x,dy=end.y-start.y;
  let x=Math.floor(start.x/tileSize),y=Math.floor(start.y/tileSize);
  const endX=Math.floor(end.x/tileSize),endY=Math.floor(end.y/tileSize);
  const stepX=dx>0?1:-1,stepY=dy>0?1:-1;
  const tDeltaX=dx===0?Infinity:Math.abs(tileSize/dx),tDeltaY=dy===0?Infinity:Math.abs(tileSize/dy);
  let tMaxX=dx===0?Infinity:((dx>0?(x+1)*tileSize-start.x:start.x-x*tileSize)/Math.abs(dx));
  let tMaxY=dy===0?Infinity:((dy>0?(y+1)*tileSize-start.y:start.y-y*tileSize)/Math.abs(dy));
  let t=0;
  const maxCells=Math.abs(endX-x)+Math.abs(endY-y)+2;
  for(let i=0;i<maxCells;i++){
    if(tileMap[y]?.[x]!==0)hits.push({x,y,t});
    if(x===endX&&y===endY)break;
    if(tMaxX<tMaxY){t=tMaxX;tMaxX+=tDeltaX;x+=stepX;}else{t=tMaxY;tMaxY+=tDeltaY;y+=stepY;}
    if(t>1)break;
  }
  return hits;
}

export function segmentWallRuns(start, end, tileMap, tileSize, startsInsideWall=false) {
  const cells=segmentBlockedTiles(start,end,tileMap,tileSize),runs=[];
  let previous=null,skipCurrentRun=startsInsideWall;
  for(const cell of cells){
    const continues=previous&&Math.abs(cell.x-previous.x)<=1&&Math.abs(cell.y-previous.y)<=1;
    if(!continues){if(!skipCurrentRun)runs.push(cell);skipCurrentRun=false;}
    previous=cell;
  }
  const x=Math.floor(end.x/tileSize),y=Math.floor(end.y/tileSize);
  return {runs,endsInsideWall:tileMap[y]?.[x]!==0};
}

export function weaponLoadoutWeight(weapons, guns) {
  return weapons.reduce((total, index) => total + guns[index].weight, 0);
}

export function canCarryWeapons(weapons, guns, capacity) {
  return weaponLoadoutWeight(weapons, guns) <= capacity;
}

export function weaponReplacement(weapons, slot, candidate, guns, capacity, gearWeight = 0) {
  const nextWeapons=weapons.slice();
  nextWeapons[slot]=candidate;
  const totalWeight=weaponLoadoutWeight(nextWeapons,guns)+gearWeight;
  const alreadyEquipped=weapons.includes(candidate);
  const hasDuplicate=nextWeapons.some((weapon,index)=>nextWeapons.indexOf(weapon)!==index);
  return {weapons:nextWeapons,totalWeight,canCarry:!alreadyEquipped&&!hasDuplicate&&totalWeight<=capacity};
}

export function chooseWeaponReplacementSlot(weapons,candidate,maxSlots,activeSlot,guns,capacity,gearWeight=0){
  const newSlot=weapons.length;
  if(newSlot<maxSlots&&weaponReplacement(weapons,newSlot,candidate,guns,capacity,gearWeight).canCarry)return newSlot;
  const preferred=maxSlots===2?[1,0]:[activeSlot,...weapons.map((_,index)=>index).filter(index=>index!==activeSlot)];
  return preferred.find(slot=>slot<weapons.length&&weaponReplacement(weapons,slot,candidate,guns,capacity,gearWeight).canCarry);
}

// The time rule lives in time-rule.js (continuous, speed-driven). Re-exported so older imports keep working.
export {timeScale} from './time-rule.js';

// Encounter recipes: each is an ordered squad list; a room of N enemies takes the first N, so every recipe
// is a mix by construction (rusher pack + gunner support, brute + gunners, warden + rushers, ...).
// `minDepth` (0..1 along the floor) gates the stop-and-go specialists: MARKSMAN and RIOT show up later.
export const ENCOUNTER_RECIPES = [
  {id:'rush-support', minDepth:0, squad:['chaser','gunner','chaser','gunner','chaser']},
  {id:'brute-guns', minDepth:0, squad:['brute','gunner','guard','gunner','chaser']},
  {id:'warden-rush', minDepth:0, squad:['guard','chaser','chaser','gunner','chaser']},
  {id:'crossfire', minDepth:0, squad:['gunner','guard','chaser','gunner','guard']},
  {id:'riot-guns', minDepth:.25, squad:['riot','gunner','gunner','guard','chaser']},
  {id:'marksman-rush', minDepth:.4, squad:['sniper','chaser','chaser','gunner','chaser']},
  {id:'brute-marksman', minDepth:.5, squad:['brute','sniper','gunner','chaser','guard']},
  {id:'riot-marksman', minDepth:.6, squad:['riot','sniper','chaser','gunner','riot']},
];
export const SPECIALIST_TYPES = ['sniper','riot'];

export function eligibleRecipes(depth) {
  const d=Number.isFinite(depth)?depth:0;
  return ENCOUNTER_RECIPES.filter(recipe=>d>=recipe.minDepth);
}

export function chooseEncounterTypes(count, seed, depth=0) {
  // Scramble first: consecutive seeds would otherwise draw near-identical first values from the LCG.
  let value=Math.imul((seed>>>0)^0x9e3779b9,2654435761)>>>0;value^=value>>>15;value=Math.imul(value,2246822519)>>>0;value^=value>>>13;
  const random=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/0x100000000;};
  const recipes=eligibleRecipes(depth);
  // Specialists are the headline of later rooms: weight them x2 once unlocked.
  const weighted=recipes.flatMap(recipe=>recipe.squad.some(type=>SPECIALIST_TYPES.includes(type))?[recipe,recipe]:[recipe]);
  const recipe=weighted[Math.floor(random()*weighted.length)];
  const squad=recipe.squad.slice(0,Math.max(0,count));
  while(squad.length<count)squad.push(recipe.squad[squad.length%recipe.squad.length]);
  // Shuffle so the specialist is not always the first spawn.
  for(let i=squad.length-1;i>0;i--){const k=Math.floor(random()*(i+1));[squad[i],squad[k]]=[squad[k],squad[i]];}
  return squad;
}
