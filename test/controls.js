// Phase 4: player controls. Stamina and mana live on the character (hidden when max is 0), players track
// current points, the DM sets maximums, and free ability rolls come back as d20 results.
const sheet = require('../src/sheet');
const { harness } = require('./helpers');
const h = harness('controls');
const { ok, until } = h;

// Pure rules
{
  const c = { system: 'dnd5e', cls: 'Fighter', level: 1, stamina: { max: 0, cur: 5 }, mana: { max: 9, cur: 20 } };
  sheet.ensureSheet(c);
  ok(c.stamina.max === 0 && c.stamina.cur === 0, 'a pool with no max stays empty (and is hidden on phones)');
  ok(c.mana.max === 9 && c.mana.cur === 9, 'mana is clamped to its maximum');
  sheet.applySheet(c, { mana: { cur: 3 } }, false);
  ok(c.mana.cur === 3, 'players can spend current mana');
  sheet.applySheet(c, { mana: { cur: 99 } }, false);
  ok(c.mana.cur === 9, 'current points stay within the maximum');
  sheet.applySheet(c, { mana: { max: 50 } }, false);
  ok(c.mana.max === 9, 'players cannot raise the maximum');
  sheet.applySheet(c, { stamina: { max: 12 } }, true);
  ok(c.stamina.max === 12 && c.stamina.cur === 0, 'the DM sets a maximum; current starts at 0 for a new pool');
  sheet.applySheet(c, { mana: { max: 4 } }, true);
  ok(c.mana.max === 4 && c.mana.cur === 4, 'lowering the maximum trims current points');
}

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  await until(() => a.last?.players.length === 1);
  const id = a.me.id;

  // Players see no pools until the DM sets a maximum.
  ok(!a.last.players.find((p) => p.id === id).stamina || a.last.players.find((p) => p.id === id).stamina.max === 0, 'no stamina pool by default');
  dm.emit('dm:sheet', { id, stamina: { max: 10 } });
  ok(await until(() => a.last.players.find((p) => p.id === id).stamina?.max === 10), 'the DM gives the character stamina');
  a.emit('player:sheet', { stamina: { cur: 4 } });
  ok(await until(() => a.last.players.find((p) => p.id === id).stamina.cur === 4), 'the player spends stamina');

  // Free ability roll: the phone asks for 1d20 with a modifier and gets a total back.
  const r = await h.call(a, 'player:roll', { expr: '1d20+2', label: 'Strength check' });
  ok(typeof r.total === 'number' && r.total >= 3 && r.total <= 22, 'a free d20 check rolls and returns a total');

  // Conditions still come from the DM; the phone cannot set them.
  a.emit('player:sheet', { conditions: ['Stunned'] });
  await h.wait(100);
  ok(!a.last.players.find((p) => p.id === id).conditions?.includes('Stunned'), 'players cannot set their own conditions');

  a.close();
  await h.done(srv);
})();
