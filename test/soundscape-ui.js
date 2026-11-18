// Soundscape panel in the browser: the DM's Scene › Soundscape card and the Music Co-DM's page (only that card,
// no output controls). SHOTS=dir saves screenshots.
const { chromium } = require('playwright');
const { harness } = require('./helpers');
const h = harness('soundscape-ui');
// h.until does not await; this one does, for checks that read the page.
const untilPage = async (fn, ms = 3000) => { const end = Date.now() + ms; for (;;) { if (await fn().catch(() => false)) return true; if (Date.now() > end) return false; await h.wait(50); } };
(async () => {
  const srv = await h.boot({ MUSIC_KEY: 'musickey' });
  const dm = await h.dm();
  const b = await chromium.launch();
  const errors = [];
  const page = async (url, viewport) => {
    const p = await (await b.newContext({ viewport })).newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(h.URL + url);
    await p.waitForLoadState('networkidle');
    return p;
  };
  const d = await page('/dm?key=dmkey', { width: 1500, height: 950 });
  await d.waitForFunction(() => window.dmShowTab);
  await d.evaluate(() => window.dmShowTab('scene', 'sound'));
  await d.waitForSelector('#soundscape', { state: 'visible' });
  const card = d.locator('#soundscape');
  h.ok(await card.isVisible(), 'the DM finds the Soundscape under Scene');
  if (await card.evaluate((c) => c.classList.contains('folded'))) await card.locator('h3').click({ position: { x: 20, y: 10 } }); // folded, unless the tab opened it (Nov 18)
  await d.waitForSelector('#soundscape:not(.folded) .ss-mood'); await h.settled(d, '#soundscape');
  h.ok(await card.locator('.ss-mood').count() === 9, 'the mood wheel has nine moods');

  await card.locator('[data-env="tavern"]').click();
  h.ok(await h.until(() => dm.last.soundscape.env === 'tavern'), 'tapping Tavern loads the tavern');
  h.ok(await untilPage(async () => (await card.locator('.ss-chip:not(.fav)').count()) === 2), 'its layers show as chips');
  await card.locator('[data-mood="mystic"]').click();
  h.ok(await h.until(() => dm.last.audio.music?.id === 'mood-mystic'), 'tapping Mystic on the wheel plays mystic music');
  h.ok(await untilPage(async () => /Mystic/.test(await card.locator('.ss-hub').textContent())), 'the hub names the mood');
  await card.locator('[data-el="favName"]').fill('Smoky tavern');
  await card.locator('[data-ss="fav"]').click();
  h.ok(await h.until(() => dm.last.soundscape.favs.length === 1), 'Save stores a favourite');
  h.ok(await card.locator('[data-el="dm"]').isVisible(), 'the DM sees master volume and output');
  await card.locator('[data-output="tv"]').click();
  h.ok(await h.until(() => dm.last.audio.output === 'tv'), 'the DM picks the TV as output');
  if (process.env.SHOTS) { await card.scrollIntoViewIfNeeded(); await h.settled(d, '#soundscape'); await card.screenshot({ path: `${process.env.SHOTS}/dm-soundscape.png` }); }

  // Music Co-DM: the DM page with only the Soundscape card.
  const m = await page('/dm?key=musickey', { width: 390, height: 844 });
  h.ok(await m.locator('#soundscape').isVisible(), 'the Music Co-DM sees the Soundscape');
  h.ok(await m.locator('#dmBar h2').textContent() === '🎻 Music Co-DM', 'the page is titled Music Co-DM');
  h.ok(!(await m.locator('#soundscape [data-el="dm"]').isVisible()), 'the Music Co-DM has no output controls');
  h.ok(await m.locator('#soundscape [data-el="weather"]').isEnabled(), 'the Music Co-DM has the weather slider');
  await m.locator('#soundscape [data-fav-scene]').first().click();
  h.ok(await h.until(() => dm.last.soundscape.favs[0].scene === dm.last.scene.title), 'the 🎬 button links a favourite to the current scene');
  const others = await m.locator('[data-tab]:not(#soundscape)').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).length);
  h.ok(others === 0, 'no other DM card shows');
  await m.locator('[data-mood="tense"]').click();
  h.ok(await h.until(() => dm.last.soundscape.mood === 'tense' && dm.last.soundscape.by === 'Music Co-DM'), 'the Music Co-DM changes the mood');
  h.ok(await untilPage(async () => /Music Co-DM/.test(await card.locator('[data-el="by"]').textContent())), 'the DM sees who changed it');
  dm.emit('sound:lock', { on: true });
  h.ok(await untilPage(async () => m.locator('[data-el="lockNote"]').isVisible()), 'the Music Co-DM sees the DM\'s lock');
  if (process.env.SHOTS) await m.screenshot({ path: `${process.env.SHOTS}/music-codm-phone.png`, fullPage: true });

  h.ok(!errors.length, `no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
  await b.close();
  await h.done(srv);
})();
