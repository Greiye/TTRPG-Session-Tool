// Feature modules (Mike, Nov 26): every optional feature can be turned off from Planning › Modules.
// Off means fully hidden: the DM page hides its tabs and windows (data-feature="<id>"), the TV and phones
// get blank state for it (src/visibility.js calls blank()), and its socket events are refused
// (src/sockets/index.js calls blocked()). Everything is on by default, so a new or old save looks the same.
//
// state.features = { <id>: false } holds only the switched-off modules. One-tap override: turn it back on.
// docs/features.md lists every feature, including the core ones that cannot be turned off.

const PILLARS = { explore: '🧭 Exploration', combat: '⚔️ Combat', social: '💬 Social', table: '🎲 Table and story', prep: '📝 Planning' };

// id: { name, pillar, text, events: socket event prefixes it owns, needs: modules it depends on }
const FEATURES = {
  worldmap: { name: 'World map and travel', pillar: 'explore', text: 'World map page, road cards, travel on the TV, phone Map.', events: ['dm:worldmap', 'player:worldmap', 'player:mapview'] },
  town: { name: 'Town visits', pillar: 'explore', text: 'Town gate, town map on the TV, phone Town tab.', events: ['dm:town', 'player:town'], needs: ['worldmap'] },
  dungeon: { name: 'Dungeons', pillar: 'explore', text: 'Dungeon rooms and gate, phone Dungeon tab.', events: ['dm:dungeon', 'player:dungeon'] },
  weather: { name: 'Weather', pillar: 'explore', text: 'Weather on the TV and its effect on travel and sight.', events: ['dm:weather', 'sound:weather'] },
  puzzle: { name: 'Puzzles', pillar: 'explore', text: 'Teamwork puzzles with clues split over phones.', events: ['dm:puzzle', 'player:puzzle'] },
  camp: { name: 'Camp and rests', pillar: 'explore', text: 'Camp pop-up, rest votes, hit dice.', events: ['dm:camp', 'dm:rest', 'dm:hitdice', 'player:camp', 'player:hitdice'] },
  downtime: { name: 'Downtime', pillar: 'explore', text: 'Downtime picks and results, phone Downtime tab.', events: ['dm:downtime', 'player:downtime'] },

  combat: { name: 'Combat mode', pillar: 'combat', text: 'The Combat mode button, Prepare combat and the Battle Window.', events: ['dm:combat', 'dm:enemy', 'dm:boss'] },
  battlemap: { name: '3D battle map', pillar: 'combat', text: 'Battle map, tokens and fog on the DM page, TV and phones.', events: ['dm:map', 'dm:token', 'dm:fog'], needs: ['combat'] },
  creatures: { name: 'Creature library and randomizer', pillar: 'combat', text: 'Creatures and Creature randomizer windows.', events: ['dm:rnd', 'dm:creature'], needs: ['combat'] },

  social: { name: 'Social mode', pillar: 'social', text: 'The Social mode button and the visual novel conversation.', events: ['dm:convo', 'player:convo'] },
  voice: { name: 'Live voice', pillar: 'social', text: 'Record and transcribe the DM, live caption on the TV.', events: ['dm:caption'], needs: ['social'] },
  shops: { name: 'Shops', pillar: 'social', text: 'Shop pop-ups on the TV and phones, buying and selling.', events: ['dm:shop', 'player:shop', 'player:buy', 'player:sell'] },
  factions: { name: 'Faction reputation', pillar: 'social', text: 'Faction standing and its price changes.', events: ['dm:faction'] },
  living: { name: 'Living world', pillar: 'social', text: 'Town standing, rumours, oracles, phone World section.', events: ['dm:living', 'player:living'] },
  web: { name: 'Relations web', pillar: 'social', text: 'NPC and faction web, revealed parts on the TV.', events: ['dm:web'] },
  relations: { name: 'NPC relations', pillar: 'social', text: 'How each NPC feels about each character (DM only).', events: ['dm:relation'] },

  items: { name: 'Items', pillar: 'table', text: 'Items tab, item cards, phone Inventory tab.', events: ['dm:item'] },
  messages: { name: 'Messages and votes', pillar: 'table', text: 'Handouts, spoils, party votes, phone Inbox.', events: ['dm:handout', 'dm:spoil', 'dm:phrase', 'player:handout'] },
  journal: { name: 'Party journal', pillar: 'table', text: 'Shared notes on phones, the DM journal window.', events: ['dm:journal', 'player:journal'] },
  lore: { name: 'Lore', pillar: 'table', text: 'Lore tab, lore repo sync, phone Lore section.', events: ['dm:lore'] },
  inspiration: { name: 'Inspiration', pillar: 'table', text: 'Inspiration points and their phone pop-up.', events: ['dm:inspiration'] },
  legends: { name: 'Legends', pillar: 'table', text: 'Hall of fame, trophy shelf, empty chairs, memorial cards.', events: ['dm:legend', 'dm:legends', 'dm:trophy', 'dm:memorial'] },
  clocks: { name: 'Clocks', pillar: 'table', text: 'Segment clocks on the TV.', events: ['dm:clock'] },
  moments: { name: 'TV moments', pillar: 'table', text: 'Entrances, relic reveals, quotes and echoes on the TV.', events: ['dm:tv'] },
  soundscape: { name: 'Soundscape', pillar: 'table', text: 'Mood wheel, environment and sound layers.', events: ['sound'] },
  lights: { name: 'Mood, lights and templates', pillar: 'table', text: 'Smart bulbs, mood presets and scene templates.', events: ['dm:bulbs', 'dm:mood', 'dm:template'] },
  table: { name: 'Table tools', pillar: 'table', text: 'Tension, canon, montage, cues, nudges, bonds, framing, foreshadowing.', events: ['dm:cue', 'dm:nudge', 'dm:bond', 'dm:framing', 'dm:foreshadow', 'dm:montage', 'dm:canon', 'dm:tension', 'dm:balance', 'dm:layout', 'player:bond', 'player:nudge', 'player:frame', 'player:montage'] },
  quiz: { name: 'Recap quiz', pillar: 'table', text: 'Recap questions answered on phones.', events: ['dm:quiz', 'player:quiz'] },
  spectators: { name: 'Spectators', pillar: 'table', text: 'Watch as a spectator, spectator suggestions.', events: ['spectate', 'spectator', 'dm:suggestion'] },
  storybook: { name: 'Storybook Keep star', pillar: 'table', text: 'The Keep star on the DM page (the journal still records).', events: ['dm:keep'] },
  codm: { name: 'Co-DM and helpers', pillar: 'table', text: 'Invite QRs for the Co-DM, Battle, Social and Music helpers.', events: [] },

  designer: { name: 'Creature Designer', pillar: 'prep', text: 'Creature Designer, keyword bank and lore wiki link.', events: ['dm:design', 'dm:wiki', 'dm:keywords'] },
  graph: { name: 'Story Nodes Graph', pillar: 'prep', text: 'Plot hooks, NPCs, places and clues on a board.', events: ['dm:graph'] },
};

