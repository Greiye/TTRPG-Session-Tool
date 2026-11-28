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

  // Test mode (Mike, Nov 27): every test character is on the phones' character list and a phone can play one.
  const cards = () => (dm.last?.roster || []).filter((c) => c.name?.startsWith('[Test]'));
  dm.emit('dm:testmode', { on: true });
  ok(await until(() => cards().length === 12), 'test mode puts every test character on the phone character list');
  ok(testers().length === 1, 'only one test character sits in the party until a phone picks another');
  const room = await h.room();
  const mira = cards().find((c) => c.name === '[Test] Mira');
  const phone = await h.client();
  const res = await h.call(phone, 'join', { id: mira.id, room });
  ok(res?.id === mira.id && !res.error, 'a phone can pick a test character and play it');
  ok(await until(() => dm.last?.players?.find((p) => p.id === mira.id)?.online), 'the picked test character is seated in the party');
  dm.emit('dm:testmode', { on: false });
  ok(await until(() => !cards().some((c) => c.name === '[Test] Quill')), 'test mode off takes unseated test characters off the list');
  ok(cards().some((c) => c.id === mira.id), 'a test character played on a phone stays on the list');
  phone.close();

  dm.emit('dm:testparty');
  ok(await until(() => testers().length === 12), 'the DM can seat the twelve test characters');
  const druid = testers().find((p) => p.cls === 'Druid');
  ok(druid && druid.level === 2 && druid.spells?.length === 2, 'the druid keeps its spells and level');

  dm.emit('dm:testparty');
  await h.wait(200);
  ok(testers().length === 12, 'seeding again does not duplicate the test party');


  dm.close(); await h.done(srv);
})();
