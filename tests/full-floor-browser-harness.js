import * as ROT from 'https://esm.sh/rot-js@2.1.3';
import {generateDungeon} from '../dungeon.js';
import {shortestFloorPath} from '../layout.js';

const result = document.querySelector('#result');
const frame = document.querySelector('#game');
const seed = 213838321;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const frameDoc = () => frame.contentDocument;
const frameWin = () => frame.contentWindow;
const gameState = () => JSON.parse(frameWin().render_game_to_text());
const browserErrors = [];
addEventListener('error', event => browserErrors.push(event.message));
addEventListener('unhandledrejection', event => browserErrors.push(String(event.reason)));
const savedStorage = Object.fromEntries(Array.from({length: localStorage.length}, (_, index) => localStorage.key(index))
  .filter(key => key !== null).map(key => [key, localStorage.getItem(key)]));

function restoreStorage() {
  localStorage.clear();
  for (const [key, value] of Object.entries(savedStorage)) localStorage.setItem(key, value);
}

function key(name, type = 'keydown') {
  const win = frameWin();
  win.dispatchEvent(new win.KeyboardEvent(type, {key: name, bubbles: true, cancelable: true}));
}

function clickIfVisible(selector) {
  const element = frameDoc().querySelector(selector);
  if (element && !element.hidden && element.offsetParent !== null) {
    element.click();
    return true;
  }
  return false;
}

function serviceDialogs() {
  const doc = frameDoc();
  const snapshot = gameState();
  if (snapshot.weaponPickup) {
    const choice = doc.querySelector('#weapon-pickup [data-pickup-slot]:not(:disabled)');
    if (choice) choice.click();
    else clickIfVisible('#decline-weapon-pickup');
  }
  if (!doc.querySelector('#loadout-confirm').hidden) clickIfVisible('#loadout-accept');
  else if (doc.querySelector('#loadout').classList.contains('show')) doc.querySelector('#close-loadout').click();
  if (!doc.querySelector('#merchant-panel').hidden) {
    const medkit = [...doc.querySelectorAll('#merchant-stock [data-merchant]')].find(button =>
      button.parentElement?.textContent.includes('FIELD MEDKIT') && !button.disabled);
    if (medkit && snapshot.player?.health < 5) medkit.click();
    clickIfVisible('#close-merchant');
  }
  return snapshot;
}

function advance(frames = 1) {
  for (let index = 0; index < frames; index++) {
    frameWin().advanceTime(16.667);
    serviceDialogs();
  }
}

function releaseMovement() {
  for (const name of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd']) key(name, 'keyup');
  const win = frameWin();
  win.dispatchEvent(new win.MouseEvent('mouseup', {button: 0, bubbles: true}));
}

function press(name) { key(name); key(name, 'keyup'); }

function moveTo(target) {
  let stagnant = 0, previous = Infinity;
  for (let step = 0; step < 1200; step++) {
    const state = serviceDialogs();
    if (state.mode !== 'play' || !state.player) return false;
    const dx = target.x - state.player.x, dy = target.y - state.player.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 16) { releaseMovement(); return true; }
    if (distance >= previous - 0.2) stagnant++; else stagnant = 0;
    if (stagnant > 40) { releaseMovement(); return false; }
    previous = distance;
    releaseMovement();
    key(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp'));
    advance();
  }
  releaseMovement();
  return false;
}

function movePath(path) {
  for (const cell of path.slice(1)) {
    if (!moveTo({x: (cell.x + 0.5) * 32, y: (cell.y + 0.5) * 32})) return false;
  }
  releaseMovement();
  return true;
}

function sample(state) {
  return {room: state.room, health: state.player?.health ?? null, armor: state.player?.armor ?? null,
    scrap: state.scrap, kills: state.kills, ammo: state.player?.ammo ?? null, reserve: state.player?.reserve ?? null,
    elapsed: state.elapsed, mode: state.mode};
}

async function waitForGame() {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const button = frameDoc()?.querySelector('#start-button');
    if (button && !button.disabled && typeof frameWin().advanceTime === 'function') return;
    await wait(100);
  }
  throw new Error('Game did not finish loading within 45 seconds');
}

