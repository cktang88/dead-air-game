// Floor identity: every floor of a run gets its own palette and mood so the entry rooms (and everything else)
// stop looking alike. Pure data + a pure remap of the per-room themes that room-templates.js stamped.
//   F1 THE SPILLWAY       teal service tunnels
//   F2 FOUNDRY ROW        amber industrial
//   F3 THE UNDERCROFT     cold red emergency lighting
//   F4 THE CONDUCTOR'S HALL  violet stage
// `wash` tints every floor tile, `wall` tints wall tops, `grade` is the screen-wide light colour (rgb triple + alpha).

export const FLOOR_LOOKS = Object.freeze({
  1: {id: 'service', accent: '#4fd1a8', tint: '#1f3a3a', wash: ['#2fb8a0', 0.07], wall: ['#0e3a40', 0.22], grade: ['70,225,190', 0.055], entry: '#4fd1a8',
    materials: {carpet: 'tile', wood: 'concrete', dirt: 'concrete'}},
  2: {id: 'foundry', accent: '#f0a03c', tint: '#3a2a18', wash: ['#d98a28', 0.1], wall: ['#4a2a0c', 0.26], grade: ['255,150,50', 0.075], entry: '#f0a03c',
    materials: {concrete: 'metal', tile: 'metal', carpet: 'grate', wood: 'dirt'}},
  3: {id: 'emergency', accent: '#ff4a5a', tint: '#3a1620', wash: ['#8a1426', 0.085], wall: ['#3a0812', 0.3], grade: ['255,40,70', 0.07], entry: '#ff4a5a',
    materials: {concrete: 'vault', tile: 'vault', wood: 'vault', dirt: 'hazard', carpet: 'vault'}},
  4: {id: 'stage', accent: '#b48cff', tint: '#22183a', wash: ['#6a3fc0', 0.08], wall: ['#1c0e38', 0.32], grade: ['150,90,255', 0.065], entry: '#b48cff',
    materials: {concrete: 'vault', metal: 'carpet', tile: 'carpet', dirt: 'vault', wood: 'carpet', grate: 'vault'}},
});

export const floorLook = n => FLOOR_LOOKS[Math.max(1, Math.min(4, Math.floor(n) || 1))];

const rgb = hex => { const m = /^#([0-9a-f]{6})$/i.exec(hex); const n = m ? parseInt(m[1], 16) : 0; return [n >> 16, (n >> 8) & 255, n & 255]; };
export function mixHex(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

// Roles whose own colour is a gameplay signal (red killbox, gold vault, red warden) stay readable: they only lean toward the floor.
const KEEP = {hazard: 0.3, elite: 0.3, cache: 0.25, clinic: 0.4, armory: 0.45};

/** Rewrites room.theme (floor material, tint, accent, lamp colours) for a floor. Idempotent per call on fresh themes. */
export function applyFloorLook(rooms, floor) {
  const look = floorLook(floor);
  for (const room of rooms) {
    const theme = room.theme;
    if (!theme) continue;
    const lean = room.role === 'entry' || room.role === 'extraction' ? 1 : (KEEP[room.role] ?? 0.62);
    theme.floor = look.materials[theme.floor] || theme.floor;
    theme.accent = mixHex(theme.accent, look.accent, lean);
    theme.tint = mixHex(theme.tint, look.tint, Math.min(1, lean + 0.15));
    if (theme.lights) theme.lights.color = theme.accent;
    for (const d of theme.decor || []) if (d.kind === 'light') d.color = theme.accent;
    theme.floorLook = look.id;
  }
  return rooms;
}
