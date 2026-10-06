export const AUDIO_SETTINGS_KEY='dead-air.audio.v1';
export const DEFAULT_MASTER_VOLUME=.65;
const AUDIO_SETTINGS_VERSION=1;

export function parseAudioSettings(serialized){
  if(typeof serialized!=='string')return {version:AUDIO_SETTINGS_VERSION,volume:DEFAULT_MASTER_VOLUME,muted:false};
  try{
    const saved=JSON.parse(serialized);
    if(saved?.version!==AUDIO_SETTINGS_VERSION||!Number.isFinite(saved.volume))return {version:AUDIO_SETTINGS_VERSION,volume:DEFAULT_MASTER_VOLUME,muted:false};
    return {version:AUDIO_SETTINGS_VERSION,volume:Math.max(0,Math.min(1,saved.volume)),muted:saved.muted===true};
  }catch{return {version:AUDIO_SETTINGS_VERSION,volume:DEFAULT_MASTER_VOLUME,muted:false};}
}

export function serializeAudioSettings(volume,isMuted=false){
  const bounded=Number.isFinite(volume)?Math.max(0,Math.min(1,volume)):DEFAULT_MASTER_VOLUME;
  return JSON.stringify({version:AUDIO_SETTINGS_VERSION,volume:bounded,muted:isMuted===true});
}

let audioContext=null,masterGain=null,masterVolume=DEFAULT_MASTER_VOLUME,muted=false,settingsStorage=null,lastTellAt=-Infinity;

export function loadAudioSettings(storage){
  settingsStorage=storage;
  try{const settings=parseAudioSettings(storage.getItem(AUDIO_SETTINGS_KEY));masterVolume=settings.volume;muted=settings.muted;}
  catch{masterVolume=DEFAULT_MASTER_VOLUME;muted=false;}
  if(masterGain)masterGain.gain.setTargetAtTime(muted?0:masterVolume,audioContext.currentTime,.02);
  return masterVolume;
}

export function getMasterVolume(){return masterVolume;}

export function setMasterVolume(volume){
  masterVolume=Number.isFinite(volume)?Math.max(0,Math.min(1,volume)):DEFAULT_MASTER_VOLUME;
  if(masterGain)masterGain.gain.setTargetAtTime(muted?0:masterVolume,audioContext.currentTime,.02);
  try{settingsStorage?.setItem(AUDIO_SETTINGS_KEY,serializeAudioSettings(masterVolume,muted));return true;}
  catch{return false;}
}

export function isAudioMuted(){return muted;}

export function setAudioMuted(value){
  muted=value===true;
  if(masterGain)masterGain.gain.setTargetAtTime(muted?0:masterVolume,audioContext.currentTime,.02);
  try{settingsStorage?.setItem(AUDIO_SETTINGS_KEY,serializeAudioSettings(masterVolume,muted));return true;}
  catch{return false;}
}


/* ---------------------------------------------------------------- pure helpers */

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

/** Distance (px) -> linear gain. 1 at the listener, 0 at maxDistance, gentle curve. */
export function distanceGain(distance,maxDistance=720){
  if(!Number.isFinite(distance)||distance<=0)return 1;
  return Math.pow(clamp(1-distance/maxDistance,0,1),1.6);
}

/** Horizontal offset from the listener (px) -> stereo pan in [-1,1]. */
export function panFromOffset(dx,halfWidth=480){
  return Number.isFinite(dx)?clamp(dx/halfWidth,-1,1):0;
}

/** Optional {pan,distance,volume} -> {pan,gain}. Missing/invalid fields fall back to centred, full level. */
export function spatialParams(opts){
  const pan=Number.isFinite(opts?.pan)?clamp(opts.pan,-1,1):0;
  const volume=Number.isFinite(opts?.volume)?clamp(opts.volume,0,2):1;
  return {pan,gain:distanceGain(opts?.distance)*volume};
}

/** Global slow-motion colouring: low-pass cutoff (Hz) and pitch multiplier for a world time scale. 1x = transparent. */
export function timeScaleColor(scale){
  const s=Number.isFinite(scale)?clamp(scale,0,1):1,slow=1-s;
  return {cutoff:Math.round(20000*Math.pow(1800/20000,slow)),pitch:+(1-.24*slow).toFixed(4)};
}

