import test from 'node:test';
import assert from 'node:assert/strict';
import {BASE_GUN_IDS, ENEMY_TYPES, GEAR, GUNS, MODS, MOD_BY_ID, SHOTGUN_SHELLS, TILE, modFits} from './catalog.js';
import {absorbArmorDamage, chooseEncounterTypes, consumePenetration, crateDamageStage, damageDurability, distanceToRect, eligibleRecipes, gunPickupPlan, minimapContactVisible, minimapPickupVisible, reloadSeconds, segmentBlockedTiles, segmentCircleHitTime, segmentIntersectsCircle, segmentWallRuns, shotgunShellStats, swapSeconds, timeScale, unlockRewardGate, weaponPenetration, weaponStats, withinWorldView} from './rules.js';
import {META_UPGRADES, awardCoins, emptyProgress, parseProgress, progressionStats, purchaseUpgrade, runCoinPayout} from './progression.js';

test('world time follows actual speed (see time-rule.test.js for the full rule), and menus pause',()=>{
  const base={mode:'play',paused:false,loadoutOpen:false,speedRatio:0};
  assert.equal(timeScale(base),0.08);
  assert.ok(Math.abs(timeScale({...base,speedRatio:1})-0.35)<1e-9);
  assert.equal(timeScale({...base,speedRatio:1.45}),1);
  assert.equal(timeScale({...base,idleScale:.05}),.05);
  assert.equal(timeScale({...base,paused:true}),0);
  assert.equal(timeScale({...base,loadoutOpen:true}),0);
  assert.equal(timeScale({...base,mode:'dead'}),0);
});

test('ranged enemy shots leave time for a sidestep at each player tempo',()=>{
  const playerSpeed=progressionStats(emptyProgress()).moveSpeed;
  const ranged=[ENEMY_TYPES.gunner,ENEMY_TYPES.guard];
  for(const enemy of ranged){
    assert.ok(enemy.minRange>0&&enemy.minRange<enemy.range,`${enemy.name} needs a useful minimum and maximum firing range`);
    assert.ok(enemy.projectileSpeed<playerSpeed*2,`${enemy.name} rounds should stay below twice player speed`);
    for(const scale of [.08,.35,1]){
      // enemy rounds fly on world time; the player moves on the real clock, so slower worlds are more generous
      const projectileTravel=65-13-10;
      const flightSeconds=projectileTravel/(enemy.projectileSpeed*scale);
      const sidestep=playerSpeed*flightSeconds;
      assert.ok(sidestep>=18,`${enemy.name} should allow an 18-unit sidestep at ${scale}×`);
    }
  }
});

test('ranged aim starts only when its tell is inside the camera view',()=>{
  const player={x:400,y:300},halfWidth=450,halfHeight=260;
  assert.equal(withinWorldView({x:850,y:560},player,halfWidth,halfHeight),true);
  assert.equal(withinWorldView({x:851,y:300},player,halfWidth,halfHeight),false);
  assert.equal(withinWorldView({x:400,y:561},player,halfWidth,halfHeight),false);
  assert.equal(withinWorldView({x:400,y:300},player,halfWidth,halfHeight),true);
  assert.equal(withinWorldView({x:Infinity,y:300},player,halfWidth,halfHeight),false);
  assert.equal(withinWorldView({x:400,y:300},player,halfWidth,-1),false);
});

