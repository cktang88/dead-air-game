// DEAD AIR broadcast ambience: room tone per theme, distant machinery, enemy radio chatter (garbled vocoder-ish
// bleeps, never words) that cuts with a squelch when that enemy dies, and static bursts on door crossings.
// Everything is synthesized. It rides the shared SFX bus (slow-mo low-pass) and the music engine's tape-detune bus,
// so when the world slows the hum, chatter and machinery sag in pitch together with the score.

import {getAudioRuntime} from './audio.js';
import {getMusicEngine} from './music.js';
import {ambienceThemeFor,chatterPlan,makeRng,nextMachineryEvent} from './music-core.js';

const TONE_LEVEL={server:.02,furnace:.032,cold:.02};
const MAX_CHATTERS=2,CHATTER_RANGE=780;

let A=null;

function noiseBuffer(ctx,brown,seconds=3){
  const n=Math.floor(ctx.sampleRate*seconds),buf=ctx.createBuffer(1,n,ctx.sampleRate),d=buf.getChannelData(0),r=makeRng(brown?11:13);
  let last=0;
  for(let i=0;i<n;i++){const w=r()*2-1;if(brown){last=(last+.02*w)/1.02;d[i]=last*3.5;}else d[i]=w;}
  return buf;
}

function init(){
  const engine=getMusicEngine(),rt=getAudioRuntime(false);
  if(!engine||!rt||!rt.sfxBus)return null;
  const ctx=rt.context,bus=ctx.createGain();bus.gain.value=1;bus.connect(rt.sfxBus);
  A={ctx,engine,bus,rng:makeRng(Date.now()&0xffff),white:noiseBuffer(ctx,false),brown:noiseBuffer(ctx,true),
    tones:{},theme:null,level:0,chat:new Map(),cool:new Map(),machine:3+Math.random()*4,lastRoom:null,lastActive:false,doorAt:-9,stats:{chatters:0,cuts:0,statics:0,machinery:0}};
  buildTones();
  if(typeof window!=='undefined'&&/[?&]debug\b/.test(location.search))window.__ambience={stats:getAmbienceStats,state:()=>A,chatter:(id,pan,vol)=>startChatter(id,pan,vol)};
  return A;
}

const tape=node=>{try{A.engine.detuneSrc.connect(node.detune);}catch{/* unsupported */}};
function osc(type,hz,out,cents=0){const o=A.ctx.createOscillator();o.type=type;o.frequency.value=hz;o.detune.value=cents;tape(o);o.connect(out);o.start();return o;}
function loopNoise(brown,out){const s=A.ctx.createBufferSource();s.buffer=brown?A.brown:A.white;s.loop=true;s.loopStart=0;tape(s);s.connect(out);s.start(0,Math.random()*2);return s;}
function filt(type,hz,q=.7){const f=A.ctx.createBiquadFilter();f.type=type;f.frequency.value=hz;f.Q.value=q;return f;}
function gain(v,out){const g=A.ctx.createGain();g.gain.value=v;if(out)g.connect(out);return g;}

function buildTones(){
  const ctx=A.ctx;
  const mk=name=>{const g=gain(0,A.bus);A.tones[name]=g;return g;};
  { // server room: mains hum + fan whisper
    const g=mk('server'),lp=filt('lowpass',420);lp.connect(g);
    osc('sine',60,gain(.5,lp));osc('sine',120.6,gain(.26,lp));osc('sine',181.5,gain(.1,lp),4);osc('sawtooth',59.6,gain(.05,lp));
    const fan=filt('bandpass',2400,.9);loopNoise(false,fan);fan.connect(gain(.05,g));
  }
  { // furnace: low rumble with a slow breathing swell
    const g=mk('furnace'),a=filt('lowpass',170);loopNoise(true,a);a.connect(gain(1,g));
    const b=filt('lowpass',650),swell=gain(.5,g);loopNoise(true,b);b.connect(swell);
    const lfo=ctx.createOscillator();lfo.frequency.value=.11;const depth=gain(.35,swell.gain);lfo.connect(depth);lfo.start();
    const lfo2=ctx.createOscillator();lfo2.frequency.value=.07;const d2=gain(260,b.frequency);lfo2.connect(d2);lfo2.start();
  }
  { // cold storage: two beating sines and a thin refrigerated hiss
    const g=mk('cold'),lp=filt('lowpass',520);lp.connect(g);
    osc('sine',92,gain(.5,lp));osc('sine',93.1,gain(.5,lp));osc('sine',138.3,gain(.18,lp),-3);
    const air=filt('highpass',4800,.5);loopNoise(false,air);air.connect(gain(.03,g));
  }
}

