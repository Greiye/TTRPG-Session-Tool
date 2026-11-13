// DM takeover (src/control.js): the DM plays a party character from a second DM tab. The phone is
// locked out of actions while the DM holds the character, can still write notes, and gets its seat
// back when the DM releases it or the DM tab closes.
const { harness } = require('./helpers');
const h = harness('takeover');
const { ok, until } = h;

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const phone = await h.player(room, 'Thorn', 'Fighter');
  const id = phone.me.id;
  await until(() => phone.last?.players.length === 1);

  // Only the DM can take a character; a phone cannot.
  const refused = await h.call(phone, 'dm:takeover', { id });
  ok(refused.error, 'a phone cannot take a character');

  // The DM plays Thorn from a second DM tab.
  const tab = await h.dm();
  const took = await h.call(tab, 'dm:takeover', { id });
  ok(took.ok, 'the DM can take a party character');
  ok(await until(() => phone.last?.dmControl?.[id] === true), 'the phone is told the DM is controlling its character');

  // The phone's actions are ignored while the DM holds the character.
  phone.emit('player:action', { text: 'I swing at the goblin' });
  phone.emit('player:sheet', { hp: 1 });
  await h.wait(250);
  ok(!dm.last.log.some((l) => l.text === 'I swing at the goblin'), 'a phone action is ignored while the DM holds the character');
  ok(phone.last.players.find((p) => p.id === id).hp !== 1, 'a phone sheet change (HP) is ignored while the DM holds the character');

  // Notes still work from the phone.
  phone.emit('player:sheet', { notes: 'The key is under the mat.' });
  ok(await until(() => tab.last.players.find((p) => p.id === id)?.notes === 'The key is under the mat.'), 'the phone can still write its sheet notes');

  // The DM's tab acts as the character.
  tab.emit('player:action', { text: 'I open the door' });
  ok(await until(() => phone.last.log.some((l) => l.text === 'I open the door')), 'the DM tab acts as the character');

  // A second DM tab cannot take the same character.
  const other = await h.dm();
  const second = await h.call(other, 'dm:takeover', { id });
  ok(second.error, 'a second DM tab cannot take a character already held');

  // The DM releases the character; the phone is back in control.
  await h.call(tab, 'dm:takeover:release');
  ok(await until(() => !phone.last.dmControl?.[id]), 'releasing hands the character back');
  phone.emit('player:action', { text: 'I am back' });
  ok(await until(() => dm.last.log.some((l) => l.text === 'I am back')), 'the phone acts again after release');

  // The DM can drop a takeover from the DM screen; the holding tab loses its seat.
  await h.call(tab, 'dm:takeover', { id });
  await until(() => phone.last.dmControl?.[id] === true);
  dm.emit('dm:control:drop', { id });
  ok(await until(() => !phone.last.dmControl?.[id]), 'the DM can drop a takeover from the DM screen');
  tab.emit('player:action', { text: 'after the drop' });
  await h.wait(250);
  ok(!dm.last.log.some((l) => l.text === 'after the drop'), 'a dropped takeover can no longer act');

  // Closing the DM tab gives the character back.
  await h.call(other, 'dm:takeover', { id });
  other.close();
  ok(await until(() => !phone.last.dmControl?.[id]), 'closing the DM tab gives the character back');

  await h.done(srv);
})();