/** Stable pseudo-random value in [0,1) from a string, so each gun has a fixed personality. */
export function hashUnit(text){
  let h=2166136261;
  for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
  return ((h>>>0)%10007)/10007;
}

/** random multiplier in [1-amount,1+amount] */
export function jitter(amount,rng=Math.random){return 1+(rng()*2-1)*amount;}

const GUN_FAMILIES={
  PISTOL:{family:'pistol',crack:2900,body:300,bodyDur:.07,crackDur:.06,tail:.18,wet:.14,vol:.9,rattle:false},
  SMG:{family:'smg',crack:3500,body:340,bodyDur:.045,crackDur:.04,tail:.1,wet:.08,vol:.72,rattle:true},
  'ASSAULT RIFLE':{family:'rifle',crack:3100,body:190,bodyDur:.08,crackDur:.075,tail:.3,wet:.2,vol:.95,rattle:false},
  SHOTGUN:{family:'shotgun',crack:2000,body:110,bodyDur:.24,crackDur:.15,tail:.38,wet:.26,vol:1.1,rattle:false},
  SNIPER:{family:'sniper',crack:4300,body:120,bodyDur:.2,crackDur:.09,tail:.55,wet:.4,vol:1.05,rattle:false},
  'ANTI-MATERIEL':{family:'antimateriel',crack:1900,body:62,bodyDur:.55,crackDur:.18,tail:1.0,wet:.55,vol:1.3,rattle:false}
};

/** Choose the synth profile for a gun definition ({id,category,damage}). Unknown categories fall back to a mid rifle-ish crack. */
export function gunProfile(gun,{suppressed=false}={}){
  const base=GUN_FAMILIES[gun?.category]||GUN_FAMILIES['ASSAULT RIFLE'];
  const personality=.9+hashUnit(gun?.id??gun?.name??'gun')*.2; // stable +-10% pitch per gun
  const damage=Number.isFinite(gun?.damage)?gun.damage:30;
  const loud=clamp(.8+damage/220,.8,1.35);
  const profile={...base,pitch:personality,vol:base.vol*loud*.55,suppressed:suppressed===true};
  if(profile.suppressed){profile.vol*=.5;profile.wet*=.4;profile.tail*=.35;profile.crack=Math.min(profile.crack,1500);}
  return profile;
}

/* ---------------------------------------------------------------- engine */

let sfxBus=null,timeFilter=null,reverbIn=null,limiter=null,noiseWhite=null,noiseBrown=null,timePitch=1,activeVoices=0,forceRunning=false;
const MAX_VOICES=48;

function buildNoise(context,brown){
  const length=Math.ceil(context.sampleRate*2),buffer=context.createBuffer(1,length,context.sampleRate),data=buffer.getChannelData(0);
  let last=0;
  for(let i=0;i<length;i++){
    const white=Math.random()*2-1;
    if(brown){last=(last+.02*white)/1.02;data[i]=last*3.5;}else data[i]=white;
  }
  return buffer;
}

function buildImpulse(context,seconds=.55){
  const length=Math.ceil(context.sampleRate*seconds),buffer=context.createBuffer(2,length,context.sampleRate);
  for(let channel=0;channel<2;channel++){
    const data=buffer.getChannelData(channel);let lp=0;
    for(let i=0;i<length;i++){
      const t=i/length,decay=Math.pow(1-t,3.2),k=.15+.8*t; // darker as it decays
      lp+=(Math.random()*2-1-lp)*(1-k*.85);
      data[i]=lp*decay*(i<90?i/90:1);
    }
  }
  return buffer;
}