function setTheme(theme,active){
  const level=active?1:0,now=A.ctx.currentTime;
  for(const [name,g] of Object.entries(A.tones)){
    const target=active&&name===theme?TONE_LEVEL[name]:0;
    if(g._target!==target){g.gain.setTargetAtTime(target,now,.9);g._target=target;}
  }
  A.theme=theme;A.level=level;
}

/* ------------------------------------------------------------ one-shots */

function spatial(pan){
  const g=A.ctx.createGain();
  if(A.ctx.createStereoPanner&&pan){const p=A.ctx.createStereoPanner();p.pan.value=Math.max(-1,Math.min(1,pan));g.connect(p);p.connect(A.bus);}else g.connect(A.bus);
  return g;
}
function burst(t,dur,{type='bandpass',hz=1800,q=.6,vol=.1,pan=0,chop=0,buf=null}={}){
  const src=A.ctx.createBufferSource();src.buffer=buf||A.white;tape(src);
  const f=filt(type,hz,q),g=A.ctx.createGain(),out=spatial(pan);
  g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(vol,t+.004);
  if(chop){for(let s=t+.01;s<t+dur-.01;s+=chop)g.gain.setValueAtTime(vol*(.15+A.rng()*.85),s);}
  g.gain.setValueAtTime(vol,Math.max(t+.005,t+dur-.02));g.gain.linearRampToValueAtTime(.0001,t+dur);
  src.connect(f);f.connect(g);g.connect(out);src.start(t,A.rng()*2,dur+.05);
}

/** Radio static burst, e.g. when you cross a door. */
export function ambienceStatic(vol=.16,pan=0){
  if(!A||A.ctx.state!=='running')return;
  const t=A.ctx.currentTime+.01;
  burst(t,.26,{hz:2200,q:.5,vol,pan,chop:.012});
  burst(t,.26,{type:'highpass',hz:3500,vol:vol*.5,chop:.02});
  burst(t+.26,.05,{hz:2600,q:1.2,vol:vol*.9});
  A.stats.statics++;
}

function machinery(type){
  const t=A.ctx.currentTime+.02,pan=A.rng()*1.6-.8,out=spatial(pan),dist=filt('lowpass',type==='clank'?1700:900);dist.connect(out);
  const env=(v,dur,att=.01)=>{const g=A.ctx.createGain();g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(v,t+att);g.gain.exponentialRampToValueAtTime(.0001,t+dur);g.connect(dist);return g;};
  const tone=(o,dur)=>{tape(o);o.start(t);o.stop(t+dur+.05);};
  if(type==='thud'){
    const g=env(.5,.8,.02),o=A.ctx.createOscillator();o.frequency.setValueAtTime(72,t);o.frequency.exponentialRampToValueAtTime(27,t+.7);o.connect(g);tone(o,.8);
    burst(t,.5,{type:'lowpass',hz:240,vol:.3,pan,buf:A.brown});
  }else if(type==='clank'){
    const base=.8+A.rng()*.5;
    [310,833,1470,2210].forEach((hz,i)=>{const o=A.ctx.createOscillator();o.frequency.value=hz*base;const g=env(.06/(i+1),.9-i*.15,.003);o.connect(g);tone(o,.9);});
  }else if(type==='pipe'){
    burst(t,1.5,{hz:420,q:6,vol:.07,pan});
  }else{
    const g=env(.06,2.2,.7),o=A.ctx.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(52,t);o.frequency.linearRampToValueAtTime(70,t+2.2);o.connect(g);tone(o,2.2);
  }
  A.stats.machinery++;
}

/* ------------------------------------------------------------ radio chatter */