const exists = (id) => Object.prototype.hasOwnProperty.call(FEATURES, id);
// On unless the DM switched it off, or a module it needs is off.
function on(state, id) {
  if (!exists(id)) return true;
  if (state?.features?.[id] === false) return false;
  return (FEATURES[id].needs || []).every((n) => on(state, n));
}
const offList = (state) => Object.keys(FEATURES).filter((id) => !on(state, id));

function list(state) {
  return Object.entries(FEATURES).map(([id, f]) => ({ id, name: f.name, pillar: f.pillar, text: f.text, needs: f.needs || [], on: state?.features?.[id] !== false, live: on(state, id) }));
}

// Turn one module on or off. Returns { error } when it cannot change now.
function set(state, id, value) {
  if (!exists(id)) return { error: 'No such module.' };
  const want = !!value;
  if (!want) {
    if (id === 'combat' && (state.combat?.active || state.combat?.staged || state.mode === 'combat')) return { error: 'End combat first.' };
    if (id === 'social' && state.mode === 'social') return { error: 'End the conversation first.' };
    if (id === 'shops' && state.shopPop) return { error: 'Close the shop first.' };
  }
  state.features ??= {};
  if (want) delete state.features[id]; else state.features[id] = false;
  return { ok: true };
}
function setAll(state, value) {
  if (value) { state.features = {}; return { ok: true }; }
  const errors = [];
  for (const id of Object.keys(FEATURES)) { const r = set(state, id, false); if (r.error) errors.push(`${FEATURES[id].name}: ${r.error}`); }
  return errors.length ? { ok: true, skipped: errors } : { ok: true };
}

// The module that owns a socket event, when that module is off; else null.
function blocked(state, event, payload) {
  if (typeof event !== 'string') return null;
  if (event === 'dm:mode') {
    const m = payload?.mode;
    if ((m === 'combat' || m === 'social') && !on(state, m)) return m;
    return null;
  }
  if (event === 'dm:features' || event.startsWith('dm:features:')) return null;
  for (const [id, f] of Object.entries(FEATURES)) {
    if (on(state, id)) continue;
    if (f.events.some((p) => event === p || event.startsWith(`${p}:`))) return id;
  }
  return null;
}
const refusal = (id) => `${FEATURES[id]?.name || id} is turned off (Planning › Modules).`;

// What the TV, phones and helpers get for a switched-off module: the same as a table that never used it.
// The DM keeps the real data so turning a module back on loses nothing.
function blank(out, base, viewer) {
  const off = (id) => !on(base, id);
  // Soundscape off: its layers stop on every speaker (the DM laptop plays sound when no TV is open).
  if (off('soundscape') && out.audio?.mix) out.audio = { ...out.audio, mix: out.audio.mix.filter((m) => !m.ss) };
  if (viewer.role === 'dm') return out;
  if (off('worldmap')) { out.worldMap = null; out.mapVote = null; }
  if (off('town')) out.town = null;
  if (off('dungeon')) out.dungeon = null;
  if (off('weather')) out.weather = { kind: 'none', intensity: 2 };
  if (off('puzzle')) out.puzzle = null;
  if (off('camp')) out.camp = null;
  if (off('downtime')) out.downtime = null;
  if (off('battlemap')) { out.map = null; out.tokens = {}; out.mapVision = null; out.pendingPlace = []; }
  if (off('shops')) { out.shops = []; out.shopPop = null; }
  if (off('web')) out.web = null;
  if (off('messages')) out.handouts = [];
  if (off('journal')) out.journal = null;
  if (off('lore')) out.lore = [];
  if (off('legends')) { out.legendsShow = null; out.trophy = null; out.memorial = null; }
  if (off('clocks')) out.clocks = [];
  if (off('quiz')) out.quiz = null;
  if (off('spectators')) out.suggestions = [];
  if (off('table')) { out.montage = null; out.myNudges = []; out.framingTokens = 0; }
  return out;
}

module.exports = { FEATURES, PILLARS, on, offList, list, set, setAll, blocked, refusal, blank };
