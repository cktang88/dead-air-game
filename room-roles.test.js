import test from 'node:test';
import assert from 'node:assert/strict';
import {assignRoomRoles, roomEnemyCount, roomPickupKinds} from './room-roles.js';

const rooms=Array.from({length:10},(_,index)=>({index,name:`ROOM ${index}`}));

test('room roles are seed-stable and reserve entry and extraction',()=>{
  const first=assignRoomRoles(rooms,417),second=assignRoomRoles(rooms,417);
  assert.deepEqual(first,second);
  assert.equal(first[0].role,'entry');
  assert.equal(first.at(-1).role,'extraction');
  assert.equal(first[0].name,rooms[0].name);
  assert.equal(first.at(-1).name,rooms.at(-1).name);
});

test('every generated floor gets a cache and room variety grows with floor size',()=>{
  const small=assignRoomRoles(rooms.slice(0,6),417).map(room=>room.role);
  const large=assignRoomRoles(rooms,417).map(room=>room.role);
  assert.equal(small.filter(role=>role==='cache').length,1);
  assert.ok(small.includes('armory')||small.includes('clinic')||small.includes('hazard'));
  assert.ok(large.includes('cache'));
  assert.ok(large.includes('armory'));
  assert.ok(large.includes('clinic'));
  assert.ok(large.includes('hazard'));
  assert.equal(large.filter(role=>role==='combat').length,4);
});

test('short floors do not assign a middle role over entry or extraction',()=>{
  const roles=assignRoomRoles(rooms.slice(0,3),1).map(room=>room.role);
  assert.deepEqual(roles,['entry','cache','extraction']);
});

test('the cache prefers a reachable room outside the entry-to-extraction route',()=>{
  const branchRooms=rooms.map((room,index)=>({...room,branch:index===4}));
  const assigned=assignRoomRoles(branchRooms,417);
  assert.equal(assigned[4].role,'cache');
  assert.equal(assigned.filter(room=>room.role==='cache').length,1);
});

test('room roles control safe rewards and combat pressure',()=>{
  assert.equal(roomEnemyCount('cache'),2);
  assert.equal(roomEnemyCount('clinic'),0);
  assert.deepEqual(roomPickupKinds('cache'),['scrap','mod']);
  assert.deepEqual(roomPickupKinds('clinic'),['heal']);
  assert.equal(roomEnemyCount('armory'),3);
  assert.deepEqual(roomPickupKinds('armory'),['gun']);
  assert.equal(roomEnemyCount('hazard',0),4);
  assert.equal(roomEnemyCount('hazard',.99),5);
  assert.deepEqual(roomPickupKinds('combat'),[]);
  assert.equal(roomEnemyCount('combat',0),2);
  assert.equal(roomEnemyCount('combat',.99),4);
});
