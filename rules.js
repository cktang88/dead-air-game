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

export function timeScale({mode, paused, loadoutOpen, moving, firing, now, lastAction, idleScale = 0.18}) {
  if (mode !== 'play' || paused || loadoutOpen) return 0;
  if (moving || firing || now - lastAction < 0.35) return 1.32;
  return idleScale;
}

export function chooseEncounterTypes(count, seed) {
  const types=['chaser','gunner','guard','brute'];
  let value=seed>>>0;
  const random=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/0x100000000;};
  const result=[];
  for(let i=0;i<count;i++)result.push(types[Math.floor(random()*types.length)]);
  if(count>=3&&!result.includes('brute')&&seed%4===0)result[result.length-1]='brute';
  return result;
}
