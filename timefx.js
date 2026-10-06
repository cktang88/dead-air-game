// Diegetic time display (pillar 1). The world, not a panel, shows how fast time runs:
//   - a screen grade that scales with how slow time is: desaturation, cold tint, vignette, film grain + flicker
//   - each shot's beat briefly lifts the grade (the world "un-freezes" for a moment)
//   - a thin edge meter along the top that appears only while the rate is changing and fades when stable
// `gradeAmount` and `meterState` are pure (unit tested); the canvas drawing lives in createTimeFx().

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 0 at full speed -> 1 at the still floor. Slightly convex so a walk (0.35x) is clearly graded but still reads lighter than still.
export function gradeAmount(rate, stillRate = 0.08) {
  const r = Number.isFinite(rate) ? rate : 1;
  return Math.pow(clamp((1 - r) / (1 - stillRate), 0, 1), 1.4);
}

// Edge meter visibility: `activity` jumps to 1 whenever the rate is moving (or a beat fires) and fades after `hold` seconds.
export function meterState(prev, {rate, dt, pulse = 0, hold = 0.9, fade = 1.6, epsilon = 0.35}) {
  const speed = Math.abs(rate - prev.rate) / Math.max(dt, 1e-4); // rate units per second
  let quiet = prev.quiet + dt, activity = prev.activity;
  if (speed > epsilon || pulse > 0.05) quiet = 0;
  if (quiet > hold) activity = Math.max(0, activity - dt * fade); else activity = Math.min(1, activity + dt * 12);
  return {rate, quiet, activity};
}

const GRAIN_TILES = 3, GRAIN_SIZE = 160;

