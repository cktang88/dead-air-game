import test from 'node:test';
import assert from 'node:assert/strict';
import {assignRoomRoles, roomEnemyCount, roomEncounterTypes, roomHasEncounter, roomHasLivingEnemies, roomPickupKinds} from './room-roles.js';

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
  assert.ok(small.some(role=>['armory','clinic','hazard','elite'].includes(role)));
  assert.ok(large.includes('cache'));
  assert.equal(large.filter(role=>role==='elite').length,1);
  assert.ok(large.some(role=>['armory','clinic','hazard'].includes(role)));
  assert.equal(large.filter(role=>role==='combat').length,4);
});

test('cache assignment prefers branch rooms that can support a validated gate',()=>{
  const candidates=rooms.map((room,index)=>({...room,index,branch:[1,3].includes(index)}));
  const assigned=assignRoomRoles(candidates,417,[3]);
  assert.equal(assigned.find(room=>room.role==='cache').index,3);
  const fallback=assignRoomRoles(candidates,417,[]);
  assert.equal(fallback.find(room=>room.role==='cache').branch,true);
});

test('short floors do not assign a middle role over entry or extraction',()=>{
  const roles=assignRoomRoles(rooms.slice(0,3),1).map(room=>room.role);
  assert.deepEqual(roles,['entry','cache','extraction']);
});

test('the cache prefers a reachable room outside the entry-to-extraction route',()=>{
  const branchRooms=rooms.map((room,index)=>({...room,branch:index===4}));
  const assigned=assignRoomRoles(branchRooms,417);
  assert.equal(assigned[4].role,'cache');
  assert.equal(assigned[4].secret,true);
  assert.equal(assigned.filter(room=>room.role==='cache').length,1);
});

test('the guaranteed cache fallback is not secret when the floor has no branch',()=>{
  const assigned=assignRoomRoles(rooms,417);
  const cache=assigned.find(room=>room.role==='cache');
  assert.ok(cache);
  assert.equal(cache.secret,false);
});

test('room roles control safe rewards and combat pressure',()=>{
  assert.equal(roomEnemyCount('cache'),2);
  assert.equal(roomEnemyCount('clinic'),0);
  assert.deepEqual(roomPickupKinds('cache'),['scrap','mod']);
  assert.deepEqual(roomPickupKinds('clinic'),['heal']);
  assert.equal(roomEnemyCount('armory'),3);
  assert.equal(roomEnemyCount('elite'),2);
  assert.deepEqual(roomEncounterTypes('elite',['chaser','gunner']),['brute','guard']);
  assert.deepEqual(roomEncounterTypes('combat',['chaser','gunner']),['chaser','gunner']);
  assert.deepEqual(roomPickupKinds('elite'),['scrap','mod']);
  assert.deepEqual(roomPickupKinds('armory'),['gun']);
  assert.equal(roomEnemyCount('hazard',0),4);
  assert.equal(roomEnemyCount('hazard',.99),5);
  assert.deepEqual(roomPickupKinds('combat'),[]);
  assert.equal(roomEnemyCount('combat',0),2);
  assert.equal(roomEnemyCount('combat',.99),4);
});

test('room completion follows living enemies to their spawn room, not their current position',()=>{
  const enemies=[
    {alive:true,roomIndex:3,x:200,y:200},
    {alive:true,roomIndex:4,x:320,y:320},
    {alive:false,roomIndex:3,x:250,y:250},
  ];
  assert.equal(roomHasLivingEnemies(3,enemies),true,'an enemy still alive in the encounter blocks its reward after leaving');
  assert.equal(roomHasLivingEnemies(4,enemies),true,'the other room keeps its own completion state');
  enemies[0].alive=false;
  assert.equal(roomHasLivingEnemies(3,enemies),false,'dead enemies do not prevent room completion');
  assert.equal(roomHasLivingEnemies(2,enemies),false,'unrelated rooms remain clear');
});

test('only fought rooms earn the room-clear scrap reward',()=>{
  const enemies=[
    {alive:false,roomIndex:2},
    {alive:true,roomIndex:3},
  ];
  assert.equal(roomHasEncounter(0,enemies),false,'the entry room never gets a clear payout');
  assert.equal(roomHasEncounter(1,[]),false,'an empty clinic or merchant gets no fight reward');
  assert.equal(roomHasEncounter(2,enemies),true,'a defeated encounter still earns its reward');
  assert.equal(roomHasEncounter(3,enemies),true,'a living encounter earns its reward when it later clears');
});
