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

export const SHOTGUN_SHELLS = [
  {id:'buckshot',name:'BUCKSHOT',pellets:9,damageMultiplier:.42,spreadMultiplier:1.35,rangeMultiplier:1,description:'WIDE · HARD HITS'},
  {id:'birdshot',name:'BIRDSHOT',pellets:16,damageMultiplier:.14,spreadMultiplier:2.1,rangeMultiplier:.7,description:'WIDEST · CLOSE RANGE'},
  {id:'slug',name:'SLUG',pellets:1,damageMultiplier:1.55,spreadMultiplier:.035,rangeMultiplier:1.35,description:'SINGLE · LONG RANGE'},
];

// `rate` is the delay between shots in seconds. Attachment IDs are also the
// IDs in MODS; keeping them on each weapon makes shop/loadout filtering direct.
const allAttachments=['extended','suppressor','hollow','stabilizer','longbarrel'];
const attachments=(...ids)=>ids;
export const GUNS = [
  // SMGs: fast handling and fire, with short range and modest per-shot damage.
  { id:'machine', name:'MACHINE PISTOL', short:'FAST · CLOSE', category:'SMG', weight:2, damage:22, rate:.17, speed:690, range:245, mag:18, reserve:72, spread:.055, reload:1.45, color:0xffd17c, ammo:'9mm', visual:{length:19,width:5}, attachments:allAttachments },
  // Original indices stay fixed because run state and legacy combat tests use them.
  { id:'shotgun', name:'STREET SWEEPER', short:'WIDE · BRUTAL', category:'SHOTGUN', weight:3.5, damage:17, rate:.58, speed:510, range:190, mag:6, reserve:30, spread:.28, count:5, reload:2.25, color:0xffad78, ammo:'12 gauge', visual:{length:31,width:7}, attachments:attachments('extended','hollow','stabilizer','longbarrel') },
  { id:'rifle', name:'HARDLINE RIFLE', short:'STEADY · LONG', category:'ASSAULT RIFLE', weight:4, damage:41, rate:.42, speed:880, range:510, mag:10, reserve:50, spread:.018, reload:2.0, color:0x84e1bd, ammo:'5.56mm', visual:{length:34,width:6}, attachments:allAttachments },
  { id:'smg_vector', name:'VECTOR 9', short:'FASTEST · CONTROLLED', category:'SMG', weight:2.5, damage:17, rate:.105, speed:710, range:220, mag:30, reserve:120, spread:.075, reload:1.65, color:0xffc66d, ammo:'9mm', visual:{length:23,width:5}, attachments:attachments('extended','suppressor','stabilizer') },
  { id:'smg_burst', name:'KITE BURST', short:'3-ROUND BURST · PRECISE', category:'SMG', weight:2.7, damage:21, rate:.31, speed:760, range:310, mag:24, reserve:96, spread:.032, count:3, reload:1.8, color:0xffdf83, ammo:'9mm', visual:{length:26,width:5}, attachments:attachments('extended','suppressor','hollow','stabilizer','longbarrel') },
  { id:'smg_heavy', name:'CINDER .45', short:'HEAVY · HARD HITTING', category:'SMG', weight:3.3, damage:31, rate:.24, speed:640, range:255, mag:20, reserve:80, spread:.09, reload:2.05, color:0xffa873, ammo:'.45', visual:{length:25,width:6}, attachments:attachments('extended','hollow','stabilizer','longbarrel') },
  // Assault rifles: flexible all-rounders, trading weight and shot speed.
  { id:'ar_ash', name:'ASH CARBINE', short:'RAPID · LIGHT', category:'ASSAULT RIFLE', weight:3.5, damage:28, rate:.22, speed:820, range:390, mag:24, reserve:96, spread:.047, reload:1.85, color:0x76ddb1, ammo:'5.56mm', visual:{length:30,width:5}, attachments:attachments('extended','suppressor','hollow','stabilizer','longbarrel') },
  { id:'ar_bastion', name:'BASTION 7.62', short:'HEAVY · PUNCHING', category:'ASSAULT RIFLE', weight:5.2, damage:54, rate:.52, speed:970, range:620, mag:12, reserve:48, spread:.029, reload:2.35, color:0x64c69e, ammo:'7.62mm', visual:{length:39,width:7}, attachments:attachments('extended','hollow','stabilizer','longbarrel') },
  // Pistols remain lightweight backups; the large-calibre option is deliberate and loud.
  { id:'pistol_9', name:'MICA 9', short:'LIGHT · QUICK DRAW', category:'PISTOL', weight:1.1, damage:25, rate:.28, speed:700, range:300, mag:15, reserve:60, spread:.025, reload:1.25, color:0xffdf9b, ammo:'9mm', visual:{length:17,width:4}, attachments:attachments('extended','suppressor','hollow','stabilizer') },
  { id:'pistol_45', name:'TALON .45', short:'SLOW · HEAVY HIT', category:'PISTOL', weight:1.7, damage:43, rate:.48, speed:750, range:330, mag:8, reserve:40, spread:.04, reload:1.55, color:0xffb987, visual:{length:20,width:5}, ammo:'.45', attachments:attachments('suppressor','hollow','stabilizer','longbarrel') },
  // Precision rifles: exceptional reach and impact, slow cycling and costly weight.
  // Penetration values count targets the round passes through before stopping on the next hit.
  { id:'sniper_lynx', name:'LYNX MARKSMAN', short:'PRECISE · QUICK CYCLE · PIERCES ENEMIES / CRATES', category:'SNIPER', penetration:{enemies:4,crates:3,walls:0}, weight:4.8, damage:78, rate:.78, speed:1120, range:760, mag:6, reserve:30, spread:.006, reload:2.2, color:0x8bc8ff, ammo:'7.62mm', visual:{length:43,width:6}, attachments:attachments('suppressor','hollow','stabilizer','longbarrel') },
  { id:'sniper_mule', name:'MULE ANTI-MATERIEL', short:'EXTREME POWER · PIERCES ONE WALL', category:'ANTI-MATERIEL', penetration:{enemies:5,crates:4,walls:1}, weight:6.8, damage:150, rate:1.45, speed:1450, range:980, mag:4, reserve:16, spread:.003, reload:2.8, color:0xb0a2ff, visual:{length:52,width:8}, ammo:'.50 BMG', attachments:attachments('hollow','stabilizer','longbarrel') },
  { id:'sniper_quill', name:'QUILL SCOUT', short:'LIGHT · PIERCES ENEMIES / CRATES', category:'SNIPER', penetration:{enemies:4,crates:3,walls:0}, weight:3.8, damage:62, rate:.62, speed:1050, range:700, mag:8, reserve:40, spread:.009, reload:1.95, color:0x72d8e8, visual:{length:38,width:5}, ammo:'5.56mm', attachments:attachments('extended','suppressor','hollow','stabilizer','longbarrel') },
];

export const BASE_CARRY_CAPACITY = 7;

export const GEAR = [
  {id:'armor',name:'ARMOR PLATE',description:'Absorb 2 damage before health · repair for 10 scrap',weight:1.5,cost:25,armorDurability:2,repairCost:10},
  {id:'ammo-harness',name:'AMMO HARNESS',description:'Reload both weapons 15% faster',weight:1,cost:30,reloadMultiplier:.85},
];

export const ENEMY_TYPES = {
  chaser:{name:'RUSHER', color:0xe95563, hp:42, speed:72, damage:1, range:19, brain:'rush'},
  gunner:{name:'GUNNER', color:0xe9a45a, hp:52, speed:40, damage:1, minRange:105, range:300, projectileSpeed:190, brain:'shoot'},
  brute:{name:'BRUTE', color:0xa17ae7, hp:100, speed:30, damage:2, range:25, brain:'rush'},
  guard:{name:'WARDEN', color:0x58aeca, hp:65, speed:28, damage:1, minRange:88, range:210, projectileSpeed:215, brain:'guard'},
};
