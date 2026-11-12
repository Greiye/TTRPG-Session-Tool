// Map and tiled combat (Phase 8, items 24 and 25).
//   map:      an uploaded image under a square grid. Each tile is 5 ft. Terrain: 'difficult' (2 ft per ft)
//             or 'wall' (no entry, even for fliers).
//   tokens:   every combatant and party member can have a tile { x, y } and a height { z } in tiles
//             (fliers rise above the table; the TV shows the height).
//   movement: a character moves up to its speed in one turn, costed over the grid. Fliers use their
//             fly speed and ignore difficult terrain. The DM can move anything (no cost check).
const { state, log } = require('./state');
const { int } = require('./util');

const TILE_FT = 5;
const WALL = 'wall';
const DIFFICULT = 'difficult';

function setMap({ image, cols, rows }) {
  state.map = {
    ...state.map,
    image: image ? String(image).slice(0, 200) : null,
    cols: int(cols, 4, 60, state.map?.cols || 20),
    rows: int(rows, 4, 40, state.map?.rows || 14),
  };
  state.map.terrain = Object.fromEntries(Object.entries(state.map.terrain || {}).filter(([k]) => {
    const [x, y] = k.split(',').map(Number);
    return x < state.map.cols && y < state.map.rows;
  }));
  state.tokens = state.tokens || {};
}
function paint(x, y, kind) {
  const k = `${x},${y}`;
  state.map.terrain = state.map.terrain || {};
  if (!kind) delete state.map.terrain[k];
  else if (kind === WALL || kind === DIFFICULT) state.map.terrain[k] = kind;
}
const inside = (x, y) => x >= 0 && y >= 0 && x < state.map.cols && y < state.map.rows;
function place(id, x, y, z) {
  if (!inside(x, y)) return false;
  if (state.map.terrain?.[`${x},${y}`] === WALL) return false;
  const t = state.tokens[id] || { x, y, z: 0 };
  state.tokens[id] = { x, y, z: z !== undefined ? int(z, 0, 10, t.z) : t.z };
  return true;
}

// Cheapest path cost in feet from one tile to another (Dijkstra over a small grid). Null if unreachable.
function cost(from, to, { flying = false } = {}) {
  if (!state.map) return null;
  const key = (x, y) => `${x},${y}`;
  const dist = new Map([[key(from.x, from.y), 0]]);
  const open = [[0, from.x, from.y]];
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [d, x, y] = open.shift();
    if (x === to.x && y === to.y) return d;
    if (d > dist.get(key(x, y))) continue;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const nx = x + dx; const ny = y + dy;
      if (!inside(nx, ny)) continue;
      const t = state.map.terrain?.[key(nx, ny)];
      if (t === WALL) continue;
      const step = t === DIFFICULT && !flying ? 2 * TILE_FT : TILE_FT;
      const nd = d + step;
      if (nd < (dist.get(key(nx, ny)) ?? Infinity)) { dist.set(key(nx, ny), nd); open.push([nd, nx, ny]); }
    }
  }
  return null;
}

// A character moves on its turn. Returns { ok, cost } or { error }.
function move(c, x, y, { dm = false } = {}) {
  const tk = state.tokens[c.id];
  if (!state.map || !tk) return { error: 'No position on the map.' };
  if (!inside(x, y) || state.map.terrain?.[`${x},${y}`] === WALL) return { error: 'That tile is blocked.' };
  if (dm) { place(c.id, x, y); return { ok: true, cost: 0 }; }
  const flying = (c.speed?.fly || 0) > 0 && (c.flying !== false);
  const budget = flying ? c.speed.fly : (c.speed?.walk ?? c.speed ?? 30);
  const used = state.combat.moved?.[c.id] || 0;
  const path = cost(tk, { x, y }, { flying });
  if (path === null) return { error: 'No route there.' };
  if (used + path > budget) return { error: `Too far: ${path} ft, ${budget - used} ft left this turn.` };
  place(c.id, x, y);
  state.combat.moved = { ...(state.combat.moved || {}), [c.id]: used + path };
  log('combat', `${c.name} moves ${path} ft.`);
  return { ok: true, cost: path };
}
const resetMoves = () => { state.combat.moved = {}; };

module.exports = { TILE_FT, WALL, DIFFICULT, setMap, paint, place, cost, move, resetMoves };
