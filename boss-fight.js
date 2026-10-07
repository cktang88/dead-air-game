// Glue between the pure boss brain (boss.js) and the game world. game.js builds one `g` context object:
//   {state, spawnEnemy, findEnemySpawn, fireBullet, hitPlayer, dropPickup, freeRoomPoint, emit, toast, banner, feed, onBossBar}
// and calls spawnBoss() when the final floor is built and updateBossEnemy() from the enemy loop.
import {BOSS, SHOT_FEED_TIME, SIGHT_LOST_REPOSITION, activateBoss, bossAmmoDropsDue, bossClockDt, bossDamageMult, bossVulnerable, createBoss, dryAmmoDropDue, stepBoss} from './boss.js';
import {TILE} from './catalog.js';

const HEAL_AT = [.75, .38]; // medkits that ride along with two of the ammo drops (the fight is long and health does not regen)
const BOSS_BULLET = {color: 0xff6aa8, range: 760};

export function spawnBoss(g, room, hpMult = 1) {
  // Stand a little off-centre so the exit marker (room centre) stays readable.
  let tx = room.cx - 3; const ty = room.cy;
  if (g.state.solidMap[ty]?.[tx] !== 0) tx = room.cx;
  const x = (tx + .5) * TILE, y = (ty + .5) * TILE;
  const enemy = g.spawnEnemy('boss', x, y, g.state.rooms.indexOf(room));
  enemy.boss = createBoss();
  enemy.hp = enemy.maxHp = Math.round(BOSS.maxHp * hpMult);
  enemy.shownHp = enemy.hp;
  return enemy;
}

// Damage the boss takes from a bullet: nothing while invulnerable, extra while exposed after a charge.
export function bossDamageFor(enemy, damage) {
  if (!enemy.boss) return damage;
  if (!bossVulnerable(enemy.boss)) return 0;
  return damage * bossDamageMult(enemy.boss);
}

// Stage lighting for the arena: the whole room glows a little and the Conductor stands in his own spotlight, so he is
// always lit (the darkness layer carves these out). Pure: returns [{x, y, r, a}] in world px.
export function bossLights(room, e, tile = TILE) {
  if (!room || !e?.alive) return [];
  const cx = (room.cx + .5) * tile, cy = (room.cy + .5) * tile, R = Math.max(room.x2 - room.x1, room.y2 - room.y1) * tile * .62;
  return [{x: cx, y: cy, r: R, a: .55}, {x: e.x, y: e.y, r: 190, a: .8}];
}
// Frame the fight: nudge the camera from the player toward the boss (at most `max` px) so he is never at the screen edge.
export function bossCamShift(player, e, {weight = .45, max = 150} = {}) {
  if (!player || !e?.alive) return {x: 0, y: 0};
  const dx = (e.x - player.x) * weight, dy = (e.y - player.y) * weight, d = Math.hypot(dx, dy);
  return d > max ? {x: dx / d * max, y: dy / d * max} : {x: dx, y: dy};
}