test('each mod is a behavior with its own numbers, and mod text matches the code',()=>{
  const gun=GUNS[0];
  const base=weaponStats(gun,null);
  assert.equal(base.magazine,18);assert.equal(base.noise,1);assert.equal(base.bounces,0);assert.equal(base.burn,null);
  assert.equal(weaponStats(gun,'extended').magazine,27);
  assert.equal(reloadSeconds(gun,'extended'),gun.reload*1.2);
  assert.equal(weaponStats(gun,'suppressor').noise,.5);
  assert.equal(weaponStats(gun,'ricochet').bounces,1);
  assert.deepEqual(weaponStats(gun,'incendiary').burn,{seconds:3,dps:7});
  assert.equal(weaponStats(gun,'longbarrel').range,gun.range*1.25);
  assert.equal(weaponPenetration(gun,'longbarrel').enemies,1);
  assert.equal(weaponPenetration(gun,null).enemies,0);
  // a mod changes only what it says: nothing else moves
  for(const id of ['suppressor','ricochet','incendiary','quickdraw'])assert.equal(weaponStats(gun,id).magazine,18,id);
  assert.equal(weaponStats(gun,'suppressor').damage,gun.damage);
  assert.equal(MODS.length,6);
  for(const mod of MODS){assert.equal(typeof mod.info,'string');assert.equal(mod.tier,undefined,'no tiers');assert.equal(mod.cost,undefined,'mods are found, not bought');}
  assert.match(MOD_BY_ID.get('suppressor').info,/halved/);assert.match(MOD_BY_ID.get('ricochet').info,/bounce once/);
  assert.match(MOD_BY_ID.get('extended').info,/\+50%.*20% longer/);assert.match(MOD_BY_ID.get('longbarrel').info,/pierce 1 enemy.*\+25% range/);
  assert.match(MOD_BY_ID.get('quickdraw').info,/instant.*double damage/);assert.match(MOD_BY_ID.get('incendiary').info,/3 s.*panic/);
});

test('swap time: base per gun, instant with QUICK-DRAW, slower on every swap with a third slot',()=>{
  const sidearm=GUNS.find(g=>g.id==='pistol_9'),breach=GUNS.find(g=>g.id==='sniper_mule');
  assert.ok(swapSeconds(sidearm,null,2)<swapSeconds(breach,null,2),'a sidearm draws faster than a rifle');
  assert.equal(swapSeconds(breach,'quickdraw',2),0);
  assert.equal(swapSeconds(breach,'quickdraw',3),0,'QUICK-DRAW beats the third-slot penalty');
  assert.ok(Math.abs(swapSeconds(sidearm,null,3)-swapSeconds(sidearm,null,2)-.4)<1e-9);
  assert.equal(swapSeconds(sidearm,'ricochet',2),sidearm.swap);
});

test('a mod the gun cannot take is ignored everywhere',()=>{
  const launcher=GUNS.find(g=>g.id==='launcher');
  assert.equal(modFits(launcher,'suppressor'),false);assert.equal(modFits(launcher,'ricochet'),true);
  assert.equal(weaponStats(launcher,'suppressor').noise,launcher.noise);
  assert.equal(weaponPenetration(launcher,'longbarrel').enemies,0);
  assert.equal(modFits(GUNS[0],'nope'),false);
});
test('armor durability absorbs incoming damage separately from health',()=>{
  const armor=GEAR.find(item=>item.id==='armor');
  assert.equal(armor.armorDurability,1);assert.equal(armor.weight,undefined,'no carry weight');assert.equal(GEAR.length,1);
  assert.deepEqual(absorbArmorDamage(2,1),{armor:1,healthDamage:0,absorbed:1});
  assert.deepEqual(absorbArmorDamage(1,3),{armor:0,healthDamage:2,absorbed:1});
  assert.deepEqual(absorbArmorDamage(0,1),{armor:0,healthDamage:1,absorbed:0});
  assert.deepEqual(absorbArmorDamage(-1,-2),{armor:0,healthDamage:0,absorbed:0});
});

