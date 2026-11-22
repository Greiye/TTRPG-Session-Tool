// Procedural pixel-art billboard sheets: 9 frames (32x32) per unit kind.
// Frames 0..7 = facing relative to camera (0 front, 1 front-right, 2 right, 3 back-right, 4 back, 5 back-left, 6 left, 7 front-left)
// Frame 8 = overhead (drawn facing screen-up; rotated at runtime).
// Swap later: set "sprite": "assets/sprites/<kind>.png" in rules.json (a horizontal strip of 9 equal frames).
import * as THREE from 'three';

const S = 32;
const OUTLINE = '#1a1420';

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

function frameCtx() {
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  return [c, g];
}

function outline(g) {
  const img = g.getImageData(0, 0, S, S), d = img.data;
  const a = (x, y) => (x < 0 || y < 0 || x >= S || y >= S ? 0 : d[(y * S + x) * 4 + 3]);
  const out = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!a(x, y) && (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1))) out.push([x, y]);
  g.fillStyle = OUTLINE; for (const [x, y] of out) g.fillRect(x, y, 1, 1);
}

function drawWeapon(g, P, kind, x, y, facingSide) {
  const metal = '#c8ccd8', wood = '#7a5230';
  switch (kind) {
    case 'sword': P(x, y - 9, 1, 9, metal); P(x - 1, y - 1, 3, 1, '#8a6a2a'); P(x, y, 1, 2, wood); break;
    case 'dagger': P(x, y - 4, 1, 4, metal); P(x - 1, y, 3, 1, '#6a4a2a'); break;
    case 'staff': P(x, y - 12, 1, 18, wood); P(x - 1, y - 14, 3, 3, '#e8c64a'); P(x, y - 13, 1, 1, '#fff6c0'); break;
    case 'club': P(x - 1, y - 8, 3, 7, '#8a5a30'); P(x, y - 1, 1, 3, wood); P(x - 1, y - 7, 1, 1, '#a07040'); break;
    case 'bow': {
      const dir = facingSide || 1;
      for (let i = -6; i <= 6; i++) P(x + Math.round(dir * (2 - (i * i) / 18)), y + i - 2, 1, 1, wood);
      P(x - dir, y - 8, 1, 13, '#e0e0e0');
      break;
    }
  }
}

function drawHumanoid(g, pal, k) {
  const P = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const skel = pal.body === 'skeleton';
  const skin = pal.skin, cloth = pal.cloth, trim = pal.trim, hair = pal.hair;
  const dark = shade(cloth, 0.75);
  const side = k === 2 ? 1 : k === 6 ? -1 : 0;
  const front = k === 0 || k === 1 || k === 7, back = k === 4 || k === 3 || k === 5;
  const three = k === 1 || k === 3 ? 1 : k === 7 || k === 5 ? -1 : 0;
  const lean = side || three; // -1 left, +1 right
  const cx = 16;
  // weapon behind body when facing away
  const wx = front ? cx - 7 * (three ? -three : 1) : back ? cx + 7 * (three ? -three : 1) : cx + 6 * side;
  if (back && pal.weapon) drawWeapon(g, P, pal.weapon, wx, 21, -1);
  // legs
  if (side) { P(cx - 3, 24, 3, 6, dark); P(cx + 0, 24, 3, 6, shade(dark, 0.85)); P(cx - 3 + side, 29, 4, 1, '#3a2a1a'); }
  else { P(cx - 4, 24, 3, 6, dark); P(cx + 1, 24, 3, 6, dark); P(cx - 4, 29, 3, 1, '#3a2a1a'); P(cx + 1, 29, 3, 1, '#3a2a1a'); }
  // torso
  const tw = side ? 7 : 10, tx = cx - Math.floor(tw / 2) + (three ? three : 0);
  P(tx, 15, tw, 9, cloth);
  P(tx, 15, side ? 2 : 3, 9, shade(cloth, 0.85));
  P(tx, 21, tw, 1, trim);
  if (skel) { for (let yy = 16; yy < 21; yy += 2) P(tx + 1, yy, tw - 2, 1, skin); P(cx, 15, 1, 7, skin); }
  // arms
  if (side) { P(cx - 1 + side, 16, 2, 7, skel ? skin : shade(cloth, 0.9)); P(cx - 1 + side, 22, 2, 2, skin); }
  else { P(tx - 2, 16, 2, 6, shade(cloth, 0.8)); P(tx + tw, 16, 2, 6, shade(cloth, 0.95)); P(tx - 2, 22, 2, 2, skin); P(tx + tw, 22, 2, 2, skin); }
  // head
  const hx = cx - 4 + lean, hy = 6;
  P(hx, hy, 8, 9, skin);
  P(hx, hy, 2, 9, shade(skin, 0.88));
  // hair / hood
  if (!skel) {
    P(hx, hy - 1, 8, 3, hair);
    if (back) P(hx, hy, 8, 8, hair);
    else if (side) P(side > 0 ? hx : hx + 4, hy, 4, 7, hair);
    else if (three) P(three > 0 ? hx : hx + 6, hy, 2, 6, hair);
    else { P(hx, hy, 1, 6, hair); P(hx + 7, hy, 1, 6, hair); }
  }
  // face
  const eye = skel ? '#200808' : '#1c1830';
  if (k === 0) { P(hx + 2, hy + 4, skel ? 2 : 1, 2, eye); P(hx + 5, hy + 4, skel ? 2 : 1, 2, eye); P(hx + 3, hy + 7, 2, 1, shade(skin, 0.7)); }
  else if (three && front) { const ex = three > 0 ? hx + 4 : hx + 1; P(ex, hy + 4, 1, 2, eye); P(ex + 2 * three + (three > 0 ? 0 : 0), hy + 4, 1, 2, eye); }
  else if (side) P(side > 0 ? hx + 6 : hx + 1, hy + 4, 1, 2, eye);
  if (pal.scale > 1.3 && (front || side)) { P(hx + 2 + (side > 0 ? 2 : 0), hy + 8, 1, 1, '#ffffff'); if (!side) P(hx + 5, hy + 8, 1, 1, '#ffffff'); }
  // weapon in front
  if (!back && pal.weapon) drawWeapon(g, P, pal.weapon, wx, 22, side || -1);
}

