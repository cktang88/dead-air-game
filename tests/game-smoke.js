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

async function run(){
  const win=frame.contentWindow,doc=frame.contentDocument;
  await waitForBoot(doc,win);
  const savedCoins=doc.querySelector('#meta-balance').textContent;
  const seed=213838321;
  const seedInput=doc.querySelector('#seed-input');
  seedInput.value=String(seed);
  doc.querySelector('#start-button').click();
  const initial=stateOf(win);
  if(initial.mode!=='play'||initial.seed!==seed||!initial.player)throw new Error('Seeded run did not start with a player');

  press(win,'d','keydown');
  win.advanceTime(500);
  press(win,'d','keyup');
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

  press(win,'Escape','keydown');
  press(win,'Escape','keyup');
  report.className='pass';
  report.textContent=`PASS · seed ${seed} · start ${initial.mode} · move Δx ${moved.player.x-initial.player.x} at ${moved.timeScale}× · fire ${fired.timeScale}× · ammo ${moved.player.ammo} → ${fired.player.ammo} · paused · saved coins ${savedCoins}`;
}

frame.addEventListener('load',()=>run().catch(error=>{
  report.className='fail';
  report.textContent=`FAIL\n${error.stack||error.message}`;
}),{once:true});
frame.src='../index.html?browser-smoke';
