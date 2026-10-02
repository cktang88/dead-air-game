export function cacheRewardAvailable(choice,{health,maxHealth,ammo,magazine,reserve,maxReserve,hasUpgrade}) {
  if(choice==='ammo')return ammo<magazine||reserve<maxReserve;
  if(choice==='health')return health<maxHealth;
  if(choice==='upgrade')return hasUpgrade;
  if(choice==='prototype')return hasUpgrade&&health>1;
  return choice==='scrap';
}