test('the roster is nine verbs plus rare variants, each with its own voice, recoil and silhouette',()=>{
  const base=GUNS.filter(g=>!g.variantOf),variants=GUNS.filter(g=>g.variantOf);
  assert.equal(base.length,9);
  assert.deepEqual(base.map(g=>g.verb).sort(),['BREACH','BURST','LAUNCH','PIERCE','PUNCH','SIDEARM','SPRAY','STEADY','SWEEP']);
  assert.equal(new Set(base.map(g=>g.verb)).size,9,'one gun per verb');
  assert.deepEqual(BASE_GUN_IDS,base.map(g=>g.id));
  assert.equal(new Set(GUNS.map(gun=>gun.id)).size,GUNS.length);
  for(const v of variants){const parent=GUNS.find(g=>g.id===v.variantOf);assert.ok(parent&&!parent.variantOf,`${v.id} extends a base gun`);assert.equal(v.verb,parent.verb,`${v.id} keeps its base verb`);}
  for(const gun of GUNS){
    for(const field of ['damage','rate','speed','range','mag','reserve','spread','reload','swap','color'])
      assert.ok(Number.isFinite(gun[field])&&gun[field]>0,`${gun.id} needs positive ${field}`);
    assert.equal(gun.weight,undefined,`${gun.id} has no carry weight`);assert.equal(gun.attachments,undefined);
    assert.ok(gun.visual.length>0&&gun.visual.width>0&&gun.visual.art,`${gun.id} needs a readable weapon profile`);
    assert.ok(gun.feel&&Number.isFinite(gun.feel.kick),`${gun.id} has its own recoil`);
    assert.ok(gun.short.startsWith(gun.verb),`${gun.id} says its verb first`);
  }
  assert.ok(new Set(GUNS.map(gun=>`${gun.damage}/${gun.rate}/${gun.mag}/${gun.spread}`)).size===GUNS.length,'each gun should have its own combat tradeoff profile');
  assert.equal(new Set(base.map(g=>JSON.stringify(g.feel))).size,9,'every base gun kicks differently');
  assert.ok(GUNS.find(g=>g.id==='launcher').lob,'the launcher lobs');
  assert.ok(GUNS.find(g=>g.id==='pistol_45').stun>0,'PUNCH staggers');
  assert.equal(GUNS.find(g=>g.id==='sniper_mule').penetration.walls,1,'BREACH goes through a wall');
  assert.equal(GUNS.find(g=>g.id==='sniper_lynx').penetration.walls,0);
  assert.ok(GUNS.find(g=>g.id==='sniper_lynx').penetration.enemies>=3,'PIERCE goes through enemies');
  assert.ok(GUNS.find(g=>g.id==='smg_vector').noise>1,'VECTOR 9 is louder');
});
test('shotgun shells are a real choice: wide buckshot or a long slug',()=>{
  const gun=GUNS.find(item=>item.id==='shotgun'),base=weaponStats(gun,null);
  assert.deepEqual(SHOTGUN_SHELLS.map(s=>s.id),['buckshot','slug']);
  const buck=shotgunShellStats(SHOTGUN_SHELLS.find(item=>item.id==='buckshot'),base);
  const slug=shotgunShellStats(SHOTGUN_SHELLS.find(item=>item.id==='slug'),base);
  assert.equal(buck.pellets,9);assert.equal(buck.damage,base.damage*.42);
  assert.equal(slug.pellets,1);assert.ok(slug.spread<buck.spread);assert.ok(slug.range>buck.range);assert.ok(slug.damage>buck.damage*3);
});
test('snipers pierce multiple enemies and crates; anti-materiel adds one wall',()=>{
  const mods=null,lynx=weaponPenetration(GUNS.find(gun=>gun.id==='sniper_lynx'),mods),quill=weaponPenetration(GUNS.find(gun=>gun.id==='sniper_quill'),mods),mule=weaponPenetration(GUNS.find(gun=>gun.id==='sniper_mule'),mods);
  for(const rifle of [lynx,quill]){assert.ok(rifle.enemies>=3);assert.ok(rifle.crates>=2);assert.equal(rifle.walls,0);}
  assert.ok(mule.enemies>=3);assert.ok(mule.crates>=2);assert.equal(mule.walls,1);
  assert.equal(weaponPenetration(GUNS[0],null).enemies,0);
  assert.equal(weaponPenetration(GUNS[0],'longbarrel').enemies,1);
  let budget={enemies:2,crates:1,walls:1};
  budget=consumePenetration(budget,'enemies');assert.deepEqual(budget,{enemies:1,crates:1,walls:1});
  budget=consumePenetration(budget,'walls');assert.equal(budget.walls,0);assert.equal(consumePenetration(budget,'walls'),null);
  assert.equal(consumePenetration(budget,'cover'),null,'ordinary cover always stops rounds');
  let sniper=lynx;for(let i=0;i<4;i++)sniper=consumePenetration(sniper,'enemies');
  assert.equal(sniper.enemies,0);assert.equal(consumePenetration(sniper,'enemies'),null,'the fifth enemy stops the sniper round');
  sniper=consumePenetration(sniper,'crates');assert.equal(sniper.crates,2,'each crate consumes its own pierce allowance');
});

