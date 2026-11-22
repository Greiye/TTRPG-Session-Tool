// Pure grid helpers shared by server and client: RNG, map gen, A*, reachability, LOS, cover, dice.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const idx = (s, x, y) => y * s.w + x;
export const inBounds = (s, x, y) => x >= 0 && y >= 0 && x < s.w && y < s.h;
export const tileAt = (s, x, y) => (inBounds(s, x, y) ? s.tiles[idx(s, x, y)] : null);

// 8 directions, index 0 = +y ("south" in world z), clockwise when viewed from above w/ our angle convention.
// Angle convention: dir d => angle d*45deg, vector (sin, cos) mapped to (x, y).
export const DIRS = [
  [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1],
];
export function dirFromDelta(dx, dy) {
  if (dx === 0 && dy === 0) return 0;
  const a = Math.atan2(dx, dy); // angle from +y toward +x
  return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
}

// ---------- Map generation ----------
function valueNoise(rand, w, h, cell) {
  const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2;
  const g = Array.from({ length: gw * gh }, rand);
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell, fy = y / cell;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = sm(fx - x0), ty = sm(fy - y0);
    const v = (i, j) => g[(j) * gw + (i)];
    const a = v(x0, y0) * (1 - tx) + v(x0 + 1, y0) * tx;
    const b = v(x0, y0 + 1) * (1 - tx) + v(x0 + 1, y0 + 1) * tx;
    return a * (1 - ty) + b * ty;
  };
}

export function generateMap(w, h, seed) {
  const rand = mulberry32(seed);
  const n1 = valueNoise(rand, w, h, 6), n2 = valueNoise(rand, w, h, 3);
  const tiles = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = n1(x, y) * 0.75 + n2(x, y) * 0.25;
    let height = Math.max(0, Math.round((v - 0.25) * 9));
    let type = 'grass';
    if (height <= 0) { type = 'water'; height = 0; }
    else if (height === 1) type = rand() < 0.5 ? 'sand' : 'dirt';
    else if (height >= 5) type = 'stone';
    else if (rand() < 0.12) type = 'dirt';
    tiles.push({ h: height, type, obstacle: null });
  }
  const s = { w, h, tiles };
  // Keep spawn corners flat & clear
  const clearZone = (cx, cy, r) => {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      const t = tileAt(s, x, y); if (!t) continue;
      t.h = 2; t.type = 'grass'; t.obstacle = null;
    }
  };
  // Obstacles
  for (const t of tiles) {
    if (t.type === 'water') continue;
    const r = rand();
    if (r < 0.06) t.obstacle = 'tree';
    else if (r < 0.10) t.obstacle = 'rock';
  }
  // A ruined wall segment or two
  for (let k = 0; k < 2; k++) {
    const horiz = rand() < 0.5;
    const len = 4 + Math.floor(rand() * 4);
    const sx = 3 + Math.floor(rand() * (w - 6 - (horiz ? len : 0)));
    const sy = 3 + Math.floor(rand() * (h - 6 - (horiz ? 0 : len)));
    const base = tileAt(s, sx, sy).h || 2;
    for (let i = 0; i < len; i++) {
      if (rand() < 0.2) continue; // gaps
      const t = tileAt(s, sx + (horiz ? i : 0), sy + (horiz ? 0 : i));
      if (!t) continue;
      t.h = Math.max(1, base); t.type = 'stone'; t.obstacle = 'wall';
    }
  }
  clearZone(2, 2, 2);
  clearZone(w - 3, h - 3, 2);
  return s;
}

/**
 * A dungeon (Mike, Nov 22): rooms of flagstone joined by cobbled corridors, cut out of solid wall. Doorways get
 * doors, larger rooms get pillars, and barrels, crates and chests stand along the walls. All floor is height 0
 * except, sometimes, a raised dais in the biggest room. Same seed, same dungeon. Rooms run left to right, so the
 * first room (where a party is placed) is on the left.
 */