async function run() {
  const report = {seed, rooms: [], events: [], errors: []};
  try {
    frame.src = '../index.html?two-room-browser-harness';
    await new Promise((resolve, reject) => {
      frame.addEventListener('load', resolve, {once: true});
      setTimeout(() => reject(new Error('Game page load timed out')), 45000);
    });
    frameWin().addEventListener('error', event => browserErrors.push(event.message));
    frameWin().addEventListener('unhandledrejection', event => browserErrors.push(String(event.reason)));
    await waitForGame();

    const topology = generateDungeon(ROT, seed);
    frameDoc().querySelector('#seed-input').value = String(seed);
    frameDoc().querySelector('#start-button').click();
    await wait(100);
    let state = gameState();
    report.start = sample(state);
    if (state.mode !== 'play' || !state.player) throw new Error('Seeded run did not start');

    // Exercise the loadout confirmation once, then accept it through the normal UI.
    press('Tab');
    const armor = frameDoc().querySelector('#gear-list [data-gear="armor"]');
    if (armor && !armor.disabled) {
      armor.click();
      serviceDialogs();
      report.events.push({event: 'loadout-preview', resolved: frameDoc().querySelector('#loadout-confirm').hidden,
        gear: gameState().loadout.gear});
    }
    press('Tab');
    clickIfVisible('#close-loadout');

    const rooms = topology.rooms.map((room, index) => ({...room, index}));
    const combatRooms = rooms.filter((room, index) => index > 0 && index < rooms.length - 1 && room.role === 'combat')
      .sort((a, b) => shortestFloorPath(topology.cells, {x: rooms[0].cx, y: rooms[0].cy}, {x: a.cx, y: a.cy}).length -
        shortestFloorPath(topology.cells, {x: rooms[0].cx, y: rooms[0].cy}, {x: b.cx, y: b.cy}).length)
      .slice(0, 2);
    if (combatRooms.length < 2) throw new Error('Seeded map did not have two combat rooms');
    let from = rooms[0];

    for (const room of combatRooms) {
      state = serviceDialogs();
      const gate = state.lockedDoors.find(door => !door.opened && door.room === room.name);
      if (gate) {
        const tile = {x: Math.floor(gate.x / 32), y: Math.floor(gate.y / 32)};
        const gatePath = shortestFloorPath(topology.cells, {x: from.cx, y: from.cy}, tile);
        if (!movePath(gatePath)) throw new Error(`Could not reach cache gate before ${room.name}`);
        press('e'); advance(2); state = serviceDialogs();
        if (state.lockedDoors.some(door => door.room === room.name && !door.opened)) {
          report.events.push({event: 'room-skipped', room: room.name, reason: 'gate could not be opened'});
          continue;
        }
      }
      const path = shortestFloorPath(topology.cells, {x: from.cx, y: from.cy}, {x: room.cx, y: room.cy});
      const entered = movePath(path);
      state = serviceDialogs();
      if ((!entered && state.room !== room.name) || state.mode !== 'play') {
        report.events.push({event: 'room-skipped', room: room.name, reason: 'could not reach'});
        continue;
      }
      const start = {...sample(state), livingEnemies: state.roomProgress[room.index]?.livingEnemies ?? 0};
      let fightSteps = 0;
      for (; fightSteps < 1800; fightSteps++) {
        state = serviceDialogs();
        if (state.mode !== 'play' || !state.player) break;
        const enemies = state.enemies.filter(enemy => enemy.roomIndex === room.index);
        if (!enemies.length) break;
        const threat = enemies.find(enemy => enemy.charging);
        if (threat) {
          const dx = threat.x - state.player.x, dy = threat.y - state.player.y;
          releaseMovement(); key(Math.abs(dx) > Math.abs(dy) ? 'ArrowUp' : 'ArrowRight'); advance(26); releaseMovement();
          continue;
        }
        if (state.player.reloading || state.player.ammo <= 1 && state.player.reserve > 0) {
          if (!state.player.reloading) press('Shift');
          advance(); continue;
        }
        const target = enemies.sort((a, b) => Math.hypot(a.x - state.player.x, a.y - state.player.y) - Math.hypot(b.x - state.player.x, b.y - state.player.y))[0];
        const win = frameWin();
        win.dispatchEvent(new win.MouseEvent('mousemove', {
          clientX: win.innerWidth / 2 + (target.x - state.player.x) * win.innerHeight / 520,
          clientY: win.innerHeight / 2 + (target.y - state.player.y) * win.innerHeight / 520, bubbles: true}));
        win.dispatchEvent(new win.MouseEvent('mousedown', {button: 0, bubbles: true}));
        advance();
      }
      releaseMovement(); advance(2); state = serviceDialogs();
      const livingEnemies = state.roomProgress[room.index]?.livingEnemies ?? 0;
      report.rooms.push({name: room.name, role: room.role, start, end: {...sample(state), livingEnemies}, fightSteps,
        cleared: start.livingEnemies > 0 && livingEnemies === 0, markedCleared: !!state.roomProgress[room.index]?.cleared});
      if (state.mode !== 'play' || !state.player) break;

      // Exercise the market modal in a market room; serviceDialogs buys a medkit if useful.
      if (state.merchant) { press('e'); advance(); state = serviceDialogs(); }
      from = room;
    }
    report.final = sample(gameState());
    if (report.rooms.length !== 2 || !report.rooms[0].cleared || report.rooms[1].fightSteps === 0) {
      report.error = 'The probe did not clear its first encounter and fight the later room';
    }
  } catch (error) {
    report.error = String(error?.stack || error);
  } finally {
    try {
      releaseMovement();
      if (gameState().mode === 'play') press('Escape');
    } catch (error) {
      browserErrors.push(String(error?.stack || error));
    }
    restoreStorage();
    report.localStorageRestored = true;
    report.errors = browserErrors;
    if (browserErrors.length && !report.error) report.error = 'The browser reported a runtime error';
    result.className = report.error ? 'fail' : 'pass';
    result.textContent = JSON.stringify(report, null, 2);
  }
}

void run();