function startChatter(id,pan,vol){
  const ctx=A.ctx,plan=chatterPlan(A.rng),t0=ctx.currentTime+.03;
  const out=A.ctx.createGain();out.gain.value=vol;
  const spat=spatial(pan);out.connect(spat);
  const crush=ctx.createWaveShaper(),curve=new Float32Array(256);
  for(let i=0;i<256;i++){const x=i/127.5-1;curve[i]=Math.round(x*5)/5*.6+x*.4;}
  crush.curve=curve;
  const hp=filt('highpass',480),lp=filt('lowpass',3200);crush.connect(hp);hp.connect(lp);lp.connect(out);
  const gate=gain(0,crush);
  const carrier=ctx.createOscillator();carrier.type='sawtooth';carrier.frequency.value=plan.pitch;tape(carrier);
  const f1=filt('bandpass',500,7),f2=filt('bandpass',1500,9),sum=gain(5,gate);
  carrier.connect(f1);carrier.connect(f2);
  const breath=ctx.createBufferSource();breath.buffer=A.white;tape(breath);const bf=filt('bandpass',1700,1.5);breath.connect(bf);
  f1.connect(sum);f2.connect(gain(.7,sum));bf.connect(gain(.25,sum));
  for(const s of plan.syllables){
    const a=t0+s.t;
    gate.gain.setValueAtTime(0,a);gate.gain.linearRampToValueAtTime(s.vol,a+.008);gate.gain.setValueAtTime(s.vol,a+s.dur-.012);gate.gain.linearRampToValueAtTime(0,a+s.dur);
    f1.frequency.setValueAtTime(s.f1,a);f2.frequency.setValueAtTime(s.f2,a);
    carrier.frequency.setValueAtTime(plan.pitch*(.85+A.rng()*.35),a);
  }
  const end=t0+plan.total;
  carrier.start(t0);carrier.stop(end+.3);breath.start(t0,A.rng()*2,plan.total+.3);
  burst(t0-.02,.04,{hz:2400,q:1,vol:vol*.5,pan}); // key-up click
  burst(end,.07,{hz:2600,q:1,vol:vol*.7,pan});    // key-down squelch
  const voice={id,end,out,carrier,breath,pan,vol};
  A.chat.set(id,voice);A.stats.chatters++;
  return voice;
}

/** Cut an enemy's radio with a squelch (call when it dies). */
export function ambienceCutChatter(id){
  if(!A)return;
  const v=A.chat.get(id);if(!v)return;
  const n=A.ctx.currentTime;
  v.out.gain.cancelScheduledValues(n);v.out.gain.setTargetAtTime(0,n,.003);
  try{v.carrier.stop(n+.05);v.breath.stop(n+.05);}catch{/* already stopped */}
  burst(n+.005,.09,{hz:2300,q:.7,vol:Math.min(.3,v.vol*1.6),pan:v.pan,chop:.01});
  A.chat.delete(v.id);A.stats.cuts++;
}

export const getAmbienceStats=()=>A?{...A.stats,theme:A.theme,chatting:A.chat.size}:null;

/**
 * One call per frame from the game loop. Reads plain game state: room theme, door crossings, enemy radios.
 * Safe to call before audio is unlocked (does nothing until the music engine exists).
 */
export function ambienceSync(state,dt=1/60){
  if(!state)return;
  if(!A&&!init())return;
  const running=A.ctx.state==='running',playing=state.mode==='play'&&!state.paused&&running;
  const room=state.rooms?.[state.currentRoom],theme=ambienceThemeFor(room?.theme?.floor);
  if(theme!==A.theme||playing!==A.lastActive)setTheme(theme,state.mode==='play');
  A.lastActive=playing;
  if(state.mode!=='play'){for(const id of [...A.chat.keys()])ambienceCutChatter(id);A.lastRoom=null;return;}
  if(A.lastRoom!==null&&state.currentRoom!==A.lastRoom&&playing)ambienceStatic();
  A.lastRoom=state.currentRoom;
  if(!playing)return;
  A.machine-=dt;
  if(A.machine<=0){const ev=nextMachineryEvent(A.rng);A.machine=ev.delay;machinery(ev.type);}
  const p=state.player;if(!p)return;
  const now=A.ctx.currentTime;
  for(const [id,v] of [...A.chat])if(v.end<now){A.chat.delete(id);}
  for(const e of state.enemies||[]){
    if(!e.alive){if(A.chat.has(e.id))ambienceCutChatter(e.id);continue;}
    const d=Math.hypot(e.x-p.x,e.y-p.y);if(d>CHATTER_RANGE)continue;
    const live=A.chat.get(e.id);
    if(live){live.pan=(e.x-p.x)/480;continue;}
    let cd=A.cool.get(e.id);if(cd===undefined){cd=1+A.rng()*7;}
    cd-=dt;
    if(cd<=0&&A.chat.size<MAX_CHATTERS&&!e.aware){
      const vol=.14*Math.pow(Math.max(0,1-d/CHATTER_RANGE),1.5);
      if(vol>.01)startChatter(e.id,Math.max(-1,Math.min(1,(e.x-p.x)/480)),vol);
      cd=7+A.rng()*10;
    }
    A.cool.set(e.id,cd);
  }
}
