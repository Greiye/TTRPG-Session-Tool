// Phone events: join/claim, profile, checks, actions, combat turns.
const hub = require('../hub');
const { state, log, broadcast, sys } = require('../state');
const { roster, newCharacter, applyEdits } = require('../roster');
const { rollDice } = require('../dice');
const { str } = require('../util');
const game = require('../game');
const session = require('../session');

module.exports = function playerSockets(socket) {
  const { io } = hub;
  // Claim a saved character (by id) or create a new one. See session.js for the rules.
  socket.on('join', ({ id, name, cls, race, player, room, token, takeover } = {}, ack) => {
    let c = roster[id];
    if (!c && id) return ack?.({ error: 'gone' });
    if (c) {
      const err = session.claimError(state, c, { token, room, takeover }, socket);
      if (err) return ack?.({ error: err });
      if (!(token && token === c.token)) c.token = session.newToken();
    } else {
      if (!session.sameRoom(state, room)) return ack?.({ error: 'room' });
      if (!str(name, 24) || !sys().classes[cls]) return ack?.({ error: 'Pick a name and class.' });
      c = newCharacter({ name, cls, race, player }, state.system);
      c.token = session.newToken();
    }
    session.seat(c, socket);
    if (!state.players[c.id]) {
      state.players[c.id] = c;
      log('system', `${c.name} the ${c.race ? c.race + ' ' : ''}${c.cls} joined the party.`);
    }
    ack?.({ id: c.id, token: c.token, room: state.room, socketId: socket.id });
    broadcast();
  });

  // Room code check before showing the character picker.
  socket.on('room:check', ({ room } = {}, ack) => ack?.({ ok: session.sameRoom(state, room) }));

  // A socket only acts for a character while it holds the claim.
  const me = () => {
    const c = state.players[socket.data.charId];
    return c && c.socketId === socket.id ? c : null;
  };

  socket.on('player:profile', (f = {}) => {
    const c = me();
    if (!c) return;
    applyEdits(c, f, false);
    broadcast();
  });

  // Sheet upkeep from the phone: HP, temp HP, spell slots, hit dice, inventory, notes, spell list.
  socket.on('player:sheet', (patch = {}) => {
    const c = me();
    if (!c) return;
    require('../sheet').applySheet(c, patch || {}, false);
    broadcast();
  });

  socket.on('player:check', ({ skill, mode } = {}) => {
    const p = me();
    if (!p || !sys().skills.includes(skill)) return;
    const chk = state.check;
    const called = chk && chk.skill === skill && !chk.results[p.id];
    const r = sys().check(p, skill, { dc: called ? chk.dc : undefined, mode });
    if (r.crit) game.spotlight(p.id, 'nat20');
    if (called) {
      chk.results[p.id] = { name: p.name, roll: r.natural, total: r.total, pass: r.pass };
      log('check', `${p.name} ${r.text} ${r.outcome}`, { tone: r.pass ? 'good' : 'bad', roll: r.natural });
    } else {
      log('check', `${p.name} ${r.text}${r.outcome ? ' ' + r.outcome : ''}`, { roll: r.natural });
    }
    broadcast();
  });

  socket.on('player:action', ({ text } = {}) => {
    const p = me();
    text = String(text || '').trim().slice(0, 200);
    if (!p || !text) return;
    if (state.mode === 'social') {
      state.social.line = { speaker: p.name, text, emotion: 'neutral', player: true, pid: p.id };
      log('say', text, { who: p.name });
    } else log('action', text, { who: p.name });
    broadcast();
  });

  socket.on('player:choice', ({ index } = {}) => {
    const p = me();
    const choice = state.social.choices[index];
    if (!p || !choice) return;
    log('say', choice, { who: p.name });
    state.social.line = { speaker: p.name, text: choice, emotion: 'neutral', player: true, pid: p.id };
    broadcast();
  });

  socket.on('player:combat', ({ act, target } = {}) => {
    const p = me();
    if (!p || game.currentTurnId() !== p.id || p.hp <= 0) return;
    if (act === 'attack') {
      const t = state.combat.enemies.find((e) => e.id === target && e.hp > 0 && e.side !== 'ally');
      if (!t) return;
      game.attack(p, t);
    } else if (['dodge', 'dash', 'help', 'hide'].includes(act)) {
      log('combat', `${p.name} takes the ${act[0].toUpperCase() + act.slice(1)} action.`);
    } else if (act === 'potion') {
      const h = rollDice([2, 4, 2]);
      p.hp = Math.min(p.maxHp, p.hp + h.total);
      log('combat', `${p.name} drinks a potion and heals ${h.total}.`, { tone: 'good' });
    } else return;
    game.advanceTurn();
    broadcast();
  });

  socket.on('disconnect', () => {
    const p = me();
    if (p && p.socketId === socket.id) p.socketId = null;
    broadcast();
  });
};
