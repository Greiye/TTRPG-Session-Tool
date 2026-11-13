// Social scene cast (phase 3). Up to 5 NPCs or items sit on the right of the scene; up to 3 player
// portraits sit on the left. The DM speaks as one cast member at a time (state.social.npc).
const { str } = require('./util');

const MAX_CAST = 5;
const MAX_PARTY = 3;
const KINDS = ['npc', 'item'];
const EMOTIONS = ['neutral', 'happy', 'angry', 'sad', 'fearful', 'surprised', 'suspicious', 'smug'];

// Ensure older saves have the new fields.
function ensure(social) {
  social.cast ??= [];
  social.expr ??= {};
  social.entered ??= 0;
  social.npc.id ??= null;
  return social;
}

// Add a cast member. Returns { ok, id } or { error }.
function add(social, { name, kind, hue, icon } = {}, nextId) {
  ensure(social);
  name = str(name, 40);
  if (!name) return { error: 'Give the NPC or item a name.' };
  if (social.cast.length >= MAX_CAST) return { error: `The scene holds ${MAX_CAST} at once. Remove one first.` };
  if (social.cast.some((c) => c.name.toLowerCase() === name.toLowerCase())) return { error: 'Someone with that name is already on the scene.' };
  const entry = {
    id: `cast-${nextId()}`,
    name,
    kind: KINDS.includes(kind) ? kind : 'npc',
    hue: Number.isFinite(Number(hue)) ? Number(hue) % 360 : 28,
    icon: str(icon, 4) || '',
    emotion: 'neutral',
    faction: null,
  };
  social.cast.push(entry);
  return { ok: true, id: entry.id };
}

function remove(social, id) {
  ensure(social);
  const before = social.cast.length;
  social.cast = social.cast.filter((c) => c.id !== id);
  if (social.npc.id === id) social.npc.id = null;
  return social.cast.length < before;
}

// Speak as a cast member: copies it into the live speaker (npc) and posts nothing.
function pick(social, id) {
  ensure(social);
  const c = social.cast.find((x) => x.id === id);
  if (!c) return false;
  social.npc = { ...social.npc, id: c.id, name: c.name, hue: c.hue, emotion: c.emotion, faction: c.faction, kind: c.kind, sprite: c.sprite || null, style: c.style || null };
  return true;
}

// Keep the cast entry in step with the live speaker after a name, colour or expression change.
function mirror(social) {
  ensure(social);
  const c = social.cast.find((x) => x.id === social.npc.id);
  if (!c) return;
  Object.assign(c, { name: social.npc.name, hue: social.npc.hue, emotion: social.npc.emotion, faction: social.npc.faction, sprite: social.npc.sprite || null, style: social.npc.style || null });
}

// A player's next line carries the expression they chose on their phone.
function setExpression(social, pid, emotion) {
  ensure(social);
  if (!EMOTIONS.includes(emotion)) return false;
  social.expr[pid] = emotion;
  return true;
}

module.exports = { MAX_CAST, MAX_PARTY, ensure, add, remove, pick, mirror, setExpression };
