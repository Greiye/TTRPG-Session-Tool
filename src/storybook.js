// Storybook (docs/exports.md, export 1; Mike, Nov 19): an append-only session journal, the DM's Keep star, and the
// story pack. state.log keeps only the last 80 lines; the storybook keeps the whole session on disk so the DM can
// scrub back through it afterwards (/story) and hand a story pack to the artists, musicians and comic makers.
//
// One file per session: DATA_DIR/sessions/<id>/journal.jsonl, one JSON record per line, never rewritten:
//   { type: 'header', v, id, startedAt }
//   { type: 'line', id, t, kind, text, who?, said?, emotion?, tone?, roll?, vis? }   every log() line (said: a phone's
//                                                                            social words without the "X says" frame)
//   { type: 'roll', id, t, who, label, total, crit?, fumble?, outcome?, vis? } every dice result
//   { type: 'moment', id, t, kind, text }                                    TV moments with no log line of their own
//   { type: 'mood', t, mood }                                                scene, backdrop, mode, NPC and emotion,
//                                                                            weather, time of day, music (on change);
//                                                                            in social mode also the NPC's look (hue,
//                                                                            sprite, portrait) and the party on the left
//   { type: 'keep', t, id, on, auto? }                                        the Keep star (auto: kept by the tool)
//   { type: 'rewind', t, after }                                              DM undo: earlier records with a higher id are gone
//   { type: 'end', t } / { type: 'resume', t }                                End Session and Resume
// A session is one run of the server. A restart within SAME_SESSION_MS of the last record, without End Session,
// carries on in the same file (a crash or a laptop restart mid-game is still one session).
// Describes what happened, never rules: dice are numbers and labels, so any game system reads the same.
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { str } = require('./util');

const VERSION = 1;
const SAME_SESSION_MS = 6 * 3600 * 1000;
const AUTO_GAP_MS = 1500; // a nat 20 logs a line and a dice result; keep only the first
const ID_RE = /^[\w-]{1,40}$/;
const dir = () => path.join(config.DATA_DIR, 'sessions');

let cur = null; // { id, file }
let kept = new Set(); // kept ids in the current session
let last = null; // the newest keepable record in the current session: { id, text }
let prevMood = '';
let lastAuto = 0;
let watched = null; // TV moment counters seen at the last broadcast
let pendingMood = null; // the mood before anything happened: written with the first record, so an idle boot leaves no file

const pad = (n) => String(n).padStart(2, '0');
function newId(d = new Date()) {
  const base = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  let id = base;
  for (let i = 2; fs.existsSync(path.join(dir(), id)); i++) id = `${base}-${i}`;
  return id;
}
const isPublic = (vis) => vis === undefined || vis === null || vis === 'all';

function readLines(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line) continue;
    try { out.push(JSON.parse(line)); } catch { /* a line cut by a crash: skip it */ }
  }
  return out;
}

// Pick the file to write to: the latest session if it is recent and not ended, else a new one.
function open() {
  if (cur) return cur;
  try {
    const latest = list()[0];
    if (latest && !latest.ended && Date.now() - latest.lastT < SAME_SESSION_MS) {
      cur = { id: latest.id, file: path.join(dir(), latest.id, 'journal.jsonl') };
      const recs = readLines(cur.file);
      kept = new Set();
      for (const r of recs) if (r.type === 'keep') { if (r.on) kept.add(r.id); else kept.delete(r.id); }
      flushMood();
      return cur;
    }
    const id = newId();
    fs.mkdirSync(path.join(dir(), id), { recursive: true });
    cur = { id, file: path.join(dir(), id, 'journal.jsonl') };
    kept = new Set();
    fs.writeFileSync(cur.file, JSON.stringify({ type: 'header', v: VERSION, id, startedAt: new Date().toISOString(), t: Date.now() }) + '\n');
    flushMood();
  } catch (e) {
    console.warn(`  Storybook off: ${e.message}`);
    cur = { id: null, file: null };
  }
  return cur;
}

function flushMood() {
  if (pendingMood && cur?.file) { const m = pendingMood; pendingMood = null; write({ type: 'mood', t: Date.now(), mood: m }); }
}
function write(rec, file) {
  const f = file || open().file;
  if (!f) return;
  try { fs.appendFileSync(f, JSON.stringify(rec) + '\n'); } catch (e) { console.warn(`  Storybook write failed: ${e.message}`); }
}

let notify = () => {};
function setKept(id, on, { auto = false, text = '', session } = {}) {
  const here = !session || session === cur?.id;
  const file = here ? undefined : path.join(dir(), session, 'journal.jsonl');
  write({ type: 'keep', t: Date.now(), id, on: !!on, ...(auto ? { auto: true } : {}) }, file);
  if (here) { if (on) kept.add(id); else kept.delete(id); }
  if (here) notify({ id, kept: !!on, auto, text });
}
function autoKeep(id, text) {
  lastAuto = Date.now();
  setKept(id, true, { auto: true, text });
}

