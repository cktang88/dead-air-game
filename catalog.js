export const TILE = 32;
export const WALL_H = 9;
export const TAU = Math.PI * 2;

// One slot per gun, no tiers: every mod is a behavior. `info` must describe exactly what the code does.
export const MODS = [
  { id:'suppressor', color:0x8fa8ff, name:'SUPPRESSOR', info:'Noise ring halved · shots wake fewer enemies', noiseMult:.5 },
  { id:'ricochet', color:0x74dfab, name:'RICOCHET', info:'Rounds bounce once off walls', bounces:1 },
  { id:'incendiary', color:0xff8a4a, name:'INCENDIARY', info:'Rounds set targets on fire: 3 s of burning, and they panic', burn:{seconds:3, dps:7} },
  { id:'extended', color:0x8fe0ff, name:'EXTENDED MAG', info:'+50% magazine · reload takes 20% longer', magMult:1.5, reloadMult:1.2 },
  { id:'quickdraw', color:0xffd27a, name:'QUICK-DRAW', info:'Swapping to this gun is instant · first shot after a swap does double damage', instantSwap:true, firstShotMult:2 },
  { id:'longbarrel', color:0xd38ff5, name:'LONG BARREL', info:'Rounds pierce 1 enemy · +25% range', pierce:1, rangeMult:1.25 },
];
export const MOD_BY_ID = new Map(MODS.map(mod => [mod.id, mod]));
// Mods that make no sense on a gun (a lobbed shell has no barrel to lengthen and no rounds to ignite).
export const MOD_BLOCKED = { launcher: ['suppressor', 'longbarrel', 'incendiary'] };
export const modFits = (gun, modId) => Boolean(gun) && MOD_BY_ID.has(modId) && !(MOD_BLOCKED[gun.id] || []).includes(modId);

// Shells are the shotgun's one toy: wide and forgiving, or a single long slug. (Birdshot was buckshot with
// different numbers, so it folded into buckshot.)
export const SHOTGUN_SHELLS = [
  {id:'buckshot',name:'BUCKSHOT',pellets:9,damageMultiplier:.42,spreadMultiplier:1.35,rangeMultiplier:1,description:'WIDE · HARD HITS'},
  {id:'slug',name:'SLUG',pellets:1,damageMultiplier:1.55,spreadMultiplier:.035,rangeMultiplier:1.35,description:'SINGLE · LONG RANGE'},
];

