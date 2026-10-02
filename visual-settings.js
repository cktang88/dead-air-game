export const VISUAL_SETTINGS_KEY='dead-air.visual.v1';
export const DEFAULT_VISUAL_SETTINGS=Object.freeze({shake:1,flash:1});
const VERSION=1;

export function parseVisualSettings(serialized){
  if(typeof serialized!=='string')return {version:VERSION,...DEFAULT_VISUAL_SETTINGS};
  try{
    const saved=JSON.parse(serialized);
    if(saved?.version!==VERSION)return {version:VERSION,...DEFAULT_VISUAL_SETTINGS};
    const bounded=value=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):null;
    const shake=bounded(saved.shake),flash=bounded(saved.flash);
    return {version:VERSION,shake:shake??DEFAULT_VISUAL_SETTINGS.shake,flash:flash??DEFAULT_VISUAL_SETTINGS.flash};
  }catch{return {version:VERSION,...DEFAULT_VISUAL_SETTINGS};}
}

export function serializeVisualSettings({shake,flash}){
  const bounded=value=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):1;
  return JSON.stringify({version:VERSION,shake:bounded(shake),flash:bounded(flash)});
}

export function loadVisualSettings(storage){
  try{return parseVisualSettings(storage.getItem(VISUAL_SETTINGS_KEY));}
  catch{return {version:VERSION,...DEFAULT_VISUAL_SETTINGS};}
}

export function saveVisualSettings(storage,settings){
  storage.setItem(VISUAL_SETTINGS_KEY,serializeVisualSettings(settings));
}

export function scaledCameraShake(amount,strength){
  return Math.max(0,Number.isFinite(amount)?amount:0)*Math.max(0,Math.min(1,Number.isFinite(strength)?strength:1));
}

export function flashOverlayOpacity(remaining,strength){
  const intensity=Math.max(0,Math.min(1,Number.isFinite(strength)?strength:1));
  const fade=Math.max(0,Math.min(1,(Number.isFinite(remaining)?remaining:0)/.24));
  return Math.min(.72,fade*.72*intensity);
}
