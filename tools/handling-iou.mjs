// node tools/handling-iou.mjs [refsDir] [outMd]   (needs Playwright + the Blender reference renders; see tools/handling-refs/README.md)
// Serves the repo, maps /__refs/ to the ref render folder, runs tools/handling-iou.html and prints / writes the per-class table.
import {chromium} from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const refs = process.argv[2] || process.env.REFS_OUT || '/tmp/claude-0/-home-user/75c704e9-7d4c-517c-a9b2-030bae929b2f/scratchpad/refs/out';
const outMd = process.argv[3] || '';
const MIME = {'.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css'};
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]), f = u.startsWith('/__refs/') ? path.join(refs, u.slice(8)) : path.join(root, u);
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, {'content-type': MIME[path.extname(f)] || 'application/octet-stream'}); res.end(d); } });
}).listen(0);
const port = srv.address().port, b = await chromium.launch(), p = await b.newPage();
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto(`http://localhost:${port}/tools/handling-iou.html`); await p.waitForFunction(() => window.__ready);
if (process.env.IOU_OVERLAY) { const [c, f] = process.env.IOU_OVERLAY.split(','); const u = await p.evaluate((k) => window.overlay(k), c); fs.writeFileSync(f, Buffer.from(u.split(',')[1], 'base64')); }
const rows = [];
for (const cls of ['pistol', 'smg', 'rifle', 'shotgun', 'sniper', 'amr', 'launcher']) {
  const r = await p.evaluate((c) => window.measure(c), cls);
  if (process.env.IOU_DEBUG === cls) console.log(JSON.stringify(r));
  const avg = (k) => r.reduce((s, x) => s + x[k], 0) / r.length;
  const rel = r.reduce((s, x) => s + (x.refRatio > 0 ? x.oursRatio / x.refRatio : 0), 0) / r.length;
  rows.push({cls, iou: avg('iou'), aligned: avg('iouAligned'), shift: r[0].shift, ours: avg('oursLen'), ref: avg('refLen'), ratio: rel, dirs: r.map((x) => x.iou.toFixed(2)).join(' ')});
}
const mean = rows.reduce((s, r) => s + r.iou, 0) / rows.length, meanA = rows.reduce((s, r) => s + r.aligned, 0) / rows.length;
let md = '| class | mean IoU | IoU after best shift (units) | gun len ours (units) | gun len ref | gun/shoulder ratio, ours vs ref | IoU per facing (0..315) |\n| --- | --- | --- | --- | --- | --- | --- |\n';
for (const r of rows) md += `| ${r.cls} | ${r.iou.toFixed(3)} | ${r.aligned.toFixed(3)} (${r.shift.map((v) => v.toFixed(1)).join(', ')}) | ${r.ours.toFixed(1)} | ${r.ref.toFixed(1)} | ${(r.ratio * 100).toFixed(0)}% | ${r.dirs} |\n`;
md += `| **all** | **${mean.toFixed(3)}** | **${meanA.toFixed(3)}** | | | | |\n`;
console.log(md); if (outMd) fs.writeFileSync(outMd, md);
await b.close(); srv.close();