test('swept projectile checks find first contacts without tunneling',()=>{
  assert.equal(segmentCircleHitTime({x:0,y:0},{x:100,y:0},{x:50,y:0},5),.45);
  assert.equal(segmentCircleHitTime({x:0,y:0},{x:100,y:0},{x:50,y:20},5),null);
  const map=Array.from({length:3},()=>Array(6).fill(0));map[1][2]=1;map[1][3]=1;
  assert.deepEqual(segmentBlockedTiles({x:8,y:24},{x:88,y:24},map,16).map(({x,y})=>[x,y]),[[2,1],[3,1]]);
});

test('anti-materiel wall penetration treats thick connected tiles as one wall',()=>{
  const map=Array.from({length:3},()=>Array(8).fill(0));map[1][2]=1;map[1][3]=1;map[1][5]=1;
  const crossing=segmentWallRuns({x:8,y:24},{x:120,y:24},map,16);
  assert.deepEqual(crossing.runs.map(({x,y})=>[x,y]),[[2,1],[5,1]],'a gap makes a second wall');
  assert.equal(crossing.endsInsideWall,false);
  const ongoing=segmentWallRuns({x:40,y:24},{x:55,y:24},map,16,true);
  assert.deepEqual(ongoing.runs,[],'remaining inside the same wall spends no second penetration');
  assert.equal(ongoing.endsInsideWall,true);
  const nextWall=segmentWallRuns({x:55,y:24},{x:96,y:24},map,16,true);
  assert.deepEqual(nextWall.runs.map(({x,y})=>[x,y]),[[5,1]],'a new wall after a floor gap still counts');
});

test('locked reward gates require the full price and cannot be charged twice',()=>{
  const gate={cost:18,opened:false};
  assert.deepEqual(unlockRewardGate(gate,17),{status:'insufficient',scrap:17,missing:1});
  assert.deepEqual(unlockRewardGate(gate,18),{status:'opened',scrap:0});
  assert.deepEqual(unlockRewardGate({...gate,opened:true},40),{status:'already-open',scrap:40});
  assert.deepEqual(gate,{cost:18,opened:false},'the price check must not mutate the gate');
});

test('room encounter rolls vary by seed and stay bounded by room capacity',()=>{
  const first=chooseEncounterTypes(4,301,.8);
  assert.deepEqual(chooseEncounterTypes(4,301,.8),first);
  assert.notDeepEqual(chooseEncounterTypes(4,302,.8),first);
  assert.equal(first.length,4);
  assert.ok(first.every(type=>Object.keys(ENEMY_TYPES).includes(type)));
});

test('encounters are mixed by design: never all one type, always a shooter present',()=>{
  const rushers=new Set(['chaser','brute','riot']);
  for(const depth of [0,.3,.5,.9])for(let count=2;count<=5;count++)for(let seed=1;seed<=400;seed++){
    const encounter=chooseEncounterTypes(count,seed,depth);
    assert.equal(encounter.length,count);
    assert.ok(new Set(encounter).size>=2,`${count} enemies at seed ${seed} depth ${depth} must mix types: ${encounter}`);
    assert.ok(encounter.some(type=>!rushers.has(type)),`seed ${seed} needs at least one shooter: ${encounter}`);
  }
});

