// Browser test (Mike, Nov 27): with test mode on, the test character in the party takes a slot on the TV landing
// page like any playable character. It has no phone, so Start game still waits for a real player.
const { chromium } = require('playwright');
const { harness } = require('./helpers');
const h = harness('testmode-lobby-ui');
const { ok } = h;

(async () => {
  const srv = await h.boot({ LOBBY: '1', TEST_MODE: '1' });
  const b = await chromium.launch();
  try {
    const tv = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    await tv.goto(h.URL + '/screen');
    await tv.waitForSelector('.lb-slot.filled .lb-join');
    ok((await tv.textContent('.lb-slot.filled .lb-join')).includes('[Test] Brann'), 'the test character has a slot on the landing page');
    ok(!(await tv.$eval('.lb-start', (e) => e.classList.contains('ready'))), 'Start game still waits for a player with a phone');
    const dm = await h.dm();
    dm.emit('dm:testmode', { on: false });
    await tv.waitForFunction(() => !document.querySelector('.lb-slot.filled'));
    ok(true, 'test mode off empties the slot');
  } catch (e) { ok(false, `error: ${e.message}`); }
  await b.close();
  await h.done(srv);
})();