function buildGraph(context,master){
  // sounds -> bus -> timeFilter -> limiter -> master. Reverb returns into timeFilter.
  const comp=context.createDynamicsCompressor();
  comp.threshold.value=-14;comp.knee.value=10;comp.ratio.value=8;comp.attack.value=.002;comp.release.value=.16;
  const shaper=context.createWaveShaper(),curve=new Float32Array(1024);
  for(let i=0;i<1024;i++){const x=i/511.5-1;curve[i]=Math.tanh(x*1.2)/Math.tanh(1.2);}
  shaper.curve=curve;comp.connect(shaper);shaper.connect(master); // soft clip: stacks never exceed full scale
  const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=20000;filter.Q.value=.5;filter.connect(comp);
  const bus=context.createGain();bus.gain.value=1.5;bus.connect(filter);
  let rev=null;
  try{
    const convolver=context.createConvolver();convolver.buffer=buildImpulse(context);
    const wetOut=context.createGain();wetOut.gain.value=.8;convolver.connect(wetOut);wetOut.connect(filter);rev=convolver;
  }catch{rev=null;}
  noiseWhite=buildNoise(context,false);noiseBrown=buildNoise(context,true);
  limiter=comp;timeFilter=filter;sfxBus=bus;reverbIn=rev;
}

function getAudioContext(){
  if(audioContext)return audioContext;
  if(typeof window==='undefined'||!window.AudioContext)return null;
  try{
    const context=new window.AudioContext(),gain=context.createGain();
    gain.gain.value=muted?0:masterVolume;gain.connect(context.destination);
    audioContext=context;masterGain=gain;
    try{buildGraph(context,gain);}catch{sfxBus=null;timeFilter=null;reverbIn=null;}
    return audioContext;
  }catch{return null;}
}

/** Shared runtime for music.js / ambience.js: the live context, the master gain (mute/volume) and the SFX bus (slow-mo filtered). Null before a context exists. */
export function getAudioRuntime(create=true){
  const context=create?getAudioContext():audioContext;
  return context&&masterGain?{context,master:masterGain,sfxBus,limiter,noiseWhite,forceRunning}:null;
}

/** Test/offline hook: render the real synth into an OfflineAudioContext. */
export function attachAudioContextForRender(context){
  audioContext=context;masterGain=context.createGain();masterGain.gain.value=1;masterGain.connect(context.destination);
  forceRunning=true;masterVolume=1;muted=false;buildGraph(context,masterGain);
  return context;
}

export async function unlockAudio(){
  const context=getAudioContext();if(!context)return false;
  try{if(context.state!=='running')await context.resume();return context.state==='running';}
  catch{return false;}
}

function withAudioContext(play){
  const context=getAudioContext();if(!context||!sfxBus||masterVolume===0||muted)return;
  if(!forceRunning&&context.state!=='running')return;
  if(activeVoices>MAX_VOICES)return;
  try{play(context);}catch{/* audio must never break the game */}
}

/** Slow-motion colouring of everything that plays: call every frame or on change with the world time scale. */
export function setTimeScaleAudio(scale){
  const color=timeScaleColor(scale);timePitch=color.pitch;
  if(!audioContext||!timeFilter)return color;
  try{timeFilter.frequency.setTargetAtTime(color.cutoff,audioContext.currentTime,.09);}catch{/* ignore */}
  return color;
}

/**
 * Per-sound output: gain (distance/volume) -> [panner] -> bus, plus a reverb send.
 * raw=true skips the slow-motion filter and pitch (UI, slow-mo whooshes).
 */
function makeOut(context,opts,{wet=0,raw=false}={}){
  const {pan,gain}=spatialParams(opts),input=context.createGain();
  input.gain.value=gain;
  let node=input;
  if(pan!==0&&context.createStereoPanner){const panner=context.createStereoPanner();panner.pan.value=pan;input.connect(panner);node=panner;}
  node.connect(raw?limiter:sfxBus);
  if(wet>0&&reverbIn&&!raw){const send=context.createGain();send.gain.value=wet*Math.min(1,gain*1.2);node.connect(send);send.connect(reverbIn);}
  return {input,raw};
}

const lastPlayed=new Map();
/** Rate limit: true if `key` may play now (min `ms` since its last play). */
function throttled(key,ms){
  const now=typeof performance!=='undefined'?performance.now():Date.now(),last=lastPlayed.get(key)??-Infinity;
  if(now-last<ms)return true;
  lastPlayed.set(key,now);return false;
}

function voiceStart(source){activeVoices++;source.onended=()=>{activeVoices--;};}

function envelope(context,start,vol,attack,duration){
  const env=context.createGain(),peak=Math.max(.0002,vol);
  env.gain.setValueAtTime(.0001,start);env.gain.linearRampToValueAtTime(peak,start+attack);env.gain.exponentialRampToValueAtTime(.0001,start+Math.max(attack+.01,duration));
  return env;
}

