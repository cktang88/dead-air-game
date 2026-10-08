// The upgrade pick: three cards, hover/focus highlights one, keys 1-3 or a click picks it. This file only adds behavior to markup
// built by meta-ui.js (freqOfferHtml): selection state, arrow-key browsing and the short "locked in" flash before the pick applies.
// Plain on purpose: no dial, no scopes; the card itself carries all the meaning.

const prefersReduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Index reached by pressing an arrow key from `i` among `n` cards (wraps). Returns `i` for other keys. */
export function browseIndex(i, n, key) {
  if (n <= 0) return 0;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (i + 1) % n;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (i + n - 1) % n;
  return i;
}

/**
 * Mount on a freshly rendered #run-modal. Cards are `[data-freq]` buttons.
 * Returns {dispose, lock(id, done) -> boolean}; lock plays a brief flash then calls done(), and returns false (caller proceeds
 * at once) under reduced motion or when the card does not exist.
 */
export function mountPick(root) {
  const cards = [...root.querySelectorAll('[data-freq]')];
  if (!cards.length) return {dispose() {}, lock: () => false};
  const reduced = prefersReduced();
  let sel = 0, locked = false;
  const select = i => {
    if (locked || !cards[i]) return;
    sel = i;
    cards.forEach((c, n) => c.classList.toggle('sel', n === i));
    root.dataset.sel = String(i);
  };
  select(0);
  cards.forEach((c, i) => {
    c.addEventListener('pointerenter', () => select(i));
    c.addEventListener('focus', () => select(i));
    c.addEventListener('keydown', e => {
      const next = browseIndex(i, cards.length, e.key);
      if (next !== i) { e.preventDefault(); cards[next].focus(); }
    });
  });
  return {
    dispose() {},
    lock(id, done) {
      const i = cards.findIndex(c => c.dataset.freq === id);
      if (i < 0 || reduced || locked) return false;
      locked = true; sel = i;
      cards.forEach((c, n) => { c.classList.toggle('sel', n === i); c.classList.toggle('dead', n !== i); });
      root.classList.add('locking');
      cards[i].classList.add('locked');
      setTimeout(() => done?.(), 380);
      return true;
    },
  };
}
