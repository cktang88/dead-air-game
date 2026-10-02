import test from 'node:test';
import assert from 'node:assert/strict';
import {BASE_CARRY_CAPACITY, ENEMY_TYPES, GEAR, GUNS, SHOTGUN_SHELLS} from './catalog.js';
import {absorbArmorDamage, canCarryWeapons, chooseEncounterTypes, compatibleAttachments, consumePenetration, crateDamageStage, damageDurability, distanceToRect, minimapContactVisible, reloadSeconds, segmentBlockedTiles, segmentCircleHitTime, segmentIntersectsCircle, segmentWallRuns, shotgunShellStats, timeScale, weaponLoadoutWeight, weaponPenetration, weaponReplacement, weaponStats} from './rules.js';
import {META_UPGRADES, awardCoins, emptyProgress, parseProgress, progressionStats, purchaseUpgrade, runCoinPayout} from './progression.js';

test('firing blends idle and normal time even while moving, and menus pause',()=>{
  const base={mode:'play',paused:false,loadoutOpen:false,moving:false,firing:false,now:10,lastAction:5};
  assert.equal(timeScale(base),0.18);
  assert.equal(timeScale({...base,moving:true}),1);
  assert.equal(timeScale({...base,firing:true}),Math.sqrt(.18));
  assert.equal(timeScale({...base,moving:true,firing:true}),Math.sqrt(.18));
  assert.equal(timeScale({...base,moving:true,firing:true,lastActionKind:'move'}),Math.sqrt(.18));
  assert.equal(timeScale({...base,lastAction:9.8,lastActionKind:'move'}),1);
  assert.equal(timeScale({...base,lastAction:9.8,lastActionKind:'fire'}),Math.sqrt(.18));
  assert.equal(timeScale({...base,lastAction:9.8,lastActionKind:'other'}),.18);
  assert.equal(timeScale({...base,lastAction:9.5}),0.18);
  assert.equal(timeScale({...base,idleScale:0.15,firing:true}),Math.sqrt(.15));
  assert.equal(timeScale({...base,idleScale:0.15,moving:true,firing:true}),Math.sqrt(.15));
  assert.equal(timeScale({...base,idleScale:.12,firing:true}),Math.sqrt(.12));
  assert.equal(timeScale({...base,idleScale:.18,firing:true,lastAction:9.9,lastActionKind:'fire'}),Math.sqrt(.18));
  assert.equal(timeScale({...base,paused:true}),0);
  assert.equal(timeScale({...base,loadoutOpen:true}),0);
  assert.equal(timeScale({...base,mode:'dead'}),0);
});

test('ranged enemy shots leave time for a sidestep at idle and action tempo',()=>{
  const playerSpeed=progressionStats(emptyProgress()).moveSpeed;
  const ranged=[ENEMY_TYPES.gunner,ENEMY_TYPES.guard];
  for(const enemy of ranged){
    assert.ok(enemy.minRange>0&&enemy.minRange<enemy.range,`${enemy.name} needs a useful minimum and maximum firing range`);
    assert.ok(enemy.projectileSpeed<playerSpeed*2,`${enemy.name} rounds should stay below twice player speed`);
    for(const scale of [.18,Math.sqrt(.18),1]){
      const projectileTravel=65-13-10;
      const flightSeconds=projectileTravel/(enemy.projectileSpeed*scale);
      const sidestep=playerSpeed*scale*flightSeconds;
      assert.ok(sidestep>=18,`${enemy.name} should allow an 18-unit sidestep at ${scale}×`);
    }
  }
});

test('gun mods change the weapon values consumed by combat',()=>{
  const base=weaponStats(GUNS[0],new Set());
  const mods=new Set(['extended','hollow','stabilizer','longbarrel','suppressor']);
  const upgraded=weaponStats(GUNS[0],mods);
  assert.equal(base.magazine,18);
  assert.equal(upgraded.magazine,27);
  assert.equal(upgraded.damage,29.700000000000003);
  assert.equal(upgraded.fireRate,0.1394);
  assert.equal(upgraded.projectileSpeed,690);
  assert.equal(upgraded.range,GUNS[0].range*1.35);
  assert.equal(upgraded.spread,0.0385);
  assert.equal(reloadSeconds(new Set()),1.65);
  assert.equal(reloadSeconds(new Set(['extended'])),1.85);
  assert.equal(reloadSeconds(new Set(['stabilizer'])),1.25);
});