function tone(context,out,{type='sine',f0,f1=f0,dur,vol,delay=0,attack=.003}){
  const start=context.currentTime+delay,mul=out.raw?1:timePitch,osc=context.createOscillator(),env=envelope(context,start,vol,attack,dur);
  osc.type=type;osc.frequency.setValueAtTime(f0*mul,start);osc.frequency.exponentialRampToValueAtTime(Math.max(1,f1*mul),start+dur);
  osc.connect(env);env.connect(out.input);voiceStart(osc);osc.start(start);osc.stop(start+dur+.02);
}

function noise(context,out,{filter='lowpass',f0,f1=f0,q=.7,dur,vol,delay=0,attack=.002,brown=false,rate=1}){
  const start=context.currentTime+delay,source=context.createBufferSource(),biquad=context.createBiquadFilter(),env=envelope(context,start,vol,attack,dur);
  source.buffer=brown?noiseBrown:noiseWhite;source.playbackRate.value=(out.raw?1:timePitch)*rate;
  biquad.type=filter;biquad.Q.value=q;biquad.frequency.setValueAtTime(f0,start);biquad.frequency.exponentialRampToValueAtTime(Math.max(20,f1),start+dur);
  source.connect(biquad);biquad.connect(env);env.connect(out.input);voiceStart(source);
  source.start(start,Math.random()*1.5,dur+.05);
}

/* ---------------------------------------------------------------- weapons */

export function playGunshot(gun,opts){
  withAudioContext(context=>{
    const p=gunProfile(gun,{suppressed:opts?.suppressed===true}),pv=jitter(.06),gv=jitter(.08),v=p.vol*gv,out=makeOut(context,opts,{wet:p.wet});
    const pm=p.pitch*pv;
    if(p.suppressed){
      noise(context,out,{filter:'lowpass',f0:1400*pm,f1:260,dur:.09,vol:v*.7,q:.8});
      tone(context,out,{type:'triangle',f0:170*pm,f1:80*pm,dur:.07,vol:v*.35});
      noise(context,out,{filter:'bandpass',f0:3800,f1:2200,q:1.5,dur:.025,vol:v*.25}); // mechanical action tick
      return;
    }
    noise(context,out,{filter:'bandpass',f0:p.crack*pm,f1:p.crack*.35,q:.9,dur:p.crackDur,vol:v*.95});
    noise(context,out,{filter:'highpass',f0:5500,f1:5500,dur:.012,vol:v*.4});
    tone(context,out,{type:p.family==='smg'?'square':'sawtooth',f0:p.body*pm*1.8,f1:p.body*pm*.5,dur:p.bodyDur,vol:v*.4});
    tone(context,out,{type:'sine',f0:p.body*pm*.9,f1:p.body*pm*.32,dur:p.bodyDur*1.6,vol:v*.7});
    noise(context,out,{filter:'lowpass',f0:900,f1:140,dur:p.tail,vol:v*.28,brown:true,delay:.012});
    if(p.family==='shotgun'){
      tone(context,out,{type:'sine',f0:85*pm,f1:34,dur:.3,vol:v*.95});
      noise(context,out,{filter:'bandpass',f0:1100,f1:300,q:.6,dur:.2,vol:v*.4,delay:.02});
    }else if(p.family==='sniper'){
      tone(context,out,{type:'sawtooth',f0:1600*pm,f1:260,dur:.08,vol:v*.18});
      noise(context,out,{filter:'lowpass',f0:1200,f1:100,dur:.5,vol:v*.3,brown:true,delay:.05});
    }else if(p.family==='antimateriel'){
      tone(context,out,{type:'sine',f0:60*pm,f1:22,dur:.75,vol:v*1.1});
      noise(context,out,{filter:'lowpass',f0:2200,f1:60,dur:.9,vol:v*.7,brown:true});
      noise(context,out,{filter:'bandpass',f0:700,f1:150,q:.5,dur:.7,vol:v*.4,delay:.03});
      tone(context,out,{type:'sawtooth',f0:2100*pm,f1:200,dur:.12,vol:v*.15});
    }else if(p.rattle){
      noise(context,out,{filter:'bandpass',f0:2400,f1:1500,q:2,dur:.02,vol:v*.25,delay:.035}); // bolt rattle
    }
  });
}

