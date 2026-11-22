// Isometric battle map rules (the 3D map that replaced the flat image grid).
// The map stays in state.map ({ cols, rows, image, terrain, fog }) and gains three sparse layers, all keyed "x,y":
//   elev    height in steps (0 to 12). One step is half a tile tall on screen; climbing one step costs 5 ft.
//   ground  surface look: grass, dirt, stone, sand, water, snow, floor, and the dungeon set flagstone, cobble, moss
//           (water is difficult ground).
//   props   things standing on a tile: rock, tree, crate, and the dungeon set door, pillar, barrel, chest.
//           Walls stay in `terrain` as before. A door blocks sight but not movement (walking through opens it).
// map.theme is 'outdoor' or 'dungeon' (how terrain is generated and how walls look); map.daylight is the DM's
// light override for the 3D map ('auto' follows the story clock).
// Geometry (A*, 3D line of sight, map generation) comes from the iso core in lib/iso-battle (built to dist/core.cjs).
// The tool's rules system still decides every roll; this file only answers "can it get there", "can it see" and "is it in cover".
const core = require('../lib/iso-battle/dist/core.cjs');
const { int } = require('./util');

const TILE_FT = 5;
const GROUNDS = ['grass', 'dirt', 'stone', 'sand', 'water', 'snow', 'floor', 'flagstone', 'cobble', 'moss'];
const PROPS = ['rock', 'tree', 'crate', 'door', 'pillar', 'barrel', 'chest'];
const THEMES = ['outdoor', 'dungeon'];
// Light on the 3D map (Mike, Nov 22): 'auto' follows the story clock (dungeons are always dark); the rest are DM overrides.
const DAYLIGHTS = ['auto', 'dawn', 'day', 'dusk', 'night', 'dark'];
const MAX_ELEV = 12;
// Cover (5e): a low prop gives half cover (+2 AC), a wall or tree three-quarters cover (+5 AC).
const COVER = { rock: 2, crate: 2, tree: 5, wall: 5, pillar: 5, barrel: 2, chest: 2 };

const OBSTACLES = {
  wall: { height: 2.5, blocksMove: true, cover: true },
  tree: { height: 2.5, blocksMove: true, cover: true },
  rock: { height: 1.0, blocksMove: true, cover: true },
  crate: { height: 1.0, blocksMove: true, cover: true },
  door: { height: 2.5, blocksMove: false, cover: false },
  pillar: { height: 2.5, blocksMove: true, cover: true },
  barrel: { height: 1.0, blocksMove: true, cover: true },
  chest: { height: 0.8, blocksMove: true, cover: true },
};
// Props a walker may stand on.
const WALKABLE = new Set(['door']);
// Costs are in tiles (5 ft each). Walkers: difficult ground and water cost double; each step up costs one more tile;
// at most 2 steps up or 3 down in one stride. Fliers ignore ground cost and height and pass over rocks and crates.
const RULES = {
  heightStep: 0.5,
  visionHeight: 1.2,
  grid: { maxClimb: 2, maxDrop: 3, climbCostPerStep: 1 },
  obstacles: OBSTACLES,
  terrain: { ...Object.fromEntries(GROUNDS.map((g) => [g, { moveCost: g === 'water' ? 2 : 1 }])), difficult: { moveCost: 2 } },
};
const FLY_RULES = {
  ...RULES,
  grid: { maxClimb: 99, maxDrop: 99, climbCostPerStep: 0 },
  obstacles: { ...OBSTACLES, ...Object.fromEntries(['rock', 'crate', 'barrel', 'chest'].map((k) => [k, { ...OBSTACLES[k], blocksMove: false }])) },
  terrain: Object.fromEntries(Object.keys(RULES.terrain).map((k) => [k, { moveCost: 1 }])),
};

const key = (x, y) => `${x},${y}`;

// The map as the iso core sees it: a dense { w, h, tiles: [{ h, type, obstacle }] }.
function toGrid(map) {
  const tiles = [];
  for (let y = 0; y < map.rows; y++) for (let x = 0; x < map.cols; x++) {
    const k = key(x, y);
    const t = map.terrain?.[k];
    const ground = map.ground?.[k] || 'grass';
    tiles.push({ h: map.elev?.[k] || 0, type: t === 'difficult' ? 'difficult' : ground, obstacle: t === 'wall' ? 'wall' : map.props?.[k] || null });
  }
  return { w: map.cols, h: map.rows, tiles };
}

