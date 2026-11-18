// DM world map page: places stay easy to select while the board redraws (Mike, Nov 15: hard to select).
const { chromium } = require('playwright');
const { harness } = require('./helpers');
const h = harness('click');
(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const b = await chromium.launch();
  const d = await (await b.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
  await d.goto(h.URL + '/dm?key=dmkey'); await d.waitForSelector('#mapToggle');
  await d.click('#mapToggle'); await d.waitForSelector('#wmBoard [data-node] i');
  await h.call(dm, 'dm:worldmap:fog:all', { on: true });
  await h.call(dm, 'dm:worldmap:timing', { legSeconds: 30 });
  await h.call(dm, 'dm:worldmap:go', { node: 'w5' }); // travelling: the board redraws often
  await h.settled(d, '#wmBoard');
  // The board redraws while travelling, so a place can be swapped out between finding it and measuring it.
  const box = async (id) => { for (let i = 0; i < 40; i++) { const b = await d.locator(`#wmBoard [data-node="${id}"] i`).boundingBox().catch(() => null); if (b) return b; await d.waitForTimeout(25); } throw new Error(`place ${id} never showed`); };
  let ok = 0; const ids = ['w1','w2','w3','w4','w6','w5','w3','w1'];
  for (const id of ids) {
    const bb = await box(id);
    await d.mouse.move(bb.x + bb.width / 2 + 8, bb.y + bb.height / 2 + 6);
    await d.mouse.down(); await d.waitForTimeout(120); await d.mouse.up(); // a slow tap: the press itself lasts 120 ms
    if (await d.waitForSelector(`#wmBoard [data-node="${id}"].sel`, { timeout: 2000 }).then(() => true, () => false)) ok++;
  }
  h.ok(ok === ids.length, `selected ${ok}/${ids.length} places (slow taps, 8px off-centre, while travelling)`);
  // Road mode (Nov 16): press on one place, drag to another, let go: a road joins them.
  await h.call(dm, 'dm:worldmap:go', { node: 'w1' }); await h.settled(d, '#wmBoard');
  const before = (dm.last.worldMap.roads || []).filter((r) => [r.a, r.b].sort().join() === 'w1,w6').length;
  await d.click('#wmRoad');
  const from = await box('w1');
  const to = await box('w6');
  await d.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await d.mouse.down();
  for (let i = 1; i <= 10; i++) await d.mouse.move(from.x + (to.x - from.x) * i / 10 + from.width / 2, from.y + (to.y - from.y) * i / 10 + from.height / 2);
  h.ok(await d.locator('#wmBoard line.wm-road.draft.hit').count() === 1, 'an ink line follows the drag and lights up over the far place');
  await d.mouse.up();
  h.ok(await h.until(() => dm.last.worldMap.roads.some((r) => [r.a, r.b].sort().join() === 'w1,w6')) && before === 0, 'dragging from one place to another lays a road between them');
  h.ok(await d.locator('#wmBoard .wm-compass').count() === 1 && await d.locator('#wmBoard .wm-board.paper').count() === 1, 'the map is a paper map with a compass rose');
  await b.close(); await h.done(srv);
})();
