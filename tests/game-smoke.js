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
    frame.src='../index.html?browser-smoke';
  });
}

async function run(){
  const win=frame.contentWindow,doc=frame.contentDocument;
  await waitForBoot(doc,win);
  const savedCoins=doc.querySelector('#meta-balance').textContent;
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

  press(win,movementKey,'keydown');
  win.advanceTime(500);
  press(win,movementKey,'keyup');
  const moved=stateOf(win);
  if(moved.player.x<=initial.player.x+20)throw new Error('Right input did not move the player');
  if(moved.timeScale!=='1.00')throw new Error(`Movement should run at 1×, got ${moved.timeScale}×`);

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

  press(win,'Escape','keydown');
  press(win,'Escape','keyup');
  if(stateOf(win).timeScale!=='0.00')throw new Error('Pause did not stop game time');
  press(win,'Tab','keydown');
  press(win,'Tab','keyup');
  const loadout=stateOf(win);
  if(!doc.querySelector('#loadout').classList.contains('show')||loadout.loadout.slots.length!==2||doc.querySelectorAll('#loadout-gun .loadout-weapon').length<2){
    throw new Error('Loadout did not show two weapon slots with the weapon list');
  }
  const extended=doc.querySelector('#mod-list [data-mod="extended"]');
  if(!extended||extended.disabled)throw new Error('Extended magazine was not available at the starting scrap budget');
  extended.click();
  const attached=stateOf(win);
  if(!attached.loadout.attachments.includes('extended'))throw new Error('Purchased attachment did not change the active weapon');
  press(win,'Tab','keydown');
  press(win,'Tab','keyup');
  if(doc.querySelector('#loadout').classList.contains('show'))throw new Error('Tab did not close the loadout');

  const originalProgress=window.localStorage.getItem(SAVE_KEY);
  try{
    const fixture={...emptyProgress(),coins:25};
    window.localStorage.setItem(SAVE_KEY,JSON.stringify(fixture));
    await reloadGame();
    let metaWin=frame.contentWindow,metaDoc=frame.contentDocument;
    await waitForBoot(metaDoc,metaWin);
    metaDoc.querySelector('#meta-button').click();
    const runner=metaDoc.querySelector('#meta-list [data-upgrade="runner"]');
    if(!runner||runner.disabled)throw new Error('Runner upgrade was not available for the 25-coin fixture');
    runner.click();
    if(metaDoc.querySelector('#meta-balance').textContent!=='0'||!metaDoc.querySelector('#meta-list').textContent.includes('RUNNER’S LEGS · 1/3')){
      throw new Error('Safehouse purchase did not spend coins and raise Runner’s Legs to level 1');
    }
    await reloadGame();
    metaWin=frame.contentWindow;metaDoc=frame.contentDocument;
    await waitForBoot(metaDoc,metaWin);
    metaDoc.querySelector('#meta-button').click();
    if(metaDoc.querySelector('#meta-balance').textContent!=='0'||!metaDoc.querySelector('#meta-list').textContent.includes('RUNNER’S LEGS · 1/3')){
      throw new Error('Safehouse upgrade and remaining coins did not survive a reload');
    }
  }finally{
    if(originalProgress===null)window.localStorage.removeItem(SAVE_KEY);
    else window.localStorage.setItem(SAVE_KEY,originalProgress);
    await reloadGame();
    await waitForBoot(frame.contentDocument,frame.contentWindow);
  }

  report.className='pass';
  report.textContent=`PASS · seed ${seed} · ${initial.enemyCount} enemies / ${initial.pickupCount} pickups · move Δx ${moved.player.x-initial.player.x} at ${moved.timeScale}× · fire ${fired.timeScale}× · crate ${crate.health} → ${crateHealthAfter} · reload ${crateHit.player.ammo} → ${reloaded.player.ammo} · frag ${thrown.throwables.counts.frag} → detonated · pause · loadout ${loadout.loadout.slots.length} slots · extended magazine · safehouse upgrade survives reload · original save restored (${savedCoins} coins)`;
}

frame.addEventListener('load',()=>run().catch(error=>{
  report.className='fail';
  report.textContent=`FAIL\n${error.stack||error.message}`;
}),{once:true});
frame.src='../index.html?browser-smoke';
