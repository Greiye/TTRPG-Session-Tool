// DM-only events: modes, scene, checks, combat, NPC dialogue, characters.
const fs = require('fs');
const path = require('path');
const hub = require('../hub');
const { PORTRAIT_DIR } = require('../config');
const { state, log, nextId, broadcast, EMOTIONS, sys } = require('../state');
const rules = require('../rules');
const { roster, newCharacter, applyEdits } = require('../roster');
const { str } = require('../util');
const game = require('../game');
const { release, newRoomCode } = require('../session');
const net = require('../net');

module.exports = function dmSockets(socket) {
  const { io } = hub;
  const dm = (event, fn) => socket.on(event, (payload = {}) => {
    if (socket.data.role !== 'dm') return;
    fn(payload || {});
    broadcast();
  });

  dm('dm:mode', ({ mode }) => {
    if (!['exploration', 'combat', 'social'].includes(mode)) return;
    state.mode = mode;
    state.check = null;
    log('system', `— ${mode.toUpperCase()} —`);
  });
  dm('dm:scene', ({ title, text, theme, poi }) => {
    Object.assign(state.scene, {
      title: String(title ?? state.scene.title).slice(0, 80),
      text: String(text ?? state.scene.text).slice(0, 600),
      theme: String(theme ?? state.scene.theme),
      poi: Array.isArray(poi) ? poi.map((s) => String(s).slice(0, 60)).filter(Boolean).slice(0, 8) : state.scene.poi,
    });
  });
  dm('dm:system', ({ id }) => {
    if (!rules.list().some((x) => x.id === id) || id === state.system) return;
    state.system = id;
    state.check = null;
    log('system', `Rules system: ${rules.get(id).name}.`);
  });
  dm('dm:narrate', ({ text }) => { if (text) log('narrate', String(text).slice(0, 400)); });
  dm('dm:check', ({ skill, dc }) => {
    if (!skill) { state.check = null; return; }
    state.check = { skill, dc: Number(dc) || 10, results: {} };
    log('check', `DM calls for a ${skill} check (DC ${state.check.dc}).`, { tone: 'call' });
  });

  // ----- combat -----
  dm('dm:enemy:add', ({ name, hp, ac, atk, dmg }) => {
    hp = Math.max(1, Number(hp) || 10);
    state.combat.enemies.push({
      id: 'e' + nextId(), name: String(name || 'Goblin').slice(0, 24), hp, maxHp: hp,
      ac: Number(ac) || 12, atk: Number(atk) || 4, dmg: [1, 6, Number(dmg) || 2], enemy: true,
    });
  });
  dm('dm:enemy:remove', ({ id }) => {
    state.combat.enemies = state.combat.enemies.filter((e) => e.id !== id);
    state.combat.order = state.combat.order.filter((o) => o.id !== id);
  });
  dm('dm:combat:start', () => game.startCombat());
  dm('dm:combat:end', () => {
    Object.assign(state.combat, { active: false, order: [], turn: 0, round: 0 });
    log('combat', 'Combat ends.');
  });
  dm('dm:combat:next', () => game.advanceTurn());
  dm('dm:enemy:attack', ({ target }) => {
    const e = game.combatant(game.currentTurnId());
    const t = state.players[target];
    if (e?.enemy && t && e.hp > 0) { game.attack(e, t); game.advanceTurn(); }
  });
  dm('dm:hp', ({ id, delta }) => {
    const t = game.combatant(id);
    if (t) game.applyDamage(t, -Number(delta) || 0);
  });

  // ----- social -----
  dm('dm:npc', ({ name, hue }) => {
    if (name) state.social.npc.name = String(name).slice(0, 40);
    if (hue !== undefined) state.social.npc.hue = Number(hue) % 360;
  });
  dm('dm:emotion', ({ emotion }) => {
    if (!EMOTIONS.includes(emotion)) return;
    state.social.npc.emotion = emotion;
    if (!state.social.line.player) state.social.line.emotion = emotion;
  });
  dm('dm:say', ({ text }) => {
    text = String(text || '').trim().slice(0, 500);
    if (!text) return;
    const { npc } = state.social;
    state.social.line = { speaker: npc.name, text, emotion: npc.emotion };
    state.social.caption = '';
    log('npc', text, { who: npc.name, emotion: npc.emotion });
  });
  dm('dm:caption', ({ text }) => { state.social.caption = String(text || '').slice(0, 500); });
  dm('dm:choices', ({ choices }) => {
    state.social.choices = (choices || []).map((c) => String(c).trim().slice(0, 120)).filter(Boolean).slice(0, 4);
  });

  // ----- characters -----
  dm('dm:char:save', (f) => {
    let c = roster[f.id];
    if (!c) {
      if (!str(f.name, 24) || !sys().classes[f.cls]) return;
      c = newCharacter(f, state.system);
    }
    applyEdits(c, f, true);
  });
  dm('dm:char:delete', ({ id }) => {
    const c = roster[id];
    if (!c) return;
    release(c);
    if (c.portrait) fs.rm(path.join(PORTRAIT_DIR, path.basename(c.portrait)), () => {});
    delete state.players[id];
    state.combat.order = state.combat.order.filter((o) => o.id !== id);
    delete roster[id];
  });
  dm('dm:char:add', ({ id }) => {
    const c = roster[id];
    if (c && !state.players[id]) { state.players[id] = c; log('system', `${c.name} joins the party.`); }
  });
  dm('dm:spotlight', ({ id }) => { if (roster[id]) game.spotlight(id, 'intro'); });
  // Whispers go only to that player's phone; the DM gets an ack saying whether it was delivered.
  socket.on('dm:whisper', ({ id, text } = {}, ack) => {
    if (socket.data.role !== 'dm') return;
    const c = roster[id];
    text = str(text, 500);
    if (!c || !text) return ack?.({ ok: false });
    const w = { id: nextId(), to: c.id, text, at: Date.now(), vis: { to: [c.id] } };
    state.whispers.push(w);
    if (state.whispers.length > 200) state.whispers.shift();
    if (c.socketId) io.to(c.socketId).emit('whisper', w);
    ack?.({ ok: !!c.socketId });
    broadcast();
  });

  // Table-wide display settings, used by the TV (phones and the DM laptop keep their own).
  const DISPLAY = { text: ['md', 'lg', 'xl'], palette: ['default', 'cb', 'hc'], motion: ['auto', 'reduce', 'full'] };
  dm('dm:settings', ({ display }) => {
    if (!display) return;
    const cur = state.settings.display || {};
    for (const [k, vals] of Object.entries(DISPLAY)) if (vals.includes(display[k])) cur[k] = display[k];
    state.settings.display = cur;
  });

  // New room code: new phones need the new QR; phones already seated keep their device tokens.
  dm('dm:room:new', () => { state.room = newRoomCode(); log('system', `New room code: ${state.room}.`); });
  // Which network address goes into the QR (when the laptop has several adapters).
  dm('dm:host', ({ host }) => {
    const ok = !host || net.lanAddresses().some((a) => a.address === host);
    if (!ok) return;
    state.settings.host = host || null;
    net.setHost(state.settings.host);
  });

  dm('dm:kick', ({ id }) => {
    const p = state.players[id];
    if (!p) return;
    release(p);
    delete state.players[id];
    state.combat.order = state.combat.order.filter((o) => o.id !== id);
    log('system', `${p.name} left the party.`);
  });
  dm('dm:reset', () => {
    state.log = [];
    state.check = null;
    Object.assign(state.combat, { active: false, round: 0, turn: 0, order: [], enemies: [] });
    for (const p of Object.values(state.players)) p.hp = p.maxHp;
    log('system', 'Session reset.');
  });
};