export function generateDungeon(w, h, seed) {
  const rand = mulberry32(seed ^ 0x5eed);
  const tiles = [];
  for (let i = 0; i < w * h; i++) tiles.push({ h: 0, type: 'flagstone', obstacle: 'wall' });
  const s = { w, h, tiles };
  const room = new Int16Array(w * h).fill(-1); // which room a floor tile belongs to
  const rooms = [];
  const tries = Math.max(30, Math.round((w * h) / 6));
  const want = Math.max(2, Math.min(10, Math.round((w * h) / 45)));
  for (let k = 0; k < tries && rooms.length < want; k++) {
    const rw = 3 + Math.floor(rand() * Math.min(6, Math.max(1, w - 6)));
    const rh = 3 + Math.floor(rand() * Math.min(5, Math.max(1, h - 6)));
    const rx = 1 + Math.floor(rand() * Math.max(1, w - rw - 1));
    const ry = 1 + Math.floor(rand() * Math.max(1, h - rh - 1));
    if (rx + rw > w - 1 || ry + rh > h - 1) continue;
    const clash = rooms.some((r) => rx < r.x + r.w + 1 && rx + rw + 1 > r.x && ry < r.y + r.h + 1 && ry + rh + 1 > r.y);
    if (!clash) rooms.push({ x: rx, y: ry, w: rw, h: rh });
  }
  if (!rooms.length) rooms.push({ x: 1, y: 1, w: Math.max(1, w - 2), h: Math.max(1, h - 2) });
  rooms.sort((a, b) => a.x + a.w / 2 - (b.x + b.w / 2));
  rooms.forEach((r, n) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const t = tiles[idx(s, x, y)]; t.obstacle = null; t.type = rand() < 0.08 ? 'moss' : 'flagstone'; room[idx(s, x, y)] = n;
    }
  });
  // Corridors: each room to the next, one leg across then one leg down (or the other way round).
  const corridor = new Uint8Array(w * h);
  const dig = (x, y) => { const i = idx(s, x, y); const t = tiles[i]; if (t.obstacle === 'wall') { t.obstacle = null; t.type = 'cobble'; corridor[i] = 1; } };
  const centre = (r) => [r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2)];
  for (let n = 1; n < rooms.length; n++) {
    const [ax, ay] = centre(rooms[n - 1]); const [bx, by] = centre(rooms[n]);
    const across = rand() < 0.5;
    if (across) { for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) dig(x, ay); for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) dig(bx, y); }
    else { for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) dig(ax, y); for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) dig(x, by); }
  }
  const at = (x, y) => tileAt(s, x, y);
  const isWall = (x, y) => { const t = at(x, y); return !t || t.obstacle === 'wall'; };
  // Doors: a corridor tile that touches a room and sits between two walls.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!corridor[idx(s, x, y)]) continue;
    const touchesRoom = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inBounds(s, x + dx, y + dy) && room[idx(s, x + dx, y + dy)] >= 0);
    const gap = (isWall(x - 1, y) && isWall(x + 1, y)) || (isWall(x, y - 1) && isWall(x, y + 1));
    if (touchesRoom && gap && rand() < 0.6) at(x, y).obstacle = 'door';
  }
  const nearPassage = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inBounds(s, x + dx, y + dy) && (corridor[idx(s, x + dx, y + dy)] || at(x + dx, y + dy).obstacle === 'door'));
  // Pillars in the corners of big rooms; a raised dais in the biggest; barrels, crates and chests by the walls.
  let big = null;
  rooms.forEach((r, n) => {
    if (r.w >= 6 && r.h >= 5) for (const [x, y] of [[r.x + 1, r.y + 1], [r.x + r.w - 2, r.y + 1], [r.x + 1, r.y + r.h - 2], [r.x + r.w - 2, r.y + r.h - 2]]) if (!nearPassage(x, y)) at(x, y).obstacle = 'pillar';
    if (n > 0 && r.w * r.h > (big ? big.w * big.h : 23)) big = r;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const t = at(x, y); if (t.obstacle || nearPassage(x, y)) continue;
      const byWall = isWall(x - 1, y) || isWall(x + 1, y) || isWall(x, y - 1) || isWall(x, y + 1);
      if (!byWall || n === 0) continue; // the first room stays clear for the party
      const r2 = rand();
      if (r2 < 0.05) t.obstacle = 'barrel'; else if (r2 < 0.08) t.obstacle = 'crate'; else if (r2 < 0.095) t.obstacle = 'chest';
    }
  });
  if (big && rand() < 0.6) {
    for (let y = big.y + 2; y < big.y + big.h - 2; y++) for (let x = big.x + 2; x < big.x + big.w - 2; x++) { const t = at(x, y); if (!t.obstacle) t.h = 1; }
  }
  s.rooms = rooms;
  return s;
}

