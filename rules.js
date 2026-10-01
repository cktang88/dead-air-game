export function weaponStats(gun, mods) {
  return {
    magazine: Math.ceil(gun.mag * (mods.has('extended') ? 1.5 : 1)),
    damage: gun.damage * (mods.has('hollow') ? 1.35 : 1),
    fireRate: gun.rate * (mods.has('stabilizer') ? 0.82 : 1),
    projectileSpeed: gun.speed * (mods.has('longbarrel') ? 1.08 : 1),
    spread: gun.spread * (mods.has('suppressor') ? 0.7 : 1),
  };
}

export function reloadSeconds(mods) {
  if (mods.has('stabilizer')) return 1.25;
  return mods.has('extended') ? 1.85 : 1.65;
}

export function damageDurability(current, damage) {
  return Math.max(0, current - Math.max(0, damage));
}

export function weaponLoadoutWeight(weapons, guns) {
  return weapons.reduce((total, index) => total + guns[index].weight, 0);
}

export function canCarryWeapons(weapons, guns, capacity) {
  return weaponLoadoutWeight(weapons, guns) <= capacity;
}

export function timeScale({mode, paused, loadoutOpen, moving, firing, now, lastAction}) {
  if (mode !== 'play' || paused || loadoutOpen) return 0;
  if (moving || firing || now - lastAction < 0.35) return 1.32;
  return 0.18;
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
