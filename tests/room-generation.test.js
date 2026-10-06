// Full-floor generation checks against the real ROT.js generator. ROT is loaded from the `rot-js` package or
// from the ROT_PATH env var (a local ESM bundle); the suite is skipped when neither is available.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {generateDungeon} from '../dungeon.js';
import {shortestFloorPath} from '../layout.js';

let ROT = null;
try { ROT = await import(process.env.ROT_PATH ? pathToFileURL(process.env.ROT_PATH).href : 'rot-js'); } catch { /* skipped below */ }

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

test('generated floors are deterministic, connected, varied and cover-rich', {skip: !ROT}, () => {
  let loops = 0, breathers = 0, templates = new Set();
  for (let i = 0; i < 40; i++) {
    const seed = 1 + i * 3571, d = generateDungeon(ROT, seed), again = generateDungeon(ROT, seed);
    assert.equal(JSON.stringify([d.cells, d.rooms]), JSON.stringify([again.cells, again.rooms]), `seed ${seed} reproducible`);
    const start = {x: d.rooms[0].cx, y: d.rooms[0].cy};
    const crateKeys = new Set(d.rooms.flatMap(r => r.crates.map(c => `${c.x},${c.y}`)));
    for (const room of d.rooms) {
      templates.add(room.template);
      assert.ok(shortestFloorPath(d.cells, start, {x: room.cx, y: room.cy}).length > 0, `seed ${seed} room ${room.index} reachable`);
      for (const spawn of room.spawnTiles) {
        assert.equal(d.cells[spawn.y][spawn.x], 0, 'spawn not in a wall');
        assert.ok(!crateKeys.has(`${spawn.x},${spawn.y}`));
        if (room.entry) assert.ok(cheb(spawn, room.entry) >= 3, 'spawn away from entry door');
      }
      for (const door of d.doors) if (Math.floor(door.x) >= room.x1 && Math.floor(door.x) <= room.x2) {
        assert.equal(d.cells[Math.floor(door.y)][Math.floor(door.x)], 0, 'door tile open');
      }
      if (room.breather) breathers++;
      assert.ok(room.cover.length + room.crates.length > 0, `seed ${seed} room ${room.index} has cover`);
    }
    for (const t of d.cells.flatMap((row, y) => row.map((v, x) => v === 0 ? {x, y} : null)).filter(Boolean)) {
      if (!crateKeys.has(`${t.x},${t.y}`)) assert.ok(shortestFloorPath(d.cells, start, t).length > 0, `seed ${seed} floor ${t.x},${t.y} reachable`);
    }
    loops += d.loops;
  }
  assert.ok(loops > 0, 'some floors have flank loops');
  assert.ok(breathers > 20, 'most floors have a breather');
  assert.ok(templates.size >= 10, `template variety (${templates.size})`);
});