export function updateBossEnemy(g, e, dt) {
  const {state} = g, boss = e.boss, player = state.player;
  if (!boss || !e.alive || !player) return;
  if (!boss.active && state.currentRoom === e.roomIndex) {
    activateBoss(boss); g.onBossBar(true, e); for (let i = 0; i < 2; i++) g.dropPickup('ammo', ...g.freeRoomPoint(state.rooms[e.roomIndex]), .6); g.banner(BOSS.name, 'EVERY ATTACK IS TELEGRAPHED · STAND STILL TO READ IT, MOVE TO DODGE');
  }
  const adds = state.enemies.filter(other => other.alive && other !== e && other.roomIndex === e.roomIndex).length;
  // His clock: real-time staging for intro/shift, TEMPO in phase II, a floor elsewhere, and your shots feed it (boss.js bossClockDt).
  const shots = state.shotsFired || 0, now = state.realElapsed || 0;
  if (boss.lastShots === undefined) boss.lastShots = shots;
  if (shots !== boss.lastShots) { boss.lastShots = shots; boss.fedUntil = now + SHOT_FEED_TIME; }
  const fed = now < (boss.fedUntil || 0), speed = g.speedRatio?.() ?? 1;
  const bossDt = bossClockDt({phase: boss.phase, mode: boss.mode, dt, frameDt: state.frameDt || dt, speedRatio: speed, fed});
  boss.tempo = boss.phase === 2 && boss.mode !== 'intro' && boss.mode !== 'shift' ? Math.min(1, bossDt / Math.max(1e-6, state.frameDt || dt)) : 1;
  // Ammo: the arena has no kills to drop it, so health thresholds and a dry player (cooldown) drop it here.
  if (boss.active && boss.mode !== 'intro') {
    const room = state.rooms[e.roomIndex], given = boss.ammoGiven ||= [];
    for (const f of bossAmmoDropsDue(e.hp / e.maxHp, given)) { given.push(f); g.dropPickup('ammo', ...g.freeRoomPoint(room), .6); if (HEAL_AT.includes(f)) g.dropPickup('heal', ...g.freeRoomPoint(room), 1); g.feed(HEAL_AT.includes(f) ? 'AMMO + MEDKIT DROPPED' : 'AMMO DROPPED', 'good'); }
    if (dryAmmoDropDue(g.playerDry?.(), now, boss.dryDropAt ?? -1e9)) { boss.dryDropAt = now; g.dropPickup('ammo', ...g.freeRoomPoint(room), .6); g.feed('OUT OF AMMO · AMMO DROPPED', 'good'); }
  }
  // Line of sight: when cover has hidden you for a while he walks a nav path round it (boss.js sightAction), recomputed ~3x/s.
  const los = g.los ? g.los(e.x, e.y, player.x, player.y) : true;
  if (boss.active && !los && boss.sightLost >= SIGHT_LOST_REPOSITION - .5 && g.path && boss.mode === 'idle') {
    boss.pathAt = (boss.pathAt ?? -1e9);
    if (now - boss.pathAt > .3) { boss.pathAt = now; boss.route = g.path({x: e.x, y: e.y}, {x: player.x, y: player.y}); }
  } else if (los) boss.route = null;
  let seek;
  if (boss.route?.length) { while (boss.route.length > 1 && Math.hypot(boss.route[0].x - e.x, boss.route[0].y - e.y) < 14) boss.route.shift(); seek = boss.route[0]; }
  const prevMode = boss.mode;
  const beat = boss.phase === 3 ? g.musicBeat?.() : null;
  const out = stepBoss(boss, bossDt, {boss: e, player, hpFraction: e.hp / e.maxHp, adds, rng: g.random, beat: beat || undefined, los, realDt: dt > 0 ? (state.frameDt || dt) : 0, seek});
  if (boss.mode === 'telegraph' && prevMode !== 'telegraph' && (boss.pattern === 'charge' || boss.pattern === 'lob')) g.sound?.(boss.pattern === 'charge' ? 'bossCharge' : 'bossLob', e);
  e.aware = boss.active; e.face = {x: Math.cos(boss.angle), y: Math.sin(boss.angle)}; e.aim = e.face;
  e.aimTimer = boss.telegraph ? Math.max(0, boss.t) : 0; e.vis && (e.vis.aimMax = boss.total || 0);
  for (const action of out.actions) {
    if (action.type === 'bullets') {
      const from = action.from || e;
      for (const shot of action.shots) g.fireBullet('enemy', from.x, from.y, Math.cos(shot.angle), Math.sin(shot.angle), {speed: shot.speed, range: BOSS_BULLET.range, damage: shot.damage, color: BOSS_BULLET.color}, 1, {enemyId: e.id, damage: shot.damage, boss: true});
      g.sound?.(action.from ? 'bossLobHit' : 'enemyShot', action.from ? {...action.from} : e);
      state.shake = Math.max(state.shake, 1.4);
    } else if (action.type === 'phase') {
      state.bullets = state.bullets.filter(b => { if (b.owner === 'enemy') { if (b.body) g.removeBody(b.body); return false; } return true; });
      g.banner(action.phase === 2 ? 'PHASE II · TEMPO' : 'PHASE III · BEATDROP', action.phase === 2 ? 'HE CONDUCTS YOUR TIME · MOVING OR FIRING WINDS HIS PATTERN UP' : 'HE MARKS A LINE ON THE BEAT · STEP OFF IT ON THE OFF-BEAT');
      g.feed(action.phase === 2 ? 'TEMPO · MOVING AND FIRING ADVANCE HIS PATTERNS' : 'BEATDROP · DODGE ON THE OFF-BEAT', 'warn');
      g.dropPickup('heal', ...g.freeRoomPoint(state.rooms[e.roomIndex]), 2);
      g.dropPickup('ammo', ...g.freeRoomPoint(state.rooms[e.roomIndex]), .4);
      g.dropPickup('ammo', ...g.freeRoomPoint(state.rooms[e.roomIndex]), .4);
      state.shake = Math.max(state.shake, 7); state.hitstop = Math.max(state.hitstop, .12);
    } else if (action.type === 'summon') {
      for (let i = 0; i < action.count; i++) {
        const type = (i + state.kills) % 2 ? 'gunner' : 'chaser', spot = g.findEnemySpawn(state.rooms[e.roomIndex], type);
        if (spot) { g.spawnEnemy(type, spot.x, spot.y, e.roomIndex); g.fx?.pickup(spot.x, spot.y, '#d58cff'); }
      }
    } else if (action.type === 'charge') {
      state.shake = Math.max(state.shake, 3); g.sound?.('bossCharge', e, true);
    } else if (action.type === 'exposed') {
      g.toast('EXPOSED · HIT HIM NOW', 900);
    }
  }
  // Movement: velocity from the brain (it is already in sim seconds because dt is scaled; the body velocity is
  // converted the same way every other enemy's is).
  const wanted = Math.hypot(out.move.x, out.move.y);
  e.knock.x = e.knock.y = 0; // the Conductor is not shoved by hits (the knock never decayed on the boss branch and made him drift)
  // Repositioning must not crawl when the world is slowed: scale the velocity up so it moves at >= 80% of real speed.
  const reposK = boss.seek && boss.mode === 'idle' && dt > 0 ? Math.max(1, .8 * (state.frameDt || dt) / dt) : 1;
  e.body.setLinvel({x: out.move.x * reposK, y: out.move.y * reposK}, true);
  let pos = e.body.translation();
  const room = state.rooms[e.roomIndex]; // stay inside the arena, never drift into a corridor
  if (room) {
    const cx = Math.min(Math.max(pos.x, (room.x1 + 1) * TILE + BOSS.radius + 2), room.x2 * TILE - BOSS.radius - 2), cy = Math.min(Math.max(pos.y, (room.y1 + 1) * TILE + BOSS.radius + 2), room.y2 * TILE - BOSS.radius - 2);
    if (cx !== pos.x || cy !== pos.y) { e.body.setTranslation({x: cx, y: cy}, true); pos = {x: cx, y: cy}; if (boss.mode === 'charge') boss.hitWall = true; }
  }
  e.x = pos.x; e.y = pos.y;
  if (boss.mode === 'charge' && boss.t < BOSS.chargeTime - .12) {
    const vel = e.body.linvel();
    if (Math.hypot(vel.x, vel.y) < wanted * .35) boss.hitWall = true;
    if (Math.hypot(player.x - e.x, player.y - e.y) < BOSS.chargeHitRadius && !e.chargeHit) { e.chargeHit = true; g.hitPlayer(BOSS.contactDamage, e.x, e.y); }
  } else if (boss.mode !== 'charge') e.chargeHit = false;
  e.shownHp += (e.hp - e.shownHp) * Math.min(1, dt * 6 + .02);
  g.onBossBar(false, e);
}
