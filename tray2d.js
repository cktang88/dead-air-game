// The world prompt for a floor gun or mod as an inspection tray: the item lies in a foam cut-out (its real silhouette),
// a paper tag names it, and "SWAP WITH" shows the gun in your hand on the other half of the tray. Analog meters under the
// foam carry a ghost needle for the gun you would give up. Canvas only; drawn straight into the game's overlay canvas.
import {drawFitted} from './equip-art.js';
import {analogMeters, needleAngle} from './ui-art.js';
import {GUNS} from './catalog.js';
import {drawIcon, MOD_ICON} from './icons.js';
import {FONTS} from './theme.js';

const MONO = FONTS.mono, DISPLAY = FONTS.display, TAU = Math.PI * 2;
const hexOf = n => '#' + (Number(n) & 0xffffff).toString(16).padStart(6, '0');
export const TRAY_W = 348;
export const trayHeight = target => (target.kind === 'gun' ? 192 : 190);

/** True when this target gets the tray treatment (it carries the item data collectInteractables attaches). */
export const hasTray = target => (target.kind === 'gun' && !!target.gunRef) || (target.kind === 'mod' && !!target.modRef);

function wrap(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/), lines = []; let cur = '';
  for (const w of words) { const next = cur ? cur + ' ' + w : w; if (cur && ctx.measureText(next).width > maxW) { lines.push(cur); cur = w; } else cur = next; }
  if (cur) lines.push(cur);
  return lines;
}

function screw(ctx, x, y) {
  ctx.fillStyle = '#6d6b63'; ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#121211'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 2, y + 1); ctx.lineTo(x + 2, y - 1); ctx.stroke();
}

function foam(ctx, x, y, w, h) {
  ctx.fillStyle = '#26292b'; ctx.fillRect(x, y, w, h);
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(255,255,255,.07)'); g.addColorStop(0.15, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
}

function tag(ctx, text, x, y, w, ink = '#19150f', paper = '#e8dcb4') {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.025);
  ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(2, 2, w, 17);
  ctx.fillStyle = paper; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(w, 0); ctx.lineTo(w, 17); ctx.lineTo(8, 17); ctx.lineTo(0, 8.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#26292b'; ctx.beginPath(); ctx.arc(7, 8.5, 2.2, 0, TAU); ctx.fill();
  ctx.fillStyle = ink; ctx.font = `900 13px ${DISPLAY}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  let t = String(text).toUpperCase(); while (t.length > 3 && ctx.measureText(t).width > w - 18) t = t.slice(0, -2);
  ctx.fillText(t, 13, 9.5);
  ctx.restore();
}

function miniGauge(ctx, cx, cy, r, m) {
  ctx.save();
  ctx.fillStyle = '#f2ead0'; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#19150f'; ctx.lineWidth = 1; ctx.stroke();
  for (let i = 0; i <= 10; i++) {
    const a = (needleAngle(i / 10) - 90) * Math.PI / 180, r0 = r * (i % 5 === 0 ? 0.62 : 0.74);
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9); ctx.stroke();
  }
  if (m.ghost != null) {
    const a = (needleAngle(m.ghost) - 90) * Math.PI / 180;
    ctx.setLineDash([2.5, 2]); ctx.strokeStyle = '#c8412f'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86); ctx.stroke(); ctx.setLineDash([]);
  }
  const a = (needleAngle(m.frac) - 90) * Math.PI / 180;
  ctx.strokeStyle = '#19150f'; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86); ctx.stroke();
  ctx.fillStyle = '#19150f'; ctx.beginPath(); ctx.arc(cx, cy, 2.4, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#efe7cc'; ctx.font = `700 11px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(m.text, cx, cy + 13);
  ctx.fillStyle = '#9a947f'; ctx.font = `700 9px ${MONO}`; ctx.fillText(m.label, cx, cy + 23);
}

/**
 * Draw the tray with its top-left at (x, y) in CSS px (the caller scales the context). `accent` is the lamp/edge colour,
 * `ok` false greys it. `drawKey(label, cx, cy)` is the caller's keycap painter.
 */
