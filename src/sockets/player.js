// Phone events: join/claim, profile, checks, actions, combat turns.
const hub = require('../hub');
const { state, log, nextId, broadcast, sys } = require('../state');
const { roster, newCharacter, applyEdits } = require('../roster');
const { rollDice } = require('../dice');
const { str } = require('../util');
const game = require('../game');
const session = require('../session');
const rolls = require('../rolls');
const shops = require('../shops');
const living = require('../living');
const factions = require('../factions');
const camp = require('../camp');
const control = require('../control');
const cast = require('../cast');
const absent = require('../absent');
const houserules = require('../houserules');
const T = require('../table');

module.exports = function playerSockets(socket) {
  const { io } = hub;
  // Claim a saved character (by id) or create a new one. See session.js for the rules.
  socket.on('join', ({ id, name, cls, race, player, room, token, takeover } = {}, ack) => {
    let c = roster[id];
    if (!c && id) return ack?.({ error: 'gone' });
    if (c) {
      if (c.death) return ack?.({ error: 'fallen' }); // a fallen character stays on the memorial until the DM revives them
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
    socket.data.spectator = false;
    // An empty chair's card: what the table did while this seat was empty (src/absent.js).
    const missed = absent.returned(state, c.id);
    if (missed.length) socket.emit('missed', { name: c.name, lines: missed });
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
  // Actions come from the seated character, unless the DM holds it (src/control.js).
  const me = () => control.actorOf(state, socket);

  socket.on('player:profile', (f = {}) => {
    const c = me();
    if (!c) return;
    applyEdits(c, f, false);
    broadcast();
  });

  // Camp: a character votes short or long rest and may describe what they do while camp is open.
  socket.on('player:camp', ({ vote, text, dice } = {}, ack) => {
    const p = me();
    if (!p) return ack?.({ error: 'no character' });
    const missing = camp.restBlockers(p);
    if (missing.length && ['short', 'long'].includes(vote)) return ack?.({ error: 'Set up before you rest.', missing });
    const ok = camp.vote(state.camp, p.id, vote, text, dice);
    if (ok) broadcast();
    ack?.({ ok });
  });

  // Phase 4: a character votes on the dialogue wheel (one vote each; changing it is allowed while open).
  socket.on('player:vote', ({ index } = {}) => {
    const p = me();
    const v = state.vote;
    if (!p || !v || !v.open || !v.options[index]) return;
    v.votes[p.id] = Number(index);
    broadcast();
  });
  // Spoils: a character asks for an item (a claim). Others can still claim; the DM awards.
  socket.on('player:claim', ({ id, note } = {}) => {
    const p = me();
    const m = state.handouts.find((h) => h.id === id && h.kind === 'spoil');
    if (!p || !m || m.awarded) return;
    m.claims[p.id] = { name: p.name, note: str(note, 120), at: Date.now() };
    broadcast();
  });
  // NPC shops (item 27): buy stock with the character's gold. Purchases show only to the buyer and the DM.
  socket.on('player:buy', ({ shopId, itemId, qty } = {}, ack) => {
    const p = me();
    if (!p) return ack?.({ error: 'Claim a character first.' });
    const shop = state.shops.find((s) => s.id === shopId);
    if (!shop) return ack?.({ error: 'No such shop.' });
    const open = living.canTrade(state, shop);
    if (open.error) return ack?.(open);
    const r = shops.buy(shop, p, itemId, qty, living.priceMult(state, shop));
    if (r.error) return ack?.(r);
    log('shop', `${p.name} buys ${r.qty}× ${r.item.name} from ${shop.name} for ${r.cost.toFixed(2)} gp.`, { who: p.name, vis: { to: [p.id], screen: false } });
    broadcast();
    ack?.({ ok: true, gold: p.gold });
  });
  // Phase 8: a character moves on its turn, within its speed (see src/grid.js).
  socket.on('player:move', ({ x, y } = {}, ack) => {
    const p = me();
    if (!p || game.currentTurnId() !== p.id) return ack?.({ error: 'Wait for your turn.' });
    const r = require('../grid').move(p, Number(x), Number(y));
    ack?.(r);
    broadcast();
  });
  // Sheet upkeep from the phone: HP, temp HP, spell slots, hit dice, inventory, notes, spell list.
  // Sheet edits are actions, so a character the DM holds can only change its notes.
  socket.on('player:sheet', (patch = {}) => {
    const notesOnly = !!patch && Object.keys(patch).every((k) => k === 'notes');
    const c = me() || (notesOnly ? control.seatOf(state, socket) : null);
    if (!c) return;
    require('../sheet').applySheet(c, patch || {}, false);
    broadcast();
  });

  // Tapping a skill, save or ability: answers the DM's roll call if it matches, else it is a free roll.
  socket.on('player:check', ({ skill, kind = 'skill', key = skill, mode } = {}) => {
    const p = me();
    if (!p) return;
    T.bump(p.id, 'acts');
    const chk = state.check;
    const called = chk && chk.kind === kind && chk.key === key && rolls.isTarget(chk, p.id) && !chk.results[p.id];
    const r = called ? rolls.answer(p, mode) : rolls.free(p, kind, key, mode);
    if (!r) return;
    if (r.crit) game.spotlight(p.id, 'nat20');
    broadcast();
  });
  // The big "Roll" button on a roll call.
  socket.on('player:answer', ({ mode, inspire } = {}) => {
    const p = me();
    const r = p && rolls.answer(p, mode, { inspire: !!inspire });
    if (!r) return;
    if (r.crit) game.spotlight(p.id, 'nat20');
    broadcast();
  });
  // Free dice: "2d6+3", "d20" with advantage, etc.
  socket.on('player:roll', ({ expr, label, mode } = {}, ack) => {
    const p = me();
    const r = p && rolls.expr(p, expr, { label, mode });
    ack?.(r ? { total: r.total } : { error: 'Could not read that. Try 2d6+3 or d20.' });
    if (r) broadcast();
  });

  socket.on('player:action', ({ text } = {}) => {
    const p = me();
    text = String(text || '').trim().slice(0, 200);
    if (!p || !text) return;
    T.bump(p.id, 'talk'); // spotlight meter (src/table.js)
    if (state.mode === 'social') {
      const emotion = state.social.expr?.[p.id] || 'neutral';
      state.social.line = { speaker: p.name, text, emotion, player: true, pid: p.id };
      log('say', text, { who: p.name });
    } else log('action', text, { who: p.name });
    broadcast();
  });

  // Phase 3: the expression this phone's next social line is spoken with.
  socket.on('player:expression', ({ emotion } = {}) => {
    const p = me();
    if (p && cast.setExpression(state.social, p.id, emotion)) broadcast();
  });

  socket.on('player:choice', ({ index } = {}) => {
    const p = me();
    const choice = state.social.choices[index];
    if (!p || !choice) return;
    T.bump(p.id, 'acts');
    log('say', choice, { who: p.name });
    state.social.line = { speaker: p.name, text: choice, emotion: 'neutral', player: true, pid: p.id };
    broadcast();
  });

  socket.on('player:combat', ({ act, target } = {}) => {
    const p = me();
    if (!p || game.currentTurnId() !== p.id || p.hp <= 0) return;
    T.bump(p.id, 'acts');
    if (act === 'attack') {
      const t = state.combat.enemies.find((e) => e.id === target && e.hp > 0 && e.side !== 'ally');
      if (!t) return;
      game.attack(p, t);
    } else if (['dodge', 'dash', 'help', 'hide'].includes(act)) {
      log('combat', `${p.name} takes the ${act[0].toUpperCase() + act.slice(1)} action.`);
    } else if (act === 'potion') {
      const why = houserules.blockPotion(state, p); // house rule: one potion per turn (src/houserules.js)
      if (why) { log('combat', why, { tone: 'bad', vis: { to: [p.id] } }); return; }
      houserules.markPotion(state, p);
      const h = rollDice([2, 4, 2]);
      p.hp = Math.min(p.maxHp, p.hp + h.total);
      log('combat', `${p.name} drinks a potion and heals ${h.total}.`, { tone: 'good' });
    } else return;
    game.advanceTurn();
    broadcast();
  });

  socket.on('disconnect', () => {
    const p = control.seatOf(state, socket);
    if (p && p.socketId === socket.id) { p.socketId = null; absent.away(state, p.id); } // the chair is empty now
    broadcast();
  });
};
