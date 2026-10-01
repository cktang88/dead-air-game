export function weaponStats(gun, mods) {
  const compatible=new Set(gun.attachments||[]);
  const has=id=>compatible.has(id)&&mods.has(id);
  return {
    magazine: Math.ceil(gun.mag * (has('extended') ? 1.5 : 1)),
    damage: gun.damage * (has('hollow') ? 1.35 : 1),
    fireRate: gun.rate * (has('stabilizer') ? 0.82 : 1),
    projectileSpeed: gun.speed,
    range: gun.range * (has('longbarrel') ? 1.35 : 1),
    spread: gun.spread * (has('suppressor') ? 0.7 : 1),
    compatibleAttachments: gun.attachments||[],
  };
}

export function reloadSeconds(mods, gun) {
  if (!gun) {
    if (mods.has('stabilizer')) return 1.25;
    return mods.has('extended') ? 1.85 : 1.65;
  }
  const compatible=new Set(gun?.attachments||[]);
  if (mods.has('stabilizer')&&compatible.has('stabilizer')) return 1.25;
  if (mods.has('extended')&&compatible.has('extended')) return (gun?.reload??1.65)*1.22;
  return gun?.reload??(mods.has('extended')&&compatible.has('extended')?1.85:1.65);
}

export function compatibleAttachments(gun, attachments) {
  const allowed=new Set(gun.attachments||[]);
  return attachments.filter(attachment=>allowed.has(attachment.id));
}

export function damageDurability(current, damage) {
  return Math.max(0, current - Math.max(0, damage));
}

export function crateDamageStage(hp, maxHp) {
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) return 2;
  const ratio=Math.max(0,Math.min(1,hp/maxHp));
  return ratio<=.35?2:ratio<=.7?1:0;
}

export function minimapContactVisible({visited, distance, scanRange}) {
  if (visited) return true;
  return Number.isFinite(distance) && Number.isFinite(scanRange) && scanRange > 0 && distance <= scanRange;
}

export function distanceToRect(point, rect) {
  const values=[point.x,point.y,rect.left,rect.top,rect.right,rect.bottom];
  if (!values.every(Number.isFinite) || rect.left>rect.right || rect.top>rect.bottom) return Infinity;
  const dx=Math.max(rect.left-point.x,0,point.x-rect.right),dy=Math.max(rect.top-point.y,0,point.y-rect.bottom);
  return Math.hypot(dx,dy);
}

export function segmentIntersectsCircle(start, end, center, radius) {
  if (![start.x,start.y,end.x,end.y,center.x,center.y,radius].every(Number.isFinite)||radius<0) return false;
  const dx=end.x-start.x,dy=end.y-start.y,lengthSquared=dx*dx+dy*dy;
  const projection=Math.max(0,Math.min(1,((center.x-start.x)*dx+(center.y-start.y)*dy)/(lengthSquared||1)));
  return Math.hypot(center.x-(start.x+dx*projection),center.y-(start.y+dy*projection))<=radius;
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