// ---------- Movement ----------
export function stepCost(s, rules, x0, y0, x1, y1, blocked) {
  const a = tileAt(s, x0, y0), b = tileAt(s, x1, y1);
  if (!a || !b) return Infinity;
  if (b.obstacle && rules.obstacles[b.obstacle]?.blocksMove) return Infinity;
  if (blocked && blocked.has(idx(s, x1, y1))) return Infinity;
  const dh = b.h - a.h;
  if (dh > rules.grid.maxClimb || -dh > rules.grid.maxDrop) return Infinity;
  const dx = x1 - x0, dy = y1 - y0;
  if (dx !== 0 && dy !== 0) {
    // no corner cutting past blocking tiles
    const c1 = tileAt(s, x0 + dx, y0), c2 = tileAt(s, x0, y0 + dy);
    const blocks = (t) => !t || (t.obstacle && rules.obstacles[t.obstacle]?.blocksMove) || Math.abs(t.h - a.h) > rules.grid.maxClimb;
    if (blocks(c1) || blocks(c2)) return Infinity;
  }
  const base = rules.terrain[b.type]?.moveCost ?? 1;
  return base + Math.max(0, dh) * rules.grid.climbCostPerStep;
}

class MinHeap {
  constructor() { this.a = []; }
  push(n, p) { const a = this.a; a.push([p, n]); let i = a.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (a[j][0] <= a[i][0]) break; [a[i], a[j]] = [a[j], a[i]]; i = j; } }
  pop() { const a = this.a; const top = a[0]; const last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m; } } return top[1]; }
  get size() { return this.a.length; }
}

/** A* over heights. Returns {path:[[x,y],...] (excluding start), cost} or null. */
export function findPath(s, rules, from, to, blocked, maxCost = Infinity) {
  const start = idx(s, from[0], from[1]), goal = idx(s, to[0], to[1]);
  if (start === goal) return { path: [], cost: 0 };
  const g = new Map([[start, 0]]), came = new Map();
  const hfn = (i) => Math.max(Math.abs((i % s.w) - to[0]), Math.abs(Math.floor(i / s.w) - to[1]));
  const open = new MinHeap(); open.push(start, hfn(start));
  const closed = new Set();
  while (open.size) {
    const cur = open.pop();
    if (cur === goal) break;
    if (closed.has(cur)) continue;
    closed.add(cur);
    const cx = cur % s.w, cy = Math.floor(cur / s.w);
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!inBounds(s, nx, ny)) continue;
      const c = stepCost(s, rules, cx, cy, nx, ny, blocked);
      if (!isFinite(c)) continue;
      const ni = idx(s, nx, ny), ng = g.get(cur) + c;
      if (ng > maxCost) continue;
      if (ng < (g.get(ni) ?? Infinity)) { g.set(ni, ng); came.set(ni, cur); open.push(ni, ng + hfn(ni)); }
    }
  }
  if (!g.has(goal)) return null;
  const path = []; let c = goal;
  while (c !== start) { path.push([c % s.w, Math.floor(c / s.w)]); c = came.get(c); }
  path.reverse();
  return { path, cost: g.get(goal) };
}

