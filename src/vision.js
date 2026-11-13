// Light and vision on the battle map (Phase B). Fog of war hides every tile no party token can see.
// A party token sees its own tile and the tiles inside its light radius (one tile is 5 ft). Walls block sight.
// Enemies carry light too, but only party tokens reveal the map.
const { WALL } = require('./grid');

// Radius in tiles: torch 20 ft, lantern 30 ft, darkvision 60 ft.
const LIGHTS = { none: 0, torch: 4, lantern: 6, darkvision: 12 };

// Bresenham line from one tile to another. Any wall strictly between the ends blocks the view.
function lineClear(terrain, x0, y0, x1, y1) {
  const dx = Math.abs(x1 - x0); const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1; const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy; let x = x0; let y = y0;
  for (;;) {
    if (x === x1 && y === y1) return true;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
    if (x === x1 && y === y1) return true;
    if (terrain?.[`${x},${y}`] === WALL) return false;
  }
}

// Tiles ("x,y") the party can see. `map` is { cols, rows, terrain }, `tokens` maps id -> { x, y, light }.
function visibleTiles(map, tokens, party) {
  const seen = new Set();
  if (!map) return seen;
  for (const [id, t] of Object.entries(tokens || {})) {
    if (!party.has(id)) continue;
    seen.add(`${t.x},${t.y}`);
    const r = LIGHTS[t.light] || 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r + r) continue; // a round radius, not a square
      const x = t.x + dx; const y = t.y + dy;
      if (x < 0 || y < 0 || x >= map.cols || y >= map.rows) continue;
      if (lineClear(map.terrain, t.x, t.y, x, y)) seen.add(`${x},${y}`);
    }
  }
  return seen;
}

module.exports = { LIGHTS, lineClear, visibleTiles };
