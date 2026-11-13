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
const ALL = ['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard'];
ok(PARTY.length === 12 && ALL.every((c) => PARTY.some((p) => p.cls === c)), 'the test party has one character for every 5e class');
ok(Object.keys(require('../src/rules/dnd5e').classes).sort().join() === ALL.join(), 'the rules define exactly the twelve 5e classes');

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const testers = () => (dm.last?.players || []).filter((p) => p.name?.startsWith('[Test]'));

  dm.emit('dm:testparty');
  ok(await until(() => testers().length === 12), 'the DM can seat the twelve test characters');
  const druid = testers().find((p) => p.cls === 'Druid');
  ok(druid && druid.level === 2 && druid.spells?.length === 2, 'the druid keeps its spells and level');

  dm.emit('dm:testparty');
  await h.wait(200);
  ok(testers().length === 12, 'seeding again does not duplicate the test party');

  dm.close(); await h.done(srv);
})();
