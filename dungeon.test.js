import test from 'node:test';
import assert from 'node:assert/strict';
import {nameDungeonRooms} from './dungeon.js';

test('room names follow route order and stay unique on larger floors',()=>{
  const rooms=nameDungeonRooms(Array.from({length:12},(_,index)=>({index,role:index?'combat':'entry'})));
  const names=rooms.map(room=>room.name);
  assert.equal(names[0],'ENTRY');
  assert.equal(names.at(-1),'EXTRACTION');
  assert.equal(new Set(names).size,names.length);
  assert.equal(names[1],'FURNACE');
  assert.equal(names[8],'FURNACE 2');
  assert.equal(rooms[3].index,3,'room data is preserved while labels are assigned');
});
