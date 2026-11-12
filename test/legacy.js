// Character death and legacy: fall (memorial card, leaves the party), phone lockout, revive,
// bundle export/import round trip with the death record.
const fs = require('fs');
const path = require('path');
const { harness } = require('./helpers');
const h = harness('legacy');
const { ok, until } = h;

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const screen = await h.client();
  screen.emit('screen:hello');
  const a = await h.player(room, 'Thorn', 'Fighter');
  const b = await h.player(room, 'Lyra', 'Wizard');
  await until(() => a.last?.players.length === 2 && b.last?.players.length === 2);
  const id = a.me.id;
  let roster = [];
  dm.on('dm:roster', (list) => { roster = list; });

  // Fall: memorial on every view, out of the party, phone told it has fallen.
  let fallen = false;
  a.once('fallen', () => { fallen = true; });
  dm.emit('dm:char:fall', { id, cause: 'Swallowed by the mill wheel', epitaph: 'Never stood still.' });
  ok(await until(() => b.last?.memorial?.id === id), 'the memorial reaches the other phones');
  ok(await until(() => screen.last?.memorial?.id === id), 'the memorial reaches the TV');
  ok(b.last.memorial.epitaph === 'Never stood still.' && b.last.memorial.cause, 'memorial carries the cause and epitaph');
  ok(!b.last.players.some((p) => p.id === id), 'the fallen character leaves the party');
  ok(await until(() => fallen), 'the fallen phone is told');

  // A fallen character cannot be claimed back by a phone until revived.
  const again = await h.client();
  const res = await h.call(again, 'join', { id, room, token: a.me.token });
  ok(res?.error === 'fallen', 'a fallen character cannot be claimed');

  // Death record and roster flag reach the DM.
  ok(await until(() => roster.find((c) => c.id === id)?.death), 'the DM roster carries the death record');

  // Export: the pc entity carries status and death.
  const bundle = await (await fetch(`${h.URL}/api/export`, { headers: { 'x-dm-key': 'dmkey' } })).json();
  const pc = bundle.entities.find((e) => e.id === `pc_${id}`);
  ok(pc && pc.status === 'dead' && pc.death.epitaph === 'Never stood still.' && pc.death.at, 'export marks the pc entity dead, with its death record');
  const live = bundle.entities.find((e) => e.id === `pc_${b.me.id}`);
  ok(live && live.status === 'alive' && !live.death, 'living characters export as alive');

  // Revive: memorial clears, character can be claimed again.
  dm.emit('dm:char:revive', { id });
  ok(await until(() => b.last?.memorial === null), 'revive clears the memorial');
  ok(!b.last.roster?.find((c) => c.id === id)?.dead, 'revived character is no longer marked dead');
  const back = await h.call(await h.client(), 'join', { id, room, token: a.me.token });
  ok(!back?.error, 'a revived character can be claimed again');

  // Import round trip: a bundle that marks the character dead restores the record on a fresh server.
  const pc2 = { ...pc, status: 'dead', death: { at: '2026-11-12T10:00:00Z', cause: 'Fell from the bridge', epitaph: 'Brave to the end.', session: 'Test' } };
  const imp = await (await fetch(`${h.URL}/api/import`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dm-key': 'dmkey' }, body: JSON.stringify({ ...bundle, entities: [pc2] }) })).json();
  ok(imp.characters === 1 && !imp.error, 'import accepts a dead character');
  const after = await (await fetch(`${h.URL}/api/export`, { headers: { 'x-dm-key': 'dmkey' } })).json();
  ok(after.entities.find((e) => e.id === `pc_${id}`)?.death?.epitaph === 'Brave to the end.', 'import restores the death record (seen in a new export)');

  // Schema rejects a death record with an unknown field.
  const bad = await (await fetch(`${h.URL}/api/import`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dm-key': 'dmkey' }, body: JSON.stringify({ ...bundle, entities: [{ ...pc2, death: { at: '2026-11-12T10:00:00Z', mood: 'sad' } }] }) })).json();
  ok(!!bad.error, 'an unknown field in the death record is rejected');

  await h.done(srv);
})();
