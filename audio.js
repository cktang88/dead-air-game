export const AUDIO_SETTINGS_KEY='dead-air.audio.v1';
export const DEFAULT_MASTER_VOLUME=.65;
const AUDIO_SETTINGS_VERSION=1;

export function parseAudioSettings(serialized){
  if(typeof serialized!=='string')return {version:AUDIO_SETTINGS_VERSION,volume:DEFAULT_MASTER_VOLUME};
  try{
    const saved=JSON.parse(serialized);
    if(saved?.version!==AUDIO_SETTINGS_VERSION||!Number.isFinite(saved.volume))return {version:AUDIO_SETTINGS_VERSION,volume:DEFAULT_MASTER_VOLUME};
    return {version:AUDIO_SETTINGS_VERSION,volume:Math.max(0,Math.min(1,saved.volume))};
  }catch{return {version:AUDIO_SETTINGS_VERSION,volume:DEFAULT_MASTER_VOLUME};}
}

export function serializeAudioSettings(volume){
  const bounded=Number.isFinite(volume)?Math.max(0,Math.min(1,volume)):DEFAULT_MASTER_VOLUME;
  return JSON.stringify({version:AUDIO_SETTINGS_VERSION,volume:bounded});
}

let audioContext=null,masterGain=null,masterVolume=DEFAULT_MASTER_VOLUME,settingsStorage=null;

export function loadAudioSettings(storage){
  settingsStorage=storage;
  try{masterVolume=parseAudioSettings(storage.getItem(AUDIO_SETTINGS_KEY)).volume;}
  catch{masterVolume=DEFAULT_MASTER_VOLUME;}
  if(masterGain)masterGain.gain.setTargetAtTime(masterVolume,audioContext.currentTime,.02);
  return masterVolume;
}

export function getMasterVolume(){return masterVolume;}

export function setMasterVolume(volume){
  masterVolume=Number.isFinite(volume)?Math.max(0,Math.min(1,volume)):DEFAULT_MASTER_VOLUME;
  if(masterGain)masterGain.gain.setTargetAtTime(masterVolume,audioContext.currentTime,.02);
  try{settingsStorage?.setItem(AUDIO_SETTINGS_KEY,serializeAudioSettings(masterVolume));return true;}
  catch{return false;}
}

function getAudioContext(){
  if(audioContext)return audioContext;
  if(!window.AudioContext)return null;
  try{
    const context=new window.AudioContext(),gain=context.createGain();
    gain.gain.value=masterVolume;gain.connect(context.destination);
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
  const context=getAudioContext();if(!context||masterVolume===0)return;
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
