// Controllers for the mechanical parts of the equipment UI: split-flap counters, gauge needles, lever pulls.
// Markup comes from ui-art.js / meta-ui.js; this file only animates what is already in the DOM.

const prefersReduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Value shown by a flap drum at progress p (0..1): eased integer, always ends exactly on the target. */
export function flapValue(target, p) {
  if (p >= 1) return target;
  const e = 1 - (1 - Math.max(0, p)) ** 3;
  return Math.floor(target * e);
}

/** Count every `[data-flap]` row in `root` up from zero, flipping each drum whose digit changes. */
export function runFlaps(root, {duration = 800, delay = 260} = {}) {
  if (!root || typeof requestAnimationFrame === 'undefined') return;
  for (const row of root.querySelectorAll('[data-flap]')) {
    const target = Number(row.dataset.flap) || 0, pad = Number(row.dataset.pad) || 3;
    const drums = [...row.querySelectorAll('.flap b')];
    const paint = v => {
      const s = String(v).padStart(pad, '0');
      drums.forEach((b, i) => { if (b.textContent !== s[i]) { b.textContent = s[i]; if (!prefersReduced()) { b.classList.remove('flip'); void b.offsetWidth; b.classList.add('flip'); } } });
    };
    if (prefersReduced() || target === 0) { paint(target); continue; }
    paint(0);
    const t0 = performance.now() + delay;
    const step = now => {
      const p = (now - t0) / duration;
      if (p >= 0) paint(flapValue(target, p));
      if (p < 1 && row.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

/** Gauges start with the needle at rest, then swing (CSS overshoot) to the value one frame after mount. */
export function runGauges(root) {
  if (!root) return;
  for (const g of root.querySelectorAll('.gauge')) {
    if (prefersReduced()) { g.classList.add('live', 'still'); continue; }
    requestAnimationFrame(() => requestAnimationFrame(() => g.classList.add('live')));
  }
}

/** Pull the lever for data-act="…": travel animation, then done(). Returns false (caller proceeds at once) under reduced motion. */
export function pullLever(root, act, done) {
  const btn = root?.querySelector(`[data-act="${act}"]`);
  const bay = btn?.closest('.bay');
  if (!bay || prefersReduced() || root.classList.contains('committing')) return false;
  root.classList.add('committing');
  bay.classList.add('pulled');
  setTimeout(() => bay.classList.add('lamp-on'), 240);
  setTimeout(() => done?.(), 520);
  return true;
}

export function mountPanel(root) { runFlaps(root); runGauges(root); }
