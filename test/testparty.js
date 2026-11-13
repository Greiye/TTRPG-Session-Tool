// Placeholder test party (src/testparty.js): the DM can seed five complex classes, seeding twice does
// not duplicate them, and the new classes take part in the rest rules.
const { harness } = require('./helpers');
const camp = require('../src/camp');
const { PARTY } = require('../src/testparty');
const h = harness('testparty');
const { ok, until } = h;

// Pure rules: the new classes count as casters or martial classes for rests.
ok(camp.restBlockers({ cls: 'Druid', spells: [], inventory: [] }).length === 1, 'a druid with no spell is not ready to rest');
ok(camp.restBlockers({ cls: 'Warlock', spells: ['srd_fire-bolt'], inventory: [] }).length === 0, 'a warlock with a spell is ready');
ok(camp.restBlockers({ cls: 'Paladin', spells: [], inventory: [{ name: 'Mace', qty: 1 }] }).length === 0, 'a paladin with a weapon is ready');
ok(PARTY.length === 5 && ['Druid', 'Paladin', 'Warlock', 'Wizard', 'Cleric'].every((c) => PARTY.some((p) => p.cls === c)), 'the test party covers druid, paladin, warlock, wizard and cleric');

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const testers = () => (dm.last?.players || []).filter((p) => p.name?.startsWith('[Test]'));

  dm.emit('dm:testparty');
  ok(await until(() => testers().length === 5), 'the DM can seat the five test characters');
  const druid = testers().find((p) => p.cls === 'Druid');
  ok(druid && druid.level === 2 && druid.spells?.length === 2, 'the druid keeps its spells and level');

  dm.emit('dm:testparty');
  await h.wait(200);
  ok(testers().length === 5, 'seeding again does not duplicate the test party');

  dm.close(); await h.done(srv);
})();