export function playEnemyShot(opts){
  withAudioContext(context=>{
    const out=makeOut(context,opts,{wet:.18}),v=.32*jitter(.1),pm=jitter(.05);
    noise(context,out,{filter:'bandpass',f0:1700*pm,f1:650,q:1.4,dur:.07,vol:v*1.1});
    tone(context,out,{type:'square',f0:520*pm,f1:170*pm,dur:.09,vol:v*.5});
    tone(context,out,{type:'sine',f0:150,f1:70,dur:.11,vol:v*.7});
    if(opts?.heavy){noise(context,out,{filter:'lowpass',f0:900,f1:140,dur:.3,vol:v*1.2});tone(context,out,{type:'sine',f0:95,f1:32,dur:.34,vol:v*1.1});}
  });
}

export function playEmptyClick(opts){
  withAudioContext(context=>{
    const out=makeOut(context,opts,{}),v=.28*jitter(.1);
    noise(context,out,{filter:'highpass',f0:3500,dur:.018,vol:v});
    tone(context,out,{type:'square',f0:950,f1:520,dur:.025,vol:v*.4});
    noise(context,out,{filter:'bandpass',f0:2200,q:3,dur:.012,vol:v*.6,delay:.045});
  });
}

export function playLowAmmo(opts){
  withAudioContext(context=>{
    const out=makeOut(context,opts,{wet:.08}),v=.18;
    tone(context,out,{type:'triangle',f0:760,f1:760,dur:.07,vol:v});
    tone(context,out,{type:'triangle',f0:560,f1:560,dur:.09,vol:v,delay:.1});
  });
}

export function playReloadStart(opts){
  withAudioContext(context=>{
    const out=makeOut(context,opts,{wet:.05}),v=.2*jitter(.08);
    noise(context,out,{filter:'bandpass',f0:3200,f1:1800,q:2,dur:.03,vol:v});          // release latch
    noise(context,out,{filter:'bandpass',f0:900,f1:400,q:1.2,dur:.12,vol:v*.7,delay:.04}); // mag slides out
    tone(context,out,{type:'triangle',f0:210,f1:110,dur:.06,vol:v*.7,delay:.14});          // mag drops
  });
}

export function playReloadEnd(opts){
  withAudioContext(context=>{
    const out=makeOut(context,opts,{wet:.06}),v=.22*jitter(.08);
    tone(context,out,{type:'triangle',f0:240,f1:120,dur:.07,vol:v});                         // mag seats
    noise(context,out,{filter:'bandpass',f0:1800,f1:900,q:1.5,dur:.04,vol:v*.8});
    noise(context,out,{filter:'bandpass',f0:3600,f1:2400,q:2.5,dur:.03,vol:v*.9,delay:.13});  // rack back
    noise(context,out,{filter:'bandpass',f0:2600,f1:1500,q:2.5,dur:.04,vol:v*1,delay:.2});     // rack forward
    tone(context,out,{type:'square',f0:420,f1:260,dur:.04,vol:v*.35,delay:.2});
  });
}

export function playReload(opts){playReloadStart(opts);}

/* ---------------------------------------------------------------- impacts */

export function playHit(opts){if(throttled('hit',30))return;
  withAudioContext(context=>{
    const out=makeOut(context,opts,{wet:.05}),v=.5*jitter(.1),pm=jitter(.1);
    noise(context,out,{filter:'lowpass',f0:1000*pm,f1:260,dur:.075,vol:v});
    tone(context,out,{type:'sine',f0:190*pm,f1:70,dur:.09,vol:v*.8});
    noise(context,out,{filter:'bandpass',f0:2600,q:1.5,dur:.02,vol:v*.4});
  });
}

export function playKill(opts){
  withAudioContext(context=>{
    const out=makeOut(context,opts,{wet:.2}),v=.2*jitter(.05);
    noise(context,out,{filter:'lowpass',f0:1200,f1:200,dur:.12,vol:v*1.1});
    tone(context,out,{type:'sine',f0:130,f1:50,dur:.18,vol:v*1.1});
    tone(context,out,{type:'triangle',f0:660,dur:.12,vol:v*.55,delay:.04});
    tone(context,out,{type:'triangle',f0:990,dur:.2,vol:v*.55,delay:.1});
    tone(context,out,{type:'sine',f0:1980,dur:.25,vol:v*.15,delay:.1});
  });
}

