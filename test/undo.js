// DM Undo / Redo (src/undo.js): any table change, by the tool or by hand, can be taken back in one tap.
const { harness } = require('./helpers');
const h = harness('undo');
const { ok, until, wait } = h;
const settle = () => wait(900); // a burst of changes becomes one step after 700 ms of quiet

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  const tv = await h.client();
  tv.emit('screen:hello');
  await until(() => dm.last?.players.length === 1 && tv.last);
  await settle();
  const id = a.me.id || dm.last.players[0].id;
  const hp0 = dm.last.players[0].hp;

  ok(dm.last.undo && 'undo' in dm.last.undo, 'the DM gets the undo labels');
  ok(a.last.undo === undefined && tv.last.undo === undefined, 'phones and the TV never get the undo history');

  // A character sheet change (HP lives on the character, not the campaign).
  dm.emit('dm:hp', { id, delta: -5 });
  ok(await until(() => dm.last.players[0].hp === hp0 - 5), 'HP drops by 5');
  await settle();
  ok(await until(() => dm.last.undo.undo === 'Change to Thorn'), 'Undo is offered, named after the character it changed');
  let r = await h.call(dm, 'dm:undo');
  ok(r.ok, 'undo succeeds');
  ok(await until(() => dm.last.players[0].hp === hp0 && a.last.players[0].hp === hp0), 'HP is back on the DM page and the phone');
  ok(await until(() => dm.last.undo.redo), 'Redo is offered');

  r = await h.call(dm, 'dm:redo');
  ok(r.ok && (await until(() => dm.last.players[0].hp === hp0 - 5)), 'redo brings the damage back');

  // A campaign change, named after its log line; a phone may not undo.
  dm.emit('dm:narrate', { text: 'The bridge groans under the cart.' });
  await settle();
  ok(await until(() => dm.last.undo.undo === 'The bridge groans under the cart.'), 'the step is named after its log line');
  ok((await h.call(a, 'dm:undo')).error, 'a phone cannot undo');
  r = await h.call(dm, 'dm:undo');
  ok(r.undone === 'The bridge groans under the cart.' && (await until(() => !dm.last.log.some((e) => e.text === 'The bridge groans under the cart.'))), 'undo takes the narration back');

  // Undo right after a change, before it settled, still takes back that change only.
  dm.emit('dm:scene', { title: 'The Old Mill' });
  await settle();
  ok(/Old Mill/.test(dm.last.undo.undo || ''), 'a scene change is named after its chapter line');
  await h.call(dm, 'dm:undo'); await h.call(dm, 'dm:redo');
  await until(() => dm.last.scene.title === 'The Old Mill');
  r = await h.call(dm, 'dm:undo');
  ok(r.ok && (await until(() => dm.last.scene.title !== 'The Old Mill')), 'a change undone at once goes back');
  ok(await until(() => dm.last.players[0].hp === hp0 - 5), '...and only that change');

  // Something new clears Redo; the undone state does not come back by itself.
  ok(dm.last.undo.redo, 'redo waits after an undo');
  await settle();
  ok(dm.last.undo.redo, 'restoring does not count as a new change');
  dm.emit('dm:hp', { id, delta: 2 });
  await settle();
  ok(await until(() => dm.last.undo.redo === null), 'a new change clears Redo');

  // Many steps: the history keeps the last 15.
  for (let i = 0; i < 18; i++) { dm.emit('dm:narrate', { text: `Line ${i}` }); await wait(760); }
  await settle();
  ok(await until(() => dm.last.undo.steps === 15), 'the history keeps 15 steps');
  let n = 0;
  while (n < 40 && (await h.call(dm, "dm:undo")).ok) n++; // bounded: a broken history must not hang the test
  ok(n === 15, 'and undoes 15 of them');
  ok((await h.call(dm, 'dm:undo')).error === 'Nothing to undo.', 'then says there is nothing to undo');

  await h.done(srv);
})();
