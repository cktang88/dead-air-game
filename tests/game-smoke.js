import {DEFAULT_KEY_BINDINGS,loadKeyBindings} from '../keybindings.js';
import {emptyProgress,SAVE_KEY} from '../progression.js';

const report=document.querySelector('#result');
const frame=document.querySelector('#game');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const stateOf=win=>JSON.parse(win.render_game_to_text());

async function waitForBoot(doc,win){
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){
    if(!doc.querySelector('#start-button')?.disabled&&typeof win.advanceTime==='function'&&typeof win.render_game_to_text==='function')return;
    await wait(50);
  }
  throw new Error('Game startup did not enable the start button within 30 seconds');
}

function press(win,key,type){
  win.dispatchEvent(new win.KeyboardEvent(type,{key,bubbles:true,cancelable:true}));
}

function reloadGame(){
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Game frame did not reload')),30000);
    frame.addEventListener('load',()=>{clearTimeout(timeout);resolve();},{once:true});
    frame.src='../index.html?browser-smoke&v=burst-3';
  });
}

async function run(){
  const win=frame.contentWindow,doc=frame.contentDocument;
  await waitForBoot(doc,win);
  const savedCoins=doc.querySelector('#meta-balance').textContent;
  doc.querySelector('#meta-button').click();
  if(doc.querySelector('#meta-panel').hidden||doc.activeElement!==doc.querySelector('#close-meta'))throw new Error('Opening safehouse upgrades did not focus its close control');
  const metaButtons=[...doc.querySelectorAll('#meta-panel button:not(:disabled)')].filter(button=>!button.closest('[hidden]'));
  const firstMetaButton=metaButtons[0],lastMetaButton=metaButtons.at(-1);
  lastMetaButton.focus();
  const metaTab=new win.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});win.dispatchEvent(metaTab);
  if(!metaTab.defaultPrevented||doc.activeElement!==firstMetaButton)throw new Error('Tab did not stay inside the safehouse dialog');
  doc.querySelector('#close-meta').click();
  if(!doc.querySelector('#meta-panel').hidden||doc.activeElement!==doc.querySelector('#meta-button'))throw new Error('Closing safehouse upgrades did not return focus to its opener');
  const seed=213838321;
  const bindings=loadKeyBindings(win.localStorage);
  const movementKey=bindings.moveRight===DEFAULT_KEY_BINDINGS.moveRight&&!Object.values(bindings).includes('arrowright')?'ArrowRight':bindings.moveRight;
  const seedInput=doc.querySelector('#seed-input');
  seedInput.value=String(seed);
  doc.querySelector('#start-button').click();
  const initial=stateOf(win);
  if(initial.mode!=='play'||initial.seed!==seed||!initial.player)throw new Error('Seeded run did not start with a player');
  if(initial.enemyCount!==initial.enemies.length||initial.pickupCount!==initial.pickups.length){
    throw new Error('Gameplay snapshot omitted enemies or pickups from its reported counts');
  }
  if(initial.enemyCount<=12||initial.pickupCount<=8){
    throw new Error('Seeded snapshot no longer exercises the former enemy and pickup output limits');
  }
  const modDrops=initial.pickups.filter(pickup=>pickup.type==='mod');
  if(!modDrops.length||modDrops.some(pickup=>!['common','uncommon','rare','prototype'].includes(pickup.rarity))){
    throw new Error('Generated attachment drops did not carry a visible rarity tier');
  }
  if(initial.roomIndex!==0||initial.roomProgress?.[0]?.name!==initial.room||
    initial.roomProgress.reduce((count,room)=>count+room.livingEnemies,0)!==initial.enemyCount||
    initial.enemies.some(enemy=>!Number.isInteger(enemy.roomIndex))){
    throw new Error('Seeded snapshot lost room ownership for a live enemy');
  }
  const roomNames=initial.roomProgress.map(room=>room.name);
  if(new Set(roomNames).size!==roomNames.length){
    throw new Error(`Generated floor reused a room name: ${JSON.stringify(roomNames)}`);
  }

  press(win,movementKey,'keydown');
  win.advanceTime(500);
  const moving=stateOf(win);
  if(moving.timeScale!=='1.00')throw new Error(`Movement should run at 1×, got ${moving.timeScale}×`);
  press(win,movementKey,'keyup');
  const moved=stateOf(win);
  if(moved.player.x<=initial.player.x+20)throw new Error('Right input did not move the player');

  win.dispatchEvent(new win.MouseEvent('mousemove',{clientX:win.innerWidth/2+100,clientY:win.innerHeight/2,bubbles:true}));
  win.dispatchEvent(new win.MouseEvent('mousedown',{button:0,bubbles:true}));
  win.advanceTime(250);
  const fired=stateOf(win);
  win.dispatchEvent(new win.MouseEvent('mouseup',{button:0,bubbles:true}));
  if(fired.player.ammo>=moved.player.ammo)throw new Error('Firing did not consume ammunition');
  if(!(Number(fired.timeScale)>Number(initial.timeScale)&&Number(fired.timeScale)<1))throw new Error(`Firing should keep a blended tempo, got ${fired.timeScale}×`);

  const crate=fired.crates.map(item=>({...item,distance:Math.hypot(item.x-fired.player.x,item.y-fired.player.y)}))
    .filter(item=>item.distance>35&&item.distance<220).sort((a,b)=>a.distance-b.distance)[0];
  if(!crate)throw new Error('No reachable test crate near the entry');
  const aimScale=win.innerHeight/520;
  win.dispatchEvent(new win.MouseEvent('mousemove',{clientX:win.innerWidth/2+(crate.x-fired.player.x)*aimScale,clientY:win.innerHeight/2+(crate.y-fired.player.y)*aimScale,bubbles:true}));
  win.dispatchEvent(new win.MouseEvent('mousedown',{button:0,bubbles:true}));
  win.advanceTime(2000);
  const crateHit=stateOf(win);
  win.dispatchEvent(new win.MouseEvent('mouseup',{button:0,bubbles:true}));
  const remainingCrate=crateHit.crates.find(item=>item.x===crate.x&&item.y===crate.y);
  const crateHealthAfter=remainingCrate?.health||0;
  if(crateHealthAfter>=crate.health)throw new Error('Player bullets did not damage the targeted crate');

  press(win,bindings.reload,'keydown');
  press(win,bindings.reload,'keyup');
  const reloading=stateOf(win);
  if(!reloading.player.reloading)throw new Error('Reload input did not begin a reload');
  win.advanceTime(12000);
  const reloaded=stateOf(win);
  if(reloaded.player.reloading||reloaded.player.ammo<=crateHit.player.ammo)throw new Error('Reload did not refill the current magazine');

  press(win,bindings.throwableUse,'keydown');
  press(win,bindings.throwableUse,'keyup');
  const thrown=stateOf(win);
  if(thrown.throwables.projectiles!==1||thrown.throwables.counts.frag!==1)throw new Error('Frag throw did not launch and consume one grenade');
  let detonated=thrown;
  for(let step=0;step<20&&!detonated.throwables.effects.includes('frag');step++){
    win.advanceTime(500);
    detonated=stateOf(win);
  }
  if(!detonated.throwables.effects.includes('frag')||detonated.throwables.projectiles!==0)throw new Error('Frag projectile did not detonate into an effect');

  win.dispatchEvent(new win.Event('blur'));
  const focusPaused=stateOf(win);
  if(!focusPaused.paused||focusPaused.timeScale!=='0.00')throw new Error('Losing browser focus did not pause game time');
  press(win,'Escape','keydown');
  press(win,'Escape','keyup');
  if(stateOf(win).paused)throw new Error('Returning from focus loss did not require and accept an explicit resume');
  press(win,'Escape','keydown');
  press(win,'Escape','keyup');
  if(!stateOf(win).paused||stateOf(win).timeScale!=='0.00')throw new Error('Manual pause did not stop game time');
  press(win,'Tab','keydown');
  press(win,'Tab','keyup');
  let loadout=stateOf(win);
  if(!doc.querySelector('#loadout').classList.contains('show')||loadout.loadout.slots.length!==2||doc.querySelectorAll('#loadout-gun .loadout-weapon').length<2){
    throw new Error('Loadout did not show two weapon slots with the weapon list');
  }
  if(doc.activeElement!==doc.querySelector('#close-loadout'))throw new Error('Opening the loadout did not move keyboard focus into the dialog');
  const menuButtons=[...doc.querySelectorAll('#loadout button:not(:disabled)')].filter(button=>!button.closest('[hidden]'));
  const firstMenuButton=menuButtons[0],lastMenuButton=menuButtons.at(-1);
  doc.querySelector('#game canvas').focus();
  const escapedTab=new win.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});win.dispatchEvent(escapedTab);
  if(!escapedTab.defaultPrevented||doc.activeElement!==firstMenuButton)throw new Error('Tab did not pull keyboard focus back into the open workbench');
  lastMenuButton.focus();
  const forwardTab=new win.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});win.dispatchEvent(forwardTab);
  if(!forwardTab.defaultPrevented||doc.activeElement!==firstMenuButton)throw new Error('Tab did not wrap focus from the end of the loadout to its first control');
  firstMenuButton.focus();
  const backwardTab=new win.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true});win.dispatchEvent(backwardTab);
  if(!backwardTab.defaultPrevented||doc.activeElement!==lastMenuButton)throw new Error('Shift+Tab did not wrap focus from the start of the loadout to its last control');
  let kiteSlot=loadout.loadout.slots.indexOf('KITE BURST');
  if(kiteSlot<0){
    const kiteButton=doc.querySelector('#loadout-gun [data-gun="4"]');
    if(!kiteButton||kiteButton.disabled)throw new Error('KITE BURST was not available within the starting carry limit');
    kiteButton.click();
    if(doc.querySelector('#loadout-confirm').hidden)throw new Error('KITE BURST replacement did not show its confirmation preview');
    doc.querySelector('#loadout-accept').click();
  }
  let burstState=stateOf(win);
  kiteSlot=burstState.loadout.slots.indexOf('KITE BURST');
  if(kiteSlot<0)throw new Error('Confirmed loadout change did not add KITE BURST to the rig');
  press(win,'Escape','keydown');press(win,'Escape','keyup');
  if(doc.querySelector('#loadout').classList.contains('show')||doc.activeElement!==doc.querySelector('#game canvas'))throw new Error('Closing the loadout did not return focus to the game');
  burstState=stateOf(win);
  if(burstState.paused){press(win,'Escape','keydown');press(win,'Escape','keyup');burstState=stateOf(win);}
  if(burstState.loadout.activeSlot!==kiteSlot){
    const weaponAction=['weaponOne','weaponTwo','weaponThree'][kiteSlot];
    press(win,bindings[weaponAction],'keydown');press(win,bindings[weaponAction],'keyup');
  }
  burstState=stateOf(win);
  if(burstState.player.weapon!=='KITE BURST'||burstState.player.ammo<3)throw new Error('KITE BURST did not become the active weapon with a usable magazine');
  const burstAmmo=burstState.player.ammo;
  win.dispatchEvent(new win.MouseEvent('mousedown',{button:0,bubbles:true}));
  win.dispatchEvent(new win.MouseEvent('mouseup',{button:0,bubbles:true}));
  burstState=stateOf(win);
  if(burstState.player.ammo!==burstAmmo-1||burstState.burstShotsRemaining!==2||burstState.timeScale!=='0.42'){
    throw new Error(`A single KITE BURST click did not start a two-round committed burst at blended tempo: before ${JSON.stringify({burstAmmo,weapon:burstState.player.weapon,ammo:burstState.player.ammo,queued:burstState.burstShotsRemaining,timeScale:burstState.timeScale,mode:burstState.mode,paused:burstState.paused})}`);
  }
  press(win,bindings.reload,'keydown');press(win,bindings.reload,'keyup');
  if(stateOf(win).player.reloading)throw new Error('Reload interrupted a committed KITE BURST sequence');
  win.advanceTime(500);
  burstState=stateOf(win);
  if(burstState.player.ammo!==burstAmmo-3||burstState.burstShotsRemaining!==0){
    throw new Error(`KITE BURST did not emit and spend three spaced rounds after trigger release: ${JSON.stringify(burstState.player)}`);
  }
  press(win,'Tab','keydown');press(win,'Tab','keyup');
  loadout=stateOf(win);
  const extended=doc.querySelector('#mod-list [data-mod="extended"]');
  if(!extended||extended.disabled)throw new Error('Extended magazine was not available at the starting scrap budget');
  extended.click();
  const attached=stateOf(win);
  if(!attached.loadout.attachments.includes('extended')||attached.loadout.attachmentTiers.extended!=='common')throw new Error('Purchased attachment did not install and retain its common tier');
  press(win,'Escape','keydown');
  press(win,'Escape','keyup');
  if(doc.querySelector('#loadout').classList.contains('show'))throw new Error('Escape did not close the loadout');

  const originalProgress=window.localStorage.getItem(SAVE_KEY);
  try{
    const fixture={...emptyProgress(),coins:55};
    window.localStorage.setItem(SAVE_KEY,JSON.stringify(fixture));
    await reloadGame();
    let metaWin=frame.contentWindow,metaDoc=frame.contentDocument;
    await waitForBoot(metaDoc,metaWin);
    metaDoc.querySelector('#meta-button').click();
    const runner=metaDoc.querySelector('#meta-list [data-upgrade="runner"]');
    if(!runner||runner.disabled)throw new Error('Runner upgrade was not available for the 25-coin fixture');
    runner.click();
    if(metaDoc.querySelector('#meta-balance').textContent!=='30'||!metaDoc.querySelector('#meta-list').textContent.includes('RUNNER’S LEGS · 1/3')){
      throw new Error('Safehouse purchase did not spend 25 coins and raise Runner’s Legs to level 1');
    }
    const luckyFind=metaDoc.querySelector('#meta-list [data-upgrade="luckyfind"]');
    if(!luckyFind||luckyFind.disabled)throw new Error('Lucky Find was not available for the 30-coin balance');
    luckyFind.click();
    if(metaDoc.querySelector('#meta-balance').textContent!=='0'||!metaDoc.querySelector('#meta-list').textContent.includes('LUCKY FIND · 1/3')){
      throw new Error('Lucky Find did not spend coins and reach level 1');
    }
    await reloadGame();
    metaWin=frame.contentWindow;metaDoc=frame.contentDocument;
    await waitForBoot(metaDoc,metaWin);
    metaDoc.querySelector('#meta-button').click();
    if(metaDoc.querySelector('#meta-balance').textContent!=='0'||!metaDoc.querySelector('#meta-list').textContent.includes('RUNNER’S LEGS · 1/3')||!metaDoc.querySelector('#meta-list').textContent.includes('LUCKY FIND · 1/3')){
      throw new Error('Safehouse Runner and Lucky Find upgrades did not survive a reload');
    }
  }finally{
    if(originalProgress===null)window.localStorage.removeItem(SAVE_KEY);
    else window.localStorage.setItem(SAVE_KEY,originalProgress);
    await reloadGame();
    await waitForBoot(frame.contentDocument,frame.contentWindow);
  }

  report.className='pass';
  report.textContent=`PASS · seed ${seed} · ${initial.enemyCount} enemies / ${initial.pickupCount} pickups · rarity-tagged mods · move Δx ${moved.player.x-initial.player.x} at ${moving.timeScale}× · fire ${fired.timeScale}× · crate ${crate.health} → ${crateHealthAfter} · reload ${crateHit.player.ammo} → ${reloaded.player.ammo} · KITE BURST ${burstAmmo} → ${burstState.player.ammo} after one released trigger · frag ${thrown.throwables.counts.frag} → detonated · focus-loss and manual pause · ${loadout.loadout.slots.length}-slot loadout · tiered extended magazine · Runner and Lucky Find persist after reload · original save restored (${savedCoins} coins)`;
}

frame.addEventListener('load',()=>run().catch(error=>{
  report.className='fail';
  report.textContent=`FAIL\n${error.stack||error.message}`;
}),{once:true});
frame.src='../index.html?browser-smoke&v=burst-3';
