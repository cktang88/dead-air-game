import test from 'node:test';
import assert from 'node:assert/strict';
import {BASE_CARRY_CAPACITY, ENEMY_TYPES, GEAR, GUNS, SHOTGUN_SHELLS, TILE} from './catalog.js';
import {absorbArmorDamage, canCarryWeapons, chooseEncounterTypes, chooseWeaponReplacementSlot, compatibleAttachments, consumePenetration, crateDamageStage, damageDurability, distanceToRect, minimapContactVisible, minimapPickupVisible, reloadSeconds, segmentBlockedTiles, segmentCircleHitTime, segmentIntersectsCircle, segmentWallRuns, shotgunShellStats, timeScale, unlockRewardGate, weaponLoadoutWeight, weaponPenetration, weaponReplacement, weaponStats, withinWorldView} from './rules.js';
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

test('gun mods change the weapon values consumed by combat',()=>{
  const base=weaponStats(GUNS[0],new Map());
  const mods=new Map(['extended','hollow','stabilizer','longbarrel','suppressor'].map(id=>[id,'common']));
  const upgraded=weaponStats(GUNS[0],mods);
  assert.equal(base.magazine,18);
  assert.equal(upgraded.magazine,27);
  assert.equal(upgraded.damage,29.700000000000003);
  assert.equal(upgraded.fireRate,0.1394);
  assert.equal(upgraded.projectileSpeed,690);
  assert.equal(upgraded.range,GUNS[0].range*1.35);
  assert.equal(upgraded.spread,0.0385);
  assert.equal(reloadSeconds(new Map()),1.65);
  assert.equal(reloadSeconds(new Map([['extended','common']])),1.85);
  assert.equal(reloadSeconds(new Map([['stabilizer','common']])),1.25);
});

test('attachment rarity is retained in weapon stats and strengthens the installed mod',()=>{
  const gun=GUNS[0],common=new Map([['extended','common']]),prototype=new Map([['extended','prototype']]);
  assert.equal(weaponStats(gun,common).magazine,27);
  assert.equal(weaponStats(gun,prototype).magazine,32);
  assert.equal(weaponPenetration(gun,new Map([['longbarrel','common']])).enemies,1);
  assert.equal(weaponPenetration(gun,new Map([['longbarrel','prototype']])).enemies,2);
  assert.ok(reloadSeconds(new Map([['stabilizer','prototype']]),gun)<reloadSeconds(new Map([['stabilizer','common']]),gun));
});

test('the weighted ammo harness speeds reloads for every carried gun and stacks with mods',()=>{
  const harness=GEAR.find(item=>item.id==='ammo-harness');
  assert.ok(harness);
  assert.equal(harness.weight,1);
  assert.equal(harness.reloadMultiplier,.85);
  for(const gun of GUNS){
    const normal=reloadSeconds(new Map(),gun);
    assert.ok(Math.abs(reloadSeconds(new Map(),gun,harness.reloadMultiplier)-normal*.85)<1e-10,`${gun.name} should reload 15% faster`);
    if(gun.attachments.includes('stabilizer'))assert.ok(Math.abs(reloadSeconds(new Map([['stabilizer','common']]),gun,harness.reloadMultiplier)-1.25*.85)<1e-10,`${gun.name} should combine the harness and stabilizer`);
  }
});

test('armor durability absorbs incoming damage separately from health',()=>{
  const armor=GEAR.find(item=>item.id==='armor');
  assert.equal(armor.armorDurability,2);assert.equal(armor.repairCost,10);assert.equal(armor.healthBonus,undefined);
  assert.deepEqual(absorbArmorDamage(2,1),{armor:1,healthDamage:0,absorbed:1});
  assert.deepEqual(absorbArmorDamage(1,3),{armor:0,healthDamage:2,absorbed:1});
  assert.deepEqual(absorbArmorDamage(0,1),{armor:0,healthDamage:1,absorbed:0});
  assert.deepEqual(absorbArmorDamage(-1,-2),{armor:0,healthDamage:0,absorbed:0});
});

