// Browser smoke check for the CURRENT game: 3 HP, the time rule (still / walk / sprint), the two starting guns, the
// supply drop (one pickup, three options), SHOVE + the dry-ammo fallback, pause/loadout focus handling and the safehouse.
// Open tests/game-smoke.html over any static server (e.g. `npm start`). It loads the game with ?debug to reach window.__deadair.
import {DEFAULT_KEY_BINDINGS,loadKeyBindings} from '../keybindings.js';
import {emptyProgress,progressionStats,SAVE_KEY} from '../progression.js';
import {readSavedProgress} from '../progress-storage.js';

const report=document.querySelector('#result');
const frame=document.querySelector('#game');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const stateOf=win=>JSON.parse(win.render_game_to_text());
const GAME_URL='../index.html?browser-smoke&debug';
// First runs open on the Signal Check tutorial floor; this smoke exercises the generated floor, so mark it done (the dedicated Signal Check checks live elsewhere).
window.localStorage.setItem('dead-air.onboarding.v1',JSON.stringify({signalDone:true,manual:[],cards:[]}));

async function waitForBoot(doc,win){
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){
    if(!doc.querySelector('#start-button')?.disabled&&typeof win.advanceTime==='function'&&typeof win.render_game_to_text==='function'&&win.__deadair)return;
    await wait(50);
  }
  throw new Error('Game startup did not enable the start button within 30 seconds');
}

function press(win,key,type){
  win.dispatchEvent(new win.KeyboardEvent(type,{key,bubbles:true,cancelable:true}));
}
const tap=(win,key)=>{press(win,key,'keydown');press(win,key,'keyup');};
const aimAt=(win,x,y)=>win.dispatchEvent(new win.MouseEvent('mousemove',{clientX:x,clientY:y,bubbles:true}));
const click=(win,down)=>win.dispatchEvent(new win.MouseEvent(down?'mousedown':'mouseup',{button:0,bubbles:true}));
// Screen position of a world point (the renderer's camera is on window.__deadair.view.cam).
const toScreen=(win,x,y)=>{const cam=win.__deadair.view.cam,sc=cam.scale;return {x:(x-cam.x)*sc+win.innerWidth/2,y:(y-cam.y)*sc+win.innerHeight/2};};

function reloadGame(){
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Game frame did not reload')),30000);
    frame.addEventListener('load',()=>{clearTimeout(timeout);resolve();},{once:true});
    frame.src=GAME_URL;
  });
}

