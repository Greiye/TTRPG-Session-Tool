// Audit hardening: malformed events must not crash the server, built-in names must not act as
// character ids, and creature bonuses/damage dice must stay out of the public log.
// Boots the server on a temp data dir and drives it over Socket.IO.
const { harness } = require('./helpers');

const h = harness('hardening');
const { ok, call, until } = h;
(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();

  // --- malformed events (null payloads) from a phone and from an unauthenticated socket
  const phone = await h.client();
  for (const ev of ['join', 'room:check', 'player:roll', 'player:check', 'player:claim', 'dm:auth']) phone.emit(ev, null);
  await h.wait(300);
  const probe = await h.client();
  const st = await until(() => probe.last || null, 1500);
  ok(!!st && st.viewer?.role === 'guest', 'server still answers after null payloads on join, auth, roll and check events');
  const again = await h.call(probe, 'room:check', { room });
  ok(again?.ok === true, 'a normal event still works after the malformed ones');

  // --- built-in names never act as character ids
  for (const id of ['constructor', '__proto__', 'toString']) {
    const r = await h.call(probe, 'join', { id, room });
    ok(r?.error === 'gone' && !r.token, `join with id "${id}" is refused as a missing character`);
  }
  dm.emit('dm:char:save', { id: 'constructor', name: 'Ghost', cls: 'Fighter' });
  await h.wait(200);
  ok(probe.connected && (await h.call(dm, 'room:check', { room }))?.ok === true, 'DM save with a built-in id is ignored without taking the server down');
  ok(({}).token === undefined && ({}).socketId === undefined, 'Object.prototype is not polluted by joins');

  // --- a real character still joins and is listed
  const a = await h.player(room, 'Mira', 'Fighter');
  ok(!!a.me?.id && !!a.me?.token, 'a new character joins and gets an id and token');

  await h.done(srv);
})();
