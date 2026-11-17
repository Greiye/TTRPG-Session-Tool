// Playtest bots tour (tools/playtest-bots.js): bots join a fresh server and a scripted DM walks them through
// rolls, exploration, town, shops, world map, social, combat, camp, quiz, downtime and puzzles. Every step must
// pass, and the save point taken first must put the table back (no bots left behind). Usage: node test/bots.js
const { harness } = require('./helpers');
const { runTour } = require('../tools/playtest-bots');

const h = harness('bots');
(async () => {
  const srv = await h.boot();
  const lines = [];
  const out = await runTour(h.URL, 3, { log: (l) => lines.push(l) });
  for (const r of out.results) h.ok(!r.fail, `tour: ${r.name}${r.skip ? ` (skipped: ${r.skip})` : ''}${r.fail ? ` (${r.fail})` : ''}`);
  h.ok(out.results.length >= 16, 'the tour covers every step');
  h.ok(!out.results.some((r) => r.skip), 'nothing is skipped on a fresh table');
  h.ok(lines.some((l) => /steps passed/.test(l)), 'the tour prints a summary');
  const dm = await h.dm();
  await h.until(() => dm.last);
  const party = dm.last.players || [];
  h.ok(!party.some((p) => p.name.startsWith('[Bot]')), 'loading the save point takes the bots off the table');
  h.ok(!(dm.last.roster || []).some((c) => c.name?.startsWith('[Bot]')), 'and out of the roster');
  if (out.errors.length) console.log(out.errors.join('\n'));
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