// ----- writers, called by the game -----

// Every log() line (src/state.js).
function line(e) {
  if (!e || !e.text) return;
  // A phone's social line logs as a sentence with only the character id: keep the name and the words it said.
  let who = e.who;
  if (!who && e.pid) { try { who = require('./roster').roster[e.pid]?.name; } catch { /* no roster in a unit test */ } }
  write({ type: 'line', id: e.id, t: e.t, kind: e.kind, text: str(e.text, 2000), ...pick({ ...e, who, said: e.said && str(e.said, 2000) }, ['who', 'said', 'emotion', 'tone', 'roll', 'vis']) });
  if (!isPublic(e.vis)) return;
  last = { id: e.id, text: e.text };
  // Kept by the tool (one tap un-keeps): a natural 20, a chapter card, the end of a fight.
  if (e.roll === 20 || e.tone === 'chapter' || /Victory!/.test(e.text)) autoKeep(e.id, e.text);
}
// Every dice result (src/rolls.js record()).
function roll(e) {
  if (!e) return;
  write({ type: 'roll', id: e.id, t: e.t, who: e.who, label: e.label, total: e.total, ...pick(e, ['crit', 'fumble', 'outcome', 'vis']) });
  if (!isPublic(e.vis)) return;
  const text = `${e.who || ''}: ${e.label || 'roll'} = ${e.total}`;
  last = { id: e.id, text };
  if (e.crit && Date.now() - lastAuto > AUTO_GAP_MS) autoKeep(e.id, text);
}
function moment(kind, text, n) {
  const id = `m-${kind}-${n}`;
  write({ type: 'moment', id, t: Date.now(), kind, text: str(text, 600) });
  last = { id, text };
  autoKeep(id, text);
}
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined && o[k] !== null && o[k] !== false).map((k) => [k, o[k]]));

// What the table felt like: read at every broadcast, written only when it changes.
function moodOf(s) {
  const social = s.mode === 'social';
  const w = s.weather && s.weather.kind && s.weather.kind !== 'none' ? s.weather : null;
  let time = null;
  try { time = s.story ? require('./moments').clockLabel(s.story) : null; } catch { /* old save */ }
  return {
    scene: s.scene?.title || '',
    backdrop: s.backdrop?.image?.url || null,
    mode: s.mode,
    npc: social ? s.social?.npc?.name || null : null,
    emotion: social ? s.social?.npc?.emotion || null : null,
    weather: w ? `${w.kind}${w.intensity ? ` ${w.intensity}` : ''}` : null,
    time,
    music: s.audio?.playing && s.audio.music ? s.audio.music.name || null : null,
    ...(social ? socialLook(s) : {}),
  };
}
// Social replays show who was talking (Mike, Nov 21): the NPC's look and the party portraits on the left (up to 3,
// as on the TV), each with the expression chosen on their phone. Old journals have none of this: the viewer
// falls back to a placeholder face.
function socialLook(s) {
  const npc = s.social?.npc || {};
  const sprite = (x) => (x && typeof x === 'object' && x.id ? { id: String(x.id), state: String(x.state || 'neutral') } : null);
  const expr = s.social?.expr || {};
  const party = Object.values(s.players || {}).slice(0, 3).map((p) => ({ id: p.id, name: p.name, hue: p.hue ?? null, portrait: p.portrait || null,
    sprite: sprite(p.sprite), emotion: expr[p.id] || null }));
  return { npcHue: Number.isFinite(npc.hue) ? npc.hue : null, npcSprite: sprite(npc.sprite), npcPortrait: npc.portrait || null, npcKind: npc.kind || 'npc', party };
}
// Called from broadcast(): mood changes and TV moments that leave no log line (entrance, relic, quote, echo).
function watch(s) {
  const m = moodOf(s);
  const key = JSON.stringify(m);
  if (key !== prevMood) {
    prevMood = key;
    if (cur?.file) write({ type: 'mood', t: Date.now(), mood: m }); else pendingMood = m;
  }
  const tv = s.tv || {};
  const now = { entrance: tv.entrance?.n || 0, relic: tv.relic?.n || 0, echo: tv.echo?.n || 0, quotes: (tv.quotes || []).map((q) => q.id) };
  if (!watched) { watched = now; return; } // first look after boot: what is on screen already is not new
  if (now.entrance && now.entrance !== watched.entrance) moment('entrance', `${tv.entrance.name} enters.`, now.entrance);
  if (now.relic && now.relic !== watched.relic) {
    const r = (tv.relics || []).find((x) => x.id === tv.relic.id);
    if (r) moment('relic', `Relic revealed: ${r.name}${r.lore ? `. ${r.lore}` : ''}`, now.relic);
  }
  if (now.echo && now.echo !== watched.echo) moment('echo', `${tv.echo.decision}: ${tv.echo.consequence}`, now.echo);
  for (const q of tv.quotes || []) if (!watched.quotes.includes(q.id)) moment('quote', `“${q.text}”${q.who ? ` (${q.who})` : ''}`, q.id.replace(/\D/g, ''));
  watched = now;
}
const end = () => write({ type: 'end', t: Date.now() });
const resume = () => write({ type: 'resume', t: Date.now() });
// DM undo went back to a table whose newest log line or dice result has id `after`.
const rewind = (after) => write({ type: 'rewind', t: Date.now(), after: Number(after) || 0 });

