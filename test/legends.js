// Phase J table legends: hall of fame, trophy shelf, house rules, empty-chair autopilot and "what you missed".
// Unit checks run in-process on a temp data dir; the socket checks run against a booted server.
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tavern-legends-data-'));
const legends = require('../src/legends');
const houserules = require('../src/houserules');
const absent = require('../src/absent');
const { harness } = require('./helpers');
const h = harness('legends');
const { ok, until } = h;

// ----- unit: hall of fame -----
const thorn = { id: 'a1', name: 'Thorn', player: 'Dana' };
legends.recordNat1(thorn);
legends.recordNat1({ id: 'a1', name: 'Thorn the Brave', player: 'dana' });
legends.recordNat1({ id: 'b2', name: 'Bree', player: '' });
const nat = legends.view().nat1;
ok(nat[0].count === 2 && nat[0].player === 'Dana' && nat[0].character === 'Thorn the Brave', 'natural 1s tally per real player name across characters');
ok(nat[1].player === 'Bree' && nat[1].count === 1, 'a character with no player name is listed under its own name');
const won = legends.award('plan', { player: 'Dana', character: 'Thorn', detail: 'Jumped into the moat' });
ok(won.entry && legends.view().plan[0].detail === 'Jumped into the moat', 'the DM can award worst plan');
ok(legends.award('nat1', { player: 'Dana' }).error, 'natural 1s cannot be awarded by hand');
ok(legends.removeAward(won.entry.id) && legends.view().plan.length === 0, 'a hall of fame record can be removed');

// ----- unit: trophy shelf -----
const t = legends.addTrophy({ name: 'Crown of the Drowned King', story: 'We bargained with the eel.', session: 'Crossroads' });
ok(t.trophy && legends.trophy(t.trophy.id).name.startsWith('Crown'), 'a trophy goes on the shelf with its story');
ok(legends.addTrophy({ name: '' }).error, 'a trophy needs a name');
legends.removeTrophy(t.trophy.id);
ok(!legends.trophy(t.trophy.id), 'a trophy can be taken down');

// ----- unit: house rules -----
const st = { houseRules: {}, combat: { active: true, round: 2, turn: 1 } };
ok(houserules.set(st, 'potion-once', true).ok && houserules.list(st).find((r) => r.id === 'potion-once').on, 'a house rule can be switched on');
ok(houserules.set(st, 'made-up', true).error, 'an unknown house rule is refused');
const pc = { id: 'p9', name: 'Pip' };
ok(houserules.blockPotion(st, pc) === null, 'a potion is allowed before one has been drunk this turn');
houserules.markPotion(st, pc);
ok(/already/.test(houserules.blockPotion(st, pc)), 'a second potion in the same turn is refused by the rule');
st.combat.turn = 2;
ok(houserules.blockPotion(st, pc) === null, 'the next turn allows a potion again');
ok(houserules.blockCamp(st) === null, 'camp is allowed when the no-camp rule is off');
houserules.set(st, 'no-camp-in-combat', true);
ok(/No camp/.test(houserules.blockCamp(st)), 'the no-camp rule blocks camp during combat');
st.combat.active = false;
ok(houserules.blockCamp(st) === null, 'the no-camp rule lets camp open once the fight is over');

// ----- unit: empty chair -----
const at = { players: { a1: { id: 'a1', name: 'Thorn', socketId: null }, b2: { id: 'b2', name: 'Bree', socketId: 'sock' } }, absent: {} };
absent.away(at, 'a1');
absent.note(at, { kind: 'action', text: 'Thorn is not here', t: 1, vis: undefined });
absent.note(at, { kind: 'notice', text: 'secret for Bree', t: 2, vis: { to: ['b2'] } });
ok(at.absent.a1.missed.length === 1, 'an empty chair keeps only what it could see');
ok(absent.setAutopilot(at, 'b2', true).error, 'autopilot is refused for a character with a phone connected');
ok(absent.setAutopilot(at, 'a1', true).ok && absent.isAutopilot(at, 'a1'), 'an empty chair can go on autopilot');
const lines = absent.returned(at, 'a1');
ok(lines.length === 1 && lines[0].text === 'Thorn is not here' && !at.absent.a1, 'the returning player gets the missed lines and autopilot ends');

// ----- sockets: booted server -----
(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const thornPhone = await h.player(room, 'Thorn', 'Fighter');
  const bree = await h.player(room, 'Bree', 'Rogue');
  const id = thornPhone.me.id;
  await until(() => dm.last?.players.length === 2);

  // Only the DM edits legends.
  const refused = await h.call(bree, 'dm:trophy:add', { name: 'Stolen cup' });
  ok(refused.error, 'a phone cannot add a trophy');
  const added = await h.call(dm, 'dm:trophy:add', { name: 'Hydra skull', story: 'Thorn held the gate while the others ran.' });
  ok(added.ok && await until(() => dm.last.legends.trophies.length === 1), 'the DM adds a trophy and the shelf updates');
  await h.call(dm, 'dm:trophy:open', { id: added.id });
  ok(await until(() => dm.last.trophy?.id === added.id), 'opening a trophy puts its story on the TV');
  await h.call(dm, 'dm:trophy:open', { id: null });
  ok(await until(() => !dm.last.trophy), 'closing the trophy card clears it');

  const award = await h.call(dm, 'dm:legend:award', { cat: 'kill', charId: id, detail: 'The ogre, in one blow' });
  ok(award.ok && await until(() => dm.last.legends.kill[0]?.character === 'Thorn'), 'the DM awards best kill to a character');
  ok((await h.call(bree, 'dm:legend:award', { cat: 'kill', charId: id })).error, 'a phone cannot award the hall of fame');

  await h.call(dm, 'dm:houserule', { id: 'potion-once', on: true });
  ok(await until(() => bree.last.houseRuleList?.find((r) => r.id === 'potion-once')?.on), 'a house rule switched on reaches the phones');

  await h.call(dm, 'dm:legends:show', { view: 'hall' });
  ok(await until(() => bree.last.legendsShow === 'hall'), 'the DM can put the hall of fame on the TV');

  // Empty chair: Thorn's phone drops, the DM puts the chair on autopilot, and Bree's action is missed.
  thornPhone.close();
  ok(await until(() => dm.last.absent?.[id]?.away === true), 'a dropped phone leaves an empty chair');
  const onPresent = await h.call(dm, 'dm:autopilot', { charId: bree.me.id, on: true });
  ok(onPresent.error, 'autopilot is refused for a character with a phone');
  const onAway = await h.call(dm, 'dm:autopilot', { charId: id, on: true });
  ok(onAway.ok && await until(() => dm.last.absent[id].autopilot === true), 'the DM puts the empty chair on autopilot');
  ok(!bree.last.absent?.[id]?.missed, 'missed lines are not shown to other phones');
  bree.emit('player:action', { text: 'I scout ahead' });
  await until(() => dm.last.log.some((l) => l.text === 'I scout ahead'));
  // Thorn's player comes back the next session: a card lists what happened, and autopilot ends.
  const back = await h.client();
  let card = null;
  back.on('missed', (m) => { card = m; });
  const claimed = await h.call(back, 'join', { id, token: thornPhone.me.token, room });
  ok(claimed.id === id, 'the player reclaims the seat with the device token');
  ok(await until(() => card?.lines?.some((l) => l.text === 'I scout ahead')), 'the returning player gets a what-you-missed card');
  ok(await until(() => dm.last.absent?.[id] === undefined), 'autopilot ends when the player is back');

  await h.done(srv);
})();
