// Off-thread stack baker (module worker). stack2d.js registers an entry (the model's slices, or the voxel grid to build them
// from), then asks for yaw buckets; each finished composite goes back as a transferred ImageBitmap. The main thread never
// waits: until a bucket arrives it draws the nearest baked angle. Message protocol (main -> worker):
//   {t:'reg', id, W, H, ax, ay, o, dzPx, nBuckets, vox: {n, cell}}              voxel model: slices are built here
//   {t:'reg', id, W, H, ax, ay, o, dzPx, nBuckets, slices: [{k, bm, ox, oy}]}   procedural model: slices are ImageBitmaps
//   {t:'bake', id, list: [bucket...], lo: true|false}                            demand (lo = false) or prefetch (lo = true)
//   {t:'drop', ids: [id...]}   {t:'clear'}
// worker -> main: {t:'img', id, bi, bm, cx, cy, ms}
import {bakeComposite, bakeVoxSlices} from './stack-bake.js';

const mk = (w, h) => new OffscreenCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
const entries = new Map();
const hi = [], lo = [];
let running = false;
const chan = new MessageChannel();
let wake = null;
chan.port1.onmessage = () => { if (wake) { const w = wake; wake = null; w(); } };
const yieldNow = () => new Promise((r) => { wake = r; chan.port2.postMessage(0); });

function ensure(e) {
  if (e.slices) return;
  const {n, cell} = e.vox;
  e.slices = bakeVoxSlices(n, cell, mk);
}

async function pump() {
  if (running) return;
  running = true;
  while (hi.length || lo.length) {
    const q = hi.length ? hi : lo;
    const job = q.shift(), e = entries.get(job.id);
    if (!e || e.done[job.bi]) continue;
    const t0 = performance.now();
    try {
      ensure(e);
      const r = bakeComposite(mk, e, job.bi);
      e.done[job.bi] = 1;
      const bm = r.cv.transferToImageBitmap ? r.cv.transferToImageBitmap() : null;
      if (bm) postMessage({t: 'img', id: job.id, bi: job.bi, bm, cx: r.cx, cy: r.cy, ms: performance.now() - t0}, [bm]);
    } catch (err) { postMessage({t: 'err', message: String(err && err.message || err)}); }
    await yieldNow();   // let new demand requests (and drops) in between bakes
  }
  running = false;
}

onmessage = (ev) => {
  const m = ev.data;
  if (m.t === 'reg') {
    const e = {id: m.id, W: m.W, H: m.H, ax: m.ax, ay: m.ay, o: m.o, dzPx: m.dzPx, nBuckets: m.nBuckets, done: new Uint8Array(m.nBuckets), slices: null, vox: m.vox, tmpA: null, tmpB: null};
    entries.set(m.id, e);
  } else if (m.t === 'bake') {
    const e = entries.get(m.id); if (!e) return;
    const q = m.lo ? lo : hi;
    for (const bi of m.list) if (!e.done[bi]) q.push({id: m.id, bi});
    pump();
  } else if (m.t === 'drop') {
    for (const id of m.ids) { const e = entries.get(id); if (e && e.slices && !e.vox) for (const s of e.slices) { try { s.cv.close && s.cv.close(); } catch { /* ok */ } } entries.delete(id); }
  } else if (m.t === 'clear') {
    entries.clear(); hi.length = 0; lo.length = 0;
  }
};
