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

function getAudioContext(){
  if(audioContext)return audioContext;
  if(!window.AudioContext)return null;
  try{
    const context=new window.AudioContext(),gain=context.createGain();
    gain.gain.value=muted?0:masterVolume;gain.connect(context.destination);
    audioContext=context;masterGain=gain;
    return audioContext;
  }catch{return null;}
}

export async function unlockAudio(){
  const context=getAudioContext();if(!context)return false;
  try{if(context.state!=='running')await context.resume();return context.state==='running';}
  catch{return false;}
}

function withAudioContext(play){
  const context=getAudioContext();if(!context||masterVolume===0||muted)return;
  if(context.state==='running')play(context);
}

function addTone(context,{frequency,endFrequency,duration,volume,type='triangle'}){
  const start=context.currentTime,oscillator=context.createOscillator(),envelope=context.createGain();
  oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,start);oscillator.frequency.exponentialRampToValueAtTime(Math.max(1,endFrequency),start+duration);
  envelope.gain.setValueAtTime(.0001,start);envelope.gain.linearRampToValueAtTime(volume,start+.004);envelope.gain.exponentialRampToValueAtTime(.0001,start+duration);
  oscillator.connect(envelope);envelope.connect(masterGain);oscillator.start(start);oscillator.stop(start+duration+.01);
}

function addNoise(context,{duration,volume,lowpass,highpass=0}){
  const start=context.currentTime,sampleCount=Math.ceil(context.sampleRate*duration),buffer=context.createBuffer(1,sampleCount,context.sampleRate),samples=buffer.getChannelData(0);
  for(let i=0;i<sampleCount;i++)samples[i]=Math.random()*2-1;
  const source=context.createBufferSource(),filter=context.createBiquadFilter(),envelope=context.createGain();
  source.buffer=buffer;filter.type=highpass?'highpass':'lowpass';filter.frequency.setValueAtTime(highpass||lowpass*3,start);if(lowpass&&!highpass)filter.frequency.exponentialRampToValueAtTime(lowpass,start+duration);
  envelope.gain.setValueAtTime(.0001,start);envelope.gain.linearRampToValueAtTime(volume,start+.002);envelope.gain.exponentialRampToValueAtTime(.0001,start+duration);
  source.connect(filter);filter.connect(envelope);envelope.connect(masterGain);source.start(start);source.stop(start+duration+.01);
}

export function playGunshot(gun){
  withAudioContext(context=>{
    const shotgun=gun.category==='SHOTGUN',precision=gun.category==='SNIPER'||gun.category==='ANTI-MATERIEL',base=shotgun?92:precision?175:245;
    const volume=Math.min(.24,.085+gun.damage/280);
    addTone(context,{frequency:base,endFrequency:base*.42,duration:.075,volume,type:'sawtooth'});
    addNoise(context,{duration:.055,volume:volume*.75,lowpass:shotgun?1200:2500,highpass:precision?600:0});
  });
}

export function playCrateBreak(){
  withAudioContext(context=>{
    addTone(context,{frequency:118,endFrequency:38,duration:.22,volume:.34,type:'triangle'});
    addNoise(context,{duration:.2,volume:.3,lowpass:1550});
    addNoise(context,{duration:.085,volume:.15,lowpass:0,highpass:1250});
  });
}

export function playReload(){
  withAudioContext(context=>{
    addTone(context,{frequency:520,endFrequency:360,duration:.055,volume:.11,type:'square'});
    addNoise(context,{duration:.09,volume:.12,lowpass:1150,highpass:170});
    addTone(context,{frequency:310,endFrequency:470,duration:.07,volume:.12,type:'triangle'});
  });
}

export function playPickup(kind='scrap'){
  const frequency={scrap:620,mod:790,heal:540,gun:470,cache:680}[kind]||600;
  withAudioContext(context=>addTone(context,{frequency,endFrequency:frequency*1.28,duration:.095,volume:.13,type:'sine'}));
}

export function playEnemyTell(){
  const now=audioContext?.currentTime??0;if(now-lastTellAt<.18)return;lastTellAt=now;
  withAudioContext(context=>{
    addTone(context,{frequency:260,endFrequency:210,duration:.13,volume:.11,type:'square'});
    addTone(context,{frequency:390,endFrequency:310,duration:.10,volume:.07,type:'triangle'});
  });
}

export function playRoomClear(){
  withAudioContext(context=>{
    addTone(context,{frequency:520,endFrequency:520,duration:.12,volume:.14,type:'triangle'});
    addTone(context,{frequency:780,endFrequency:930,duration:.19,volume:.12,type:'sine'});
  });
}

export function playExtraction(){
  withAudioContext(context=>{
    for(const [index,frequency] of [392,523,659,784].entries())addTone(context,{frequency,endFrequency:frequency*1.04,duration:.26,volume:.15-index*.02,type:'sine'});
    addNoise(context,{duration:.32,volume:.06,lowpass:900});
  });
}