export function createTimeFx() {
  const fx = {slow: 0, pulse: 0, meter: {rate: 1, quiet: 9, activity: 0}, rate: 1, t: 0, grain: null, vig: null, vigKey: ''};

  const mk = (w, h) => { const c = typeof document !== 'undefined' ? document.createElement('canvas') : null; if (c) { c.width = w; c.height = h; } return c; };

  function buildGrain() {
    const tiles = [];
    for (let i = 0; i < GRAIN_TILES; i++) {
      const c = mk(GRAIN_SIZE, GRAIN_SIZE); if (!c) return tiles;
      const g = c.getContext('2d'), img = g.createImageData(GRAIN_SIZE, GRAIN_SIZE), d = img.data;
      for (let p = 0; p < d.length; p += 4) { const v = Math.random() < 0.5 ? 255 : 0; d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = Math.random() * 60; }
      g.putImageData(img, 0, 0); tiles.push(c);
    }
    return tiles;
  }

  function vignette(w, h) {
    const key = w + 'x' + h;
    if (fx.vig && fx.vigKey === key) return fx.vig;
    const c = mk(256, Math.max(64, Math.round(256 * h / w))); if (!c) return null;
    const g = c.getContext('2d'), grad = g.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.28, c.width / 2, c.height / 2, c.width * 0.62);
    grad.addColorStop(0, 'rgba(8,14,34,0)'); grad.addColorStop(0.65, 'rgba(8,14,34,0.2)'); grad.addColorStop(1, 'rgba(4,8,22,0.62)');
    g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
    fx.vig = c; fx.vigKey = key; return c;
  }

  // frame: {worldRate, timeScale, beatPulse, idleScale}. Returns the smoothed grade amount (also used by lighting).
  fx.step = function step(frame, dt) {
    const rate = frame.worldRate ?? frame.timeScale ?? 1;
    this.t += dt;
    const target = gradeAmount(rate, frame.idleScale ?? 0.08);
    // slow -> fast (grade lifts) is quick, fast -> slow (it settles back) is a little lazier so each beat visibly "ticks"
    const k = target < this.slow ? 26 : 7;
    this.slow += (target - this.slow) * (1 - Math.exp(-k * dt));
    this.pulse = frame.beatPulse ?? 0;
    this.rate += (rate - this.rate) * (1 - Math.exp(-18 * dt));
    this.meter = meterState(this.meter, {rate: this.rate, dt, pulse: this.pulse});
    return this.slow;
  };

  // Selective colour: the ENVIRONMENT (floor, walls, props, crates) drains first and hardest while actors, bullets and
  // pickups are drawn afterwards at full colour, so in frozen time the things that matter pop off a calm, cool backdrop.
  // Screen space (identity transform). Call after the environment is drawn and before actors. `rooms` is an optional
  // list of {x, y, w, h, color} screen-pixel rects: each room's accent colour is washed back in AFTER the drain so
  // every room keeps its identity in slow time.
  fx.drawEnv = function drawEnv(ctx, w, h, rooms) {
    const g = clamp(this.slow * (1 - 0.55 * this.pulse), 0, 1);
    ctx.save();
    if (g > 0.01) { ctx.globalCompositeOperation = 'saturation'; ctx.globalAlpha = 0.6 * g; ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, w, h); }
    // floor luminance LIFT (screen raises blacks far more than highlights): frozen time must read, not sink into the dark
    ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.55 + 0.4 * g; ctx.fillStyle = 'rgb(34,40,56)'; ctx.fillRect(0, 0, w, h);
    if (rooms) for (const r of rooms) { // each room's accent colour survives the drain (a little at 1x, more in slow time)
      ctx.globalCompositeOperation = 'color'; ctx.globalAlpha = 0.09 + 0.12 * g; ctx.fillStyle = r.color; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.03 + 0.03 * g; ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.restore();
  };

  // Screen space (identity transform), after the world and lights are drawn. w/h are canvas pixels.
  fx.draw = function draw(ctx, w, h, dpr = 1, flashK = 1) {
    const g = clamp(this.slow * (1 - 0.55 * this.pulse * flashK), 0, 1);
    if (g > 0.01) {
      ctx.save();
      // 1. a light touch of drain over everything (the environment already drained in drawEnv)
      ctx.globalCompositeOperation = 'saturation'; ctx.globalAlpha = 0.12 * g; ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      // 2. a gentle vignette that closes in as time thins
      const v = vignette(w, h); if (v) { ctx.globalAlpha = 0.3 * g; ctx.drawImage(v, 0, 0, w, h); }
      // 3. very fine film grain (tile jumps ~10 times a second); barely there, never competes with the read
      if (!this.grain) this.grain = buildGrain();
      if (this.grain.length) {
        const frameIdx = Math.floor(this.t * 10), tile = this.grain[frameIdx % this.grain.length];
        const ox = (frameIdx * 53) % GRAIN_SIZE, oy = (frameIdx * 97) % GRAIN_SIZE, s = Math.max(1, dpr);
        ctx.globalAlpha = (0.02 + 0.07 * g) * flashK;
        const pat = ctx.createPattern(tile, 'repeat');
        if (pat) { ctx.translate(-ox * s, -oy * s); ctx.scale(s, s); ctx.fillStyle = pat; ctx.fillRect(ox, oy, w / s + GRAIN_SIZE, h / s + GRAIN_SIZE); ctx.setTransform(1, 0, 0, 1, 0, 0); }
      }
      ctx.restore();
    }
    if (this.pulse > 0.02) { // beat: a brief cool-white tick as the world lets a moment through
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.07 * this.pulse * flashK; ctx.fillStyle = '#cfe0ff'; ctx.fillRect(0, 0, w, h); ctx.restore();
    }
  };

  // The edge meter is a DOM strip (#time-edge, above the HUD scrim); game.js feeds it from edgeView().
  return fx;
}

// Edge meter geometry: sqrt-spread so still / walk / sprint land well apart on the gauge. Returns CSS-friendly values.
export function edgeView(rate, activity) {
  const r = clamp(rate, 0, 1), f = 0.04 + 0.96 * Math.sqrt(r);
  const walk = 0.04 + 0.96 * Math.sqrt(0.35);
  return {opacity: clamp(activity, 0, 1), width: f * 100, walk: walk * 100, color: `rgb(${Math.round(120 + 135 * r)},${Math.round(180 + 60 * r)},${Math.round(255 - 60 * r)})`};
}
