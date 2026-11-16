// One-tap DM undo (Nov 16): the universal override for anything the tool did by itself or anyone did by hand.
// After each burst of changes settles, the table (campaign snapshot plus every character sheet) is kept in a
// short history. Undo puts the table back one step; Redo steps forward again until something new happens.
// Rules-free: it works the same for HP, conditions, rolls, rests, travel, clocks, shops or anything added later.
const MAX = 15; // steps kept
const QUIET_MS = 700; // a drag or a run of quick clicks settles into one step

let deps = null; // { snapshot(), characters(), apply(step), lastLine(), changed() }
let past = []; // oldest first; the last entry is the table as it is now
let future = []; // steps undone, newest last
let timer = null;

function init(d) { deps = d; past = []; future = []; capture(); }

// Plain names for the parts of the table, used when a step adds no log line.
const NAMES = {
  scene: 'scene', combat: 'combat', social: 'conversation', map: 'battle map', tokens: 'battle map', worldMap: 'world map',
  dungeon: 'dungeon', clocks: 'clocks', living: 'living world', weather: 'weather', story: 'story clock', shops: 'shops',
  handouts: 'messages', vote: 'vote', camp: 'camp', factions: 'factions', lore: 'lore', timers: 'timers', tv: 'TV',
  backdrop: 'backdrop', audio: 'music', mode: 'mode', party: 'party', rolls: 'dice log', journal: 'journal', trail: 'trail',
};

// The snapshot carries a save time and the id counter, which move on their own; they are not a change.
// It also holds live objects, so only JSON copies are kept: one per part, to name what changed.
function read() {
  const { savedAt, seq, ...live } = deps.snapshot();
  const parts = Object.fromEntries(Object.entries(live).filter(([, v]) => v !== undefined).map(([k, v]) => [k, JSON.stringify(v)]));
  const chars = Object.fromEntries(Object.entries(deps.characters()).map(([id, c]) => [id, JSON.stringify(c)]));
  return { parts, chars, json: JSON.stringify([parts, chars]), line: deps.lastLine() };
}
function describe(now, top) {
  if (!top) return 'Start';
  if (now.line && now.line.id !== top.line?.id) return now.line.text; // the newest log line it added
  const who = Object.keys(now.chars).filter((id) => now.chars[id] !== top.chars[id]).map((id) => JSON.parse(now.chars[id]).name);
  const what = [...new Set(Object.keys(now.parts).filter((k) => k !== 'log' && now.parts[k] !== top.parts[k]).map((k) => NAMES[k] || k))];
  const bits = [...(who.length ? [`${who.slice(0, 2).join(' and ')}${who.length > 2 ? ' and others' : ''}`] : []), ...what.slice(0, 2)];
  return bits.length ? `Change to ${bits.join(', ')}` : 'Table change';
}

function capture() {
  clearTimeout(timer); timer = null;
  if (!deps) return;
  const now = read();
  const top = past[past.length - 1];
  if (top && top.json === now.json) return;
  const label = describe(now, top);
  past.push({ ...now, label, at: Date.now() });
  if (past.length > MAX + 1) past.shift();
  future = [];
  if (past.length > 1) deps.changed?.(); // the DM's Undo button names the new step (none for the starting point)
}
// Called after every broadcast.
function touch() { if (!deps) return; clearTimeout(timer); timer = setTimeout(capture, QUIET_MS); }

function undo() {
  capture(); // a change made a moment ago is its own step
  if (past.length < 2) return { error: 'Nothing to undo.' };
  const step = past.pop();
  future.push(step);
  deps.apply(past[past.length - 1]);
  return { ok: true, undone: step.label };
}
function redo() {
  capture();
  if (!future.length) return { error: 'Nothing to redo.' };
  const step = future.pop();
  past.push(step);
  deps.apply(step);
  return { ok: true, redone: step.label };
}

// The DM's button labels: what Undo would take back and what Redo would bring back.
const view = () => ({ undo: past.length > 1 ? past[past.length - 1].label : null, redo: future.length ? future[future.length - 1].label : null, steps: past.length - 1 });

module.exports = { MAX, QUIET_MS, init, touch, capture, undo, redo, view };