test('marksman and riot are introduced later in the floor and respect their caps',()=>{
  const specialists=['sniper','riot'];
  for(let seed=1;seed<=300;seed++)for(let count=2;count<=5;count++){
    assert.ok(!chooseEncounterTypes(count,seed,.1).some(type=>specialists.includes(type)),'no specialists in the opening rooms');
    assert.ok(!chooseEncounterTypes(count,seed,.3).includes('sniper'),'no marksman before mid-floor');
  }
  let sawSniper=false,sawRiot=false;
  for(let seed=1;seed<=300;seed++){
    const late=chooseEncounterTypes(4,seed,.9);
    sawSniper||=late.includes('sniper');sawRiot||=late.includes('riot');
    assert.ok(late.filter(type=>type==='sniper').length<=1,'at most one marksman per room');
    assert.ok(late.filter(type=>type==='riot').length<=2);
  }
  assert.ok(sawSniper&&sawRiot,'late rooms should actually roll the new types');
});

test('crate durability loses health per hit and never drops below zero',()=>{
  let hp=60;
  hp=damageDurability(hp,18);
  assert.equal(hp,42);
  hp=damageDurability(hp,50);
  assert.equal(hp,0);
  assert.equal(damageDurability(60,-10),60);
});

test('crate damage stages progress at clear health thresholds and clamp invalid ratios',()=>{
  assert.equal(crateDamageStage(60,60),0);
  assert.equal(crateDamageStage(42,60),1);
  assert.equal(crateDamageStage(21,60),2);
  assert.equal(crateDamageStage(100,60),0);
  assert.equal(crateDamageStage(-4,60),2);
  assert.equal(crateDamageStage(10,0),2);
});

test('the minimap hides unknown distant contacts but shows explored or scanned contacts',()=>{
  assert.equal(minimapContactVisible({visited:false,distance:100,scanRange:0}),false);
  assert.equal(minimapContactVisible({visited:false,distance:480,scanRange:480}),true);
  assert.equal(minimapContactVisible({visited:false,distance:481,scanRange:480}),false);
  assert.equal(minimapContactVisible({visited:true,distance:900,scanRange:0}),true);
  assert.equal(minimapContactVisible({visited:false,distance:Infinity,scanRange:480}),false);
  assert.equal(minimapContactVisible({visited:false,distance:2,scanRange:480,secret:true}),false);
  assert.equal(minimapContactVisible({visited:true,distance:900,scanRange:0,secret:true}),true);
});

test('loot scanner reveals only available nearby pickups and keeps undiscovered cache loot hidden',()=>{
  assert.equal(minimapPickupVisible({available:true,distance:224,scanRange:224}),true);
  assert.equal(minimapPickupVisible({available:true,distance:225,scanRange:224}),false);
  assert.equal(minimapPickupVisible({available:false,distance:20,scanRange:224}),false);
  assert.equal(minimapPickupVisible({available:true,distance:20,scanRange:224,hiddenSecret:true}),false);
  assert.equal(minimapPickupVisible({available:true,distance:20,scanRange:224,hiddenSecret:false}),true);
});

test('room scan distance measures from the full outer tile edge, including the last tile',()=>{
  const room={left:32,top:64,right:128,bottom:160};
  assert.equal(distanceToRect({x:80,y:100},room),0);
  assert.equal(distanceToRect({x:128,y:100},room),0);
  assert.equal(distanceToRect({x:129,y:100},room),1);
  assert.equal(distanceToRect({x:130,y:162},room),Math.hypot(2,2));
  assert.equal(distanceToRect({x:0,y:0},{...room,right:room.left-1}),Infinity);
  assert.equal(distanceToRect({x:NaN,y:0},room),Infinity);
});

