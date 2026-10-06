// Glue between the pure boss brain (boss.js) and the game world. game.js builds one `g` context object:
//   {state, spawnEnemy, findEnemySpawn, fireBullet, hitPlayer, dropPickup, freeRoomPoint, emit, toast, banner, feed, onBossBar}
// and calls spawnBoss() when the final floor is built and updateBossEnemy() from the enemy loop.
import {BOSS, activateBoss, bossDamageMult, bossVulnerable, createBoss, stepBoss, tempoRate} from './boss.js';
import {TILE} from './catalog.js';

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
    activateBoss(boss); g.onBossBar(true, e); g.banner(BOSS.name, 'EVERY ATTACK IS TELEGRAPHED · STAND STILL TO READ IT');
  }
  const adds = state.enemies.filter(other => other.alive && other !== e && other.roomIndex === e.roomIndex).length;
  // Phase II TEMPO: his pattern clock runs on how much YOU move (real time x tempo), not on world time.
  const tempoOn = boss.phase === 2 && boss.mode !== 'intro' && boss.mode !== 'shift';
  boss.tempo = tempoOn ? tempoRate(g.speedRatio?.() ?? 1) : 1;
  const bossDt = tempoOn ? (state.frameDt || dt) * boss.tempo : dt;
  const beat = boss.phase === 3 ? g.musicBeat?.() : null;
  const out = stepBoss(boss, bossDt, {boss: e, player, hpFraction: e.hp / e.maxHp, adds, rng: g.random, beat: beat || undefined});
  e.aware = boss.active; e.face = {x: Math.cos(boss.angle), y: Math.sin(boss.angle)}; e.aim = e.face;
  e.aimTimer = boss.telegraph ? Math.max(0, boss.t) : 0; e.vis && (e.vis.aimMax = boss.total || 0);
  for (const action of out.actions) {
    if (action.type === 'bullets') {
      for (const shot of action.shots) g.fireBullet('enemy', e.x, e.y, Math.cos(shot.angle), Math.sin(shot.angle), {speed: shot.speed, range: BOSS_BULLET.range, damage: shot.damage, color: BOSS_BULLET.color}, 1, {enemyId: e.id, damage: shot.damage});
      g.sound?.('enemyShot', e);
      state.shake = Math.max(state.shake, 1.4);
    } else if (action.type === 'phase') {
      state.bullets = state.bullets.filter(b => { if (b.owner === 'enemy') { if (b.body) g.removeBody(b.body); return false; } return true; });
      g.banner(action.phase === 2 ? 'PHASE II · TEMPO' : 'PHASE III · BEATDROP', action.phase === 2 ? 'HE CONDUCTS YOUR TIME · HIS ATTACKS ONLY ADVANCE WHILE YOU MOVE' : 'HE MARKS A LINE ON THE BEAT · STEP OFF IT ON THE OFF-BEAT');
      g.feed(action.phase === 2 ? 'TEMPO · MOVE TO ADVANCE HIS PATTERNS' : 'BEATDROP · DODGE ON THE OFF-BEAT', 'warn');
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
      state.shake = Math.max(state.shake, 3);
    } else if (action.type === 'exposed') {
      g.toast('EXPOSED · HIT HIM NOW', 900);
    }
  }
  // Movement: velocity from the brain (it is already in sim seconds because dt is scaled; the body velocity is
  // converted the same way every other enemy's is).
  const wanted = Math.hypot(out.move.x, out.move.y);
  e.body.setLinvel({x: out.move.x + e.knock.x * .15, y: out.move.y + e.knock.y * .15}, true);
  const pos = e.body.translation(); e.x = pos.x; e.y = pos.y;
  if (boss.mode === 'charge' && boss.t < BOSS.chargeTime - .12) {
    const vel = e.body.linvel();
    if (Math.hypot(vel.x, vel.y) < wanted * .35) boss.hitWall = true;
    if (Math.hypot(player.x - e.x, player.y - e.y) < BOSS.radius + 10 && !e.chargeHit) { e.chargeHit = true; g.hitPlayer(BOSS.contactDamage, e.x, e.y); }
  } else if (boss.mode !== 'charge') e.chargeHit = false;
  e.shownHp += (e.hp - e.shownHp) * Math.min(1, dt * 6 + .02);
  g.onBossBar(false, e);
}
