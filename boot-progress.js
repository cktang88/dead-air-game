// DEAD AIR loading progress: pure weighting logic (no DOM) shared by the inline loader in index.html and game.js.
//
// A plan is a set of named phases that may run in parallel (the CDN modules download while rapier compiles). Each phase reports
// REAL work: done / total (module files fetched, chunks baked, sprite buckets finished). The overall fraction is the weighted sum
// of the phases' own fractions; it can never go backwards. The label names the first phase that is not finished yet.

/** Startup. Weights follow where the time really goes (network first, then wasm, then the first stage build). */
export const BOOT_PHASES = [
  {id: 'fetch', w: 0.46, label: 'FETCHING ENGINE', counts: true},
  {id: 'physics', w: 0.18, label: 'WARMING PHYSICS'},
  {id: 'engine', w: 0.12, label: 'STARTING ENGINE'},
  {id: 'stage', w: 0.14, label: 'BUILDING THE STAGE'},
  {id: 'tune', w: 0.10, label: 'TUNING THE BROADCAST'},
];

/** Starting a run or descending a floor. `floor` is a count-less step; chunks and sprites report real counts. */
export const RUN_PHASES = [
  {id: 'floor', w: 0.30, label: 'BUILDING FLOOR', floorNo: true},
  {id: 'chunks', w: 0.40, label: 'DRAWING THE MAP', counts: true},
  {id: 'sprites', w: 0.30, label: 'BAKING SPRITES', percent: true},
];

const clamp01 = (v) => (v > 1 ? 1 : v > 0 ? v : 0);

/** @param phases BOOT_PHASES-shaped list @param opts {floor} number shown in the floor label */
export function createPlan(phases, opts = {}) {
  const total = phases.reduce((s, p) => s + p.w, 0) || 1;
  const frac = new Map(phases.map((p) => [p.id, 0]));
  const counts = new Map();
  let floorNo = opts.floor || 1, last = 0;
  const plan = {
    /** Report progress: update('fetch', 3, 7). total omitted / 0 means "finished" when done > 0. Returns the snapshot. */
    update(id, done, totalCount) {
      if (!frac.has(id)) return plan.snapshot();
      const f = totalCount > 0 ? clamp01(done / totalCount) : done > 0 ? 1 : 0;
      if (f >= frac.get(id)) { frac.set(id, f); counts.set(id, [done, totalCount || 0]); }
      return plan.snapshot();
    },
    finish(id) { return plan.update(id, 1, 1); },
    setFloor(n) { floorNo = n; },
    /** 0..1, monotonic. */
    fraction() {
      let s = 0;
      for (const p of phases) s += p.w * frac.get(p.id);
      last = Math.max(last, clamp01(s / total));
      return last;
    },
    current() { return phases.find((p) => frac.get(p.id) < 1) || null; },
    label() {
      const p = plan.current();
      if (!p) return 'ON AIR';
      const c = counts.get(p.id);
      let out = p.label;
      if (p.floorNo) out += ' ' + String(floorNo).padStart(2, '0');
      if (p.counts && c && c[1] > 0) out += ' · ' + Math.min(c[0], c[1]) + '/' + c[1];
      else if (p.percent && c && c[1] > 0) out += ' ' + Math.round(clamp01(c[0] / c[1]) * 100) + '%';
      return out;
    },
    done() { return plan.current() === null; },
    snapshot() { return {fraction: plan.fraction(), label: plan.label(), done: plan.done()}; },
  };
  return plan;
}

/** The loader widget that index.html defines (window.deadairBoot), or a no-op stand-in outside the page (tests, tools). */
export function bootUI() {
  const ui = typeof window !== 'undefined' ? window.deadairBoot : null;
  return ui || {phase() {}, set() {}, show() {}, hide() {}, fail() {}};
}

/** Sprite bake progress from the worker's pending count and the peak it reached: {done,total}. */
export function spriteProgress(pendingNow, peak) { return {done: Math.max(0, peak - pendingNow), total: Math.max(1, peak)}; }
