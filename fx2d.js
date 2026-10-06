// Particles, flashes, rings, floaters and light events for the Canvas 2D renderer.
// World-space effects age with the (time-scaled) simulation step; UI feedback ages in real time.
import {INK, TAU, glowSprite, hexStr, puffSprite, rgba, shade, tint} from './sprites2d.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const WOOD = ['#a07651', '#8a6244', '#c79a6a', '#6d4c36'];
const SPARK = ['#fff3c4', '#ffd98a', '#ffffff'];
const BLOODS = ['#7b1c30', '#5f1424', '#9a2a40'];

export class Fx {
  constructor() {
    this.parts = [];
    this.flashes = [];
    this.rings = [];
    this.lights = [];
    this.floaters = [];
    this.decals = [];
    this.hitMark = 0; this.hitKill = false;
    this.hurt = 0;
    this.killPop = 0;
    this.camPunch = 0;
    this.isSolid = () => false;
    this.cap = 650;
  }

  clear() { this.parts.length = this.flashes.length = this.rings.length = this.lights.length = this.floaters.length = this.decals.length = 0; this.hitMark = 0; this.hurt = 0; this.camPunch = 0; }

  add(p) {
    if (this.parts.length >= this.cap) this.parts.shift();
    p.age = 0; p.drag ??= 4; p.grow ??= 0; p.rot ??= 0; p.vr ??= 0; p.z ??= 0; p.vz ??= 0; p.g ??= 0; p.bounce ??= 0.4; p.tm ??= 0;
    this.parts.push(p);
  }

