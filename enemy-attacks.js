export const BRUTE_WINDUP_SECONDS=0.48;
export const BRUTE_RECOVERY_SECONDS=0.9;

// Brutes commit to one visible swing instead of dealing random contact damage.
export function stepBruteMelee({windup=0,cooldown=0},dt,inRange,interrupt=false){
  const elapsed=Number.isFinite(dt)?Math.max(0,dt):0;
  const remainingCooldown=Math.max(0,(Number.isFinite(cooldown)?cooldown:0)-elapsed);
  if(interrupt)return {windup:0,cooldown:remainingCooldown,started:false,strike:false};
  const remainingWindup=Math.max(0,(Number.isFinite(windup)?windup:0)-elapsed);
  if(windup>0){
    const strike=remainingWindup===0;
    return {windup:remainingWindup,cooldown:strike?BRUTE_RECOVERY_SECONDS:remainingCooldown,started:false,strike};
  }
  if(remainingCooldown>0||!inRange)return {windup:0,cooldown:remainingCooldown,started:false,strike:false};
  return {windup:BRUTE_WINDUP_SECONDS,cooldown:0,started:true,strike:false};
}

export function bruteMeleeHits({canSee,distance,range,targetRadius=0,aim,targetDirection}){
  if(canSee!==true||![distance,range,targetRadius,aim?.x,aim?.y,targetDirection?.x,targetDirection?.y].every(Number.isFinite)||distance<0||range<0||targetRadius<0)return false;
  const aimLength=Math.hypot(aim.x,aim.y),targetLength=Math.hypot(targetDirection.x,targetDirection.y);
  if(aimLength===0||targetLength===0||distance>range+targetRadius)return false;
  const alignment=(aim.x*targetDirection.x+aim.y*targetDirection.y)/(aimLength*targetLength);
  return alignment>=Math.SQRT1_2;
}
