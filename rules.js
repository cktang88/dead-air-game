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

export function segmentBlockedTiles(start, end, tileMap, tileSize) {
  const length=Math.hypot(end.x-start.x,end.y-start.y),steps=Math.max(1,Math.ceil(length/(tileSize/4)));
  const hits=[],seen=new Set();
  for(let i=1;i<=steps;i++){
    const t=i/steps,x=Math.floor((start.x+(end.x-start.x)*t)/tileSize),y=Math.floor((start.y+(end.y-start.y)*t)/tileSize),key=`${x},${y}`;
    if(seen.has(key))continue;
    seen.add(key);
    if(tileMap[y]?.[x]!==0)hits.push({x,y,t});
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

export function timeScale({mode, paused, loadoutOpen, moving, firing, now, lastAction, lastActionKind = 'other', idleScale = 0.18}) {
  if (mode !== 'play' || paused || loadoutOpen) return 0;
  const stillScale = Math.max(0, Math.min(1, idleScale));
  const firingScale = Math.sqrt(stillScale);
  if (firing) return firingScale;
  if (moving) return 1;
  if (now - lastAction < 0.35) {
    if (lastActionKind === 'move') return 1;
    if (lastActionKind === 'fire') return firingScale;
  }
  return stillScale;
}

export function chooseEncounterTypes(count, seed) {
  const types=['chaser','gunner','guard','brute'];
  const rushers=new Set(['chaser','brute']);
  let value=seed>>>0;
  const random=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/0x100000000;};
  const result=[];
  for(let i=0;i<count;i++)result.push(types[Math.floor(random()*types.length)]);
  if(count>=3&&!result.includes('brute')&&seed%4===0)result[result.length-1]='brute';
  if(count>=2){
    let rushCount=result.filter(type=>rushers.has(type)).length;
    let bruteCount=result.filter(type=>type==='brute').length;
    const maxRushers=Math.floor(count/2);
    for(let i=result.length-1;i>=0&&rushCount>maxRushers;i--){
      if(!rushers.has(result[i]))continue;
      if(result[i]==='brute'&&bruteCount<=1)continue;
      if(result[i]==='brute')bruteCount--;
      result[i]=random()<.5?'gunner':'guard';
      rushCount--;
    }
  }
  return result;
}