export function playPlayerHurt(opts){
  withAudioContext(context=>{
    const out=makeOut(context,{...opts,distance:0},{wet:.12,raw:true}),v=.3;
    tone(context,out,{type:'sawtooth',f0:230,f1:60,dur:.26,vol:v*.8});
    noise(context,out,{filter:'lowpass',f0:900,f1:140,dur:.22,vol:v});
    tone(context,out,{type:'sine',f0:1450,f1:1400,dur:.45,vol:v*.12,delay:.03});
  });
}

export function playArmorHit(opts){
  withAudioContext(context=>{
    const out=makeOut(context,opts,{wet:.15}),v=.3*jitter(.08);
    for(const [i,f] of [1850,2740,3910].entries())tone(context,out,{type:'square',f0:f,f1:f*.97,dur:.09-i*.02,vol:v*(.5-i*.1)});
    noise(context,out,{filter:'bandpass',f0:4200,f1:2800,q:1.5,dur:.04,vol:v*.7});
    tone(context,out,{type:'sine',f0:150,f1:80,dur:.1,vol:v*.8});
  });
}

export function playWallImpact(opts){if(throttled('wall',30))return;
  withAudioContext(context=>{
    const out=makeOut(context,opts,{wet:.08}),v=.3*jitter(.12);
    noise(context,out,{filter:'lowpass',f0:1500,f1:300,dur:.05,vol:v});
    tone(context,out,{type:'sine',f0:150*jitter(.15),f1:70,dur:.07,vol:v*.7});
    if(Math.random()<.4){const f=2600+Math.random()*1800;tone(context,out,{type:'sine',f0:f,f1:f*.55,dur:.14,vol:v*.28,delay:.012});}
  });
}

export function playCrateBreak(opts){
  withAudioContext(context=>{
    const out=makeOut(context,opts,{wet:.12});
    tone(context,out,{type:'triangle',f0:118,f1:38,dur:.22,vol:.34});
    noise(context,out,{filter:'lowpass',f0:4600,f1:1550,dur:.2,vol:.3});
    noise(context,out,{filter:'highpass',f0:1250,dur:.085,vol:.15});
    for(let i=0;i<4;i++)noise(context,out,{filter:'bandpass',f0:1500+Math.random()*2500,q:3,dur:.03,vol:.07,delay:.06+i*.045+Math.random()*.03});
  });
}

/* ---------------------------------------------------------------- throwables */

export function playExplosion(opts){
  withAudioContext(context=>{
    const out=makeOut(context,opts,{wet:.55}),v=.62;
    tone(context,out,{type:'sine',f0:95,f1:22,dur:1,vol:v*1.1});
    noise(context,out,{filter:'lowpass',f0:3000,f1:60,dur:1.2,vol:v,brown:true});
    noise(context,out,{filter:'bandpass',f0:1600,f1:300,q:.6,dur:.35,vol:v*.7});
    noise(context,out,{filter:'highpass',f0:4000,dur:.06,vol:v*.4});
    for(let i=0;i<7;i++)noise(context,out,{filter:'bandpass',f0:900+Math.random()*3000,q:4,dur:.04,vol:.1,delay:.15+i*.07+Math.random()*.08});
  });
}

export function playFlashbang(opts){
  withAudioContext(context=>{
    const out=makeOut(context,opts,{wet:.45}),v=.5;
    noise(context,out,{filter:'highpass',f0:900,dur:.28,vol:v});
    tone(context,out,{type:'sine',f0:120,f1:40,dur:.3,vol:v*.8});
    const ring=makeOut(context,{...opts,distance:0},{raw:true});
    tone(context,ring,{type:'sine',f0:4200,f1:3900,dur:1.5,vol:.11,delay:.04,attack:.02});
    tone(context,ring,{type:'sine',f0:5600,f1:5400,dur:1.1,vol:.05,delay:.04,attack:.02});
  });
}