// Every gun has a VERB you can name in two words. Near-duplicates are rare in-run VARIANTS (variantOf = the base
// gun): same verb, one twist. Variants are never sold in the safehouse; they only drop in runs.
//   rate    delay between shots (or between burst triggers), seconds
//   swap    seconds before you can fire after switching to the gun (QUICK-DRAW makes it 0)
//   noise   multiplier on the 380px shot noise ring
//   stun    extra stagger on hit (PUNCH)
//   feel    per-gun overrides of the category recoil model (feel.js gunFeel)
//   sound   per-gun overrides of the synth voice (audio.js gunProfile)
//   visual  silhouette: {length,width,art} (art picks a sprite shape in sprites2d.js GUN_ART)
export const GUNS = [
  { id:'machine', name:'MACHINE PISTOL', verb:'SPRAY', short:'SPRAY · FAST, CLOSE', category:'SMG', damage:22, rate:.17, speed:690, range:245, mag:18, reserve:72, spread:.055, reload:1.45, swap:.3, color:0xffd17c, ammo:'9mm', visual:{length:25,width:5,art:'SMG'},
    feel:{kick:.4,shake:1.6,nudge:8}, sound:{crack:3500,body:340,bodyDur:.045,tail:.1,vol:.72,rattle:true} },
  { id:'shotgun', name:'STREET SWEEPER', verb:'SWEEP', short:'SWEEP · WIDE, BRUTAL', category:'SHOTGUN', damage:17, rate:.58, speed:510, range:190, mag:6, reserve:30, spread:.28, count:5, reload:2.25, swap:.45, color:0xffad78, ammo:'12 gauge', visual:{length:44,width:7,art:'SHOTGUN'},
    feel:{kick:1.0,shake:4.0,nudge:70} },
  { id:'ar_ash', name:'ASH CARBINE', verb:'STEADY', short:'STEADY · TRUE ON THE MOVE', category:'ASSAULT RIFLE', damage:28, rate:.22, speed:820, range:390, mag:24, reserve:96, spread:.03, reload:1.85, swap:.35, color:0x76ddb1, ammo:'5.56mm', visual:{length:44,width:5,art:'CARBINE'},
    feel:{moveMul:1,moveAdd:0,perShot:.09,firstMul:.5,kick:.5,shake:1.9,nudge:12}, sound:{crack:3100,body:230,bodyDur:.06,tail:.22,vol:.9} },
  { id:'smg_burst', name:'KITE BURST', verb:'BURST', short:'BURST · THREE-ROUND, PRECISE', category:'SMG', damage:21, rate:.31, speed:760, range:310, mag:24, reserve:96, spread:.032, burst:{shots:3,interval:.075}, reload:1.8, swap:.3, color:0xffdf83, ammo:'9mm', visual:{length:34,width:5,art:'BURST'},
    feel:{perShot:.2,kick:.5,shake:2.0,nudge:12}, sound:{crack:4100,body:420,bodyDur:.035,tail:.08,vol:.75,rattle:false} },
  { id:'pistol_45', name:'TALON .45', verb:'PUNCH', short:'PUNCH · STAGGERS TARGETS', category:'PISTOL', damage:40, rate:.48, speed:750, range:330, mag:7, reserve:35, spread:.035, reload:1.55, stun:.45, swap:.25, color:0xffb987, ammo:'.45', visual:{length:15,width:5,art:'PISTOL'},
    feel:{kick:.9,shake:3.0,nudge:30}, sound:{crack:2400,body:230,bodyDur:.1,tail:.24,vol:1.0} },
  { id:'sniper_lynx', name:'LYNX MARKSMAN', verb:'PIERCE', short:'PIERCE · THROUGH ENEMIES', category:'SNIPER', penetration:{enemies:4,crates:3,walls:0}, damage:78, rate:.78, speed:1120, range:760, mag:6, reserve:30, spread:.006, reload:2.2, swap:.5, noise:1.1, color:0x8bc8ff, ammo:'7.62mm', visual:{length:60,width:6,art:'SNIPER'},
    feel:{kick:1.0,shake:3.2,nudge:55} },
  { id:'sniper_mule', name:'MULE ANTI-MATERIEL', verb:'BREACH', short:'BREACH · THROUGH ONE WALL', category:'ANTI-MATERIEL', penetration:{enemies:5,crates:4,walls:1}, damage:150, rate:1.45, speed:1450, range:980, mag:4, reserve:16, spread:.003, reload:2.8, swap:.6, noise:1.4, color:0xb0a2ff, ammo:'.50 BMG', visual:{length:68,width:8,art:'ANTI-MATERIEL'},
    feel:{kick:1.4,shake:5.0,nudge:110} },
  { id:'launcher', name:'CORK LAUNCHER', verb:'LAUNCH', short:'LAUNCH · SLOW LOBBED BLAST', category:'LAUNCHER', lob:{radius:84,damage:90}, damage:90, rate:1.1, speed:240, range:360, mag:3, reserve:9, spread:.01, reload:2.4, swap:.5, noise:1.3, color:0xff9a50, ammo:'40mm', visual:{length:42,width:9,art:'LAUNCHER'},
    feel:{kick:1.1,shake:3.4,nudge:60}, sound:{family:'launcher',crack:900,body:90,bodyDur:.16,tail:.3,vol:1.0} },
  { id:'pistol_9', name:'MICA 9', verb:'SIDEARM', short:'SIDEARM · INSTANT DRAW, QUIET', category:'PISTOL', damage:25, rate:.28, speed:700, range:300, mag:15, reserve:60, spread:.025, reload:1.1, swap:.1, noise:.75, color:0xffdf9b, ammo:'9mm', visual:{length:13,width:4,art:'PISTOL'},
    feel:{kick:.5,shake:1.8,nudge:12}, sound:{crack:3000,body:320,bodyDur:.06,tail:.14,vol:.85} },
  // ---- variants: rare drops, never sold. Same verb as the base gun, one twist.
  { id:'smg_vector', variantOf:'machine', name:'VECTOR 9', verb:'SPRAY', short:'SPRAY · FASTER, LOUDER', category:'SMG', damage:14, rate:.085, speed:710, range:220, mag:32, reserve:128, spread:.08, reload:1.65, swap:.3, noise:1.5, color:0xffc66d, ammo:'9mm', visual:{length:30,width:5,art:'SMG'},
    feel:{kick:.28,shake:1.3,nudge:5,perShot:.1}, sound:{crack:4300,body:420,bodyDur:.03,tail:.06,vol:.85,rattle:true} },
  { id:'smg_heavy', variantOf:'machine', name:'CINDER .45', verb:'SPRAY', short:'SPRAY · SLOW, HEAVY HITS', category:'SMG', damage:31, rate:.24, speed:640, range:255, mag:20, reserve:80, spread:.09, reload:2.05, swap:.35, stun:.2, color:0xffa873, ammo:'.45', visual:{length:32,width:6,art:'SMG'},
    feel:{kick:.75,shake:2.6,nudge:20}, sound:{crack:2500,body:210,bodyDur:.07,tail:.2,vol:.95,rattle:false} },
  { id:'rifle', variantOf:'ar_ash', name:'HARDLINE RIFLE', verb:'STEADY', short:'STEADY · SEMI-AUTO, TIGHT', category:'ASSAULT RIFLE', damage:41, rate:.42, speed:880, range:510, mag:10, reserve:50, spread:.012, reload:2.0, swap:.4, color:0x84e1bd, ammo:'5.56mm', visual:{length:49,width:6,art:'CARBINE'},
    feel:{moveMul:1,moveAdd:0,perShot:.04,firstMul:.2,kick:.7,shake:2.4,nudge:18} },
  { id:'ar_bastion', variantOf:'ar_ash', name:'BASTION 7.62', verb:'STEADY', short:'STEADY · HEAVY, LONG, LOUD', category:'ASSAULT RIFLE', penetration:{enemies:1,crates:1,walls:0}, damage:54, rate:.52, speed:970, range:620, mag:12, reserve:48, spread:.029, reload:2.35, swap:.5, noise:1.35, color:0x64c69e, ammo:'7.62mm', visual:{length:57,width:7,art:'CARBINE'},
    feel:{moveMul:1,moveAdd:0,perShot:.12,kick:.95,shake:3.0,nudge:28}, sound:{crack:2700,body:150,bodyDur:.1,tail:.4,vol:1.05} },
  { id:'sniper_quill', variantOf:'sniper_lynx', name:'QUILL SCOUT', verb:'PIERCE', short:'PIERCE · LIGHT, QUIET', category:'SNIPER', penetration:{enemies:3,crates:3,walls:0}, damage:62, rate:.62, speed:1050, range:700, mag:8, reserve:40, spread:.009, reload:1.95, swap:.35, noise:.6, color:0x72d8e8, ammo:'5.56mm', visual:{length:53,width:5,art:'SNIPER'},
    feel:{kick:.7,shake:2.4,nudge:36} },
];
export const GUN_BY_ID = new Map(GUNS.map(gun => [gun.id, gun]));
export const gunIsVariant = gun => Boolean(gun?.variantOf);
// Base roster: what the safehouse can sell. Everything with `variantOf` is run-only.
export const BASE_GUN_IDS = GUNS.filter(gun => !gun.variantOf).map(gun => gun.id);