test('the roster covers the requested classes with distinct, complete weapon profiles',()=>{
  const counts=Object.groupBy(GUNS,gun=>gun.category);
  assert.equal(counts['ASSAULT RIFLE'].length,3);
  assert.equal(counts.SMG.length,4);
  assert.equal(counts.PISTOL.length,2);
  assert.equal(counts.SNIPER.length+counts['ANTI-MATERIEL'].length,3);
  assert.equal(new Set(GUNS.map(gun=>gun.id)).size,GUNS.length);
  for(const gun of GUNS){
    for(const field of ['damage','rate','speed','range','mag','reserve','spread','reload','weight','color'])
      assert.ok(Number.isFinite(gun[field])&&gun[field]>0,`${gun.id} needs positive ${field}`);
    assert.ok(gun.visual.length>0&&gun.visual.width>0,`${gun.id} needs a readable weapon profile`);
    assert.ok(gun.attachments.length>0,`${gun.id} needs compatible attachments`);
    assert.ok(gun.attachments.every(id=>['extended','suppressor','hollow','stabilizer','longbarrel'].includes(id)));
  }
  assert.deepEqual(GUNS.slice(0,3).map(gun=>gun.id),['machine','shotgun','rifle']);
  assert.ok(new Set(GUNS.map(gun=>`${gun.damage}/${gun.rate}/${gun.mag}/${gun.spread}`)).size===GUNS.length,
    'each gun should have its own combat tradeoff profile');
});

test('attachment compatibility gates the actual weapon stats and shop options',()=>{
  const mule=GUNS.find(gun=>gun.id==='sniper_mule');
  const owned=new Set(['extended','hollow','longbarrel','suppressor']);
  const stats=weaponStats(mule,new Map([...owned].map(id=>[id,'common'])));
  assert.equal(stats.magazine,mule.mag,'Mule cannot take an extended magazine');
  assert.equal(stats.damage,mule.damage*1.35);
  assert.equal(stats.spread,mule.spread,'Mule cannot take a suppressor');
  assert.equal(stats.projectileSpeed,mule.speed);
  assert.equal(stats.range,mule.range*1.35);
  assert.deepEqual(compatibleAttachments(mule,[
    {id:'extended'},{id:'hollow'},{id:'suppressor'},{id:'longbarrel'}
  ]).map(item=>item.id),['hollow','longbarrel']);
  assert.equal(reloadSeconds(new Map(),mule),mule.reload);
  assert.equal(reloadSeconds(new Map([['stabilizer','common']]),GUNS[0]),1.25);
});

test('shotgun shells trade pellet count, spread, damage, and range',()=>{
  const gun=GUNS.find(item=>item.id==='shotgun'),base=weaponStats(gun,new Map());
  const buck=shotgunShellStats(SHOTGUN_SHELLS.find(item=>item.id==='buckshot'),base);
  const bird=shotgunShellStats(SHOTGUN_SHELLS.find(item=>item.id==='birdshot'),base);
  const slug=shotgunShellStats(SHOTGUN_SHELLS.find(item=>item.id==='slug'),base);
  assert.equal(buck.pellets,9);assert.equal(buck.damage,base.damage*.42);
  assert.equal(bird.pellets,16);assert.ok(bird.spread>buck.spread);assert.ok(bird.range<buck.range);
  assert.equal(slug.pellets,1);assert.ok(slug.spread<buck.spread);assert.ok(slug.range>buck.range);
  assert.ok(buck.damage*buck.pellets<base.damage*gun.count,'buckshot should stay below the old five-pellet volley total');
});

