// Phase 5: roles and messages. Spectators watch from phones only, the table message log keeps each
// message with its speaker, and casters and martial classes must be set up before a rest.
const messagelog = require('../src/messagelog');
const camp = require('../src/camp');
const { harness } = require('./helpers');
const h = harness('roles');
const { ok, until } = h;

// Pure rules
{
  const list = [];
  ok(messagelog.post(list, { from: 'Thorn', role: 'player', text: '  hello  ', id: 1 }).text === 'hello', 'messages are trimmed');
  ok(!messagelog.post(list, { from: 'Thorn', text: '   ', id: 2 }), 'empty messages are refused');
  for (let i = 0; i < messagelog.MAX + 5; i++) messagelog.post(list, { from: 'DM', role: 'dm', text: `m${i}`, id: 10 + i });
  ok(list.length === messagelog.MAX && list[0].text === 'm5', 'the log keeps the newest messages only');
  ok(messagelog.post(list, { from: 'x', role: 'oops', text: 'y', id: 99 }).role === 'player', 'unknown roles are treated as players');

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

  // Table log: each message carries who said it.
  const d = await h.call(dm, 'msg:post', { text: 'The door is locked.' });
  ok(d.ok, 'the DM can post to the table log');
  const p = await h.call(a, 'msg:post', { text: 'I pick it.' });
  ok(p.ok, 'a player can post to the table log');
  const empty = await h.call(a, 'msg:post', { text: '' });
  ok(empty.error, 'an empty message is refused');
  ok(await until(() => a.last.messages?.length === 2), 'the table log reaches the phones');
  const [m1, m2] = a.last.messages;
  ok(m1.from === 'DM' && m1.role === 'dm' && m2.from === 'Thorn' && m2.role === 'player', 'each message keeps its speaker');
  ok(!a.last.log.some((l) => l.text === 'I pick it.'), 'table messages stay out of the event log');

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