// Cheapest route in feet, with the tiles walked. `blocked` is a Set of "x,y" a creature may not end on or pass.
function route(map, from, to, { flying = false, maxFt = Infinity } = {}) {
  const g = toGrid(map);
  if (!core.inBounds(g, to.x, to.y)) return null;
  const r = core.findPath(g, flying ? FLY_RULES : RULES, [from.x, from.y], [to.x, to.y], null, maxFt / TILE_FT);
  return r && { ft: r.cost * TILE_FT, path: [[from.x, from.y], ...r.path] };
}

// Line of sight between two tiles in 3D: heights, walls, trees and rocks block. Eye height is the same for everyone.
function sees(map, a, b, g = toGrid(map)) {
  return core.hasLOS(g, RULES, a.x, a.y, b.x, b.y, 1.0);
}

// Cover the target gets against an attacker: 0, 2 (half) or 5 (three-quarters). Adjacent attackers ignore cover.
// Looks at the tile(s) next to the target on the attacker's side: a prop or wall there, or ground two steps higher.
function cover(map, a, b) {
  if (Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1) return 0;
  const dx = Math.sign(a.x - b.x); const dy = Math.sign(a.y - b.y);
  const cands = [[b.x + dx, b.y + dy]];
  if (dx && dy) cands.push([b.x + dx, b.y], [b.x, b.y + dy]);
  const hb = map.elev?.[key(b.x, b.y)] || 0;
  let best = 0;
  for (const [x, y] of cands) {
    if (x < 0 || y < 0 || x >= map.cols || y >= map.rows) continue;
    const k = key(x, y);
    const o = map.terrain?.[k] === 'wall' ? 'wall' : map.props?.[k];
    if (o) best = Math.max(best, COVER[o] || 0);
    if ((map.elev?.[k] || 0) - hb >= 2) best = Math.max(best, 2);
  }
  return best;
}

// Edit one tile: elevation (absolute, or +1/-1 with `raise`), ground and prop. Walls and difficult ground use dm:map:paint.
function editTile(map, { x, y, elev, raise, ground, prop } = {}) {
  x = Number(x); y = Number(y);
  if (!map || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= map.cols || y >= map.rows) return false;
  const k = key(x, y);
  map.elev ||= {}; map.ground ||= {}; map.props ||= {};
  if (raise !== undefined || elev !== undefined) {
    const h = raise !== undefined ? (map.elev[k] || 0) + (Number(raise) > 0 ? 1 : -1) : int(elev, 0, MAX_ELEV, 0);
    const v = Math.max(0, Math.min(MAX_ELEV, h));
    if (v) map.elev[k] = v; else delete map.elev[k];
  }
  if (ground !== undefined) { if (GROUNDS.includes(ground) && ground !== 'grass') map.ground[k] = ground; else if (ground === 'grass' || ground === null) delete map.ground[k]; }
  if (prop !== undefined) { if (PROPS.includes(prop)) map.props[k] = prop; else if (prop === null || prop === 'none') delete map.props[k]; }
  return true;
}

// Fill the map with generated terrain. Outdoors: rolling hills, water, ruined walls, trees and rocks. Dungeon:
// rooms and corridors with doors, pillars, barrels, crates and chests. Same seed and theme, same map.
// Replaces the layers and the terrain; keeps the size, the image and fog. The theme stays on the map.
function generate(map, seed = Math.floor(Math.random() * 1e9), theme = map.theme) {
  const th = THEMES.includes(theme) ? theme : 'outdoor';
  const g = th === 'dungeon' ? core.generateDungeon(map.cols, map.rows, seed >>> 0) : core.generateMap(map.cols, map.rows, seed >>> 0);
  const elev = {}; const ground = {}; const props = {}; const terrain = {};
  g.tiles.forEach((t, i) => {
    const k = key(i % map.cols, Math.floor(i / map.cols));
    if (t.h) elev[k] = Math.min(MAX_ELEV, t.h);
    if (t.type !== 'grass') ground[k] = t.type;
    if (t.obstacle === 'wall') terrain[k] = 'wall';
    else if (t.obstacle) props[k] = t.obstacle;
  });
  Object.assign(map, { elev, ground, props, terrain, seed, theme: th });
  return map;
}

// The DM's light override for the 3D map. Returns false for an unknown value.
function setDaylight(map, v) {
  if (!map || !DAYLIGHTS.includes(v)) return false;
  if (v === 'auto') delete map.daylight; else map.daylight = v;
  return true;
}

// Facing from one tile toward another, 0 to 7 (0 = +y). Used by the 3D view to turn the sprite.
const facing = (from, to) => core.dirFromDelta(to[0] - from[0], to[1] - from[1]);

module.exports = { TILE_FT, GROUNDS, PROPS, THEMES, DAYLIGHTS, WALKABLE, MAX_ELEV, COVER, RULES, FLY_RULES, setDaylight, toGrid, route, sees, cover, editTile, generate, facing };
