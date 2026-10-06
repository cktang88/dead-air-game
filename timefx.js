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
      for (let p = 0; p < d.length; p += 4) { const v = Math.random() < 0.5 ? 255 : 0; d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = Math.random() * 70; }
      g.putImageData(img, 0, 0); tiles.push(c);
    }
    return tiles;
  }

  function vignette(w, h) {
    const key = w + 'x' + h;
    if (fx.vig && fx.vigKey === key) return fx.vig;
    const c = mk(256, Math.max(64, Math.round(256 * h / w))); if (!c) return null;
    const g = c.getContext('2d'), grad = g.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.28, c.width / 2, c.height / 2, c.width * 0.62);
    grad.addColorStop(0, 'rgba(8,14,34,0)'); grad.addColorStop(0.6, 'rgba(8,14,34,0.4)'); grad.addColorStop(1, 'rgba(4,8,22,0.95)');
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

  // Screen space (identity transform), after the world and lights are drawn. w/h are canvas pixels.
  fx.draw = function draw(ctx, w, h, dpr = 1) {
    const g = clamp(this.slow * (1 - 0.55 * this.pulse), 0, 1);
    if (g > 0.01) {
      ctx.save();
      // 1. drain colour hard
      ctx.globalCompositeOperation = 'saturation'; ctx.globalAlpha = 0.82 * g; ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, w, h);
      // 2. cold tint (multiply keeps highlights icy rather than flat blue)
      ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.5 * g; ctx.fillStyle = '#9fb8ff'; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      // 3. vignette that closes in as time thins
      const v = vignette(w, h); if (v) { ctx.globalAlpha = 0.62 * g; ctx.drawImage(v, 0, 0, w, h); }
      // 4. film grain + flicker (grain tile jumps ~12 times a second; stronger the slower the world)
      if (!this.grain) this.grain = buildGrain();
      if (this.grain.length) {
        const frameIdx = Math.floor(this.t * 12), tile = this.grain[frameIdx % this.grain.length];
        const ox = (frameIdx * 53) % GRAIN_SIZE, oy = (frameIdx * 97) % GRAIN_SIZE, s = Math.max(1, dpr);
        ctx.globalAlpha = 0.1 + 0.34 * g;
        const pat = ctx.createPattern(tile, 'repeat');
        if (pat) { ctx.translate(-ox * s, -oy * s); ctx.scale(s, s); ctx.fillStyle = pat; ctx.fillRect(ox, oy, w / s + GRAIN_SIZE, h / s + GRAIN_SIZE); ctx.setTransform(1, 0, 0, 1, 0, 0); }
      }
      const fl = (Math.sin(this.t * 41) + Math.sin(this.t * 23.3 + 1.7)) * 0.5;
      ctx.globalAlpha = Math.max(0, 0.05 * g * (0.5 + fl)); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    if (this.pulse > 0.02) { // beat: a brief cool-white tick as the world lets a moment through
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.07 * this.pulse; ctx.fillStyle = '#cfe0ff'; ctx.fillRect(0, 0, w, h); ctx.restore();
    }
    this.drawMeter(ctx, w, h, dpr);
  };

  // Thin line along the top edge: fills outward from the centre in proportion to the world rate, only while time is changing.
  fx.drawMeter = function drawMeter(ctx, w, h, dpr) {
    const a = this.meter.activity; if (a < 0.02) return;
    const rate = clamp(this.rate, 0, 1), thick = Math.max(2, Math.round(3 * dpr)), cx = w / 2, half = w / 2 * rate;
    // colour: icy blue at still -> warm white at sprint
    const r = Math.round(110 + 145 * rate), gg = Math.round(170 + 70 * rate), b = Math.round(255 - 55 * rate);
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(120,150,210,0.18)'; ctx.fillRect(0, 0, w, thick);
    const grad = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
    grad.addColorStop(0, `rgba(${r},${gg},${b},0.15)`); grad.addColorStop(0.5, `rgba(${r},${gg},${b},0.95)`); grad.addColorStop(1, `rgba(${r},${gg},${b},0.15)`);
    ctx.fillStyle = grad; ctx.shadowColor = `rgba(${r},${gg},${b},0.9)`; ctx.shadowBlur = 10 * dpr;
    ctx.fillRect(cx - half, 0, half * 2, thick);
    ctx.shadowBlur = 0;
    // walk tick (0.35x): where a normal walk lands, so the bar reads like a gauge
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (const m of [0.35]) { const x = w / 2 * m; ctx.fillRect(cx - x - 1, 0, 2, thick + 3 * dpr); ctx.fillRect(cx + x - 1, 0, 2, thick + 3 * dpr); }
    ctx.restore();
  };

  return fx;
}
