import test from 'node:test';
import assert from 'node:assert/strict';
import {roomsAvoidableOnRoute, shapeDungeon, shortestFloorPath} from './layout.js';

const blank = (width, height) => Array.from({length:height}, () => Array(width).fill(1));
const room = (x1,x2,y1,y2) => ({x1,x2,y1,y2});

test('doorways stay walkable, become two cells wide, and retain frame positions', () => {
  const cells = blank(12,9);
  for (let y=2;y<=6;y++) for(let x=2;x<=4;x++) cells[y][x]=0;
  for (let y=2;y<=6;y++) for(let x=7;x<=9;x++) cells[y][x]=0;
  cells[4][5]=2; cells[4][6]=2;
  const result=shapeDungeon(cells,[room(2,4,2,6),room(7,9,2,6)],{x:3,y:4});
  assert.equal(result.cells[4][5],0);
  assert.equal(result.cells[4][6],0);
  assert.ok(result.doors.some(door=>door.kind==='corridor'));
  assert.ok(shortestFloorPath(result.cells,{x:3,y:4},{x:8,y:4}).length>0);
});

test('close parallel rooms get a short double-width door connection', () => {
  const cells=blank(14,10);
  for(let y=2;y<=7;y++) for(let x=2;x<=5;x++) cells[y][x]=0;
  for(let y=2;y<=7;y++) for(let x=7;x<=10;x++) cells[y][x]=0;
  const result=shapeDungeon(cells,[room(2,5,2,7),room(7,10,2,7)],{x:3,y:4});
  assert.equal(result.cells[4][6],0);
  assert.equal(result.cells[5][6],0);
  assert.ok(result.doors.some(door=>door.kind==='room-link'));
  assert.ok(shortestFloorPath(result.cells,{x:3,y:4},{x:9,y:4}).length>0);
});

test('rooms with one short hall between them get a framed shortcut through the wall', () => {
  const cells=blank(15,10);
  for(let y=2;y<=7;y++) for(let x=2;x<=5;x++) cells[y][x]=0;
  for(let y=2;y<=7;y++) for(let x=9;x<=12;x++) cells[y][x]=0;
  const result=shapeDungeon(cells,[room(2,5,2,7),room(9,12,2,7)],{x:3,y:4});
  assert.ok(result.doors.filter(door=>door.kind==='room-link').length>=2);
  assert.equal(result.cells[4][6],0);
  assert.equal(result.cells[4][7],0);
  assert.equal(result.cells[4][8],0);
  assert.ok(shortestFloorPath(result.cells,{x:3,y:4},{x:10,y:4}).length>0);
});

test('long straight corridors widen to three cells without opening room walls', () => {
  const cells=blank(14,9);
  for(let x=2;x<=4;x++) for(let y=2;y<=6;y++) cells[y][x]=0;
  for(let x=9;x<=11;x++) for(let y=2;y<=6;y++) cells[y][x]=0;
  for(let x=5;x<=8;x++) cells[4][x]=0;
  const result=shapeDungeon(cells,[room(2,4,2,6),room(9,11,2,6)],{x:3,y:4});
  assert.equal(result.cells[3][6],0);
  assert.equal(result.cells[5][6],0);
  assert.equal(result.cells[1][3],1);
});

test('unreachable floor is removed and a disconnected goal has no route', () => {
  const cells=blank(8,6); cells[2][2]=0; cells[3][2]=0; cells[2][5]=0;
  const result=shapeDungeon(cells,[room(2,2,2,3)],{x:2,y:2});
  assert.equal(result.cells[2][5],1);
  assert.deepEqual(shortestFloorPath(result.cells,{x:2,y:2},{x:5,y:2}),[]);
});