test('snipers pierce multiple enemies and crates; anti-materiel adds one wall',()=>{
  const mods=new Map(),lynx=weaponPenetration(GUNS.find(gun=>gun.id==='sniper_lynx'),mods),quill=weaponPenetration(GUNS.find(gun=>gun.id==='sniper_quill'),mods),mule=weaponPenetration(GUNS.find(gun=>gun.id==='sniper_mule'),mods);
  for(const rifle of [lynx,quill]){assert.ok(rifle.enemies>=3);assert.ok(rifle.crates>=2);assert.equal(rifle.walls,0);}
  assert.ok(mule.enemies>=3);assert.ok(mule.crates>=2);assert.equal(mule.walls,1);
  assert.equal(weaponPenetration(GUNS[0],new Map()).enemies,0);
  assert.equal(weaponPenetration(GUNS[0],new Map([['longbarrel','common']])).enemies,1);
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

test('loot scanner is a one-weight, seven-tile gear choice',()=>{
  const scanner=GEAR.find(item=>item.id==='loot-scanner');
  assert.ok(scanner);
  assert.equal(scanner.weight,1);
  assert.equal(scanner.cost,32);
  assert.equal(scanner.pickupScanRange,7*TILE);
  assert.equal(weaponLoadoutWeight([0,1],GUNS)+scanner.weight,6.5);
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

test('weapon choices use a visible carry budget',()=>{
  assert.equal(weaponLoadoutWeight([0,1],GUNS),5.5);
  assert.equal(canCarryWeapons([0,1],GUNS,BASE_CARRY_CAPACITY),true);
  assert.equal(canCarryWeapons([1,2],GUNS,BASE_CARRY_CAPACITY),false);
  assert.equal(canCarryWeapons([0,1],GUNS,BASE_CARRY_CAPACITY-1.5),true);
  assert.equal(canCarryWeapons([0,2],GUNS,BASE_CARRY_CAPACITY-1.5),false);
});

test('weapon replacement preview includes gear weight without mutating the current loadout',()=>{
  const current=[0,1],rifle=GUNS.findIndex(gun=>gun.id==='rifle');
  const primary=weaponReplacement(current,0,rifle,GUNS,BASE_CARRY_CAPACITY,1.5);
  assert.deepEqual(primary.weapons,[rifle,1]);
  assert.equal(primary.totalWeight,9);
  assert.equal(primary.canCarry,false);
  const secondary=weaponReplacement(current,1,rifle,GUNS,BASE_CARRY_CAPACITY,1.5);
  assert.deepEqual(secondary.weapons,[0,rifle]);
  assert.equal(secondary.totalWeight,7.5);
  assert.equal(secondary.canCarry,false);
  assert.deepEqual(current,[0,1]);
  assert.equal(weaponReplacement(current,1,rifle,GUNS,BASE_CARRY_CAPACITY+1,1.5).canCarry,true);
});

test('weapon replacement selection shares append and replacement priorities',()=>{
  const pistol=GUNS.findIndex(gun=>gun.id==='pistol_9');
  const heavy=GUNS.findIndex(gun=>gun.id==='sniper_mule');
  assert.equal(chooseWeaponReplacementSlot([0,1],pistol,2,0,GUNS,BASE_CARRY_CAPACITY,1.5),1);
  assert.equal(chooseWeaponReplacementSlot([0,1],pistol,3,0,GUNS,BASE_CARRY_CAPACITY+2),2);
  assert.equal(chooseWeaponReplacementSlot([0,1],pistol,2,0,GUNS,BASE_CARRY_CAPACITY),1);
  assert.equal(chooseWeaponReplacementSlot([0,1,2],pistol,3,2,GUNS,BASE_CARRY_CAPACITY+4),2);
  assert.equal(chooseWeaponReplacementSlot([0,1,2],pistol,3,2,GUNS,BASE_CARRY_CAPACITY+4,1),2);
  assert.equal(chooseWeaponReplacementSlot([0,1],heavy,3,0,GUNS,BASE_CARRY_CAPACITY+1.5),undefined);
  assert.equal(chooseWeaponReplacementSlot([0,1],0,3,0,GUNS,BASE_CARRY_CAPACITY+3),undefined);
});

test('weapon pickup cannot equip the same gun in both slots',()=>{
  const current=[0,1];
  assert.equal(weaponReplacement(current,1,current[0],GUNS,BASE_CARRY_CAPACITY).canCarry,false);
  assert.equal(weaponReplacement(current,0,current[0],GUNS,BASE_CARRY_CAPACITY).canCarry,false);
  assert.deepEqual(weaponReplacement(current,0,2,GUNS,BASE_CARRY_CAPACITY).weapons,[2,1]);
});

test('an unlocked third slot appends a distinct gun only when weapon and gear weight fit',()=>{
  const current=[0,1],lightPistol=GUNS.findIndex(gun=>gun.id==='pistol_9'),third=weaponReplacement(current,2,lightPistol,GUNS,BASE_CARRY_CAPACITY+3,1.5);
  assert.deepEqual(third.weapons,[0,1,lightPistol]);
  assert.equal(third.canCarry,true);
  assert.equal(third.totalWeight,8.1);
  assert.equal(weaponReplacement(current,2,lightPistol,GUNS,8,1.5).canCarry,false);
  assert.equal(weaponReplacement(current,2,0,GUNS,BASE_CARRY_CAPACITY+3).canCarry,false);
  assert.deepEqual(current,[0,1]);
});

const legacyStats=({moveSpeed,idleScale,maxHealth,carryCapacity,maxWeaponSlots,crateDropChance,roomClearScrap,luckyFindLevel,scannerRange})=>({moveSpeed,idleScale,maxHealth,carryCapacity,maxWeaponSlots,crateDropChance,roomClearScrap,luckyFindLevel,scannerRange});
test('run coins reward death and extraction while upgrades persist as capped levels',()=>{
  const deathPayout=runCoinPayout({won:false,roomsCleared:2,kills:4});
  const winPayout=runCoinPayout({won:true,roomsCleared:2,kills:4});
  assert.equal(deathPayout,29);
  assert.equal(winPayout,79);
  let progress=awardCoins(emptyProgress(),winPayout);
  const purchase=purchaseUpgrade(progress,'carryrig');
  assert.equal(purchase.purchased,true);
  progress=purchase.progress;
  assert.equal(progress.coins,44);
  assert.equal(progressionStats(progress).carryCapacity,8);
  assert.equal(progressionStats(progress).maxWeaponSlots,2);
  const restored=parseProgress(JSON.stringify(progress));
  assert.deepEqual(restored,progress);
  assert.equal(parseProgress('{bad json').coins,0);
  assert.equal(META_UPGRADES.find(item=>item.id==='carryrig').costs.length,3);
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
  assert.deepEqual(legacyStats(base),{moveSpeed:112,idleScale:.08,maxHealth:5,carryCapacity:BASE_CARRY_CAPACITY,maxWeaponSlots:2,crateDropChance:.35,roomClearScrap:20,luckyFindLevel:0,scannerRange:0});
  const restored=parseProgress(JSON.stringify({version:1,coins:-4,upgrades:{runner:1,carryrig:99,unknown:3}}));
  assert.equal(restored.coins,0);
  assert.equal(restored.upgrades.carryrig,3);
  assert.equal(restored.upgrades.unknown,undefined);
  assert.deepEqual(legacyStats(progressionStats(restored)),{moveSpeed:118.72,idleScale:.08,maxHealth:5,carryCapacity:BASE_CARRY_CAPACITY+3,maxWeaponSlots:3,crateDropChance:.35,roomClearScrap:20,luckyFindLevel:0,scannerRange:0});
  assert.equal(progressionStats({...restored,upgrades:{...restored.upgrades,carryrig:2}}).maxWeaponSlots,2);
});

test('Vital Reserve raises saved starting health by one per capped tier',()=>{
  let progress=awardCoins(emptyProgress(),1000);
  for(const maxHealth of [6,7,8]){
    const purchase=purchaseUpgrade(progress,'vitalreserve');
    assert.equal(purchase.purchased,true);
    progress=purchase.progress;
    assert.equal(progressionStats(progress).maxHealth,maxHealth);
  }
  assert.equal(purchaseUpgrade(progress,'vitalreserve').purchased,false);
  const restored=parseProgress(JSON.stringify(progress));
  assert.equal(restored.upgrades.vitalreserve,3);
  assert.equal(progressionStats(restored).maxHealth,8);
  assert.equal(progressionStats(parseProgress(JSON.stringify({version:1,coins:12,upgrades:{runner:1}}))).maxHealth,5);
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
  for(const [chance,clearScrap] of [[.45,22],[.55,24],[.65,26]]){
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