  // ---- emitters
  spark(x, y, angle, count = 4, spread = 1, speed = [160, 380], color) {
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() * 2 - 1) * spread, s = rand(speed[0], speed[1]);
      this.add({kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 8, life: rand(0.1, 0.24), size: rand(1.2, 2), color: color || pick(SPARK)});
    }
  }
  chips(x, y, angle, colors, count, spread = Math.PI, speed = [40, 190], size = [1.5, 3.4], life = [0.35, 0.8]) {
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() * 2 - 1) * spread, s = rand(speed[0], speed[1]);
      this.add({kind: 'chip', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 5, life: rand(life[0], life[1]), size: rand(size[0], size[1]), color: pick(colors), rot: rand(0, TAU), vr: rand(-14, 14)});
    }
  }
  smoke(x, y, size = 9, count = 1, color = '#a29da8', spread = 20, life = [0.6, 1.1], alpha = 0.5) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU), s = rand(4, spread);
      this.add({kind: 'smoke', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 2.2, life: rand(life[0], life[1]), size: size * rand(0.7, 1.2), grow: 1.5, color, alpha});
    }
  }
  dust(x, y, vx = 0, vy = 0) {
    this.add({kind: 'smoke', x: x + rand(-2, 2), y: y + rand(-2, 2), vx: -vx * 0.12 + rand(-6, 6), vy: -vy * 0.12 + rand(-6, 6), drag: 3, life: rand(0.35, 0.6), size: rand(2.8, 4.4), grow: 1.7, color: '#b3a9a4', alpha: 0.2});
  }
  blood(x, y, angle, count = 6, spread = 0.7, speed = [60, 240]) {
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() * 2 - 1) * spread, s = rand(speed[0], speed[1]);
      this.add({kind: 'drop', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 6, life: rand(0.25, 0.55), size: rand(1.1, 2.4), color: pick(BLOODS)});
    }
  }

  muzzle(x, y, angle, {color = '#ffd58a', size = 1, light = true} = {}) {
    this.flashes.push({x, y, a: angle, age: 0, life: 0.075, size, color});
    if (light) this.lights.push({x, y, r: 84 * size, age: 0, life: 0.12, strength: 0.65, color});
    this.spark(x, y, angle, 3, 0.35, [200, 420]);
    this.smoke(x + Math.cos(angle) * 3, y + Math.sin(angle) * 3, 4.5, 1, '#c9c2c8', 14, [0.35, 0.6], 0.28);
  }
  casing(x, y, angle) {
    const a = angle + Math.PI / 2 + rand(-0.5, 0.4), s = rand(70, 150);
    this.add({kind: 'casing', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 2.6, life: rand(1.1, 1.6), size: 2, rot: rand(0, TAU), vr: rand(-30, 30), z: 5, vz: rand(55, 95), g: 330, bounce: 0.42});
  }
  // A spent magazine dropping from the gun: falls, bounces twice and lies on the floor for a while.
  mag(x, y, angle, side = 1) {
    const a = angle + side * Math.PI / 2 + rand(-0.3, 0.3), s = rand(26, 52);
    this.add({kind: 'mag', x, y, vx: Math.cos(a) * s + Math.cos(angle) * 8, vy: Math.sin(a) * s + Math.sin(angle) * 8, drag: 2.4, life: 9, size: 1, rot: angle + rand(-0.4, 0.4), vr: rand(-9, 9), z: 7, vz: rand(18, 40), g: 300, bounce: 0.34});
  }
  star(x, y, color, size = 3, life = 0.4) { this.add({kind: 'star', x, y, vx: 0, vy: -rand(8, 22), drag: 2, life, size, color, rot: rand(0, 1), vr: rand(-3, 3)}); }

  // Impacts read the wall's normal: sparks leave on the mirrored ray, grit and dust fan out of the surface, a flat
  // splat flashes along the wall, and grazing hits ricochet with long streaks.
  wallImpact(x, y, vx, vy, owner = 'player') {
    const sp = Math.hypot(vx, vy) || 1, dx = vx / sp, dy = vy / sp, hot = owner === 'player', d = 4;
    let nx = 0, ny = 0;
    if (this.isSolid(x + d, y)) nx -= 1; if (this.isSolid(x - d, y)) nx += 1;
    if (this.isSolid(x, y + d)) ny -= 1; if (this.isSolid(x, y - d)) ny += 1;
    let nl = Math.hypot(nx, ny);
    if (nl < 0.01 || nx * dx + ny * dy > 0) { nx = -dx; ny = -dy; nl = 1; } else { nx /= nl; ny /= nl; }
    const dot = dx * nx + dy * ny, rx = dx - 2 * dot * nx, ry = dy - 2 * dot * ny, graze = 1 + dot; // 0 head-on, 1 grazing
    const na = Math.atan2(ny, nx), ra = Math.atan2(ry, rx), col = hot ? undefined : '#ff9a8a';
    this.spark(x, y, ra, hot ? 5 : 3, 0.3 + (1 - graze) * 0.5, [140, 380], col);
    this.spark(x, y, na, 2, 0.7, [60, 160], col);
    this.chips(x, y, na, ['#7d7886', '#5d5868', '#9a95a4'], 3, 0.8, [30, 110], [1, 2], [0.3, 0.6]);
    for (let i = 0; i < 2; i++) this.add({kind: 'smoke', x: x + nx * 1.5, y: y + ny * 1.5, vx: nx * rand(14, 34) + rand(-8, 8), vy: ny * rand(14, 34) + rand(-8, 8), drag: 3, life: rand(0.35, 0.6), size: rand(2.4, 4), grow: 1.8, color: '#9b96a2', alpha: 0.32});
    this.flashes.push({x, y, a: na, age: 0, life: 0.09, size: 0.6, color: hot ? '#ffe2a0' : '#ff9a8a', splat: true});
    if (graze > 0.62) {
      for (let i = 0; i < 2; i++) this.add({kind: 'spark', x, y, vx: rx * rand(380, 560) + rand(-30, 30), vy: ry * rand(380, 560) + rand(-30, 30), drag: 2.2, life: rand(0.14, 0.26), size: 1.3, color: hot ? '#fff3c4' : '#ffb0a0', long: true});
      this.rings.push({x, y, r0: 1, r1: 7, age: 0, life: 0.14, color: hot ? '#ffe9b0' : '#ff9a8a', width: 1.4});
    }
    this.lights.push({x, y, r: 36, age: 0, life: 0.09, strength: 0.4, color: hot ? '#ffd58a' : '#ff8a7a'});
  }
  hitCrate(crate, vx, vy) {
    const a = Math.atan2(-vy, -vx);
    this.chips(crate.x, crate.y, a, WOOD, 7, 1.1, [50, 200], [1.6, 3.6], [0.35, 0.8]);
    this.spark(crate.x, crate.y, a, 2, 0.8);
    crate.flash = 1;
    const w = crate.wob ??= {x: 0, y: 0, vx: 0, vy: 0, r: 0, vr: 0}, sp = Math.hypot(vx, vy) || 1;
    w.vx += vx / sp * 110; w.vy += vy / sp * 110; w.vr += rand(-8, 8);
    crate.chips ??= [];
    crate.chips.push({x: rand(-9, 9), y: rand(-9, 9), r: rand(1.2, 2.6), a: rand(0, TAU)});
    if (crate.chips.length > 14) crate.chips.shift();
  }
  breakCrate(crate) {
    // planks fly off, tumbling (their width scales with a fake flip) and bounce before settling as floor decals
    for (let i = 0; i < 6; i++) {
      const a = rand(0, TAU), sp = rand(60, 190);
      this.add({kind: 'plank', x: crate.x + Math.cos(a) * 5, y: crate.y + Math.sin(a) * 5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2.2, life: rand(0.9, 1.3), size: rand(3.2, 5.2), color: pick(WOOD), rot: rand(0, TAU), vr: rand(-16, 16), z: rand(4, 9), vz: rand(70, 130), g: 360, bounce: 0.38});
    }
    this.chips(crate.x, crate.y, 0, WOOD, 12, Math.PI, [60, 240], [1.6, 3.6], [0.45, 1.0]);
    this.smoke(crate.x, crate.y, 11, 4, '#8f8174', 26, [0.7, 1.2], 0.4);
    this.spark(crate.x, crate.y, 0, 4, Math.PI, [80, 220], '#ffd9a0');
    this.decals.push({kind: 'chip', x: crate.x + rand(-10, 10), y: crate.y + rand(-10, 10), r: 1.6, a: rand(0, TAU), color: '#6d4c36'});
    this.rings.push({x: crate.x, y: crate.y, r0: 8, r1: 34, age: 0, life: 0.28, color: '#e0c49a', width: 2});
  }
  hitEnemy(e, damage, vx, vy, killed) {
    const a = Math.atan2(vy, vx);
    this.blood(e.x, e.y, a, killed ? 8 : 5);
    this.spark(e.x, e.y, a + Math.PI, 3, 0.9, [90, 240], '#ffe9d0');
    e.vis ??= {};
    e.vis.flash = 1; e.vis.hitAngle = a; e.vis.barT = 2;
    e.vis.kick = 1; e.vis.punch = 1;
    e.vis.fvx = (e.vis.fvx || 0) + Math.cos(a) * (killed ? 170 : 100); e.vis.fvy = (e.vis.fvy || 0) + Math.sin(a) * (killed ? 170 : 100);
    this.damageNumber(e, damage, killed);
    this.hitMark = 0.22; this.hitKill = killed;
    this.lights.push({x: e.x, y: e.y, r: 44, age: 0, life: 0.08, strength: 0.3, color: '#ffe0c0'});
  }
  damageNumber(e, damage, killed) {
    const text = String(Math.max(1, Math.round(damage)));
    const recent = this.floaters.find((f) => f.tag === e && f.age < 0.28 && !f.kill);
    if (recent) { recent.sum += Math.round(damage); recent.text = String(recent.sum); recent.age = Math.min(recent.age, 0.1); recent.size = Math.min(26, recent.size + 1.2); recent.kill ||= killed; if (killed) recent.color = '#ffd86e'; return; }
    this.floaters.push({x: e.x + rand(-5, 5), y: e.y - e.radius - 4, tag: e, text, sum: Math.round(damage), age: 0, life: 0.95, size: killed ? 17 : 13, color: killed ? '#ffd86e' : '#fff4e8', vy: -34, kill: killed});
  }
  floater(x, y, text, color = '#fff', size = 13, life = 1.1) {
    this.floaters.push({x, y, text, sum: 0, age: 0, life, size, color, vy: -26});
  }
  kill(e, vx, vy) {
    const a = Math.atan2(vy, vx);
    this.blood(e.x, e.y, a, 16, 0.9, [90, 340]);
    this.chips(e.x, e.y, a, [hexStr(e.def.color), shade(hexStr(e.def.color), 0.6), '#2a2330'], 9, 1.2, [60, 240], [2, 4.2], [0.4, 0.9]);
    this.spark(e.x, e.y, a, 6, 1.2, [120, 320], '#ffd9b0');
    this.rings.push({x: e.x, y: e.y, r0: 5, r1: e.radius * 3.4, age: 0, life: 0.3, color: tint(hexStr(e.def.color), 0.5), width: 3});
    this.decals.push({kind: 'blood', x: e.x, y: e.y, r: e.radius * 1.15, dir: a, seed: Math.floor(Math.random() * 1e6)});
    this.lights.push({x: e.x, y: e.y, r: 70, age: 0, life: 0.18, strength: 0.5, color: hexStr(e.def.color)});
    this.killPop = 0.3;
    this.camPunch = Math.min(0.07, this.camPunch + (e.elite || e.type === 'brute' ? 0.05 : 0.03));
    e.vis ??= {}; e.vis.deathFx = 0; e.vis.flash = 1; e.vis.deathT = 0; e.vis.spin = (Math.random() < 0.5 ? -1 : 1) * rand(2.2, 4.2); e.vis.deathAngle = a;
  }
  playerHit(x, y, armorOnly) {
    this.blood(x, y, rand(0, TAU), armorOnly ? 0 : 10, Math.PI, [80, 240]);
    this.spark(x, y, rand(0, TAU), armorOnly ? 10 : 5, Math.PI, [100, 300], armorOnly ? '#9fe8ff' : '#ffb0a0');
    this.rings.push({x, y, r0: 6, r1: 34, age: 0, life: 0.26, color: armorOnly ? '#7fd8ee' : '#ff5a6a', width: 3});
    this.hurt = 0.55;
  }
  pickup(x, y, color) {
    const c = typeof color === 'number' ? hexStr(color) : color;
    this.rings.push({x, y, r0: 4, r1: 28, age: 0, life: 0.35, color: c, width: 2});
    this.spark(x, y, 0, 9, Math.PI, [60, 200], c);
    for (let i = 0; i < 3; i++) this.star(x + rand(-7, 7), y + rand(-7, 7), c, rand(2.4, 4), rand(0.3, 0.5));
    this.lights.push({x, y, r: 60, age: 0, life: 0.2, strength: 0.4, color: c});
  }
  burst(x, y, color, count = 8, power = 1) {
    const c = typeof color === 'number' ? hexStr(color) : color;
    this.chips(x, y, 0, [c, tint(c, 0.4), shade(c, 0.7)], Math.ceil(count * 0.6), Math.PI, [30 * power, 150 * power]);
    this.spark(x, y, 0, Math.ceil(count * 0.4), Math.PI, [60 * power, 220 * power], c);
  }
  explode(id, x, y, radius) {
    if (id === 'frag') {
      this.flashes.push({x, y, a: 0, age: 0, life: 0.22, size: 5.2, color: '#ffb066', round: true});
      this.flashes.push({x, y, a: 0, age: 0, life: 0.5, size: 10, color: '#ff8a3c', round: true, alpha: 0.35});
      this.rings.push({x, y, r0: 8, r1: radius * 1.05, age: 0, life: 0.42, color: '#ffb877', width: 5});
      this.rings.push({x, y, r0: 4, r1: radius * 0.7, age: 0, life: 0.3, color: '#fff0d0', width: 3});
      for (let i = 0; i < 16; i++) { const a = rand(0, TAU), s = rand(20, 120); this.add({kind: 'flame', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 3.5, life: rand(0.35, 0.7), size: rand(12, 24), grow: 0.8, color: pick(['#ff8a3c', '#ffb25a', '#ff5a2a'])}); }
      this.smoke(x, y, 18, 10, '#3a3238', 70, [0.9, 1.7], 0.55);
      this.spark(x, y, 0, 30, Math.PI, [160, 560], '#ffd08a');
      this.chips(x, y, 0, ['#3a3631', '#5a5249', '#ff9a40'], 18, Math.PI, [120, 420], [2, 5], [0.5, 1.1]);
      this.lights.push({x, y, r: radius * 2.1, age: 0, life: 0.45, strength: 1, color: '#ffb066'});
      this.decals.push({kind: 'scorch', x, y, r: radius * 0.5, seed: Math.floor(Math.random() * 1e6)});
    } else if (id === 'flash') {
      this.flashes.push({x, y, a: 0, age: 0, life: 0.34, size: 9, color: '#fffbe8', round: true});
      this.flashes.push({x, y, a: 0, age: 0, life: 0.7, size: 17, color: '#fff6c8', round: true, alpha: 0.4});
      this.rings.push({x, y, r0: 8, r1: radius, age: 0, life: 0.4, color: '#fff6c8', width: 4});
      this.spark(x, y, 0, 26, Math.PI, [140, 460], '#fffbe0');
      this.lights.push({x, y, r: radius * 2.4, age: 0, life: 0.5, strength: 1, color: '#fffbe8'});
    } else if (id === 'smoke') {
      this.smoke(x, y, 22, 12, '#b2aeb9', 55, [1.2, 2], 0.7);
      this.rings.push({x, y, r0: 6, r1: radius * 0.9, age: 0, life: 0.5, color: '#cfcbd6', width: 2});
    } else if (id === 'incendiary') {
      this.flashes.push({x, y, a: 0, age: 0, life: 0.2, size: 4.4, color: '#ff8a4a', round: true});
      this.rings.push({x, y, r0: 6, r1: radius, age: 0, life: 0.45, color: '#ff8a4a', width: 3});
      for (let i = 0; i < 14; i++) { const a = rand(0, TAU), s = rand(30, 130); this.add({kind: 'flame', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 3, life: rand(0.4, 0.8), size: rand(8, 16), grow: 0.6, color: pick(['#ff7a30', '#ffb040', '#ff5a24'])}); }
      this.lights.push({x, y, r: radius * 1.9, age: 0, life: 0.4, strength: 0.8, color: '#ff8a4a'});
      this.decals.push({kind: 'burn', x, y, r: radius * 0.8});
    }
  }
  flames(x, y, radius) {
    const a = rand(0, TAU), d = Math.sqrt(Math.random()) * radius * 0.88;
    this.add({kind: 'flame', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: rand(-6, 6), vy: rand(-26, -10), drag: 1.2, life: rand(0.4, 0.8), size: rand(7, 13), grow: -0.3, color: pick(['#ff7a30', '#ffb040', '#ff5a24', '#ffd070'])});
    if (Math.random() < 0.35) this.add({kind: 'spark', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: rand(-20, 20), vy: rand(-80, -30), drag: 1.5, life: rand(0.5, 0.9), size: 1.3, color: '#ffc070'});
    if (Math.random() < 0.18) this.smoke(x + Math.cos(a) * d, y + Math.sin(a) * d, 7, 1, '#3c3238', 6, [0.8, 1.3], 0.35);
  }
  ring(x, y, r0, r1, color, life = 0.3, width = 2) { this.rings.push({x, y, r0, r1, age: 0, life, color, width}); }

  // ---- updates
  update(dt) {
    const parts = this.parts;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      const decay = Math.exp(-p.drag * dt);
      p.vx *= decay; p.vy *= decay;
      let nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
      if (this.isSolid(nx, p.y)) { p.vx *= -0.35; nx = p.x; }
      if (this.isSolid(p.x, ny)) { p.vy *= -0.35; ny = p.y; }
      p.x = nx; p.y = ny; p.rot += p.vr * dt;
      if (p.g) {
        p.vz -= p.g * dt; p.z += p.vz * dt; p.tm += p.vr * 0.7 * dt;
        if (p.z <= 0) {
          p.z = 0;
          if (p.vz < -24) { p.vz = -p.vz * p.bounce; p.vr *= 0.55; p.vx *= 0.7; p.vy *= 0.7; }
          else { p.vz = 0; p.vr *= Math.exp(-16 * dt); p.drag = 11; }
        }
      }
      const slow = Math.hypot(p.vx, p.vy) < 9 && p.z < 0.3;
      if (p.age >= p.life || ((p.kind === 'casing' || p.kind === 'drop') && slow)) {
        if (p.kind === 'plank') this.decals.push({kind: 'plank', x: p.x, y: p.y, r: p.size, a: p.rot});
        else if (p.kind === 'casing') this.decals.push({kind: 'casing', x: p.x, y: p.y, a: p.rot});
        else if (p.kind === 'drop' && p.age < p.life + 1) this.decals.push({kind: 'drop', x: p.x, y: p.y, r: p.size * (0.8 + Math.random() * 0.6), color: p.color, a: p.rot});
        else if (p.kind === 'chip' && p.size > 2.2 && Math.random() < 0.5) this.decals.push({kind: 'chip', x: p.x, y: p.y, r: p.size * 0.5, a: p.rot, color: p.color});
        parts.splice(i, 1);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) { const f = this.flashes[i]; f.age += dt; if (f.age >= f.life) this.flashes.splice(i, 1); }
    for (let i = this.rings.length - 1; i >= 0; i--) { const r = this.rings[i]; r.age += dt; if (r.age >= r.life) this.rings.splice(i, 1); }
    for (let i = this.lights.length - 1; i >= 0; i--) { const l = this.lights[i]; l.age += dt; if (l.age >= l.life) this.lights.splice(i, 1); }
  }
  tick(dt) {
    for (let i = this.floaters.length - 1; i >= 0; i--) { const f = this.floaters[i]; f.age += dt; f.y += f.vy * dt; f.vy *= Math.exp(-2.4 * dt); if (f.age >= f.life) this.floaters.splice(i, 1); }
    this.hitMark = Math.max(0, this.hitMark - dt);
    this.hurt = Math.max(0, this.hurt - dt);
    this.killPop = Math.max(0, this.killPop - dt);
  }

  // ---- drawing (world transform active)
  drawBelow(ctx, b) {
    for (const p of this.parts) {
      if (p.x < b.x0 || p.x > b.x1 || p.y < b.y0 || p.y > b.y1) continue;
      const k = p.age / p.life;
      if (p.kind === 'casing') {
        if (p.z > 0.4) { ctx.globalAlpha = 0.35; ctx.fillStyle = INK; ctx.fillRect(p.x - 1.5, p.y - 0.5, 3, 1.1); ctx.globalAlpha = 1; }
        ctx.save(); ctx.translate(p.x, p.y - p.z); ctx.rotate(p.rot); const w = 0.45 + 0.55 * Math.abs(Math.cos(p.tm)); ctx.scale(1, w); ctx.fillStyle = '#d3ac55'; ctx.fillRect(-2, -0.9, 4, 1.8); ctx.fillStyle = '#fff1a8'; ctx.fillRect(-2, -0.9, 1, 1.8); ctx.restore();
      } else if (p.kind === 'plank') {
        const fade = Math.min(1, (p.life - p.age) * 4);
        ctx.globalAlpha = 0.3 * fade; ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(p.x + 1, p.y + 1.5, p.size * (0.8 - Math.min(0.3, p.z * 0.02)), p.size * 0.32, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = fade; ctx.save(); ctx.translate(p.x, p.y - p.z); ctx.rotate(p.rot); ctx.scale(1, 0.45 + 0.55 * Math.abs(Math.cos(p.tm)));
        ctx.fillStyle = INK; ctx.fillRect(-p.size - 0.8, -p.size * 0.32 - 0.8, p.size * 2 + 1.6, p.size * 0.64 + 1.6);
        ctx.fillStyle = p.color; ctx.fillRect(-p.size, -p.size * 0.32, p.size * 2, p.size * 0.64);
        ctx.fillStyle = 'rgba(255,230,190,0.35)'; ctx.fillRect(-p.size, -p.size * 0.32, p.size * 2, 0.8);
        ctx.restore(); ctx.globalAlpha = 1;
      } else if (p.kind === 'mag') {
        const fade = Math.min(1, (p.life - p.age) * 1.2);
        if (p.z > 0.4) { ctx.globalAlpha = 0.3 * fade; ctx.fillStyle = INK; ctx.fillRect(p.x - 1.5, p.y, 3, 1.4); }
        ctx.globalAlpha = fade; ctx.save(); ctx.translate(p.x, p.y - p.z); ctx.rotate(p.rot); ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.cos(p.tm)));
        ctx.fillStyle = INK; ctx.fillRect(-2.9, -1.9, 5.8, 3.8); ctx.fillStyle = '#3a3e48'; ctx.fillRect(-2.2, -1.2, 4.4, 2.4); ctx.fillStyle = '#d3ac55'; ctx.fillRect(1.4, -1.2, 0.9, 2.4);
        ctx.restore(); ctx.globalAlpha = 1;
      } else if (p.kind === 'drop') {
        ctx.globalAlpha = 1 - k * 0.5; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - k * 0.3), 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      } else if (p.kind === 'chip') {
        ctx.globalAlpha = Math.min(1, (1 - k) * 2.2); ctx.fillStyle = p.color;
        if (p.size < 2.4) ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size, -p.size * 0.3, p.size * 2, p.size * 0.6); ctx.restore(); }
        ctx.globalAlpha = 1;
      }
    }
  }
  drawSmoke(ctx, b) {
    for (const p of this.parts) {
      if (p.kind !== 'smoke' || p.x < b.x0 - 30 || p.x > b.x1 + 30 || p.y < b.y0 - 30 || p.y > b.y1 + 30) continue;
      const k = p.age / p.life, r = p.size * (1 + p.grow * k);
      ctx.globalAlpha = (p.alpha ?? 0.5) * (1 - k) * Math.min(1, k * 8 + 0.2);
      ctx.drawImage(puffSprite(p.color), p.x - r, p.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }
  drawAdditive(ctx, b) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const p of this.parts) {
      if (p.x < b.x0 - 30 || p.x > b.x1 + 30 || p.y < b.y0 - 30 || p.y > b.y1 + 30) continue;
      const k = p.age / p.life;
      if (p.kind === 'spark') {
        const sp = Math.hypot(p.vx, p.vy) || 1, len = Math.min(p.long ? 26 : 14, 1.5 + sp * (p.long ? 0.055 : 0.03));
        ctx.strokeStyle = p.color; ctx.globalAlpha = Math.min(1, (1 - k) * 1.6); ctx.lineWidth = p.size;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx / sp * len, p.y - p.vy / sp * len); ctx.stroke();
      } else if (p.kind === 'star') {
        const r = p.size * (1 - k * 0.7) * (0.7 + 0.3 * Math.sin(k * 20)); ctx.globalAlpha = Math.min(1, (1 - k) * 2); ctx.fillStyle = p.color;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.22, -r * 0.22); ctx.lineTo(r, 0); ctx.lineTo(r * 0.22, r * 0.22); ctx.lineTo(0, r); ctx.lineTo(-r * 0.22, r * 0.22); ctx.lineTo(-r, 0); ctx.lineTo(-r * 0.22, -r * 0.22); ctx.closePath(); ctx.fill(); ctx.restore();
      } else if (p.kind === 'flame') {
        const r = Math.max(1, p.size * (1 + p.grow * k) * (1 - k * 0.5));
        ctx.globalAlpha = (1 - k) * 0.8; ctx.drawImage(glowSprite(p.color), p.x - r, p.y - r, r * 2, r * 2);
      }
    }
    ctx.globalAlpha = 1;
    for (const f of this.flashes) {
      const k = f.age / f.life;
      if (f.splat) {
        // flat flash spreading along the wall surface (a = wall normal)
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.a); ctx.globalAlpha = (1 - k) * 0.9; ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.ellipse(1, 0, 2.2 * (1 - k * 0.4), (5 + 5 * k) * f.size, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fffdf0'; ctx.beginPath(); ctx.ellipse(0.6, 0, 1.2 * (1 - k), (2.6 + 3 * k) * f.size, 0, 0, TAU); ctx.fill();
        ctx.restore(); ctx.globalAlpha = 1;
        continue;
      }
      if (f.round) {
        const r = f.size * 14 * (0.6 + k * 0.6);
        ctx.globalAlpha = (1 - k) * 0.95 * (f.alpha ?? 1); ctx.drawImage(glowSprite(f.color), f.x - r, f.y - r, r * 2, r * 2); ctx.globalAlpha = 1;
        continue;
      }
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.a); ctx.globalAlpha = 1 - k * 0.7;
      const len = (14 + 12 * (1 - k)) * f.size, wid = 6 * f.size;
      ctx.fillStyle = f.color;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len * 0.35, -wid); ctx.lineTo(len, 0); ctx.lineTo(len * 0.35, wid); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fffbea';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len * 0.3, -wid * 0.42); ctx.lineTo(len * 0.62, 0); ctx.lineTo(len * 0.3, wid * 0.42); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-1, -wid * 0.9); ctx.lineTo(3, 0); ctx.lineTo(-1, wid * 0.9); ctx.lineTo(-3 * f.size, 0); ctx.closePath(); ctx.fillStyle = f.color; ctx.fill();
      const r = 16 * f.size; ctx.drawImage(glowSprite(f.color), -r + len * 0.25, -r, r * 2, r * 2);
      ctx.restore();
    }
    for (const r of this.rings) {
      const k = r.age / r.life, e = 1 - (1 - k) * (1 - k), rad = r.r0 + (r.r1 - r.r0) * e;
      ctx.globalAlpha = (1 - k) * 0.85; ctx.strokeStyle = r.color; ctx.lineWidth = r.width * (1 - k * 0.6);
      ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  // screen-space text pass (cam gives world->screen)
  drawFloaters(ctx, cam, dpr) {
    if (!this.floaters.length) return;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const f of this.floaters) {
      const k = f.age / f.life;
      const sx = ((f.x - cam.x) * cam.scale + cam.w / 2) * dpr, sy = ((f.y - cam.y) * cam.scale + cam.h / 2) * dpr;
      const pop = 1 + Math.max(0, 1 - f.age * 9) * 0.5;
      ctx.font = `800 ${Math.round(f.size * dpr * pop)}px 'Barlow Condensed','DM Mono',system-ui,sans-serif`;
      ctx.globalAlpha = Math.min(1, (1 - k) * 2.4);
      ctx.lineWidth = 3.4 * dpr; ctx.strokeStyle = 'rgba(14,10,20,0.9)'; ctx.strokeText(f.text, sx, sy);
      ctx.fillStyle = f.color; ctx.fillText(f.text, sx, sy);
    }
    ctx.globalAlpha = 1;
  }

  lightList() {
    const out = [];
    for (const l of this.lights) { const k = l.age / l.life; out.push({x: l.x, y: l.y, r: l.r * (0.8 + k * 0.3), a: l.strength * (1 - k) * (1 - k), color: l.color}); }
    return out;
  }
}

export {rgba};
