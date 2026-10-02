import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_KEY_BINDINGS,isBindableKey,keyLabel,loadKeyBindings,movementFromKeys,normalizeKey,parseKeyBindings,rebindKey,saveKeyBindings,serializeKeyBindings,KEY_BINDINGS_KEY} from './keybindings.js';

test('default bindings cover movement and all key-driven combat actions',()=>{
  assert.deepEqual(DEFAULT_KEY_BINDINGS,{moveUp:'w',moveDown:'s',moveLeft:'a',moveRight:'d',interact:'e',reload:'shift',throwableCycle:'q',throwableUse:'g',weaponOne:'1',weaponTwo:'2',shellCycle:'c'});
  assert.equal(normalizeKey('ArrowUp'),'arrowup');
  assert.equal(normalizeKey(' '),'space');
  assert.equal(keyLabel('arrowleft'),'←');
});

test('rebinding accepts supported single keys and rejects conflicts and reserved keys',()=>{
  const first=rebindKey(DEFAULT_KEY_BINDINGS,'moveUp','i');
  assert.equal(first.ok,true);
  assert.equal(first.bindings.moveUp,'i');
  assert.equal(DEFAULT_KEY_BINDINGS.moveUp,'w');
  assert.deepEqual(rebindKey(first.bindings,'moveDown','i'),{ok:false,reason:'in-use',bindings:first.bindings});
  assert.equal(rebindKey(DEFAULT_KEY_BINDINGS,'reload','Escape').reason,'invalid');
  assert.equal(rebindKey(DEFAULT_KEY_BINDINGS,'interact','Tab').reason,'invalid');
  assert.equal(rebindKey(DEFAULT_KEY_BINDINGS,'interact','f').reason,'invalid');
  assert.equal(rebindKey(DEFAULT_KEY_BINDINGS,'reload','r').reason,'invalid');
  assert.equal(rebindKey(DEFAULT_KEY_BINDINGS,'interact','F2').reason,'invalid');
  assert.equal(isBindableKey('Shift'),true);
  assert.equal(isBindableKey('Control'),false);
});

test('custom movement bindings preserve normalized diagonal speed and opposing-key cancellation',()=>{
  const bindings={...DEFAULT_KEY_BINDINGS,moveUp:'i',moveDown:'k',moveLeft:'j',moveRight:'l'};
  assert.deepEqual(movementFromKeys(new Set(['i']),bindings),{x:0,y:-1});
  const diagonal=movementFromKeys(new Set(['i','l']),bindings);
  assert.ok(Math.abs(Math.hypot(diagonal.x,diagonal.y)-1)<1e-10);
  assert.deepEqual(movementFromKeys(new Set(['j','l']),bindings),{x:0,y:0});
});

test('saved bindings round-trip and corrupt or conflicting saves fall back as a whole',()=>{
  const changed=rebindKey(DEFAULT_KEY_BINDINGS,'moveUp','arrowup').bindings;
  assert.deepEqual(parseKeyBindings(serializeKeyBindings(changed)),{version:1,...changed});
  assert.deepEqual(parseKeyBindings(null),{version:1,...DEFAULT_KEY_BINDINGS});
  assert.deepEqual(parseKeyBindings('{broken'),{version:1,...DEFAULT_KEY_BINDINGS});
  assert.deepEqual(parseKeyBindings(JSON.stringify({version:2,bindings:changed})),{version:1,...DEFAULT_KEY_BINDINGS});
  const conflict={...DEFAULT_KEY_BINDINGS,moveUp:'d'};
  assert.deepEqual(parseKeyBindings(JSON.stringify({version:1,bindings:conflict})),{version:1,...DEFAULT_KEY_BINDINGS});
  assert.equal(KEY_BINDINGS_KEY,'dead-air.keys.v1');
});

test('key bindings persist through the storage boundary and tolerate denied reads',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const changed=rebindKey(DEFAULT_KEY_BINDINGS,'throwableUse','t').bindings;
  saveKeyBindings(storage,changed);
  assert.deepEqual(loadKeyBindings(storage),{version:1,...changed});
  assert.deepEqual(loadKeyBindings({getItem(){throw new Error('denied');}}),{version:1,...DEFAULT_KEY_BINDINGS});
});