// The Keep star: no id keeps (or un-keeps) the newest thing the table saw.
function keep({ id, on, session } = {}) {
  if (session !== undefined && session !== cur?.id) {
    if (!ID_RE.test(String(session)) || id === undefined || !read(session)) return { error: 'No such session' };
    setKept(id, on !== false, { session });
    return { ok: true, id, kept: on !== false };
  }
  open();
  const target = id !== undefined ? id : last?.id;
  if (target === undefined) return { error: 'Nothing to keep yet' };
  const want = on === undefined ? !kept.has(target) : !!on;
  const text = id === undefined ? last.text : '';
  setKept(target, want, { text });
  return { ok: true, id: target, kept: want, text };
}

// ----- readers, for the viewer and the story pack -----

function summary(id) {
  const file = path.join(dir(), id, 'journal.jsonl');
  const recs = readLines(file);
  if (!recs.length) return null;
  const head = recs.find((r) => r.type === 'header');
  const scenes = recs.filter((r) => r.type === 'mood').map((r) => r.mood.scene).filter(Boolean);
  let ended = false;
  for (const r of recs) { if (r.type === 'end') ended = true; if (r.type === 'resume') ended = false; }
  const lastT = recs.reduce((a, r) => Math.max(a, r.t || 0), 0);
  let mtime = 0;
  try { mtime = fs.statSync(file).mtimeMs; } catch { /* gone */ }
  return { id, startedAt: head?.startedAt || null, lastT: Math.max(lastT, mtime), ended, title: scenes[0] || 'Session', scenes: [...new Set(scenes)].slice(0, 12),
    lines: recs.filter((r) => r.type === 'line' || r.type === 'roll' || r.type === 'moment').length, current: id === cur?.id };
}
// Every session, newest first.
function list() {
  let names = [];
  try { names = fs.readdirSync(dir(), { withFileTypes: true }).filter((d) => d.isDirectory() && ID_RE.test(d.name)).map((d) => d.name); } catch { return []; }
  return names.map(summary).filter(Boolean).sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || '') || b.id.localeCompare(a.id));
}

// A session folded into a timeline: each item carries the mood at that moment and whether it is kept.
// { id, items: [{ id, t, type, kind, text, who, said, emotion, vis, roll, public, kept, auto, mood }], kept: n }
function read(id) {
  if (!ID_RE.test(String(id))) return null;
  const recs = readLines(path.join(dir(), id, 'journal.jsonl'));
  if (!recs.length) return null;
  let items = [];
  let mood = null;
  const keepOf = new Map();
  for (const r of recs) {
    if (r.type === 'mood') mood = r.mood;
    else if (r.type === 'line' || r.type === 'roll' || r.type === 'moment') {
      const text = r.type === 'roll' ? `${r.who || ''}: ${r.label || 'roll'} = ${r.total}${r.outcome ? ` (${r.outcome})` : ''}${r.crit ? ' · natural 20' : r.fumble ? ' · natural 1' : ''}` : r.text;
      items.push({ id: r.id, t: r.t, type: r.type, kind: r.type === 'roll' ? 'roll' : r.kind, text, who: r.who || null, said: r.said || null, emotion: r.emotion || null, vis: r.vis ?? 'all',
        roll: r.roll ?? (r.crit ? 20 : r.fumble ? 1 : undefined), tone: r.tone || null, public: isPublic(r.vis), mood });
    } else if (r.type === 'keep') keepOf.set(r.id, { on: r.on, auto: !!r.auto });
    else if (r.type === 'rewind') items = items.filter((x) => typeof x.id !== 'number' || x.id <= r.after);
  }
  for (const x of items) { const k = keepOf.get(x.id); x.kept = !!k?.on; x.auto = !!(k?.on && k.auto); }
  return { ...summary(id), items, kept: items.filter((x) => x.kept).length };
}

// Called once at boot (src/state.js): opens the session lazily on the first record.
function init({ onKept } = {}) { if (onKept) notify = onKept; }
// Tests: forget the open file so the next record opens (or continues) a session again.
function _reset() { cur = null; kept = new Set(); last = null; prevMood = ''; watched = null; lastAuto = 0; pendingMood = null; }

module.exports = { line, roll, watch, keep, end, resume, rewind, list, read, summary, moodOf, isPublic, init, current: () => open().id, _reset, ID_RE };