test('cover circles intersect a sight or blast path, including endpoints and edge contact',()=>{
  const start={x:0,y:0},end={x:100,y:0};
  assert.equal(segmentIntersectsCircle(start,end,{x:50,y:15},15),true);
  assert.equal(segmentIntersectsCircle(start,end,{x:50,y:16},15),false);
  assert.equal(segmentIntersectsCircle(start,end,{x:108,y:0},8),true);
  assert.equal(segmentIntersectsCircle(start,end,{x:50,y:1},-1),false);
});

test('picking up a gun adds it with a free slot, swaps the gun in hand when full, and never duplicates',()=>{
  assert.deepEqual(gunPickupPlan([0],5,2,0),{slot:1,replaces:null});
  assert.deepEqual(gunPickupPlan([0,1],5,2,0),{slot:0,replaces:0},'full hands swap the active gun');
  assert.deepEqual(gunPickupPlan([0,1],5,2,1),{slot:1,replaces:1});
  assert.deepEqual(gunPickupPlan([0,1],5,3,1),{slot:2,replaces:null},'the third slot adds instead of swapping');
  assert.deepEqual(gunPickupPlan([0,1,2],5,3,2),{slot:2,replaces:2});
  assert.equal(gunPickupPlan([0,1],1,2,0),null,'you cannot carry the same gun twice');
  const hands=[0,1];gunPickupPlan(hands,5,2,0);assert.deepEqual(hands,[0,1],'planning does not mutate');
});
const legacyStats=({moveSpeed,idleScale,maxHealth,maxWeaponSlots,crateDropChance,roomClearScrap,luckyFindLevel,scannerRange})=>({moveSpeed,idleScale,maxHealth,maxWeaponSlots,crateDropChance,roomClearScrap,luckyFindLevel,scannerRange});
test('run coins reward death and extraction while upgrades persist as capped levels',()=>{
  const deathPayout=runCoinPayout({won:false,roomsCleared:2,kills:4});
  const winPayout=runCoinPayout({won:true,roomsCleared:2,kills:4});
  assert.equal(deathPayout,29);
  assert.equal(winPayout,79);
  let progress=awardCoins(emptyProgress(),winPayout);
  const purchase=purchaseUpgrade(progress,'salvager');
  assert.equal(purchase.purchased,true);
  progress=purchase.progress;
  assert.equal(progress.coins,59);
  assert.equal(progressionStats(progress).maxWeaponSlots,2);
  const restored=parseProgress(JSON.stringify(progress));
  assert.deepEqual(restored,progress);
  assert.equal(parseProgress('{bad json').coins,0);
  assert.equal(META_UPGRADES.find(item=>item.id==='salvager').costs.length,3);
  assert.equal(META_UPGRADES.some(item=>item.id==='carryrig'),false,'carry weight is gone');
  const third=purchaseUpgrade({...emptyProgress(),coins:200},'thirdslot');
  assert.equal(third.purchased,true);assert.equal(progressionStats(third.progress).maxWeaponSlots,3);
  assert.equal(META_UPGRADES.find(item=>item.id==='thirdslot').costs.length,1);
  assert.match(META_UPGRADES.find(item=>item.id==='thirdslot').description,/0\.4 s longer/);
});

test('an upgrade purchase cannot spend too few coins or go past its final tier',()=>{
  const poor=emptyProgress();
  assert.equal(purchaseUpgrade(poor,'runner').purchased,false);
  let progress={...poor,coins:1000,upgrades:{...poor.upgrades,runner:3}};
  const result=purchaseUpgrade(progress,'runner');
  assert.equal(result.purchased,false);
  assert.equal(result.progress.coins,1000);
});