test('enemy navigation can route around blocking cover while keeping the destination clear', () => {
  const cells=Array.from({length:7},()=>Array(7).fill(0));
  const blocked=(x,y)=>x===3&&y>=1&&y<=5;
  const path=shortestFloorPath(cells,{x:1,y:3},{x:5,y:3},(x,y)=>cells[y]?.[x]===0&&!blocked(x,y));
  assert.ok(path.length>0);
  assert.ok(path.every(point=>!blocked(point.x,point.y)));
  assert.ok(path.some(point=>point.y===0||point.y===6));
});

test('replanning at each tile carries an enemy around a corner to its goal',()=>{
  const cells=Array.from({length:7},()=>Array(7).fill(0));
  const blocked=(x,y)=>x===3&&y>=1&&y<=5;
  let current={x:1,y:3};
  for(let step=0;step<20&&(current.x!==5||current.y!==3);step++){
    const path=shortestFloorPath(cells,current,{x:5,y:3},(x,y)=>cells[y]?.[x]===0&&!blocked(x,y));
    assert.ok(path.length>1,'each waypoint should have a next step');
    current=path[1];
  }
  assert.deepEqual(current,{x:5,y:3});
});

test('a branch room stays reachable while the entry-to-extraction route can avoid it',()=>{
  const cells=blank(17,12);
  const rooms=[
    {...room(1,3,4,6),cx:2,cy:5},
    {...room(7,9,4,6),cx:8,cy:5},
    {...room(7,9,1,3),cx:8,cy:2},
    {...room(13,15,4,6),cx:14,cy:5},
  ];
  for(const {x1,x2,y1,y2} of rooms)for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++)cells[y][x]=0;
  for(let x=4;x<=6;x++)cells[5][x]=0;
  for(let x=10;x<=12;x++)cells[5][x]=0;
  for(let y=3;y<=4;y++)cells[y][8]=0;

  assert.deepEqual(roomsAvoidableOnRoute(cells,rooms),[2]);
  assert.ok(shortestFloorPath(cells,{x:2,y:5},{x:14,y:5}).length>0,'the extraction route should bypass the optional room');
  assert.ok(shortestFloorPath(cells,{x:2,y:5},{x:8,y:2}).length>0,'the optional room should remain reachable');
});

test('rooms on the only route to extraction are not marked optional',()=>{
  const cells=blank(12,9),rooms=[
    {...room(1,3,3,5),cx:2,cy:4},
    {...room(5,7,3,5),cx:6,cy:4},
    {...room(9,11,3,5),cx:10,cy:4},
  ];
  for(const {x1,x2,y1,y2} of rooms)for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++)cells[y][x]=0;
  for(let x=4;x<=8;x++)cells[4][x]=0;
  assert.deepEqual(roomsAvoidableOnRoute(cells,rooms),[]);
});

test('L, U, and C rooms carve different outlines while keeping their centers and doors connected',()=>{
  const seeds={L:4,U:0,C:1};
  for(const [expected,seed] of Object.entries(seeds)){
    const cells=blank(18,12),rooms=[
      {...room(2,7,2,9),cx:4,cy:5,index:0},
      {...room(9,14,2,9),cx:11,cy:5,index:1},
    ];
    for(let y=2;y<=9;y++)for(let x=2;x<=7;x++)cells[y][x]=0;
    for(let y=2;y<=9;y++)for(let x=9;x<=14;x++)cells[y][x]=0;
    const before=cells.slice(3,9).reduce((count,row)=>count+row.slice(10,14).filter(value=>value===0).length,0);
    const result=shapeDungeon(cells,rooms,{x:4,y:5},seed);
    const after=result.cells.slice(3,9).reduce((count,row)=>count+row.slice(10,14).filter(value=>value===0).length,0);
    assert.equal(result.roomShapes.find(item=>item.index===1).shape,expected);
    assert.ok(after<before,`${expected} should remove part of the rectangular floor`);
    assert.equal(result.cells[5][11],0,`${expected} should keep the room center open`);
    assert.ok(shortestFloorPath(result.cells,{x:4,y:5},{x:11,y:5}).length>0,`${expected} should retain its door route`);
  }
});
