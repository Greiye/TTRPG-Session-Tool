// Map and tiled combat (Phase 8, items 24 and 25).
//   map:      an uploaded image under a square grid. Each tile is 5 ft. Terrain: 'difficult' (2 ft per ft)
//             or 'wall' (no entry, even for fliers).
//   tokens:   every combatant and party member can have a tile { x, y } and a height { z } in tiles
//             (fliers rise above the table; the TV shows the height).
//   movement: a character moves up to its speed in one turn, costed over the grid. Fliers use their
//             fly speed and ignore difficult terrain. The DM can move anything (no cost check).
//   3D:       heights, ground and props (src/iso.js). Climbing a step costs 5 ft more; walkers go up at most
//             2 steps and down 3 in one stride; rocks, trees and crates block walkers (fliers pass rocks and crates).
const { state, log } = require('./state');
const { int } = require('./util');
const iso = require('./iso');

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
  const fits = ([k]) => { const [x, y] = k.split(',').map(Number); return x < state.map.cols && y < state.map.rows; };
  for (const layer of ['terrain', 'elev', 'ground', 'props']) state.map[layer] = Object.fromEntries(Object.entries(state.map[layer] || {}).filter(fits));
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
  state.tokens[id] = { ...t, x, y, z: z !== undefined ? int(z, 0, 10, t.z) : t.z };
  return true;
}

// Cheapest path cost in feet from one tile to another, over heights and props (src/iso.js). Null if unreachable.
function cost(from, to, { flying = false } = {}) {
  if (!state.map) return null;
  return iso.route(state.map, from, to, { flying })?.ft ?? null;
}

// The last move, for the 3D view to walk the token along its path. n changes on every move.
function remember(id, path) {
  const n = (state.combat.lastMove?.n || 0) + 1;
  state.combat.lastMove = { id, path: path.slice(0, 64), n };
  if (path.length > 1) state.tokens[id].facing = iso.facing(path[path.length - 2], path[path.length - 1]);
}

// A character moves on its turn. Returns { ok, cost } or { error }.
function move(c, x, y, { dm = false } = {}) {
  const tk = state.tokens[c.id];
  if (!state.map || !tk) return { error: 'No position on the map.' };
  if (!inside(x, y) || state.map.terrain?.[`${x},${y}`] === WALL) return { error: 'That tile is blocked.' };
  const flying = (c.speed?.fly || 0) > 0 && (c.flying !== false);
  if (dm) {
    const r = iso.route(state.map, tk, { x, y }, { flying: true });
    const from = [tk.x, tk.y];
    place(c.id, x, y);
    remember(c.id, r ? r.path : [from, [x, y]]);
    return { ok: true, cost: 0 };
  }
  if (state.map.props?.[`${x},${y}`] && !flying) return { error: 'That tile is blocked.' };
  const budget = flying ? c.speed.fly : (c.speed?.walk ?? c.speed ?? 30);
  const used = state.combat.moved?.[c.id] || 0;
  const r = iso.route(state.map, tk, { x, y }, { flying });
  if (!r) return { error: 'No route there.' };
  if (used + r.ft > budget) return { error: `Too far: ${r.ft} ft, ${budget - used} ft left this turn.` };
  place(c.id, x, y);
  remember(c.id, r.path);
  state.combat.moved = { ...(state.combat.moved || {}), [c.id]: used + r.ft };
  log('combat', `${c.name} moves ${r.ft} ft.`);
  return { ok: true, cost: r.ft };
}
const resetMoves = () => { state.combat.moved = {}; };

module.exports = { TILE_FT, WALL, DIFFICULT, setMap, paint, place, cost, move, resetMoves };
