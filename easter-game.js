// Game-side glue for the easter eggs (secrets.js / easter.js hold the rules, details2d.js draws them). game.js builds one
// context `g` and calls these hooks; nothing here changes combat or balance: the only rewards are cosmetic (a hat) or a
// field tape, and every secret is visible before it is found (a cracked wall you can see, a tape glinting in a corner).
//
// g = {state, view, toast(msg, ms), TILE, removeBody(body), sound:{break, pickup, tape}, nav()}
import {planSecret, planTape, numberStationRooms, hitCrack, bulletHitsTile} from './secrets.js';
import {hatFor, unlockHat, loadCosmetics, saveCosmetics, createCodeMatcher, codeById, toggleMode, HAT_BY_ID} from './easter.js';
import {fieldTapeFor, FIELD_TAPES} from './story.js';
import {RIG_FX} from './rig2d.js';

export const BOW_AFTER = 10;   // seconds of perfectly still door-peeking at the Conductor before he bows

/** Plan everything hidden on a freshly generated floor. Call right after state.tileMap / rooms exist. */
export function planFloor(state, {boss = false} = {}) {
  state.secret = state.fieldTape = null; state.numberRooms = new Set();
  if (state.signal?.active || !state.tileMap?.length) return;
  const last = state.rooms.length - 1, skipRooms = boss ? [state.rooms[last]?.index] : [];
  const seed = state.seed || 1, floor = state.floor || 1;
  const plan = planSecret({tileMap: state.tileMap, rooms: state.rooms, seed, floor, skipRooms});
  if (plan) {
    // half of the secrets hide a hat, the rest a tape; the same seed always hides the same thing
    const wantsHat = ((seed ^ (floor * 2654435761)) >>> 0) % 2 === 0;
    const reward = wantsHat ? {type: 'hat', id: hatFor(seed, floor)} : {type: 'tape', id: fieldTapeFor(seed, floor + 1).id};
    state.secret = {...plan, hp: plan.hits, opened: false, taken: false, reward, rewardPx: {x: (plan.reward.x + 0.5) * 32, y: (plan.reward.y + 0.5) * 32}, body: null};
  }
  const tape = planTape({tileMap: state.tileMap, rooms: state.rooms, doors: state.doors || [], seed, floor, avoid: [...skipRooms, plan?.room]});
  if (tape) state.fieldTape = {...tape, taken: false};
  if (!boss) for (const i of numberStationRooms({rooms: state.rooms, seed, floor})) state.numberRooms.add(i);
}
/** Tiles the secret hollows out (crack + pocket). Wall physics skips them; the crack gets its own removable body. */
export const hollowSet = (state) => new Set((state.secret?.cells || []).map((c) => c.y * state.mapW + c.x));