test('the weighted ammo harness speeds reloads for every carried gun and stacks with mods',()=>{
  const harness=GEAR.find(item=>item.id==='ammo-harness');
  assert.ok(harness);
  assert.equal(harness.weight,1);
  assert.equal(harness.reloadMultiplier,.85);
  for(const gun of GUNS){
    const normal=reloadSeconds(new Set(),gun);
    assert.ok(Math.abs(reloadSeconds(new Set(),gun,harness.reloadMultiplier)-normal*.85)<1e-10,`${gun.name} should reload 15% faster`);
    if(gun.attachments.includes('stabilizer'))assert.ok(Math.abs(reloadSeconds(new Set(['stabilizer']),gun,harness.reloadMultiplier)-1.25*.85)<1e-10,`${gun.name} should combine the harness and stabilizer`);
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
  const stats=weaponStats(mule,owned);
  assert.equal(stats.magazine,mule.mag,'Mule cannot take an extended magazine');
  assert.equal(stats.damage,mule.damage*1.35);
  assert.equal(stats.spread,mule.spread,'Mule cannot take a suppressor');
  assert.equal(stats.projectileSpeed,mule.speed);
  assert.equal(stats.range,mule.range*1.35);
  assert.deepEqual(compatibleAttachments(mule,[
    {id:'extended'},{id:'hollow'},{id:'suppressor'},{id:'longbarrel'}
  ]).map(item=>item.id),['hollow','longbarrel']);
  assert.equal(reloadSeconds(new Set(),mule),mule.reload);
  assert.equal(reloadSeconds(new Set(['stabilizer']),GUNS[0]),1.25);
});

test('shotgun shells trade pellet count, spread, damage, and range',()=>{
  const gun=GUNS.find(item=>item.id==='shotgun'),base=weaponStats(gun,new Set());
  const buck=shotgunShellStats(SHOTGUN_SHELLS.find(item=>item.id==='buckshot'),base);
  const bird=shotgunShellStats(SHOTGUN_SHELLS.find(item=>item.id==='birdshot'),base);
  const slug=shotgunShellStats(SHOTGUN_SHELLS.find(item=>item.id==='slug'),base);
  assert.equal(buck.pellets,9);assert.equal(buck.damage,base.damage*.42);
  assert.equal(bird.pellets,16);assert.ok(bird.spread>buck.spread);assert.ok(bird.range<buck.range);
  assert.equal(slug.pellets,1);assert.ok(slug.spread<buck.spread);assert.ok(slug.range>buck.range);
  assert.ok(buck.damage*buck.pellets<base.damage*gun.count,'buckshot should stay below the old five-pellet volley total');
});

test('snipers pierce multiple enemies and crates; anti-materiel adds one wall',()=>{
  const mods=new Set(),lynx=weaponPenetration(GUNS.find(gun=>gun.id==='sniper_lynx'),mods),quill=weaponPenetration(GUNS.find(gun=>gun.id==='sniper_quill'),mods),mule=weaponPenetration(GUNS.find(gun=>gun.id==='sniper_mule'),mods);
  for(const rifle of [lynx,quill]){assert.ok(rifle.enemies>=3);assert.ok(rifle.crates>=2);assert.equal(rifle.walls,0);}
  assert.ok(mule.enemies>=3);assert.ok(mule.crates>=2);assert.equal(mule.walls,1);
  assert.equal(weaponPenetration(GUNS[0],new Set()).enemies,0);
  assert.equal(weaponPenetration(GUNS[0],new Set(['longbarrel'])).enemies,1);
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

test('room encounter rolls vary by seed and stay bounded by room capacity',()=>{
  const first=chooseEncounterTypes(4,301);
  assert.deepEqual(chooseEncounterTypes(4,301),first);
  assert.notDeepEqual(chooseEncounterTypes(4,302),first);
  assert.equal(first.length,4);
  assert.ok(first.every(type=>['chaser','gunner','guard','brute'].includes(type)));
  for(let count=2;count<=4;count++)for(let seed=1;seed<=256;seed++){
    const encounter=chooseEncounterTypes(count,seed),rushers=encounter.filter(type=>type==='chaser'||type==='brute').length;
    assert.ok(rushers<=Math.floor(count/2),`${count} enemies at seed ${seed} should include ranged support`);
  }
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

test('weapon pickup cannot equip the same gun in both slots',()=>{
  const current=[0,1];
  assert.equal(weaponReplacement(current,1,current[0],GUNS,BASE_CARRY_CAPACITY).canCarry,false);
  assert.equal(weaponReplacement(current,0,current[0],GUNS,BASE_CARRY_CAPACITY).canCarry,false);
  assert.deepEqual(weaponReplacement(current,0,2,GUNS,BASE_CARRY_CAPACITY).weapons,[2,1]);
});

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
  assert.deepEqual(base,{moveSpeed:112,idleScale:.18,carryCapacity:BASE_CARRY_CAPACITY,crateDropChance:.35,scannerRange:0});
  const restored=parseProgress(JSON.stringify({version:1,coins:-4,upgrades:{runner:1,carryrig:99,unknown:3}}));
  assert.equal(restored.coins,0);
  assert.equal(restored.upgrades.carryrig,3);
  assert.equal(restored.upgrades.unknown,undefined);
  assert.deepEqual(progressionStats(restored),{moveSpeed:118.72,idleScale:.18,carryCapacity:BASE_CARRY_CAPACITY+3,crateDropChance:.35,scannerRange:0});
});

test('Room Sense is a capped saved upgrade with increasing scan range',()=>{
  let progress=awardCoins(emptyProgress(),200);
  for(const range of [480,800,1120]){
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