export function playSmoke(opts){
  withAudioContext(context=>{
    const out=makeOut(context,opts,{wet:.3}),v=.2;
    tone(context,out,{type:'triangle',f0:180,f1:70,dur:.12,vol:v*.9});
    noise(context,out,{filter:'highpass',f0:2200,f1:3500,dur:.9,vol:v*.5,attack:.12,delay:.05});
    noise(context,out,{filter:'bandpass',f0:1400,f1:900,q:.5,dur:.7,vol:v*.4,attack:.1,delay:.05});
  });
}

export function playFire(opts){
  withAudioContext(context=>{
    const out=makeOut(context,opts,{wet:.2}),v=.2;
    tone(context,out,{type:'sine',f0:110,f1:50,dur:.2,vol:v});
    noise(context,out,{filter:'lowpass',f0:1000,f1:350,dur:.6,vol:v*.8,attack:.05,brown:true});
    for(let i=0;i<9;i++)noise(context,out,{filter:'bandpass',f0:1800+Math.random()*3500,q:3,dur:.018+Math.random()*.02,vol:v*(.25+Math.random()*.35),delay:.02+i*.055+Math.random()*.04});
  });
}

/* ---------------------------------------------------------------- movement, doors, ui */

export function playFootstep(opts){if(throttled('step',60))return;
  withAudioContext(context=>{
    const out=makeOut(context,opts,{wet:.03}),v=.14*jitter(.25),pm=jitter(.12);
    noise(context,out,{filter:'lowpass',f0:700*pm,f1:250,dur:.045,vol:v});
    tone(context,out,{type:'sine',f0:95*pm,f1:55,dur:.05,vol:v*.8});
  });
}

export function playBruteWindup(opts){
  withAudioContext(context=>{
    const out=makeOut(context,opts,{wet:.25}),v=.24;
    tone(context,out,{type:'sawtooth',f0:62,f1:120,dur:.55,vol:v*.7,attack:.12});
    tone(context,out,{type:'square',f0:93,f1:178,dur:.55,vol:v*.25,attack:.15});
    noise(context,out,{filter:'lowpass',f0:300,f1:900,dur:.55,vol:v*.7,attack:.2,brown:true});
  });
}

export function playEnemyTell(opts){
  const now=audioContext?.currentTime??0;if(now-lastTellAt<.18)return;lastTellAt=now;
  withAudioContext(context=>{
    const out=makeOut(context,opts,{wet:.1});
    tone(context,out,{type:'square',f0:260,f1:210,dur:.13,vol:.11});
    tone(context,out,{type:'triangle',f0:390,f1:310,dur:.1,vol:.07});
  });
}

// Enemy round whips past the player: short band-passed "whoosh" with a downward pitch bend (a pass-by).
export function playNearMiss(opts){if(throttled('miss',90))return;
  withAudioContext(context=>{
    const out=makeOut(context,opts,{wet:.1});
    noise(context,out,{filter:'bandpass',f0:2600,f1:900,q:2.2,dur:.16,vol:.16,attack:.02});
    tone(context,out,{type:'sine',f0:1500*jitter(.1),f1:520,dur:.13,vol:.05});
  });
}

// Player round stopped by a RIOT shield: dull metallic clank.
export function playShieldBlock(opts){if(throttled('shield',40))return;
  withAudioContext(context=>{
    const out=makeOut(context,opts,{wet:.12}),f=900*jitter(.12);
    tone(context,out,{type:'square',f0:f,f1:f*.6,dur:.07,vol:.12});
    tone(context,out,{type:'triangle',f0:f*2.7,f1:f*1.9,dur:.12,vol:.09,delay:.005});
    noise(context,out,{filter:'highpass',f0:3000,f1:5000,dur:.04,vol:.1});
  });
}

// MARKSMAN laser lock: a rising two-note chirp so the commit point is audible even off-screen.
export function playSniperLock(opts){if(throttled('lock',300))return;
  withAudioContext(context=>{
    const out=makeOut(context,opts,{wet:.15});
    tone(context,out,{type:'sine',f0:1100,f1:1700,dur:.1,vol:.14});
    tone(context,out,{type:'sine',f0:1700,f1:2100,dur:.12,vol:.12,delay:.1});
  });
}

