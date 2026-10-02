export const KEY_BINDINGS_KEY='dead-air.keys.v1';
export const DEFAULT_KEY_BINDINGS=Object.freeze({
  moveUp:'w',moveDown:'s',moveLeft:'a',moveRight:'d',interact:'e',reload:'shift',
  throwableCycle:'q',throwableUse:'g',weaponOne:'1',weaponTwo:'2',weaponThree:'3',shellCycle:'c',
});
export const KEY_BINDING_ACTIONS=Object.freeze([
  {id:'moveUp',label:'Move up'}, {id:'moveDown',label:'Move down'},
  {id:'moveLeft',label:'Move left'}, {id:'moveRight',label:'Move right'},
  {id:'interact',label:'Interact'}, {id:'reload',label:'Reload'},
  {id:'throwableCycle',label:'Cycle throwable'}, {id:'throwableUse',label:'Throw throwable'},
  {id:'weaponOne',label:'Primary weapon'}, {id:'weaponTwo',label:'Secondary weapon'},
  {id:'weaponThree',label:'Tertiary weapon'},
  {id:'shellCycle',label:'Shotgun shell'},
]);
const VERSION=1;
const RESERVED_KEYS=new Set(['escape','tab','f','r']);

export function normalizeKey(key){
  if(typeof key!=='string')return '';
  const normalized=key.toLowerCase();
  return normalized===' '?'space':normalized;
}

export function isBindableKey(key){
  const normalized=normalizeKey(key);
  return (/^[a-z0-9]$/.test(normalized)||['space','shift','arrowup','arrowdown','arrowleft','arrowright'].includes(normalized))&&!RESERVED_KEYS.has(normalized);
}

export function keyLabel(key){
  return ({space:'SPACE',shift:'SHIFT',arrowup:'↑',arrowdown:'↓',arrowleft:'←',arrowright:'→'})[key]||key.toUpperCase();
}

export function movementFromKeys(keys,bindings){
  const left=keys.has(bindings.moveLeft),right=keys.has(bindings.moveRight),up=keys.has(bindings.moveUp),down=keys.has(bindings.moveDown);
  const x=(right?1:0)-(left?1:0),y=(down?1:0)-(up?1:0),length=Math.hypot(x,y)||1;
  return {x:x/length,y:y/length};
}

export function rebindKey(bindings,action,key){
  const normalized=normalizeKey(key);
  if(!Object.hasOwn(DEFAULT_KEY_BINDINGS,action)||!isBindableKey(normalized))return {ok:false,reason:'invalid',bindings};
  if(Object.entries(bindings).some(([other,value])=>other!==action&&value===normalized))return {ok:false,reason:'in-use',bindings};
  return {ok:true,reason:null,bindings:{...bindings,[action]:normalized}};
}

export function parseKeyBindings(serialized){
  const fallback=()=>({version:VERSION,...DEFAULT_KEY_BINDINGS});
  if(typeof serialized!=='string')return fallback();
  try{
    const saved=JSON.parse(serialized),values=saved?.bindings;
    if(saved?.version!==VERSION||!values||typeof values!=='object')return fallback();
    const bindings={};
    for(const action of KEY_BINDING_ACTIONS){
      if(!Object.hasOwn(values,action.id))continue;
      const key=normalizeKey(values[action.id]);
      if(!isBindableKey(key)||Object.values(bindings).includes(key))return fallback();
      bindings[action.id]=key;
    }
    for(const action of KEY_BINDING_ACTIONS){
      if(Object.hasOwn(bindings,action.id))continue;
      const preferred=DEFAULT_KEY_BINDINGS[action.id];
      const replacement=Object.values(bindings).includes(preferred)?'abcdefghijklmnopqrstuvwxyz0123456789'.split('').find(key=>!Object.values(bindings).includes(key)):preferred;
      if(!replacement)return fallback();
      bindings[action.id]=replacement;
    }
    return {version:VERSION,...bindings};
  }catch{return fallback();}
}

export function serializeKeyBindings(bindings){
  const parsed=parseKeyBindings(JSON.stringify({version:VERSION,bindings}));
  return JSON.stringify({version:VERSION,bindings:Object.fromEntries(KEY_BINDING_ACTIONS.map(({id})=>[id,parsed[id]]))});
}

export function loadKeyBindings(storage){
  try{return parseKeyBindings(storage.getItem(KEY_BINDINGS_KEY));}
  catch{return {version:VERSION,...DEFAULT_KEY_BINDINGS};}
}

export function saveKeyBindings(storage,bindings){
  storage.setItem(KEY_BINDINGS_KEY,serializeKeyBindings(bindings));
}
