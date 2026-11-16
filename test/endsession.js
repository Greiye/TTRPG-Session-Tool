// End of session (Mike, Nov 16): the DM ends the session, the TV and phones get the end card, resume clears it.
const { harness } = require('./helpers');
const h = harness('endsession');
const { ok, until } = h;

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const tv = await h.client();
  tv.emit('screen:hello');
  const a = await h.player(room, 'Thorn', 'Fighter');
  await until(() => a.last?.players.length === 1 && tv.last);
  ok(tv.last.ended === null && a.last.ended === null, 'a session starts not ended');

  a.emit('dm:session:end');
  await new Promise((r) => setTimeout(r, 150));
  ok(tv.last.ended === null, 'a phone cannot end the session');

  dm.emit('dm:session:end');
  ok(await until(() => tv.last.ended && a.last.ended), 'the TV and phones see the session end');
  const n = tv.last.ended.n;
  ok(dm.last.log.some((l) => l.text === '— END OF SESSION —'), 'the log marks the end of the session');
  dm.emit('dm:session:end');
  await new Promise((r) => setTimeout(r, 150));
  ok(tv.last.ended.n === n, 'ending twice keeps the first end');

  dm.emit('dm:session:resume');
  ok(await until(() => tv.last.ended === null && a.last.ended === null), 'resume takes everyone back to the game');

  await h.done(srv);
})();