async function run(){
  const win=frame.contentWindow,doc=frame.contentDocument;
  await waitForBoot(doc,win);
  doc.querySelector('#meta-button').click();
  if(doc.querySelector('#meta-panel').hidden||doc.activeElement!==doc.querySelector('#close-meta'))throw new Error('Opening the safehouse did not focus its close control');
  const metaButtons=[...doc.querySelectorAll('#meta-panel button:not(:disabled)')].filter(button=>!button.closest('[hidden]'));
  const firstMetaButton=metaButtons[0],lastMetaButton=metaButtons.at(-1);
  lastMetaButton.focus();
  const metaTab=new win.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});win.dispatchEvent(metaTab);
  if(!metaTab.defaultPrevented||doc.activeElement!==firstMetaButton)throw new Error('Tab did not stay inside the safehouse dialog');
  doc.querySelector('#close-meta').click();
  if(!doc.querySelector('#meta-panel').hidden||doc.activeElement!==doc.querySelector('#meta-button'))throw new Error('Closing the safehouse did not return focus to its opener');

  const seed=213838321;
  const bindings=loadKeyBindings(win.localStorage);
  const movementKey=bindings.moveRight===DEFAULT_KEY_BINDINGS.moveRight&&!Object.values(bindings).includes('arrowright')?'ArrowRight':bindings.moveRight;
  doc.querySelector('#seed-input').value=String(seed);
  doc.querySelector('#start-button').click();
  const initial=stateOf(win);
  if(initial.mode!=='play'||initial.seed!==seed||!initial.player)throw new Error('Seeded run did not start with a player');
  const idleScale=progressionStats(readSavedProgress(win.localStorage)).idleScale.toFixed(2);

  // ---- the opening state of the current game: three hit points, two guns, smoke + flash, a hand-readable floor
  if(initial.player.health!==3||initial.player.maxHealth!==3)throw new Error(`The player should start with 3 health, got ${JSON.stringify(initial.player)}`);
  if(initial.loadout.slots.length!==2||initial.loadout.slots.some(name=>!name))throw new Error('The run should start with two carried guns');
  if(initial.throwables.counts.smoke!==1||initial.throwables.counts.flash!==1||initial.throwables.selected!=='smoke')throw new Error(`Starting throwables should be one smoke and one flash: ${JSON.stringify(initial.throwables)}`);
  if(initial.enemyCount!==initial.enemies.length||initial.pickupCount!==initial.pickups.length)throw new Error('Gameplay snapshot omitted enemies or pickups from its reported counts');
  if(initial.enemyCount<=12||initial.pickupCount<=8)throw new Error('Seeded snapshot no longer exercises the former enemy and pickup output limits');
  if(initial.timeScale!==idleScale)throw new Error(`The world should start at the still rate ${idleScale}×, got ${initial.timeScale}×`);
  if(initial.roomIndex!==0||initial.roomProgress?.[0]?.name!==initial.room||
    initial.roomProgress.reduce((count,room)=>count+room.livingEnemies,0)!==initial.enemyCount||
    initial.enemies.some(enemy=>!Number.isInteger(enemy.roomIndex))){
    throw new Error('Seeded snapshot lost room ownership for a live enemy');
  }
  const roomNames=initial.roomProgress.map(room=>room.name);
  if(new Set(roomNames).size!==roomNames.length)throw new Error(`Generated floor reused a room name: ${JSON.stringify(roomNames)}`);
  if(initial.enemies.some(enemy=>!['guard','patrol','sleep','gather'].includes(enemy.posture)))throw new Error('Enemies should start in readable postures (guard, patrol, sleep, gather)');
  if(initial.supplyOpen!==false)throw new Error('The supply drop must start closed');
  if(!initial.pickups.some(pickup=>pickup.type==='supply')&&!initial.doorMarkers.length)throw new Error('The floor shows neither a supply drop nor door rewards');

  // ---- THE TIME RULE: still 0.08x, walking ~0.35x, sprinting toward 1x
  press(win,movementKey,'keydown');
  win.advanceTime(500);
  const walking=stateOf(win);
  const walkRate=Number(walking.timeScale);
  if(!(walkRate>0.25&&walkRate<0.5))throw new Error(`Walking should run the world near 0.35×, got ${walking.timeScale}×`);
  press(win,'Shift','keydown');
  win.advanceTime(700);
  const sprinting=stateOf(win);
  if(!(Number(sprinting.timeScale)>0.8))throw new Error(`Sprinting should run the world near 1×, got ${sprinting.timeScale}×`);
  const sprintDistance=sprinting.player.x-walking.player.x;
  win.advanceTime(300);
  const walkDistance=(()=>{press(win,'Shift','keyup');const a=stateOf(win);win.advanceTime(300);return stateOf(win).player.x-a.player.x;})();
  if(sprintDistance<=0||walkDistance<=0||sprintDistance/0.7<walkDistance/0.3*1.2)throw new Error(`Sprint should cover ground faster than a walk: ${JSON.stringify({sprintDistance,walkDistance})}`);
  press(win,movementKey,'keyup');
  win.advanceTime(1500);
  const still=stateOf(win);
  if(still.timeScale!==idleScale)throw new Error(`Standing still should settle at ${idleScale}×, got ${still.timeScale}×`);

  // ---- firing spends ammo and a shot lets a beat of time through; player bullets ride world time and must visibly travel
  const ammoBefore=still.player.ammo;
  aimAt(win,win.innerWidth/2+160,win.innerHeight/2);
  click(win,true);win.advanceTime(150);click(win,false);
  const fired=stateOf(win);
  if(fired.player.ammo>=ammoBefore)throw new Error('Firing did not consume ammunition');
  if(!fired.bullets.length||!fired.bullets.some(bullet=>bullet.owner==='player'||bullet.owner===undefined))throw new Error('A fired round should be in flight for a moment (player bullets ride world time)');
  win.advanceTime(1500);

  // ---- bullets damage the crate we aim at
  const here=stateOf(win);
  const crate=here.crates.map(item=>({...item,distance:Math.hypot(item.x-here.player.x,item.y-here.player.y)}))
    .filter(item=>item.distance>35&&item.distance<220).sort((a,b)=>a.distance-b.distance)[0];
  if(!crate)throw new Error('No reachable test crate near the entry');
  const target=toScreen(win,crate.x,crate.y);aimAt(win,target.x,target.y);
  click(win,true);win.advanceTime(3000);const crateHit=stateOf(win);click(win,false);
  const remaining=crateHit.crates.find(item=>item.x===crate.x&&item.y===crate.y);
  if((remaining?.health||0)>=crate.health)throw new Error('Player bullets did not damage the targeted crate');

  // ---- reload
  tap(win,bindings.reload);
  if(!stateOf(win).player.reloading)throw new Error('Reload input did not begin a reload');
  win.advanceTime(12000);
  const reloaded=stateOf(win);
  if(reloaded.player.reloading||reloaded.player.ammo<=crateHit.player.ammo)throw new Error('Reload did not refill the current magazine');

  // ---- throwables: the smoke grenade launches, is consumed and blooms
  tap(win,bindings.throwableUse);
  const thrown=stateOf(win);
  if(thrown.throwables.projectiles!==1||thrown.throwables.counts.smoke!==0)throw new Error('Smoke throw did not launch and consume one grenade');
  let detonated=thrown;
  for(let step=0;step<24&&!detonated.throwables.effects.includes('smoke');step++){win.advanceTime(500);detonated=stateOf(win);}
  if(!detonated.throwables.effects.includes('smoke')||detonated.throwables.projectiles!==0)throw new Error('Smoke projectile did not detonate into a cloud');

  // ---- SHOVE: rebindable melee. A shove from behind an unaware enemy is a silent takedown; the dry-ammo fallback drops AMMO.
  if(bindings.shove!=='v'&&!bindings.shove)throw new Error('Shove has no key binding');
  const dead=win.__deadair,s=dead.state,p=s.player;
  for(const e of [...s.enemies])if(e.alive){e.hp=0;e.alive=false;e.body.setEnabled(false);}
  dead.spawnEnemy('gunner',p.x+26,p.y,0);
  const victim=s.enemies.find(e=>e.alive);
  Object.assign(victim,{posture:'guard',aware:false,face:{x:1,y:0}});if(victim.ai){victim.ai.aware=false;victim.ai.face={x:1,y:0};}
  for(const gi of s.weaponSlots){s.weaponAmmo[gi]=0;s.reserveAmmo[gi]=0;}
  const vs=toScreen(win,victim.x,victim.y);aimAt(win,vs.x,vs.y);win.advanceTime(20);Object.assign(victim,{aware:false,face:{x:1,y:0}});
  const killsBefore=s.kills;
  tap(win,bindings.shove);win.advanceTime(250);
  if(victim.alive||s.kills!==killsBefore+1)throw new Error('Shoving an unaware enemy from behind should be a silent takedown');
  if(!s.pickups.some(pk=>pk.kind==='ammo')&&stateOf(win).loadout.ammunition.every(entry=>entry.reserve===0))throw new Error('The kill after running dry should drop an AMMO pickup '+JSON.stringify({solid:s.solidMap[Math.floor(victim.y/32)]?.[Math.floor(victim.x/32)],at:[victim.x,victim.y],pk:s.pickups.map(k=>k.kind).join()}));
  win.advanceTime(1500);

  // ---- pause / focus handling
  win.dispatchEvent(new win.Event('blur'));
  const focusPaused=stateOf(win);
  if(!focusPaused.paused||focusPaused.timeScale!=='0.00')throw new Error('Losing browser focus did not pause game time');
  tap(win,'Escape');
  if(stateOf(win).paused)throw new Error('Returning from focus loss did not require and accept an explicit resume');
  tap(win,'Escape');
  if(!stateOf(win).paused||stateOf(win).timeScale!=='0.00')throw new Error('Manual pause did not stop game time');

  // ---- loadout dialog: two slots, focus trap, mod fitting
  tap(win,'Tab');
  const loadout=stateOf(win);
  if(!doc.querySelector('#loadout').classList.contains('show')||loadout.loadout.slots.length!==2||doc.querySelectorAll('#loadout-gun .loadout-weapon').length<2){
    throw new Error('Loadout did not show two weapon slots with the weapon list');
  }
  if(doc.activeElement!==doc.querySelector('#close-loadout'))throw new Error('Opening the loadout did not move keyboard focus into the dialog');
  const menuButtons=[...doc.querySelectorAll('#loadout button:not(:disabled)')].filter(button=>!button.closest('[hidden]'));
  const firstMenuButton=menuButtons[0],lastMenuButton=menuButtons.at(-1);
  doc.querySelector('#game canvas').focus();
  const escapedTab=new win.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});win.dispatchEvent(escapedTab);
  if(!escapedTab.defaultPrevented||doc.activeElement!==firstMenuButton)throw new Error('Tab did not pull keyboard focus back into the open loadout');
  lastMenuButton.focus();
  const forwardTab=new win.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});win.dispatchEvent(forwardTab);
  if(!forwardTab.defaultPrevented||doc.activeElement!==firstMenuButton)throw new Error('Tab did not wrap focus from the end of the loadout to its first control');
  firstMenuButton.focus();
  const backwardTab=new win.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true});win.dispatchEvent(backwardTab);
  if(!backwardTab.defaultPrevented||doc.activeElement!==lastMenuButton)throw new Error('Shift+Tab did not wrap focus from the start of the loadout to its last control');
  // one mod per gun, found on the floor and fitted on pickup (no buying, no tiers): the loadout lists them, the gun wears one
  if(doc.querySelectorAll('#mod-list .mod-row .nm').length<5)throw new Error('The loadout should list the behavior mods (suppressor, ricochet, incendiary, extended, quick-draw, long barrel)');
  win.__deadair.fitMod('extended');
  const attached=stateOf(win);
  if(attached.loadout.mod!=='extended'&&!attached.loadout.mods.includes('extended'))throw new Error('Fitting a mod did not install it on the carried gun');
  tap(win,'Escape');
  if(doc.querySelector('#loadout').classList.contains('show')||doc.activeElement!==doc.querySelector('#game canvas'))throw new Error('Closing the loadout did not return focus to the game');
  if(stateOf(win).paused)tap(win,'Escape');

  // ---- safehouse purchases persist across a reload; Vital Reserve raises the 3-HP baseline
  const originalProgress=window.localStorage.getItem(SAVE_KEY);
  try{
    window.localStorage.setItem(SAVE_KEY,JSON.stringify({...emptyProgress(),coins:95}));
    await reloadGame();
    let metaWin=frame.contentWindow,metaDoc=frame.contentDocument;
    await waitForBoot(metaDoc,metaWin);
    metaDoc.querySelector('#meta-button').click();
    metaDoc.querySelector('[data-act="tab"][data-id="upgrades"]').click();
    const buy=id=>{const button=metaDoc.querySelector(`#meta-list [data-upgrade="${id}"]`);if(!button||button.disabled)throw new Error(`${id} was not purchasable`);button.click();};
    const balance=()=>metaDoc.querySelector('#meta-balance').textContent;
    buy('runner');
    if(balance()!=='70'||!metaDoc.querySelector('#meta-list').textContent.includes('RUNNER’S LEGS · 1/3'))throw new Error('Safehouse purchase did not spend 25 coins and raise Runner’s Legs to level 1');
    buy('luckyfind');
    if(balance()!=='40'||!metaDoc.querySelector('#meta-list').textContent.includes('LUCKY FIND · 1/3'))throw new Error('Lucky Find did not spend coins and reach level 1');
    buy('vitalreserve');
    if(balance()!=='0'||!metaDoc.querySelector('#meta-list').textContent.includes('VITAL RESERVE · 1/3'))throw new Error('Vital Reserve did not spend 40 coins and reach level 1');
    await reloadGame();
    metaWin=frame.contentWindow;metaDoc=frame.contentDocument;
    await waitForBoot(metaDoc,metaWin);
    metaDoc.querySelector('#meta-button').click();
    metaDoc.querySelector('[data-act="tab"][data-id="upgrades"]').click();
    const listText=metaDoc.querySelector('#meta-list').textContent;
    if(balance()!=='0'||!listText.includes('RUNNER’S LEGS · 1/3')||!listText.includes('LUCKY FIND · 1/3')||!listText.includes('VITAL RESERVE · 1/3'))throw new Error('Safehouse upgrades did not survive a reload');
    metaDoc.querySelector('#close-meta').click();
    metaDoc.querySelector('#start-button').click();
    const upgradedRun=stateOf(metaWin);
    if(upgradedRun.player?.health!==4||upgradedRun.player?.maxHealth!==4)throw new Error(`Vital Reserve should raise the 3-health baseline to 4: ${JSON.stringify(upgradedRun.player)}`);
  }finally{
    if(originalProgress===null)window.localStorage.removeItem(SAVE_KEY);
    else window.localStorage.setItem(SAVE_KEY,originalProgress);
    await reloadGame();
    await waitForBoot(frame.contentDocument,frame.contentWindow);
  }

  report.className='pass';
  report.textContent=`PASS · seed ${seed} · ${initial.enemyCount} enemies / ${initial.pickupCount} pickups · 3 HP · time rule still ${idleScale}× / walk ${walking.timeScale}× / sprint ${sprinting.timeScale}× · shove takedown + dry ammo drop · loadout focus trap · safehouse persists`;
}

frame.addEventListener('load',()=>run().catch(error=>{
  report.className='fail';
  report.textContent=`FAIL\n${error.stack||error.message}`;
}),{once:true});
frame.src=GAME_URL;
