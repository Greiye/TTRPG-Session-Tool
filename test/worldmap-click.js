// DM world map page: places stay easy to select while the board redraws (Mike, Nov 15: hard to select).
const { chromium } = require('playwright');
const { harness } = require('./helpers');
const h = harness('click');
(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const b = await chromium.launch();
  const d = await (await b.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
  await d.goto(h.URL + '/dm?key=dmkey'); await d.waitForTimeout(1500);
  await d.click('#mapToggle'); await d.waitForTimeout(500);
  await h.call(dm, 'dm:worldmap:fog:all', { on: true });
  await h.call(dm, 'dm:worldmap:timing', { legSeconds: 30 });
  await h.call(dm, 'dm:worldmap:go', { node: 'w5' }); // travelling: the board redraws often
  await d.waitForTimeout(500);
  let ok = 0; const ids = ['w1','w2','w3','w4','w6','w5','w3','w1'];
  for (const id of ids) {
    const box = await d.locator(`#wmBoard [data-node="${id}"] i`).boundingBox();
    await d.mouse.move(box.x + box.width / 2 + 8, box.y + box.height / 2 + 6);
    await d.mouse.down(); await d.waitForTimeout(120); await d.mouse.up();
    await d.waitForTimeout(200);
    if (await d.locator(`#wmBoard [data-node="${id}"].sel`).count()) ok++;
  }
  h.ok(ok === ids.length, `selected ${ok}/${ids.length} places (slow taps, 8px off-centre, while travelling)`);
  await b.close(); await h.done(srv);
})();
