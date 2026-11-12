// Phone events: join/claim, profile, checks, actions, combat turns.
const hub = require('../hub');
const { state, log, broadcast } = require('../state');
const { roster, newCharacter, applyEdits } = require('../roster');
const { CLASSES } = require('../rules/dnd5e');
const { d, rollDice, sign } = require('../dice');
const { str } = require('../util');
const game = require('../game');

module.exports = function playerSockets(socket) {
  const { io } = hub;
  // Claim a saved character (by id) or create a new one. Claiming from a new phone takes it over.
  socket.on('join', ({ id, name, cls, race, player } = {}, ack) => {
    let c = roster[id];
    if (!c) {
      if (id) return ack?.({ error: 'gone' });
      if (!str(name, 24) || !CLASSES[cls]) return ack?.({ error: 'Pick a name and class.' });
      c = newCharacter({ name, cls, race, player });
    }
    if (c.socketId && c.socketId !== socket.id) io.to(c.socketId).emit('taken');
    c.socketId = socket.id;
    socket.data.charId = c.id;
    if (!state.players[c.id]) {
      state.players[c.id] = c;
      log('system', `${c.name} the ${c.race ? c.race + ' ' : ''}${c.cls} joined the party.`);
    }
    ack?.({ id: c.id, socketId: socket.id });
    broadcast();
  });

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

  socket.on('player:check', ({ skill } = {}) => {
    const p = me();
    if (!p || !(skill in p.skills)) return;
    const r = d(20); const total = r + p.skills[skill];
    const chk = state.check;
    if (r === 20) game.spotlight(p.id, 'nat20');
    if (chk && chk.skill === skill && !chk.results[p.id]) {
      const pass = total >= chk.dc;
      chk.results[p.id] = { name: p.name, roll: r, total, pass };
      log('check', `${p.name} ${skill}: d20(${r})${sign(p.skills[skill])} = ${total} ${pass ? 'SUCCESS' : 'FAIL'}`, { tone: pass ? 'good' : 'bad', roll: r });
    } else {
      log('check', `${p.name} ${skill}: d20(${r})${sign(p.skills[skill])} = ${total}`, { roll: r });
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
      const t = state.combat.enemies.find((e) => e.id === target && e.hp > 0);
      if (!t) return;
      game.attack(p, t, p.atk, p.dmg);
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
