// Social scene cast (phase 3). Up to 5 NPCs or items sit on the right of the scene; up to 3 player
// portraits sit on the left. The DM speaks as one cast member at a time (state.social.npc).
const { str } = require('./util');

const MAX_CAST = 5;
const MAX_PARTY = 3; // portraits on the TV's left
const MAX_TALKERS = 8; // player characters in one conversation
const KINDS = ['npc', 'item'];
const EMOTIONS = ['neutral', 'happy', 'angry', 'sad', 'fearful', 'surprised', 'suspicious', 'smug'];
// NPCs the DM can pull into a conversation (placeholders for now, Mike Nov 16).
const POOL = [['albert', 'Albert', 28], ['brent', 'Brent', 205], ['christina', 'Christina', 320]];
const freshPool = () => POOL.map(([id, name, hue]) => ({ id: `pool-${id}`, name, kind: 'npc', hue, icon: '', emotion: 'neutral', faction: null }));
// How a phone line reads in the log: "Vex looks to be angry. She says "...""
const SAYS = { he: 'He says', she: 'She says', they: 'They say' };
const MOOD = { neutral: 'calm' };

// Ensure older saves have the new fields.
function ensure(social) {
  social.cast ??= [];
  social.expr ??= {};
  social.entered ??= 0;
  social.npc.id ??= null;
  social.pool ??= freshPool();
  social.convo ??= { live: false, ending: false, n: 0, from: 0 };
  social.party ??= []; // player characters in the conversation (dragged in by the DM or joined from the phone)
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

// Conversation flow (Mike, Nov 16): entering Social mode shows the DM the NPC list; holding Start
// puts the chosen NPCs on the scene, and phones get "Join the conversation?" (social.entered).
// `from` is the id counter at the start, so the TV's social narration box shows only this talk's lines.
// pids: player characters the DM dragged in (Nov 21); players can also join from their phone (join()).
function start(social, ids, from, pids = []) {
  ensure(social);
  const picked = [...new Set(Array.isArray(ids) ? ids : [])].map((id) => social.pool.find((p) => p.id === id)).filter(Boolean).slice(0, MAX_CAST);
  if (!picked.length) return { error: 'Pick at least one NPC for the conversation.' };
  social.cast = picked.map((p) => ({ ...p, emotion: 'neutral' }));
  social.party = [...new Set((Array.isArray(pids) ? pids : []).map(String))].slice(0, MAX_TALKERS);
  pick(social, picked[0].id);
  social.expr = {};
  social.choices = [];
  social.line = { speaker: picked[0].name, text: '…', emotion: 'neutral' };
  social.convo = { live: true, ending: false, n: (social.convo.n || 0) + 1, from };
  social.entered += 1;
  return { ok: true, names: picked.map((p) => p.name) };
}
// A player character joins the live conversation (from the phone, or dragged in by the DM). Returns true when added.
function join(social, pid) {
  ensure(social);
  if (!pid || social.party.includes(pid) || social.party.length >= MAX_TALKERS) return false;
  social.party.push(pid);
  return true;
}
function leave(social, pid) {
  ensure(social);
  const before = social.party.length;
  social.party = social.party.filter((x) => x !== pid);
  return social.party.length < before;
}
// The DM drags a pool NPC onto the live scene (Nov 21). Returns { ok } or { error }.
function bring(social, id) {
  ensure(social);
  const p = social.pool.find((x) => x.id === id);
  if (!p) return { error: 'No such NPC.' };
  if (social.cast.some((c) => c.id === id)) return { error: `${p.name} is already in the conversation.` };
  if (social.cast.length >= MAX_CAST) return { error: `The scene holds ${MAX_CAST} at once. Remove one first.` };
  social.cast.push({ ...p, emotion: 'neutral' });
  return { ok: true, name: p.name };
}

// End: the TV holds "The conversation has concluded" before the table returns to exploration.
function end(social) {
  ensure(social);
  if (!social.convo.live || social.convo.ending) return false;
  social.convo.ending = true;
  return true;
}
// Leaving social mode by any route closes the conversation; the next entry starts at the NPC list.
function close(social) {
  ensure(social);
  social.convo = { ...social.convo, live: false, ending: false };
  social.party = [];
}

const sentence = (name, pronoun, emotion, text) => `${name} looks to be ${MOOD[emotion] || emotion}. ${SAYS[pronoun] || SAYS.they} "${text}"`;

module.exports = { MAX_CAST, MAX_PARTY, EMOTIONS, ensure, add, remove, pick, mirror, setExpression, start, join, leave, bring, end, close, sentence };