function drawSlime(g, pal, k) {
  const P = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const rows = [[10, 20], [8, 22], [7, 23], [6, 24], [6, 24], [5, 25], [5, 25], [5, 25], [5, 25], [6, 24]];
  rows.forEach(([a, b], i) => P(a, 20 + i, b - a + 1, 1, i < 3 ? shade(pal.skin, 1.15) : i > 7 ? shade(pal.skin, 0.8) : pal.skin));
  P(9, 22, 2, 2, '#ffffff');
  const ang = (k * Math.PI) / 4, f = Math.cos(ang), s = Math.sin(ang);
  if (f > -0.3) { const ex = 15 + Math.round(s * 5); P(ex - 2, 24, 2, 2, '#102020'); if (Math.abs(s) < 0.9) P(ex + 2, 24, 2, 2, '#102020'); }
}

function drawOverhead(g, pal) {
  const P = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  if (pal.body === 'slime') {
    for (let y = -6; y <= 6; y++) { const w = Math.round(Math.sqrt(36 - y * y)); P(16 - w, 16 + y, w * 2, 1, pal.skin); }
    P(13, 11, 2, 2, '#102020'); P(18, 11, 2, 2, '#102020'); return;
  }
  // facing up: shoulders, head, weapon arm forward
  for (let y = -3; y <= 3; y++) { const w = Math.round(7 * Math.sqrt(1 - (y * y) / 12)); P(16 - w, 17 + y, w * 2, 1, y > 0 ? shade(pal.cloth, 0.8) : pal.cloth); }
  P(9, 15, 2, 3, pal.skin); P(21, 13, 2, 3, pal.skin); // hands
  for (let y = -3; y <= 3; y++) { const w = Math.round(Math.sqrt(10 - y * y)); P(16 - w, 16 + y, w * 2, 1, pal.body === 'skeleton' ? pal.skin : pal.hair); }
  P(15, 12, 2, 1, pal.skin); // nose/face edge
  const wood = '#7a5230', metal = '#c8ccd8';
  if (pal.weapon === 'sword' || pal.weapon === 'dagger') P(21, pal.weapon === 'sword' ? 4 : 8, 1, pal.weapon === 'sword' ? 9 : 5, metal);
  if (pal.weapon === 'staff') { P(21, 3, 1, 12, wood); P(20, 2, 3, 2, '#e8c64a'); }
  if (pal.weapon === 'club') P(20, 6, 3, 8, '#8a5a30');
  if (pal.weapon === 'bow') { P(17, 8, 9, 1, wood); P(21, 8, 1, 6, '#e0e0e0'); }
}

const cache = new Map();

/** Returns {texture, frames, aspect} for a unit kind. Texture is a 9-frame horizontal strip. */
export function getSheet(kind, def) {
  if (cache.has(kind)) return cache.get(kind);
  const pal = { ...def.palette };
  const sheet = document.createElement('canvas'); sheet.width = S * 9; sheet.height = S;
  const sg = sheet.getContext('2d'); sg.imageSmoothingEnabled = false;
  const frames = [];
  for (let k = 0; k <= 4; k++) {
    const [c, g] = frameCtx();
    pal.body === 'slime' ? drawSlime(g, pal, k) : drawHumanoid(g, pal, k);
    outline(g); frames[k] = c;
  }
  // mirror 1..3 -> 7..5
  for (const [src, dst] of [[1, 7], [2, 6], [3, 5]]) {
    const [c, g] = frameCtx(); g.translate(S, 0); g.scale(-1, 1); g.drawImage(frames[src], 0, 0); frames[dst] = c;
  }
  { const [c, g] = frameCtx(); drawOverhead(g, pal); outline(g); frames[8] = c; }
  frames.forEach((f, i) => sg.drawImage(f, i * S, 0));
  const tex = new THREE.CanvasTexture(sheet);
  configure(tex);
  const entry = { texture: tex, canvas: sheet, frameCanvases: frames, scale: pal.scale || 1 };
  // The same strip as a flat white shape: drawn through walls and hills so a hidden unit still shows its outline.
  Object.defineProperty(entry, 'silhouette', { get() {
    if (this._sil) return this._sil;
    const c = document.createElement('canvas'); c.width = sheet.width; c.height = sheet.height;
    const g = c.getContext('2d'); g.drawImage(sheet, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    this._sil = new THREE.CanvasTexture(c); configure(this._sil); this._sil.colorSpace = THREE.NoColorSpace;
    return this._sil;
  } });
  cache.set(kind, entry);
  if (def.sprite) {
    // optional external sheet; replaces the procedural image when it loads
    const img = new Image();
    img.onload = () => { tex.image = img; tex.needsUpdate = true; };
    img.src = def.sprite;
  }
  return entry;
}

function configure(tex) {
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(1 / 9, 1);
}

export function portraitDataURL(kind, def) { return getSheet(kind, def).frameCanvases[0].toDataURL(); }