/** Dijkstra flood: Map<tileIdx, cost> of tiles reachable within maxCost. */
export function reachable(s, rules, from, blocked, maxCost) {
  const start = idx(s, from[0], from[1]);
  const dist = new Map([[start, 0]]);
  const open = new MinHeap(); open.push(start, 0);
  while (open.size) {
    const cur = open.pop(); const d = dist.get(cur);
    const cx = cur % s.w, cy = Math.floor(cur / s.w);
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!inBounds(s, nx, ny)) continue;
      const c = stepCost(s, rules, cx, cy, nx, ny, blocked);
      const nd = d + c;
      if (!isFinite(nd) || nd > maxCost) continue;
      const ni = idx(s, nx, ny);
      if (nd < (dist.get(ni) ?? Infinity)) { dist.set(ni, nd); open.push(ni, nd); }
    }
  }
  return dist;
}

// ---------- Line of sight ----------
const surfaceTop = (s, rules, t) => t.h * rules.heightStep + (t.obstacle ? (rules.obstacles[t.obstacle]?.height ?? 0) : 0);

/** 3D raycast from eye of (ax,ay) to (bx,by). targetHeight: height above target tile surface to aim at. */
export function hasLOS(s, rules, ax, ay, bx, by, targetHeight = rules.visionHeight) {
  const ta = tileAt(s, ax, ay), tb = tileAt(s, bx, by);
  if (!ta || !tb) return false;
  const z0 = ta.h * rules.heightStep + rules.visionHeight;
  const z1 = tb.h * rules.heightStep + targetHeight;
  const x0 = ax + 0.5, y0 = ay + 0.5, x1 = bx + 0.5, y1 = by + 0.5;
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist * 4));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = Math.floor(x0 + (x1 - x0) * t), py = Math.floor(y0 + (y1 - y0) * t);
    if ((px === ax && py === ay) || (px === bx && py === by)) continue;
    const tt = tileAt(s, px, py);
    if (!tt) return false;
    if (surfaceTop(s, rules, tt) > z0 + (z1 - z0) * t) return false;
  }
  return true;
}

/** Tile-set visible from (x,y) within sight radius. Target = ~knee height so low walls hide crouched stuff a bit. */
export function visibleFrom(s, rules, x, y, sight) {
  const out = new Set();
  const r = Math.ceil(sight);
  for (let ty = y - r; ty <= y + r; ty++) for (let tx = x - r; tx <= x + r; tx++) {
    if (!inBounds(s, tx, ty)) continue;
    if (Math.hypot(tx - x, ty - y) > sight) continue;
    if (hasLOS(s, rules, x, y, tx, ty, 0.6)) out.add(idx(s, tx, ty));
  }
  return out;
}

/** Simple cover: the tile adjacent to target toward the attacker blocks if it has an obstacle granting cover or is >=2 steps higher than target. */
export function hasCover(s, rules, ax, ay, bx, by) {
  const dx = Math.sign(ax - bx), dy = Math.sign(ay - by);
  if (Math.max(Math.abs(ax - bx), Math.abs(ay - by)) <= 1) return false; // melee: no cover
  const tb = tileAt(s, bx, by);
  const cands = [[bx + dx, by + dy]];
  if (dx && dy) cands.push([bx + dx, by], [bx, by + dy]);
  for (const [cx, cy] of cands) {
    const c = tileAt(s, cx, cy); if (!c) continue;
    if (c.obstacle && rules.obstacles[c.obstacle]?.cover) return true;
    if (c.h - tb.h >= 2) return true;
  }
  return false;
}

// ---------- Dice ----------
export function parseDice(expr) {
  const m = /^(-)?(\d+)d(\d+)([+-]\d+)?$/.exec(expr.replace(/\s/g, ''));
  if (!m) throw new Error('bad dice ' + expr);
  return { sign: m[1] ? -1 : 1, n: +m[2], d: +m[3], mod: +(m[4] || 0) };
}
export function rollDice(expr, rand = Math.random) {
  const { sign, n, d, mod } = parseDice(expr);
  let t = 0; for (let i = 0; i < n; i++) t += 1 + Math.floor(rand() * d);
  return sign * t + mod;
}
