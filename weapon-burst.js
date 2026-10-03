export function beginWeaponBurst({weaponIndex,shots,interval,firstShotAt,remainingAmmo}) {
  if(!Number.isInteger(weaponIndex)||!Number.isInteger(shots)||shots<1||
    !Number.isFinite(interval)||interval<=0||!Number.isFinite(firstShotAt)||
    !Number.isInteger(remainingAmmo)||remainingAmmo<0)return null;
  const shotsRemaining=Math.min(shots-1,remainingAmmo);
  return shotsRemaining?{weaponIndex,shotsRemaining,interval,nextShotAt:firstShotAt+interval}:null;
}

export function advanceWeaponBurst(burst,{weaponIndex,now,ammo}) {
  if(!burst)return {burst:null,shots:0};
  if(weaponIndex!==burst.weaponIndex||!Number.isFinite(now)||!Number.isInteger(ammo)||ammo<=0){
    return {burst:null,shots:0};
  }
  let shots=0,shotsRemaining=burst.shotsRemaining,nextShotAt=burst.nextShotAt;
  while(shotsRemaining>0&&shots<ammo&&now+1e-9>=nextShotAt){
    shots++;
    shotsRemaining--;
    nextShotAt+=burst.interval;
  }
  if(!shotsRemaining||shots===ammo)return {burst:null,shots};
  return {burst:{...burst,shotsRemaining,nextShotAt},shots};
}
