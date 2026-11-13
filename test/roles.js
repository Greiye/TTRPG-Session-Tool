// Phase 5: roles. Spectators watch from phones only, and casters and martial classes must be set up before a rest.
const camp = require('../src/camp');
const { harness } = require('./helpers');
const h = harness('roles');
const { ok, until } = h;

// Pure rules
{
  ok(camp.restBlockers({ cls: 'Wizard', spells: [], inventory: [] }).length === 1, 'a caster with no spell is not ready');
  ok(camp.restBlockers({ cls: 'Wizard', spells: ['fire-bolt'], inventory: [] }).length === 0, 'a caster with a spell is ready');
  ok(camp.restBlockers({ cls: 'Fighter', spells: [], inventory: [{ name: 'Rations', qty: 3 }] }).length === 1, 'a fighter needs a weapon');
  ok(camp.restBlockers({ cls: 'Fighter', spells: [], inventory: [{ name: 'Longsword', qty: 1 }] }).length === 0, 'a fighter with a weapon is ready');
  ok(camp.restBlockers({ cls: 'Fighter', spells: [], inventory: [{ name: 'Longsword', qty: 0 }] }).length === 1, 'a weapon you no longer carry does not count');
  ok(camp.restBlockers({ cls: 'Bard', spells: [], inventory: [] }).length === 1, 'bards are casters');
}

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  await until(() => a.last?.players.length === 1);

  // Spectators: phones only.
  const laptop = await h.client();
  laptop.emit('client:device', { device: 'laptop' });
  const refused = await h.call(laptop, 'spectate', { room, name: 'Fan' });
  ok(refused.error && /phone/.test(refused.error), 'a laptop cannot watch as a spectator');
  const phone = await h.client();
  phone.emit('client:device', { device: 'phone' });
  const seated = await h.call(phone, 'spectate', { room, name: 'Fan' });
  ok(seated.ok, 'a phone can watch as a spectator');

  // Rest: a fighter without a weapon cannot vote for a rest until set up.
  dm.emit('dm:camp:open', { open: true });
  await until(() => a.last.camp?.open);
  const blocked = await h.call(a, 'player:camp', { vote: 'short' });
  ok(blocked.error && blocked.missing?.length === 1, 'a fighter with no weapon cannot rest yet');
  a.emit('player:sheet', { inv: { op: 'add', name: 'Longsword', qty: 1 } });
  await until(() => a.last.players.find((x) => x.id === a.me.id)?.inventory?.length === 1);
  const ready = await h.call(a, 'player:camp', { vote: 'short' });
  ok(ready.ok, 'after a weapon is set up the vote goes through');

  laptop.close(); phone.close(); a.close();
  await h.done(srv);
})();
