// Faction reputation: how each faction sees the party, from -100 (hostile) to +100 (allied).
// The DM moves the numbers. A tier change sets the mood of the NPC that belongs to the faction,
// and the tier's price multiplier applies to that faction's shops. Phones see the tier, never the number.
const crypto = require('crypto');
const { str, int } = require('./util');

const MAX_FACTIONS = 30;
// Highest band first: a faction is in the first tier whose minimum it reaches.
const TIERS = [
  { id: 'allied', label: 'Allied', min: 50, mood: 'happy', mult: 0.85 },
  { id: 'friendly', label: 'Friendly', min: 15, mood: 'happy', mult: 0.95 },
  { id: 'neutral', label: 'Neutral', min: -14, mood: 'neutral', mult: 1 },
  { id: 'unfriendly', label: 'Unfriendly', min: -49, mood: 'suspicious', mult: 1.2 },
  { id: 'hostile', label: 'Hostile', min: -100, mood: 'angry', mult: 1.5 },
];

const clampRep = (v) => int(v, -100, 100, 0);
const tierOf = (rep) => TIERS.find((t) => clampRep(rep) >= t.min) || TIERS[TIERS.length - 1];
const find = (state, id) => (state.factions || []).find((f) => f.id === id) || null;

// A new faction from the DM: { name, rep }. Returns { faction } or { error }.
function create(state, f, id) {
  const name = str(f.name, 60);
  if (!name) return { error: 'A faction needs a name.' };
  if ((state.factions || []).length >= MAX_FACTIONS) return { error: 'Too many factions. Remove one first.' };
  if ((state.factions || []).some((x) => x.name.toLowerCase() === name.toLowerCase())) return { error: `${name} already exists.` };
  return { faction: { id, name, rep: clampRep(f.rep), at: Date.now() } };
}

// Move a faction's reputation by delta. If its tier changes and an NPC belongs to it, that NPC's mood follows.
// Returns { faction, from, to, moodChanged } or { error }. Nothing changes on error.
function shift(state, id, delta) {
  const faction = find(state, id);
  if (!faction) return { error: 'No such faction.' };
  const from = tierOf(faction.rep);
  faction.rep = clampRep(faction.rep + int(delta, -100, 100, 0));
  const to = tierOf(faction.rep);
  const moodChanged = from.id !== to.id && applyMood(state, id);
  return { faction, from, to, moodChanged };
}

// Set the NPC's mood from its faction's tier. Returns true if the NPC belongs to that faction.
function applyMood(state, factionId) {
  const npc = state.social?.npc;
  if (!npc || !npc.faction) return false;
  const faction = factionId ? find(state, factionId) : find(state, npc.faction);
  if (!faction || faction.id !== npc.faction) return false;
  const mood = tierOf(faction.rep).mood;
  npc.emotion = mood;
  if (!state.social.line.player) state.social.line.emotion = mood;
  return true;
}

// Price multiplier a shop charges, from its faction's tier. Shops with no faction charge list price.
const multFor = (state, shop) => (shop?.faction && find(state, shop.faction) ? tierOf(find(state, shop.faction).rep).mult : 1);

// Remove a faction. Its shops and NPC lose the link.
function remove(state, id) {
  state.factions = (state.factions || []).filter((f) => f.id !== id);
  for (const s of state.shops || []) if (s.faction === id) s.faction = null;
  if (state.social?.npc?.faction === id) state.social.npc.faction = null;
}

const newId = () => `f${crypto.randomBytes(4).toString('hex')}`;

// Public view of a faction: the tier for everyone, the number for the DM only.
function view(f, dm) {
  const t = tierOf(f.rep);
  const { rep, ...rest } = f;
  return dm ? { ...f, tier: t.id, label: t.label } : { ...rest, tier: t.id, label: t.label };
}

module.exports = { TIERS, MAX_FACTIONS, clampRep, tierOf, find, create, shift, applyMood, multFor, remove, newId, view };
