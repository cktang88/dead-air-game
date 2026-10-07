// node tools/handling-shot.mjs "<page path + query>" out.png [refsDir]
// e.g. node tools/handling-shot.mjs "tools/handling-ref.html?cls=rifle&zoom=4" docs/art/handling-ref-rifle.png
// Serves the repo plus /__refs/ -> the Blender reference render folder, waits for window.__ready, screenshots the page.
import {chromium} from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [, , page, out, refsArg] = process.argv;
const refs = refsArg || process.env.REFS_OUT || '/tmp/claude-0/-home-user/75c704e9-7d4c-517c-a9b2-030bae929b2f/scratchpad/refs/out';
const MIME = {'.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css'};
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]), f = u.startsWith('/__refs/') ? path.join(refs, u.slice(8)) : path.join(root, u);
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, {'content-type': MIME[path.extname(f)] || 'application/octet-stream'}); res.end(d); } });
}).listen(0);
const b = await chromium.launch(), p = await b.newPage({viewport: {width: 1800, height: 900}});
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto(`http://localhost:${srv.address().port}/${page}`); await p.waitForFunction(() => window.__ready, null, {timeout: 60000});
await p.waitForTimeout(200); const cv = await p.$('#c'); if (cv) await cv.screenshot({path: out}); else await p.screenshot({path: out, fullPage: true});
await b.close(); srv.close();
