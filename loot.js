export const LOOT_TIERS = [
  {id:'common',label:'COMMON',strength:1,color:0xd38ff5},
  {id:'uncommon',label:'UNCOMMON',strength:1.15,color:0x71d49b},
  {id:'rare',label:'RARE',strength:1.3,color:0x66b9f2},
  {id:'prototype',label:'PROTOTYPE',strength:1.45,color:0xf4c66d},
];

export function lootTierForRoll(roll,luckyFindLevel=0) {
  const safeRoll=Number.isFinite(roll)?Math.max(0,Math.min(0.999999999,roll)):0;
  const level=Number.isInteger(luckyFindLevel)?Math.max(0,Math.min(3,luckyFindLevel)):0;
  const chances=[.75-.05*level,.2+.025*level,.045+.02*level,.005+.005*level];
  let boundary=0;
  for(let index=0;index<LOOT_TIERS.length;index++){
    boundary+=chances[index];
    if(safeRoll<boundary)return LOOT_TIERS[index].id;
  }
  return LOOT_TIERS.at(-1).id;
}

export function lootTier(id) {
  return LOOT_TIERS.find(tier=>tier.id===id)||LOOT_TIERS[0];
}