export function createEggs(g) {
  const {state} = g;
  state.cosmetics = (() => { try { return loadCosmetics(localStorage); } catch { return loadCosmetics(null); } })();
  const apply = () => { RIG_FX.headScale = state.cosmetics.bighead ? 1.7 : 1; try { document.documentElement.classList.toggle('vhs', !!state.cosmetics.vhs); } catch { /* no DOM */ } };
  apply();
  const matcher = createCodeMatcher();
  const save = () => { try { saveCosmetics(localStorage, state.cosmetics); } catch { /* storage blocked: modes last for this session */ } apply(); };

  /** Title-screen key codes. Returns true if a code completed. */
  function key(code) {
    const id = matcher.push(code);
    if (!id) return false;
    state.cosmetics = toggleMode(state.cosmetics, id);
    const c = codeById(id);
    g.toast(state.cosmetics[id] ? c.on : c.off, 3600);
    save();
    return true;
  }

  /** A bullet ended on a wall: if it struck the cracked tile, chip it. Returns true when the wall just opened. */
  function shot(b) {
    const s = state.secret;
    if (!s || s.opened) return false;
    if (!bulletHitsTile(b.x, b.y, b.vx, b.vy, s.crack.x, s.crack.y, g.TILE)) return false;
    const r = hitCrack(s.hp, 1);
    s.hp = r.hp;
    const x = (s.crack.x + 0.5) * g.TILE, y = (s.crack.y + 0.5) * g.TILE;
    for (let i = 0; i < 5; i++) g.view.fx.dust(x + (Math.random() - 0.5) * 12, y + (Math.random() - 0.5) * 12, -s.dir.x * 60, -s.dir.y * 60);
    if (r.broke) open();
    else { g.toast(s.hp === 1 ? 'THE WALL IS GIVING' : 'THE CRACK WIDENS', 900); g.sound.hit?.(); }
    return r.broke;
  }
  /** Explosions near the crack (frag grenades) open it in one go. */
  function blast(x, y, radius) {
    const s = state.secret;
    if (!s || s.opened) return;
    const cx = (s.crack.x + 0.5) * g.TILE, cy = (s.crack.y + 0.5) * g.TILE;
    if (Math.hypot(cx - x, cy - y) < radius) { s.hp = 0; open(); }
  }
  function open() {
    const s = state.secret;
    s.opened = true; s.hp = 0;
    for (const c of s.cells) { state.tileMap[c.y][c.x] = 0; state.solidMap[c.y][c.x] = 0; state.nav?.setSolid?.(c.x, c.y, 0); }
    if (s.body) { g.removeBody(s.body); s.body = null; }
    g.view.world.patchTiles?.(s.cells); g.view.lighting.patchTiles?.(s.cells);
    const x = (s.crack.x + 0.5) * g.TILE, y = (s.crack.y + 0.5) * g.TILE;
    for (let i = 0; i < 4; i++) g.view.fx.spark(x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 10, Math.random() * 6.28, 6, 1.3);
    for (let i = 0; i < 10; i++) g.view.fx.dust(x + (Math.random() - 0.5) * 20, y + (Math.random() - 0.5) * 20, -s.dir.x * 90 + (Math.random() - 0.5) * 60, -s.dir.y * 90 + (Math.random() - 0.5) * 60);
    g.sound.break?.();
    state.shake = Math.max(state.shake || 0, 5);
    g.toast('SECRET ROOM FOUND', 3200);
    state.secretsFound = (state.secretsFound || 0) + 1;
  }

  function takeReward() {
    const s = state.secret;
    s.taken = true;
    g.sound.pickup?.();
    if (s.reward.type === 'hat') {
      const r = unlockHat(state.cosmetics, s.reward.id);
      state.cosmetics = r.cosmetics; save();
      const hat = HAT_BY_ID.get(s.reward.id);
      g.toast(`${r.isNew ? 'NEW HAT' : 'HAT'} · ${hat.name} · ${hat.blurb}`, 4200);
    } else playTape(s.reward.id);
  }
  function playTape(id) {
    const t = (id && FIELD_TAPES.find((x) => x.id === id)) || fieldTapeFor(state.seed, state.floor);
    state.testCardT = 1.4;
    g.sound.tape?.();
    g.toast(`${t.title} · ${t.text}`, 6800);
    state.fieldTapes = (state.fieldTapes || 0) + 1;
  }

  /** Per-frame checks that need the real clock: pickups, the Conductor's bow. */
  function frame(dt) {
    const p = state.player;
    if (!p || state.mode !== 'play' || state.paused) return;
    const s = state.secret;
    if (s?.opened && !s.taken && Math.hypot(p.x - s.rewardPx.x, p.y - s.rewardPx.y) < 18) takeReward();
    const f = state.fieldTape;
    if (f && !f.taken && Math.hypot(p.x - f.x, p.y - f.y) < 15) { f.taken = true; playTape(null); }
    // the Conductor bows if you watch him through the door, perfectly still, for 10 seconds before he wakes
    const boss = state.boss;
    if (boss?.alive && boss.boss && !boss.boss.active) {
      if (state.peek && state.peek.room === boss.roomIndex) {
        state.bowStill = (state.bowStill || 0) + dt;
        if (state.bowStill >= BOW_AFTER && !state.bowDone) {
          state.bowDone = true; (boss.vis ??= {}).bowT = 2.4;
          g.view.fx.floater(boss.x, boss.y - 34, '*BOWS*', '#e8c58c', 14, 2);
          g.toast('THE CONDUCTOR BOWS · MANNERS COST NOTHING', 3600);
          state.bows = (state.bows || 0) + 1;
        }
      } else state.bowStill = 0;
    } else state.bowStill = 0;
    if (boss?.vis?.bowT > 0) boss.vis.bowT = Math.max(0, boss.vis.bowT - dt);
  }
  function reset() { state.bowStill = 0; state.bowDone = false; }

  return {key, shot, blast, frame, reset, apply, save};
}
