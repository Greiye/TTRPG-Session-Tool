// DM-only events: modes, scene, checks, combat, NPC dialogue, characters.
const hub = require('../hub');
const { removeUrl } = require('../assets');
const { state, log, nextId, broadcast, EMOTIONS, sys } = require('../state');
const rules = require('../rules');
const { roster, newCharacter, applyEdits } = require('../roster');
const { str } = require('../util');
const { LIGHTS } = require('../vision');
const cast = require('../cast');
const sprites = require('../sprites');
const game = require('../game');
const combatfx = require('../combatfx');
const entities = require('../entities');
const { release, newRoomCode } = require('../session');
const net = require('../net');
const creatures = require('../creatures');
const iso = require('../iso');
const { seedTestParty, setTestMode } = require('../testparty');
const rolls = require('../rolls');

// Log types the DM can show on the TV (display setting showLog; none by default, Mike Nov 15).
const camp = require('../camp');
const houserules = require('../houserules');
const NARRATION_MAX = 10; // narrate posts kept under the scene description
const LOG_KINDS = ['action', 'check', 'combat', 'downtime', 'narrate', 'npc', 'say', 'shop', 'system', 'notice'];
const perception = require('../perception');
const messages = require('../messages');
const tracker = require('../tracker');
const world = require('../world');
const bulbs = require('../bulbs');
const grid = require('../grid');
const randomizer = require('../randomizer');
const spells = require('../spells');
const saves = require('../saves');
const shops = require('../shops');
const objectives = require('../objectives');
const factions = require('../factions');
const { applySheet } = require('../sheet');
const { saveRoster } = require('../roster');
const legacy = require('../legacy');
const moments = require('../moments');
const speech = require('../speech');
const timers = require('../timers');
const roles = require('../roles');

