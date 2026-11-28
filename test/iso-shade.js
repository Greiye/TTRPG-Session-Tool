// 3D battle map floor shading (Mike, Nov 27): height differences read at a glance. Higher ground is lighter,
// lower ground darker, and a tile at the foot of higher ground is shaded, more on the side away from the sun.
const { harness } = require('./helpers');
const h = harness('iso-shade');
const { ok } = h;

(async () => {
  const { floorShade } = await import('../lib/iso-battle/src/client/scene.js');
  const grid = (hs) => hs.map((v) => ({ h: v }));
  const flat = grid([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  ok(floorShade(flat, 4, 3, 3) === floorShade(flat, 0, 3, 3), 'flat ground has one shade');
  const hill = grid([0, 0, 0, 0, 2, 0, 0, 0, 0]);
  ok(floorShade(hill, 4, 3, 3) > floorShade(flat, 4, 3, 3), 'a raised tile is lighter than flat ground');
  ok(floorShade(hill, 1, 3, 3) < floorShade(flat, 1, 3, 3), 'a tile next to higher ground is shaded');
  const pit = grid([0, 0, 0, 0, -2, 0, 0, 0, 0]);
  ok(floorShade(pit, 4, 3, 3) < floorShade(flat, 4, 3, 3) - 0.1, 'a pit is clearly darker');
  // Sun at -x, +z (y on the grid): the tile whose hill stands between it and the sun gets the deeper shade.
  const sun = { x: -8, z: 5 };
  const wall = grid([0, 3, 0]);
  ok(floorShade(wall, 2, 3, 1, sun) < floorShade(wall, 0, 3, 1, sun), 'the side away from the sun is darker');
  ok(floorShade(grid([0, 9, 9, 9, 9, 9, 9, 9, 9]), 0, 3, 3) > 0.3, 'shade has a floor, so the tile stays visible');
  await h.done();
})();
