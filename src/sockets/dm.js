// DM-only events: modes, scene, checks, combat, NPC dialogue, characters.
const hub = require('../hub');
const { removeUrl } = require('../assets');
const { state, log, nextId, broadcast, EMOTIONS, sys } = require('../state');
const rules = require('../rules');
const { roster, newCharacter, applyEdits } = require('../roster');
const { str } = require('../util');
const game = require('../game');
const entities = require('../entities');
const { release, newRoomCode } = require('../session');
const net = require('../net');
const creatures = require('../creatures');
const rolls = require('../rolls');
const perception = require('../perception');
const spells = require('../spells');
const saves = require('../saves');
const { applySheet } = require('../sheet');
const { saveRoster } = require('../roster');

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
    state.scene.secrets ??= [];
  });
  dm('dm:system', ({ id }) => {
    if (!rules.list().some((x) => x.id === id) || id === state.system) return;
    state.system = id;
    state.check = null;
    log('system', `Rules system: ${rules.get(id).name}.`);
  });
  dm('dm:narrate', ({ text }) => { if (text) log('narrate', String(text).slice(0, 400)); });
  // ----- roll calls, dice, check presets (Phase 2) -----
  dm('dm:check', ({ skill, dc }) => { if (!skill) rolls.clear(); else rolls.call({ kind: 'skill', key: skill, dc }); }); // older clients
  dm('dm:call', (f) => { if (f.clear) rolls.clear(); else rolls.call(f); });
  dm('dm:roll', ({ expr, label, secret, mode }) => { rolls.expr({ name: 'DM', id: 'dm', hue: 45 }, expr, { label, secret, mode }); });
  dm('dm:preset:save', (f) => { rolls.savePreset(f); });
  dm('dm:preset:delete', ({ id }) => { rolls.removePreset(id); });
  dm('dm:rollpopup', ({ on }) => { state.settings.rollPopup = !!on; });
  // The DM dismisses the popup for everyone (the TV has no keyboard).
  dm('dm:rollpop:skip', () => { io.emit('rollpop:skip'); });

  // ----- perception-gated items (item 6) -----
  dm('dm:secret:add', (f) => { const s = perception.make(f, sys(), 's' + nextId()); if (s && state.scene.secrets.length < 30) state.scene.secrets.push(s); });
  dm('dm:secret:remove', ({ id }) => { state.scene.secrets = state.scene.secrets.filter((s) => s.id !== id); });
  // to: 'all' | 'none' | character id (toggles that character)
  dm('dm:secret:show', ({ id, to }) => {
    const s = state.scene.secrets.find((x) => x.id === id);
    if (!s) return;
    if (to === 'all') { s.shown = 'all'; log('narrate', `The party notices: ${s.text}`); } else if (to === 'none') s.shown = [];
    else if (state.players[to]) { const cur = Array.isArray(s.shown) ? s.shown : []; s.shown = cur.includes(to) ? cur.filter((x) => x !== to) : [...cur, to]; }
  });

  // ----- combat -----
  // Numbered names when the same creature is added more than once: Goblin, Goblin 2, Goblin 3.
  const uniqueName = (base) => {
    const taken = new Set(state.combat.enemies.map((e) => e.name));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base} ${n}`)) n++;
    return `${base} ${n}`;
  };
  // Quick one-off combatant typed into the encounter card (not saved to the library).
  dm('dm:enemy:add', ({ name, hp, ac, atk, dmg, side }) => {
    const block = creatures.normalize({ name: name || 'Goblin', hp: Number(hp) || 10, ac: Number(ac) || 12, side,
      attacks: [{ name: 'Attack', atk: Number(atk) || 4, dmg: /d/i.test(String(dmg)) ? dmg : `1d6+${Number(dmg) || 2}` }] });
    state.combat.enemies.push(creatures.spawn(block, { id: 'e' + nextId(), name: String(name || 'Goblin').slice(0, 24) }));
  });
  // ----- creature library (stat blocks) -----
  socket.on('dm:creature:save', (f = {}, ack) => {
    if (socket.data.role !== 'dm') return;
    const c = creatures.upsert(f);
    ack?.({ id: c.id });
    broadcast();
  });
  dm('dm:creature:delete', ({ id }) => { const c = creatures.lib.get(id); if (c) { removeUrl(c.image); creatures.lib.remove(id); } });
  dm('dm:creature:spawn', ({ id, count, side }) => {
    const block = creatures.lib.get(id);
    if (!block) return;
    for (let i = 0; i < Math.max(1, Math.min(12, Number(count) || 1)); i++) {
      const c = creatures.spawn(creatures.SIDES.includes(side) ? { ...block, side } : block, { id: 'e' + nextId(), name: uniqueName(block.name) });
      state.combat.enemies.push(c);
      // Joining a fight in progress: roll initiative and slot in.
      if (state.combat.active) {
        state.combat.order.push({ id: c.id, init: sys().initiative(c) });
        const cur = state.combat.order[state.combat.turn]?.id;
        state.combat.order.sort((a, b) => b.init - a.init);
        state.combat.turn = Math.max(0, state.combat.order.findIndex((o) => o.id === cur));
      }
    }
  });
  socket.on('dm:spell:save', (f = {}, ack) => { if (socket.data.role !== 'dm') return; ack?.({ id: spells.upsert(f).id }); broadcast(); });
  dm('dm:spell:delete', ({ id }) => { spells.lib.remove(id); });
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
  // The DM plays every creature: enemies, allies and neutrals. `attack` picks one from the stat block.
  dm('dm:enemy:attack', ({ target, attack, mode }) => {
    const e = game.combatant(game.currentTurnId());
    const t = game.combatant(target);
    if (e && !state.players[e.id] && t && t !== e && e.hp > 0) { game.attack(creatures.withAttack(e, Number(attack) || 0), t, { mode }); game.advanceTurn(); }
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
  // Sheet edits from the DM (HP, slots, inventory, abilities, languages...). Same patch shape as the phone.
  dm('dm:sheet', ({ id, ...patch }) => { const c = roster[id]; if (c) { applySheet(c, patch, true); saveRoster(); } });

  // ----- save points (item 1) -----
  socket.on('dm:save:create', ({ name } = {}, ack) => {
    if (socket.data.role !== 'dm') return;
    const chars = Object.fromEntries(Object.entries(roster).map(([id, { socketId, token, ...c }]) => [id, c]));
    const id = saves.create(name, { campaign: require('../state').snapshot(), characters: chars });
    ack?.({ id });
    broadcast();
  });
  dm('dm:save:delete', ({ id }) => { saves.remove(id); });
  dm('dm:save:load', ({ id }) => {
    const s = saves.read(id);
    if (!s?.campaign) return;
    // Characters go back to how they were; phones stay seated where the character still exists.
    for (const [cid, c] of Object.entries(roster)) if (!s.characters?.[cid]) { release(c); delete roster[cid]; }
    for (const [cid, c] of Object.entries(s.characters || {})) {
      const { socketId, token } = roster[cid] || {};
      roster[cid] = Object.assign(roster[cid] || {}, JSON.parse(JSON.stringify(c)), { socketId, token });
    }
    require('../state').loadSnapshot(JSON.parse(JSON.stringify(s.campaign)));
    saveRoster();
    log('system', `Loaded save point "${s.name}".`);
  });
  dm('dm:char:delete', ({ id }) => {
    const c = roster[id];
    if (!c) return;
    release(c);
    removeUrl(c.portrait);
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

  // ----- world entities (NPCs, locations, factions, events, lore) shared with Arthuria -----
  socket.on('dm:entity:save', (e = {}, ack) => {
    if (socket.data.role !== 'dm') return;
    const r = entities.upsert(e);
    ack?.(r.error ? { error: r.error } : { id: r.entity.id });
    if (!r.error) broadcast();
  });
  dm('dm:entity:delete', ({ id }) => { entities.remove(id); });

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