export function drawTray(ctx, target, x, y, {accent = '#74c9ed', ok = true, key = 'E', drawKey = null, t = 0} = {}) {
  const W = TRAY_W, H = trayHeight(target), isGun = target.kind === 'gun';
  ctx.save(); ctx.translate(x, y);
  // faceplate
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(2, 4, W, H);
  ctx.fillStyle = '#1b1c1e'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(0, 0, W, 1);
  ctx.lineWidth = 2; ctx.strokeStyle = ok ? accent : '#ff6a78'; ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 6); ctx.strokeRect(1, 1, W - 2, H - 2); ctx.globalAlpha = 1;
  for (const [sx, sy] of [[7, 7], [W - 7, 7], [7, H - 7], [W - 7, H - 7]]) screw(ctx, sx, sy);
  // header: key + verb strip + the gun's one-line verb
  if (drawKey && key) drawKey(key, 25, 21);
  const verb = target.verb || (isGun ? 'TAKE' : 'FIT');
  ctx.font = `800 14px ${DISPLAY}`; const vw = ctx.measureText(verb).width + 16;
  ctx.fillStyle = '#e6dec6'; ctx.fillRect(42, 12, vw, 18);
  ctx.fillStyle = '#19150f'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(verb, 50, 21.5);
  const sub = isGun ? target.gunRef.short : 'SEATS IN THE RAIL';
  ctx.fillStyle = ok ? '#cdc7d3' : '#a39dae'; ctx.font = `600 10px ${MONO}`;
  let st = String(sub).toUpperCase(); while (st.length > 4 && ctx.measureText(st).width > W - vw - 66) st = st.slice(0, -2);
  ctx.fillText(st, 42 + vw + 8, 21.5);
  // the two halves of the tray
  const fy = 38, fw = 158, fh = 84, ax = 10, bx = W - 10 - fw;
  foam(ctx, ax, fy, fw, fh); foam(ctx, bx, fy, fw, fh);
  const alpha = ok ? 1 : 0.55;
  if (isGun) {
    drawFitted(ctx, {kind: 'gun', gun: target.gunRef}, ax + 4, fy + 4, fw - 8, fh - 28, {cavity: true, fit: 0.96, alpha});
    tag(ctx, target.gunRef.name, ax + 8, fy + fh - 21, fw - 16);
    if (target.swapRef) {
      drawFitted(ctx, {kind: 'gun', gun: target.swapRef}, bx + 4, fy + 4, fw - 8, fh - 28, {cavity: true, fit: 0.96, alpha: 0.9});
      tag(ctx, target.swapRef.name, bx + 8, fy + fh - 21, fw - 16, '#3a1410', '#d9c3b0');
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5; ctx.strokeRect(bx + 14, fy + 12, fw - 28, fh - 40); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.font = `700 11px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('FREE SLOT', bx + fw / 2, fy + fh / 2 - 6);
    }
  } else {
    const col = hexOf(target.modRef.color);
    drawFitted(ctx, {kind: 'mod', color: col}, ax + 18, fy + 6, fw - 36, fh - 30, {cavity: true, fit: 0.92, alpha});
    drawIcon(ctx, MOD_ICON[target.modRef.id] || 'pickup-mod', ax + fw / 2, fy + (fh - 24) / 2 - 3, 20, '#ffffff');
    tag(ctx, target.modRef.name, ax + 8, fy + fh - 21, fw - 16);
    if (target.handGunRef) {
      drawFitted(ctx, {kind: 'gun', gun: target.handGunRef}, bx + 4, fy + 14, fw - 8, fh - 38, {cavity: true, fit: 0.96, alpha: 0.95});
      // the rail the chip would seat on, and the chip already there
      const worn = target.wornRef;
      ctx.strokeStyle = worn ? hexOf(worn.color) : 'rgba(255,255,255,.4)'; ctx.setLineDash(worn ? [] : [3, 3]); ctx.lineWidth = 2; ctx.strokeRect(bx + fw * 0.42, fy + 6, 24, 12); ctx.setLineDash([]);
      if (worn) { ctx.fillStyle = hexOf(worn.color); ctx.globalAlpha = 0.65; ctx.fillRect(bx + fw * 0.42 + 2, fy + 8, 20, 8); ctx.globalAlpha = 1; }
      tag(ctx, `ON ${target.handGunRef.name}`, bx + 8, fy + fh - 21, fw - 16, '#3a1410', '#d9c3b0');
    }
  }
  // the exchange mark between the halves
  ctx.fillStyle = ok ? accent : '#ff6a78'; ctx.beginPath(); ctx.moveTo(W / 2 - 4, fy + fh / 2 - 8); ctx.lineTo(W / 2 + 4, fy + fh / 2); ctx.lineTo(W / 2 - 4, fy + fh / 2 + 8); ctx.closePath(); ctx.fill();
  // caption strips
  ctx.font = `700 9px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const cap = (txt, cx) => { const w = ctx.measureText(txt).width + 8; ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(cx, fy + 5, w, 12); ctx.fillStyle = '#e6dec6'; ctx.fillText(txt, cx + 4, fy + 11.5); };
  cap(isGun ? 'ON THE FLOOR' : 'THIS CHIP', ax + 5); cap(isGun ? (target.swapRef ? 'SWAP WITH' : 'IN YOUR HANDS') : 'IN YOUR HAND', bx + 5);
  // lower band
  const ly = fy + fh + 8;
  if (isGun) {
    const ms = analogMeters(target.gunRef, GUNS, {versus: target.swapRef || null});
    ms.forEach((m, i) => miniGauge(ctx, ax + 28 + i * 58, ly + 26, 22, m));
    ctx.fillStyle = target.enabled ? '#cdc7d3' : '#ff8a7a'; ctx.font = `600 10px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const lines = wrap(ctx, (target.reason || '').toUpperCase(), W - 258 - 10).slice(0, 4);
    lines.forEach((ln, i) => ctx.fillText(ln, 250, ly + 4 + i * 13));
    if (target.swapRef) { ctx.fillStyle = '#c8412f'; ctx.fillRect(250, ly + 4 + lines.length * 13 + 5, 12, 0); }
  } else {
    ctx.font = `600 11px ${MONO}`; ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillStyle = '#cdc7d3';
    wrap(ctx, target.note || '', W - 28).slice(0, 2).forEach((ln, i) => ctx.fillText(ln, 14, ly + 2 + i * 14));
    ctx.fillStyle = target.enabled ? accent : '#ff8a7a'; ctx.font = `700 10px ${MONO}`;
    wrap(ctx, (target.reason || '').toUpperCase(), W - 28).slice(0, 2).forEach((ln, i) => ctx.fillText(ln, 14, ly + 34 + i * 12));
  }
  ctx.restore();
  return {w: W, h: H};
}
