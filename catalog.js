export const TILE = 32;
export const WALL_H = 9;
export const TAU = Math.PI * 2;

export const MODS = [
  { id:'extended', name:'EXTENDED MAG', info:'+50% mag · heavier reload', cost:35 },
  { id:'suppressor', name:'SUPPRESSOR', info:'Quieter shots · tighter spread', cost:50 },
  { id:'hollow', name:'HOLLOW POINT', info:'+35% damage · bigger kick', cost:60 },
  { id:'stabilizer', name:'STOCK / STABILIZER', info:'Less recoil · faster recovery', cost:45 },
  { id:'longbarrel', name:'LONG BARREL', info:'+35% range · piercing rounds', cost:70 },
];

export const GUNS = [
  { id:'machine', name:'MACHINE PISTOL', short:'FAST · CLOSE', weight:2, damage:22, rate:0.17, speed:690, mag:18, reserve:72, spread:0.055, color:0xffd17c },
  { id:'shotgun', name:'STREET SWEEPER', short:'WIDE · BRUTAL', weight:3.5, damage:17, rate:0.58, speed:510, mag:6, reserve:30, spread:0.28, count:5, color:0xffad78 },
  { id:'rifle', name:'HARDLINE RIFLE', short:'STEADY · LONG', weight:4, damage:41, rate:0.42, speed:880, mag:10, reserve:50, spread:0.018, color:0x84e1bd },
];

export const BASE_CARRY_CAPACITY = 6.5;

export const ENEMY_TYPES = {
  chaser:{name:'RUSHER', color:0xe95563, hp:42, speed:72, damage:1, range:19, brain:'rush'},
  gunner:{name:'GUNNER', color:0xe9a45a, hp:52, speed:40, damage:1, range:300, brain:'shoot'},
  brute:{name:'BRUTE', color:0xa17ae7, hp:100, speed:30, damage:2, range:25, brain:'rush'},
  guard:{name:'WARDEN', color:0x58aeca, hp:65, speed:28, damage:1, range:210, brain:'guard'},
};