module.exports = function dmSockets(socket) {
  const { io } = hub;
  // DM events. A Battle or Social Master may run the ones src/roles.js lists for their role.
  const dm = (event, fn) => socket.on(event, (payload = {}) => {
    if (!roles.can(socket.data.role, event)) return;
    fn(payload || {});
    broadcast();
  });

  function setMode(mode, npcId) {
    if (!['exploration', 'combat', 'social'].includes(mode)) return;
    // Prepare combat (Mike, Nov 21): any mode button ends the DM's private prep. Combat takes the table into the
    // fight (the usual "Get ready" filter); the mode the table is already in just closes the prep.
    if (state.combat.staged) state.combat.staged = false;
    // Pressing the mode you are already in does nothing (no log line, no re-entry), except picking who speaks.
    if (mode === state.mode) { if (mode === 'social' && npcId) cast.pick(state.social, npcId); return; }
    state.mode = mode;
    world.applyMood(mode);
    // The world map stays on the TV in social and exploration (Mike, Nov 16). Entering combat hands the TV to the
    // combat prep filter below; Show on TV can still put the map back up during a fight.
    if (mode === 'combat') state.worldMap.onTv = false;
    // Combat prep (Mike, Nov 15): entering combat puts a "Combat · Get ready" filter on the TV while the DM sets
    // the field. It lifts when the DM's 3-second initiative hold rolls initiative (dm:combat:start).
    state.combatPrep = mode === 'combat' && !state.combat.active ? { holding: false } : null;
    state.check = null;
    // Quick switching keeps one mode line: a mode line still at the end of the log is replaced, not stacked.
    const last = state.log[state.log.length - 1];
    if (last?.modeLine) state.log.pop();
    log('system', `— ${mode.toUpperCase()} —`, { modeLine: true });
    void bulbs.sync(state);
    // Entering social mode opens the DM's NPC list; the conversation (and the phones' pop-up) starts
    // when the DM holds Start conversation (dm:convo:start). Leaving social closes it.
    cast.close(state.social); // a real switch (same-mode presses return above)
    if (mode === 'social' && npcId) cast.pick(state.social, npcId);
  }
  dm('dm:mode', ({ mode, npcId }) => setMode(mode, npcId));
  // Prepare combat (Mike, Nov 21): the DM's page opens the Battle Window while the TV and phones stay in the mode
  // they are in. Creatures, the battle map and tokens stay hidden from them (src/visibility.js) until the DM
  // presses Combat or rolls initiative.
  dm('dm:combat:stage', ({ on = true } = {}) => {
    if (state.mode === 'combat' || state.combat.active) return; // the table is already in the fight
    state.combat.staged = on ? { at: state.log[state.log.length - 1]?.id || 0 } : false;
  });
  socket.on('dm:convo:start', ({ ids } = {}, ack) => {
    if (!roles.can(socket.data.role, 'dm:convo:start')) return ack?.({ error: 'DM only.' });
    if (state.mode !== 'social') return ack?.({ error: 'Switch to Social mode first.' });
    const r = cast.start(state.social, ids, nextId());
    if (r.ok) log('system', `A conversation begins with ${r.names.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`);
    broadcast();
    ack?.(r);
  });
  // End conversation: the TV holds "The conversation has concluded" for about a second, then everyone
  // (and the DM) goes back to exploration.
  const CONVO_END_MS = 1300;
  dm('dm:convo:end', () => {
    if (state.mode !== 'social' || !cast.end(state.social)) return;
    log('system', 'The conversation has concluded.');
    const n = state.social.convo.n;
    setTimeout(() => {
      if (state.mode !== 'social' || !state.social.convo.ending || state.social.convo.n !== n) return;
      setMode('exploration');
      broadcast();
    }, CONVO_END_MS);
  });
  dm('dm:scene', ({ title, text, theme, poi }) => {
    const before = state.scene.title;
    Object.assign(state.scene, {
      title: String(title ?? state.scene.title).slice(0, 80),
      text: String(text ?? state.scene.text).slice(0, 600),
      theme: String(theme ?? state.scene.theme),
      poi: Array.isArray(poi) ? poi.map((s) => String(s ?? '').trim().slice(0, 60)).filter(Boolean).slice(0, 8) : state.scene.poi,
    });
    state.scene.revealed = (state.scene.revealed || []).filter((p) => state.scene.poi.includes(p)); // a removed point leaves no stale reveal
    state.scene.secrets ??= [];
    // A new place: TV fade and chapter card, and planned choice echoes count down a scene (src/moments.js).
    // Points of interest start covered: a renamed POI list keeps only the uncovered points still in it,
    // and a new place starts with all of them hidden from the TV (Mike, Nov 16).
    state.scene.revealed = (state.scene.revealed || []).filter((p) => state.scene.poi.includes(p));
    if (state.scene.title !== before) {
      const { chapter } = moments.onNewScene(state);
      require('../soundscape').onScene(state); // a favourite linked to this scene starts (Mike, Nov 17)
      if (chapter) log('narrate', moments.chapterLine(chapter), { tone: 'chapter' });
      state.narration = []; // a new place starts a clean narration list
      state.scene.revealed = [];
    }
  });
  dm('dm:system', ({ id }) => {
    if (!rules.list().some((x) => x.id === id) || id === state.system) return;
    state.system = id;
    state.check = null;
    log('system', `Rules system: ${rules.get(id).name}.`);
  });
  // ----- Phase 8: map, tokens, randomizer -----
  // Setting the grid puts the party on it, towards the left (src/grid.js placeParty, Mike Nov 17).
  dm('dm:map', (f) => { grid.setMap(f); grid.placeParty(); });
  // A newly added creature must be placed on the map before anything else (terrain, other tokens, next turn).
  const mustPlaceFirst = () => (state.pendingPlace || []).length > 0;
  const queueForMap = (ids) => { if (state.map) state.pendingPlace = [...(state.pendingPlace || []), ...ids]; };
  dm('dm:map:paint', ({ x, y, kind }) => { if (!mustPlaceFirst()) grid.paint(Number(x), Number(y), kind); });
  // 3D map (src/iso.js): one tile's height, ground and prop, or generated terrain for the whole grid.
  dm('dm:map:tile', (f = {}) => {
    if (mustPlaceFirst() || !state.map) return;
    if (iso.editTile(state.map, f) && f.prop && f.prop !== 'none') delete state.map.terrain?.[`${f.x},${f.y}`]; // a prop replaces a wall
  });
  dm('dm:map:generate', ({ seed } = {}) => {
    if (mustPlaceFirst() || !state.map) return;
    iso.generate(state.map, seed === undefined || seed === '' ? undefined : Number(seed));
    // Tokens left standing in a wall or a prop move to the nearest open tile.
    for (const [id, t] of Object.entries(state.tokens || {})) {
      const open = (x, y) => x >= 0 && y >= 0 && x < state.map.cols && y < state.map.rows && !state.map.terrain[`${x},${y}`] && !state.map.props[`${x},${y}`];
      if (open(t.x, t.y)) continue;
      outer: for (let r = 1; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (open(t.x + dx, t.y + dy)) { state.tokens[id] = { ...t, x: t.x + dx, y: t.y + dy }; break outer; }
    }
    log('system', 'The battle map gets new terrain.', { vis: 'dm' });
  });
  dm('dm:token', ({ id, x, y, z }) => {
    const q = state.pendingPlace || [];
    if (q.length && id !== q[0]) return;
    if (!(state.combat.enemies.some((e) => e.id === id) || state.players[id])) return;
    if (grid.place(id, Number(x), Number(y), z) && q[0] === id) q.shift();
  });
  // Fog of war and light (Phase B, src/vision.js). Only party tokens reveal the map.
  dm('dm:fog', ({ on } = {}) => { if (state.map) state.map.fog = !!on; });
  dm('dm:token:light', ({ id, light } = {}) => {
    const t = state.tokens[id];
    if (t && Object.prototype.hasOwnProperty.call(LIGHTS, light)) t.light = light;
  });
  // TV weather (Phase B): rain, snow, fog or storm at light, medium or heavy strength. It writes the one shared
  // weather field (state.weather) through the living world, so travel, sight and its history see the same change.
  dm('dm:weather', ({ kind, intensity } = {}) => { require('../living').setWeather(state, kind === 'clear' ? 'none' : kind, intensity); });
  dm('dm:token:move', ({ id, x, y }) => {
    if (mustPlaceFirst()) return;
    const c = game.combatant(id); if (c && state.tokens?.[id]) grid.move(c, Number(x), Number(y), { dm: true });
  });
  // Right-click menu on the battle map: give a creature its movement back, or take its token off the map (back to the tray).
  dm('dm:move:reset', ({ id } = {}) => { if (game.combatant(id)) grid.resetMove(id); });
  dm('dm:token:remove', ({ id } = {}) => {
    if (!state.tokens?.[id]) return;
    delete state.tokens[id];
    if (state.combat.lastMove?.id === id) state.combat.lastMove = null;
  });
  // Art for each pick of a roll: { slot: url } for the picks that have art.
  const artsFor = (r) => {
    const arts = state.rndArt[r.table] || {};
    return Object.fromEntries(Object.entries(r.picks).flatMap(([s, label]) => (arts[s]?.[label] ? [[s, arts[s][label]]] : [])));
  };
  // Creature art: the DM attaches an uploaded creature image to one pick (table, slot, label). url null removes it.
  dm('dm:rnd:art', ({ table, slot, label, url }) => {
    const t = randomizer.TABLES[table];
    if (!t || !t.slots.some((x) => x.name === slot)) return;
    if (url !== null && (typeof url !== 'string' || !url.startsWith('/uploads/creatures/'))) return;
    const byTable = (state.rndArt[table] ||= {});
    const bySlot = (byTable[slot] ||= {});
    if (url === null) delete bySlot[label]; else bySlot[label] = url;
    if (state.roll?.table === table) state.roll.art = artsFor(state.roll);
  });
  dm('dm:roll:creature', ({ table, seed, reroll: slot }) => {
    const t = randomizer.TABLES[table];
    if (!t) return;
    const prev = state.roll && state.roll.table === table ? state.roll : null;
    const r = slot && prev ? { table, ...randomizer.reroll(t, prev, slot) } : { table, n: 0, ...randomizer.roll(t, seed) };
    // Attach the art the DM set for each pick, so the DM page and the TV show the same creature.
    r.art = artsFor(r);
    state.roll = r;
  });

  // ----- Phase 7: world and content -----
  dm('dm:relation', ({ npc, charId, stance }) => world.relate(npc, charId, stance));
  dm('dm:phrase', (f) => { const p = world.phrase(f); if (p) state.handouts.push(p); });
  dm('dm:phrase:reveal', ({ id, on }) => { const p = state.handouts.find((h) => h.id === id && h.kind === 'phrase'); if (p) { p.revealed = !!on; if (on) p.read = {}; } }); // a reveal pops the phrase up again, now readable
  dm('dm:mood', ({ mode, track }) => { if (['exploration', 'combat', 'social'].includes(mode)) world.setMood(mode, track); });
  dm('dm:light', ({ light }) => { world.setLight(light); void bulbs.sync(state); });
  dm('dm:template', ({ key }) => { world.applyTemplate(key); void bulbs.sync(state); });
  // Smart bulbs (item 10): toggling on pushes the current colour at once. Turning off leaves the bulbs as they are.
  dm('dm:bulbs', ({ on }) => { state.bulbsOn = !!on; void bulbs.sync(state, { force: true }); });

  // ----- Phase 6: conditions, clocks, rests -----
  dm('dm:condition', ({ id, name, on }) => tracker.setCondition(id, name, !!on));
  // Phase D timers: a condition that counts down by round, and concentration on a spell.
  dm('dm:timer:condition', ({ id, name, rounds }) => timers.conditionTimer(id, name, rounds));
  dm('dm:concentrate', ({ id, spell }) => timers.concentrate(id, spell));
  dm('dm:concentrate:drop', ({ id }) => timers.dropConcentration(id));
  dm('dm:clock:add', (f) => { if (state.clocks.length < 20) tracker.addClock(f); });
  dm('dm:clock:fill', ({ id, delta }) => tracker.fillClock(id, delta));
  dm('dm:clock:remove', ({ id }) => { state.clocks = state.clocks.filter((k) => k.id !== id); });
  dm('dm:rest', ({ kind }) => {
    const short = kind !== 'long';
    tracker.rest(short ? 'short' : 'long', short ? (state.camp.dice || {}) : {});
    state.camp.dice = {}; // the spent dice are used up once the rest is applied
  });

  // ----- Camp: TV image, phone votes for short or long rest (src/camp.js) -----
  dm('dm:camp:open', ({ open }) => {
    const was = state.camp.open;
    const why = open && !was ? houserules.blockCamp(state) : null; // house rule (src/houserules.js)
    if (why) { log('system', why, { tone: 'bad' }); return; }
    if (open && !was) require('../popups').only(state, 'camp');
    const kind = !open && was ? camp.restKind(state.camp) : null; // ending camp applies the voted (or overridden) rest
    camp.setOpen(state.camp, open);
    if (state.camp.open && !was) log('system', 'Camp is set. Choose a short or long rest.', { tone: 'call' });
    if (kind) {
      tracker.rest(kind, kind === 'short' ? (state.camp.dice || {}) : {});
      state.camp.dice = {};
    }
    if (!state.camp.open && was) log('system', kind ? `Camp is over after a ${kind} rest.` : 'Camp is over. No rest was taken.', { tone: 'call' });
  });
  dm('dm:camp:apply', ({ apply }) => camp.setApply(state.camp, apply));

  // ----- Inspiration tab: the DM gives or takes inspiration points (capped like the recap quiz) -----
  dm('dm:inspiration', ({ id, delta, all }) => {
    const d = Math.sign(Number(delta) || 0);
    if (!d) return;
    const who = all ? Object.values(state.players) : [state.players[id]].filter(Boolean);
    const changed = who.filter((c) => { const was = c.inspiration || 0; return require('../quiz').adjust(c, d) !== was; });
    if (!changed.length) return;
    const names = changed.map((c) => c.name).join(', ');
    log('system', d > 0 ? `✨ ${names} ${changed.length > 1 ? 'gain' : 'gains'} inspiration.` : `${names} ${changed.length > 1 ? 'lose' : 'loses'} an inspiration point.`, { tone: d > 0 ? 'good' : 'call' });
  });
  dm('dm:camp:image', ({ id }) => camp.setImage(state.camp, state.backdrop.library.find((b) => b.id === id)));

  // ----- Phase 4: messages -----
  dm('dm:handout', (f) => { const m = messages.handout(f, 'h' + nextId(), roster); if (m.text || m.image) state.handouts.push(m); if (state.handouts.length > 80) state.handouts.shift(); });
  dm('dm:spoil', (f) => { const m = messages.spoil(f, 'p' + nextId()); if (m) state.handouts.push(m); });
  dm('dm:spoil:award', ({ id, charId }) => {
    const m = state.handouts.find((h) => h.id === id && h.kind === 'spoil');
    if (!m || !roster[charId]) return;
    m.awarded = charId;
    log('system', `${roster[charId].name} gets the spoils: ${m.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}.`);
  });
  // Secret objectives (item 9): the DM gives one to a character; only that phone sees it until revealed.
  dm('dm:objective', (f) => {
    if (state.objectives.length >= objectives.MAX_OBJECTIVES) return;
    const o = objectives.create(f, 'o' + nextId(), roster);
    if (o) state.objectives.push(o);
  });
  dm('dm:objective:reveal', ({ id, on }) => objectives.setRevealed(state.objectives, id, on));
  dm('dm:objective:remove', ({ id }) => { state.objectives = state.objectives.filter((o) => o.id !== id); });
  dm('dm:handout:remove', ({ id }) => { state.handouts = state.handouts.filter((h) => h.id !== id); });
  // NPC shops (item 27): import a CSV or Markdown list; the server parses it and answers with any skipped rows.
  socket.on('dm:shop:import', (f = {}, ack) => {
    if (socket.data.role !== 'dm') return;
    if (state.shops.length >= shops.MAX_SHOPS) return ack?.({ error: 'Too many shops. Remove one first.' });
    const r = shops.create(f || {}, 's' + nextId());
    if (r.error) return ack?.(r);
    r.shop.faction = factions.find(state, r.shop.faction) ? r.shop.faction : null;
    state.shops.push(r.shop);
    log('system', `${r.shop.name} opens${r.shop.npc ? ` (${r.shop.npc})` : ''} with ${r.shop.items.length} items.`);
    broadcast();
    ack?.({ ok: true, id: r.shop.id, items: r.shop.items.length, skipped: r.shop.skipped });
  });
  // Faction reputation (src/factions.js): the DM moves the numbers; mood and prices follow.
  socket.on('dm:faction:add', (f = {}, ack) => {
    if (socket.data.role !== 'dm') return ack?.({ error: 'DM only.' });
    const r = factions.create(state, f || {}, factions.newId());
    if (r.error) return ack?.(r);
    state.factions.push(r.faction);
    log('system', `${r.faction.name} now tracks its standing with the party (${factions.tierOf(r.faction.rep).label}).`);
    broadcast();
    ack?.({ ok: true, id: r.faction.id });
  });
  dm('dm:faction:shift', ({ id, delta }) => {
    const r = factions.shift(state, id, delta);
    if (r.error || !r.from || r.from.id === r.to.id) return broadcast();
    log('system', `${r.faction.name} turns ${r.to.label.toLowerCase()} toward the party.${r.moodChanged ? ` ${state.social.npc.name} shows ${r.to.mood}.` : ''}`);
    broadcast();
  });
  dm('dm:faction:remove', ({ id }) => { factions.remove(state, id); broadcast(); });
  dm('dm:shop:faction', ({ id, faction }) => {
    const s = state.shops.find((x) => x.id === id);
    if (s) s.faction = factions.find(state, faction) ? faction : null;
    broadcast();
  });
  // A shop's banner picture (an uploaded image URL, or empty to show the shop's name instead).
  dm('dm:shop:banner', ({ id, url }) => { const s = state.shops.find((x) => x.id === id); if (s) s.banner = typeof url === 'string' && /^\/(uploads|samples)\//.test(url) ? url.slice(0, 300) : null; });
  dm('dm:shop:open', ({ id, open }) => { const s = state.shops.find((x) => x.id === id); if (s) s.open = !!open; });
  dm('dm:shop:remove', ({ id }) => { state.shops = state.shops.filter((s) => s.id !== id); if (state.shopPop?.shopId === id) state.shopPop = null; });
  // Shop pop-up (Mike, Nov 14): the TV shows the shop and how many are still shopping; phones get a buy and
  // sell list. Popping a shop opens it for trade. id null closes the pop-up.
  dm('dm:shop:pop', ({ id }) => {
    const s = id && state.shops.find((x) => x.id === id);
    if (!s) { state.shopPop = null; return; }
    require('../popups').only(state, 'shop');
    s.open = true;
    state.shopPop = { shopId: s.id, n: (state.shopPop?.n || 0) + 1, done: [] };
    log('shop', `${s.name} is open for business${s.npc ? `: ${s.npc} lays out the wares` : ''}.`);
  });
  // Share a handout with the TV (the group decides what goes on the big screen).
  dm('dm:share', ({ id, on }) => {
    const h = state.handouts.find((x) => x.id === id);
    if (h && typeof h.vis === 'object') h.vis = { ...h.vis, screen: !!on };
  });
  // The party vote was removed (Mike, Nov 18: "they can just vote with their words").

  // ----- Phase 3: fog of war (7c) and boss title cards (7b) -----
  // Points of interest start hidden on the TV and phones; the DM uncovers them one at a time.
  dm('dm:reveal', ({ poi, all, hide }) => {
    if (all) { state.scene.revealed = hide ? [] : [...state.scene.poi]; return; }
    if (!state.scene.poi.includes(poi)) return;
    const cur = new Set(state.scene.revealed);
    if (hide) cur.delete(poi); else cur.add(poi);
    state.scene.revealed = state.scene.poi.filter((p) => cur.has(p));
    if (!hide) log('narrate', `Uncovered: ${poi}.`);
  });
  dm('dm:boss:card', ({ id }) => {
    const e = state.combat.enemies.find((x) => x.id === id);
    if (!e) return;
    state.bossCard = { id: e.id, name: e.name, title: e.title || '', n: (state.bossCard?.n || 0) + 1 };
  });
  dm('dm:boss:clear', () => { state.bossCard = null; });

  // Narrate bar: the post goes to the log and under the scene description, which keeps the newest 10.
  dm('dm:narrate', ({ text }) => {
    const t = String(text || '').trim().slice(0, 400);
    if (!t) return;
    log('narrate', t);
    state.narration = [...(state.narration || []), { id: nextId(), text: t }].slice(-NARRATION_MAX);
  });
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
    const enemy = creatures.spawn(block, { id: 'e' + nextId(), name: String(name || 'Goblin').slice(0, 24) });
    enemy.accent = randomizer.accent();
    state.combat.enemies.push(enemy);
    queueForMap([enemy.id]);
  });
  // ----- creature library (stat blocks) -----
  socket.on('dm:creature:save', (f = {}, ack) => {
    if (!roles.can(socket.data.role, 'dm:creature:save')) return;
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
      c.accent = randomizer.accent();
      state.combat.enemies.push(c);
      queueForMap([c.id]);
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
    state.pendingPlace = (state.pendingPlace || []).filter((x) => x !== id);
    state.combat.order = state.combat.order.filter((o) => o.id !== id);
  });
  // Creature randomizer: a new accessory colour for one creature's 2D token, or for every creature (id 'all').
  dm('dm:creature:accent', ({ id, seed } = {}) => {
    const list = id === 'all' ? state.combat.enemies : state.combat.enemies.filter((e) => e.id === id);
    const s0 = seed === undefined || seed === '' ? undefined : Number(seed) >>> 0;
    list.forEach((e, i) => { e.accent = randomizer.accent(s0 === undefined ? undefined : (s0 + i) >>> 0); });
  });
  dm('dm:combat:start', () => { state.combatPrep = null; game.startCombat(); });
  // The DM is holding Roll initiative: the TV filter shakes until the hold completes or is let go early.
  dm('dm:combat:prep', ({ holding }) => { if (state.combatPrep) state.combatPrep.holding = !!holding; });
  // Ending combat clears the combat window for the next fight (Mike, Nov 16): creatures, tokens, the battle map,
  // initiative and movement all go. The party and the creature library stay.
  dm('dm:combat:end', () => {
    // End of combat pop-up (Mike, Nov 21) on the TV and phones, when the table saw a fight (not a private prep).
    if (state.combat.active && !state.combat.staged) {
      const foes = state.combat.enemies.filter((e) => (e.side || 'enemy') === 'enemy');
      combatfx.end({ won: foes.length > 0 && foes.every((e) => e.hp <= 0) });
    }
    Object.assign(state.combat, { active: false, order: [], turn: 0, round: 0, acted: {}, moved: {}, enemies: [], lastMove: null, staged: false });
    state.tokens = {};
    state.pendingPlace = [];
    state.map = null;
    log('combat', 'Combat ends.');
  });
  // TV battle view (Mike, Nov 21): the DM turns the TV's camera a quarter turn at a time, and can look straight down.
  // It stays between fights (dm:combat:end leaves combat.cam alone).
  dm('dm:tv:cam', ({ turn, top, reset } = {}) => {
    const cam = (state.combat.cam ||= { rot: 0, top: false, n: 0 });
    if (reset) Object.assign(cam, { rot: 0, top: false });
    if (turn === 1 || turn === -1) cam.rot = (((cam.rot || 0) + turn) % 4 + 4) % 4;
    if (typeof top === 'boolean') cam.top = top;
    cam.n = (cam.n || 0) + 1;
  });
  dm('dm:combat:next', () => { if (!mustPlaceFirst()) game.advanceTurn(); });
  // The DM plays every creature: enemies, allies and neutrals. `attack` picks one from the stat block.
  dm('dm:enemy:attack', ({ target, attack, mode }) => {
    const e = game.combatant(game.currentTurnId());
    const t = game.combatant(target);
    if (e && !state.players[e.id] && t && t !== e && e.hp > 0) {
      const r = game.attack(creatures.withAttack(e, Number(attack) || 0), t, { mode });
      if (r.blocked) { log('combat', r.blocked, { tone: 'bad', vis: 'dm' }); return; } // no roll, the creature's turn goes on
      (state.combat.acted ||= {})[e.id] = state.combat.round; // the DM page greys out its actions until its next round
      game.advanceTurn();
    }
  });
  dm('dm:hp', ({ id, delta }) => {
    const t = game.combatant(id);
    if (!t) return;
    const was = t.hp;
    game.applyDamage(t, -Number(delta) || 0);
    // A combat cue for the change (src/combatfx.js); a fall to 0 already sent its "down" cue.
    if (state.combat.active && t.hp !== was && t.hp > 0) combatfx.emit(t.hp > was ? 'heal' : 'hit', { target: t, amount: Math.abs(t.hp - was) });
  });

  // ----- social -----
  dm('dm:npc', ({ name, hue, faction, style }) => {
    if (name) state.social.npc.name = String(name).slice(0, 40);
    if (style !== undefined) state.social.npc.style = speech.styleFor(style);
    if (hue !== undefined) state.social.npc.hue = Number(hue) % 360;
    if (faction !== undefined) {
      state.social.npc.faction = factions.find(state, faction) ? faction : null;
      factions.applyMood(state); // the NPC's mood follows its faction at once
    }
    cast.mirror(state.social);
  });
  socket.on('dm:cast:add', (f = {}, ack) => {
    if (!roles.can(socket.data.role, 'dm:cast:add')) return ack?.({ error: 'DM only.' });
    const r = cast.add(state.social, f || {}, nextId);
    if (r.ok) log('system', `${f.name} joins the scene.`);
    broadcast();
    ack?.(r);
  });
  dm('dm:cast:remove', ({ id }) => { cast.remove(state.social, id); });
  dm('dm:cast:pick', ({ id }) => { cast.pick(state.social, id); });
  dm('dm:emotion', ({ emotion }) => {
    if (!EMOTIONS.includes(emotion)) return;
    state.social.npc.emotion = emotion;
    if (!state.social.line.player) state.social.line.emotion = emotion;
    // A speaker wearing a sprite switches to the matching sprite state too.
    if (state.social.npc.sprite) state.social.npc.sprite = { ...state.social.npc.sprite, state: emotion };
    cast.mirror(state.social);
  });
  // Steps 5-6: the emotion buttons can also drive a character's sprite state.
  dm('dm:pc:emotion', ({ id, emotion }) => {
    const c = roster[id];
    if (!EMOTIONS.includes(emotion) || !c?.sprite) return;
    c.sprite = { ...c.sprite, state: emotion };
    if (state.players[id]) state.players[id].sprite = c.sprite;
    saveRoster();
  });
  // The DM picks which uploaded sprite an NPC (target 'npc') or a character (target = its id) wears.
  socket.on('dm:sprite', ({ target, sprite } = {}, ack) => {
    if (!roles.can(socket.data.role, 'dm:sprite')) return ack?.({ error: 'DM only.' });
    const s = sprites.clean(sprite);
    if (s === undefined) return ack?.({ error: 'Sprite ids use lowercase letters, digits, - and _.' });
    if (target === 'npc') {
      state.social.npc.sprite = s;
      cast.mirror(state.social);
    } else if (roster[target]) {
      roster[target].sprite = s;
      if (state.players[target]) state.players[target].sprite = s;
      saveRoster();
    } else return ack?.({ error: 'Pick the speaker or a character.' });
    broadcast();
    ack?.({ ok: true });
  });
  dm('dm:say', ({ text, lang }) => {
    text = String(text || '').trim().slice(0, 500);
    if (!text) return;
    const { npc } = state.social;
    const tongue = str(lang, 30);
    const line = { n: nextId(), speaker: npc.name, text, emotion: npc.emotion, style: npc.style || null }; // n: phones notify once per line
    if (tongue) Object.assign(line, { lang: tongue, gloss: [] }); // in a tongue: scrambled until glossed
    state.social.line = line;
    state.social.caption = '';
    if (!tongue) return log('npc', text, { who: npc.name, emotion: npc.emotion });
    log('npc', speech.scramble(text), { who: npc.name, emotion: npc.emotion });
    log('npc', `(${tongue}) ${text}`, { who: npc.name, emotion: npc.emotion, vis: 'dm' });
  });
  // Phase D: the DM lets one character, or everyone ('*'), read the current line in its tongue.
  dm('dm:gloss', ({ to, on }) => speech.gloss(state.social.line, to === '*' ? '*' : String(to || ''), !!on));
  dm('dm:intro', (f) => speech.showIntro(f));
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
  // One-tap undo and redo of the last table changes (src/undo.js). DM only: helpers' screens hide the button.
  for (const [event, fn] of [['dm:undo', 'undo'], ['dm:redo', 'redo']]) {
    socket.on(event, (_p, ack) => {
      if (socket.data.role !== 'dm') return ack?.({ error: 'DM only.' });
      const r = require('../undo')[fn]();
      if (r.ok) { saveRoster(); broadcast(); }
      ack?.(r);
    });
  }
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
  // Placeholder party for testing (src/testparty.js): seeds five complex classes and seats them.
  dm('dm:testparty', () => { seedTestParty(); });
  // Test mode (Nov 18): on seats one test player; off takes the test characters out of the party.
  dm('dm:testmode', ({ on }) => { setTestMode(!!on); });
  dm('dm:spotlight', ({ id }) => { if (roster[id]) game.spotlight(id, 'intro'); });
  // Death and legacy (src/legacy.js): fall = leaves the party, memorial card on the TV.
  dm('dm:char:fall', ({ id, cause, epitaph }) => legacy.fall(id, { cause, epitaph }));
  dm('dm:char:revive', ({ id }) => legacy.revive(id));
  dm('dm:memorial:clear', () => legacy.clearMemorial());

  // Table-wide display settings, used by the TV (phones and the DM laptop keep their own).
  const DISPLAY = { text: ['md', 'lg', 'xl'], palette: ['default', 'cb', 'hc'], motion: ['auto', 'reduce', 'full'], log: ['show', 'hide'], sprite: ['auto', 'webm', 'sheet'], anim: ['on', 'off'], dice: ['on', 'off'], fx: ['on', 'off'], numbers: ['dm', 'all'], gestures: ['on', 'off'] };
  dm('dm:settings', ({ display }) => {
    if (!display) return;
    const cur = state.settings.display || {};
    for (const [k, vals] of Object.entries(DISPLAY)) if (vals.includes(display[k])) cur[k] = display[k];
    // Show individual log types on the TV (DM choice; the phones keep their own log). None by default.
    if (typeof display.hideJoin === 'boolean') cur.hideJoin = display.hideJoin; // hide the top-right join box on the TV
    if (Array.isArray(display.showLog)) cur.showLog = display.showLog.filter((k) => LOG_KINDS.includes(k));
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
  // End of session (Mike, Nov 16): a 1 s hold on the DM page. The TV shows "End of Session", phones
  // show "Thanks for playing.", and the DM gets a save and log dialog. Resume clears it.
  // Keep star (storybook): marks the newest thing the table saw, or the item named by id; pressing it again un-keeps.
  socket.on('dm:keep', ({ id, on } = {}, ack) => {
    if (socket.data.role !== 'dm') return ack?.({ error: 'DM only' });
    const r = require('../storybook').keep({ id: typeof id === 'number' || typeof id === 'string' ? id : undefined, on: typeof on === 'boolean' ? on : undefined });
    ack?.(r);
  });
  dm('dm:session:end', () => {
    if (state.ended) return;
    state.ended = { n: nextId(), at: Date.now(), session: state.intro?.session || null };
    log('system', '— END OF SESSION —');
    require('../storybook').end();
  });
  dm('dm:session:resume', () => {
    if (!state.ended) return;
    state.ended = null;
    require('../storybook').resume();
    log('system', 'Session resumed.');
  });
};