export function playDoorOpen(opts){
  withAudioContext(context=>{
    const out=makeOut(context,opts,{wet:.2}),v=.2;
    noise(context,out,{filter:'bandpass',f0:500,f1:900,q:2,dur:.28,vol:v*.5,attack:.04});
    tone(context,out,{type:'sawtooth',f0:90,f1:170,dur:.28,vol:v*.4,attack:.05});
    tone(context,out,{type:'sine',f0:100,f1:48,dur:.12,vol:v*.9,delay:.26});
  });
}

export function playGateUnlock(opts){
  withAudioContext(context=>{
    const out=makeOut(context,opts,{wet:.25}),v=.22;
    noise(context,out,{filter:'bandpass',f0:3400,f1:2000,q:3,dur:.04,vol:v});
    tone(context,out,{type:'square',f0:1400,f1:1100,dur:.05,vol:v*.4,delay:.08});
    tone(context,out,{type:'sine',f0:90,f1:42,dur:.35,vol:v*1.1,delay:.18});
    noise(context,out,{filter:'lowpass',f0:1200,f1:200,dur:.5,vol:v*.7,delay:.18,brown:true});
    tone(context,out,{type:'triangle',f0:784,dur:.3,vol:v*.4,delay:.3});
    tone(context,out,{type:'triangle',f0:1175,dur:.4,vol:v*.4,delay:.38});
  });
}

export function playUiClick(opts){
  withAudioContext(context=>{
    const out=makeOut(context,{...opts,distance:0},{raw:true});
    tone(context,out,{type:'sine',f0:1250,f1:850,dur:.03,vol:.18});
  });
}

/* ---------------------------------------------------------------- slow motion */

/** World slows: a downward breath, a sub dip and a muffled whoosh. Not coloured by the slow-mo filter itself. */
export function playSlowmoEnter(){if(throttled('slowIn',250))return;
  withAudioContext(context=>{
    const out=makeOut(context,null,{raw:true});
    noise(context,out,{filter:'lowpass',f0:5200,f1:380,q:.9,dur:.55,vol:.1,attack:.04,brown:true});
    tone(context,out,{type:'sine',f0:150,f1:46,dur:.5,vol:.16,attack:.02});
    tone(context,out,{type:'triangle',f0:900,f1:200,dur:.4,vol:.035});
  });
}

/** World resumes: an upward release, a bright inhale and a small pop. */
export function playSlowmoExit(){if(throttled('slowOut',250))return;
  withAudioContext(context=>{
    const out=makeOut(context,null,{raw:true});
    noise(context,out,{filter:'bandpass',f0:500,f1:6500,q:.8,dur:.28,vol:.09,attack:.1});
    tone(context,out,{type:'sine',f0:60,f1:210,dur:.22,vol:.1,attack:.03});
    tone(context,out,{type:'sine',f0:1400,f1:2100,dur:.08,vol:.04,delay:.2});
  });
}

/* ---------------------------------------------------------------- pickups & progression */

export function playPickup(kind='scrap',opts){
  const frequency={scrap:620,mod:790,heal:540,gun:470,cache:680}[kind]||600;
  withAudioContext(context=>{
    const out=makeOut(context,opts,{wet:.1});
    tone(context,out,{type:'sine',f0:frequency,f1:frequency*1.28,dur:.095,vol:.13});
    tone(context,out,{type:'triangle',f0:frequency*2,f1:frequency*2.4,dur:.07,vol:.04,delay:.02});
  });
}

export function playRoomClear(){
  withAudioContext(context=>{
    const out=makeOut(context,null,{wet:.3});
    tone(context,out,{type:'triangle',f0:520,dur:.12,vol:.14});
    tone(context,out,{type:'sine',f0:780,f1:930,dur:.19,vol:.12});
    tone(context,out,{type:'triangle',f0:1040,dur:.3,vol:.06,delay:.1});
  });
}

export function playExtraction(){
  withAudioContext(context=>{
    const out=makeOut(context,null,{wet:.4});
    for(const [index,frequency] of [392,523,659,784].entries())tone(context,out,{type:'sine',f0:frequency,f1:frequency*1.04,dur:.26+index*.05,vol:.15-index*.02,delay:index*.07});
    noise(context,out,{filter:'lowpass',f0:900,dur:.32,vol:.06});
  });
}