test('permanent upgrades change only their run stats and save data is sanitized',()=>{
  const base=progressionStats(emptyProgress());
  assert.deepEqual(legacyStats(base),{moveSpeed:112,idleScale:.08,maxHealth:3,maxWeaponSlots:2,crateDropChance:.35,roomClearScrap:6,luckyFindLevel:0,scannerRange:0});
  const restored=parseProgress(JSON.stringify({version:1,coins:-4,upgrades:{runner:1,thirdslot:99,unknown:3}}));
  assert.equal(restored.coins,0);
  assert.equal(restored.upgrades.thirdslot,1);
  assert.equal(restored.upgrades.unknown,undefined);
  assert.deepEqual(legacyStats(progressionStats(restored)),{moveSpeed:118.72,idleScale:.08,maxHealth:3,maxWeaponSlots:3,crateDropChance:.35,roomClearScrap:6,luckyFindLevel:0,scannerRange:0});
  assert.equal(progressionStats({...restored,upgrades:{...restored.upgrades,thirdslot:0}}).maxWeaponSlots,2);
});

test('Vital Reserve raises saved starting health by one per capped tier',()=>{
  let progress=awardCoins(emptyProgress(),1000);
  for(const maxHealth of [4,5,6]){
    const purchase=purchaseUpgrade(progress,'vitalreserve');
    assert.equal(purchase.purchased,true);
    progress=purchase.progress;
    assert.equal(progressionStats(progress).maxHealth,maxHealth);
  }
  assert.equal(purchaseUpgrade(progress,'vitalreserve').purchased,false);
  const restored=parseProgress(JSON.stringify(progress));
  assert.equal(restored.upgrades.vitalreserve,3);
  assert.equal(progressionStats(restored).maxHealth,6);
  assert.equal(progressionStats(parseProgress(JSON.stringify({version:1,coins:12,upgrades:{runner:1}}))).maxHealth,3);
});

test('Lucky Find is saved and adds capped rarity levels without changing item quantity',()=>{
  let progress=awardCoins(emptyProgress(),1000);
  for(let level=1;level<=3;level++){
    const purchase=purchaseUpgrade(progress,'luckyfind');
    assert.equal(purchase.purchased,true);
    progress=purchase.progress;
    assert.equal(progressionStats(progress).luckyFindLevel,level);
  }
  assert.equal(purchaseUpgrade(progress,'luckyfind').purchased,false);
  assert.equal(parseProgress(JSON.stringify(progress)).upgrades.luckyfind,3);
  const olderSave=parseProgress(JSON.stringify({version:1,coins:12,upgrades:{salvager:1}}));
  assert.equal(olderSave.upgrades.luckyfind,0);
});

test('Salvager improves crate drops and combat room-clear scrap at each tier',()=>{
  let progress=awardCoins(emptyProgress(),1000);
  for(const [chance,clearScrap] of [[.45,8],[.55,10],[.65,12]]){
    const purchase=purchaseUpgrade(progress,'salvager');
    assert.equal(purchase.purchased,true);
    progress=purchase.progress;
    const stats=progressionStats(progress);
    assert.ok(Math.abs(stats.crateDropChance-chance)<1e-10);
    assert.equal(stats.roomClearScrap,clearScrap);
  }
  assert.equal(purchaseUpgrade(progress,'salvager').purchased,false);
});

test('Room Sense is a capped saved upgrade with increasing scan range',()=>{
  let progress=awardCoins(emptyProgress(),200);
  for(const range of [15,25,35].map(tiles=>tiles*TILE)){
    const purchase=purchaseUpgrade(progress,'roomsense');
    assert.equal(purchase.purchased,true);
    progress=purchase.progress;
    assert.equal(progressionStats(progress).scannerRange,range);
  }
  assert.equal(purchaseUpgrade(progress,'roomsense').purchased,false);
  const restored=parseProgress(JSON.stringify(progress));
  assert.equal(restored.upgrades.roomsense,3);
  assert.equal(progressionStats(restored).scannerRange,1120);
});