// One plate is all the "gear" left: a rare drop that soaks damage before health. (Weight, harness and scanner
// were bookkeeping and are gone; the two-gun limit is the real constraint.)
export const GEAR = [
  {id:'armor',name:'ARMOR PLATE',description:'Absorbs one hit before health',armorDurability:1},
];

export const ENEMY_TYPES = {
  chaser:{name:'RUSHER', color:0xe95563, hp:30, speed:110, damage:1, range:26, brain:'rush', melee:{windup:.24, lunge:true}},
  gunner:{name:'GUNNER', color:0xe9a45a, hp:40, speed:40, damage:1, minRange:105, range:300, projectileSpeed:215, brain:'shoot'},
  brute:{name:'BRUTE', color:0xa17ae7, hp:100, speed:52, damage:2, range:25, brain:'rush', melee:{windup:.3}},
  sniper:{name:'MARKSMAN', color:0x6fe0d2, hp:30, speed:24, damage:3, minRange:150, range:520, sightRange:560, projectileSpeed:340, brain:'sniper', longSight:true},
  riot:{name:'RIOT', color:0x8aa0b4, hp:70, speed:50, damage:1, range:26, brain:'rush', melee:{windup:.26, lunge:true}, shield:true, shieldHalfArc:1.15},
  boss:{name:'THE CONDUCTOR', color:0x8a2f7a, hp:700, speed:38, damage:2, range:30, brain:'boss', hitRadius:22},
  guard:{name:'WARDEN', color:0x58aeca, hp:60, speed:28, damage:1, minRange:88, range:210, projectileSpeed:220, brain:'guard'},
};
