// TV moments (phase H): stage effects the DM triggers for the big screen. Pure state logic; sockets in
// src/sockets/moments.js. Each trigger takes the next number from tv.seq, so the TV plays it once per n.
// The server only counts scenes (for choice echoes) and derives the time of day from the story clock.
const { str } = require('./util');

const TRANSITIONS = ['fade', 'wipe', 'ink'];
const MAX_QUOTES = 30;
const MAX_ECHOES = 12;
const MAX_RELICS = 20;
const BOOK_ENTRIES = 12;
const EPILOGUE_SLIDES = 24;

const defaults = () => ({
  seq: 0,
  trans: { n: 0, kind: 'fade' },
  pause: null, // { n, text } dims the TV until the DM releases it
  chapter: null, // { n, title, sub }
  entrance: null, // { n, name, image, sfx }
  quotes: [], // { id, text, who } pinned lines for the quote wall
  echoes: [], // { id, decision, consequence, left } planned by the DM; never sent to the TV
  echo: null, // { n, decision, consequence } a planned echo that has come due
  relics: [], // { id, name, icon, lore, revealed }
  relic: null, // { n, id } the relic card on the TV
  book: { n: 0, open: false, entries: [] }, // journal snapshot shown as a book
  epilogue: null, // { n, slides: [{ kicker, title, text }] }
});
const storyDefault = () => ({ day: 1, hour: 9 });

const next = (tv) => { tv.seq = (tv.seq || 0) + 1; return tv.seq; };
const hourOk = (h) => Number.isInteger(h) && h >= 0 && h <= 23;

// Time of day sets the TV light: dawn 5-7, day 7-17, dusk 17-19, night otherwise.
function storyLight(story) {
  const h = story.hour;
  if (h >= 5 && h < 7) return 'dawn';
  if (h >= 7 && h < 17) return 'day';
  if (h >= 17 && h < 19) return 'dusk';
  return 'night';
}
const clockLabel = (story) => `Day ${story.day} · ${String(story.hour).padStart(2, '0')}:00`;
// What the TV and phones get: the label and light are derived here, so every screen agrees.
const storyView = (story) => ({ day: story.day, hour: story.hour, label: clockLabel(story), light: storyLight(story) });

function setTime(story, day, hour) {
  const d = Number(day), h = Number(hour);
  if (!Number.isInteger(d) || d < 1 || d > 9999 || !hourOk(h)) return false;
  story.day = d; story.hour = h;
  return true;
}
// Adds whole hours and rolls the day over at midnight.
function advance(story, hours) {
  const add = Math.floor(Number(hours));
  if (!(add >= 0 && add <= 24 * 365)) return false;
  const total = (story.day - 1) * 24 + story.hour + add;
  story.day = Math.floor(total / 24) + 1;
  story.hour = total % 24;
  return true;
}

function transition(tv, kind) {
  if (TRANSITIONS.includes(kind)) tv.trans = { n: next(tv), kind };
}
function pause(tv, on, text) {
  tv.pause = on ? { n: next(tv), text: str(text, 200).trim() } : null;
}
function chapter(tv, title, sub) {
  const t = str(title, 80).trim();
  if (t) tv.chapter = { n: next(tv), title: t, sub: str(sub, 80).trim() };
}
// The sound is optional and must be one of the built-in one-shots; the caller plays it.
function entrance(tv, { name, image, sfx } = {}, sfxList = []) {
  const n = str(name, 60).trim();
  if (!n) return null;
  const img = typeof image === 'string' && image.startsWith('/uploads/') ? image : null;
  tv.entrance = { n: next(tv), name: n, image: img, sfx: sfxList.includes(sfx) ? sfx : null };
  return tv.entrance;
}

function quoteAdd(tv, { text, who } = {}) {
  const t = str(text, 240).trim();
  if (!t) return null;
  const q = { id: 'q' + next(tv), text: t, who: str(who, 40).trim() };
  tv.quotes = [...tv.quotes, q].slice(-MAX_QUOTES);
  return q;
}
const quoteRemove = (tv, id) => { tv.quotes = tv.quotes.filter((q) => q.id !== id); };

function echoPlant(tv, { decision, consequence, after } = {}) {
  const d = str(decision, 160).trim(), c = str(consequence, 240).trim();
  const left = Math.floor(Number(after));
  if (!d || !c || !(left >= 1 && left <= 20) || tv.echoes.length >= MAX_ECHOES) return null;
  const e = { id: 'e' + next(tv), decision: d, consequence: c, left };
  tv.echoes = [...tv.echoes, e];
  return e;
}
// Fires a planned echo now (or when its scenes run out). Returns false if there is no such echo.
function echoFire(tv, id) {
  const e = tv.echoes.find((x) => x.id === id);
  if (!e) return false;
  tv.echoes = tv.echoes.filter((x) => x.id !== id);
  tv.echo = { n: next(tv), decision: e.decision, consequence: e.consequence };
  return true;
}
const echoCancel = (tv, id) => { tv.echoes = tv.echoes.filter((x) => x.id !== id); };
// One scene has passed: count every planned echo down and fire the ones that are due.
function echoTick(tv) {
  for (const e of tv.echoes) e.left -= 1;
  const due = tv.echoes.filter((e) => e.left <= 0);
  for (const e of due) echoFire(tv, e.id);
  return due.length;
}

function relicAdd(tv, { name, icon, lore } = {}) {
  const n = str(name, 60).trim();
  if (!n || tv.relics.length >= MAX_RELICS) return null;
  const r = { id: 'r' + next(tv), name: n, icon: str(icon, 4).trim() || '✨', lore: str(lore, 400).trim(), revealed: false };
  tv.relics = [...tv.relics, r];
  return r;
}
function relicReveal(tv, id) {
  const r = tv.relics.find((x) => x.id === id);
  if (!r) return false;
  r.revealed = true;
  tv.relic = { n: next(tv), id };
  return true;
}
const relicRemove = (tv, id) => { tv.relics = tv.relics.filter((x) => x.id !== id); if (tv.relic?.id === id) tv.relic = null; };
const relicClose = (tv) => { tv.relic = null; };

// Opening the book copies the newest journal entries, so the TV shows a fixed page even as phones add notes.
function bookSet(tv, open, journal = []) {
  if (!open) { tv.book = { ...tv.book, n: next(tv), open: false }; return; }
  const entries = journal.slice(0, BOOK_ENTRIES).map(({ kind, name, text }) => ({ kind, name: str(name, 60), text: str(text, 300) }));
  tv.book = { n: next(tv), open: true, entries };
}

// Epilogue: a slideshow built once from the title, pinned quotes, journal notes and the notable log lines.
function epilogueStart(tv, s) {
  const slides = [{ kicker: 'The end of the session', title: s.scene.title || 'The session', text: s.story ? clockLabel(s.story) : '' }];
  for (const q of tv.quotes) slides.push({ kicker: 'Quote', title: q.who ? `— ${q.who}` : '', text: `“${q.text}”` });
  for (const e of [...(s.journal || [])].reverse().slice(0, 8)) slides.push({ kicker: `Journal · ${e.name}`, title: '', text: e.text });
  for (const l of s.log.filter((x) => x.tone === 'call' || x.roll === 20 || x.roll === 1).slice(-6)) {
    slides.push({ kicker: l.roll === 20 ? 'Natural 20' : l.roll === 1 ? 'Natural 1' : 'Key moment', title: l.who || '', text: l.text });
  }
  // The closing slide always stays, even when the cap cuts the middle.
  const body = slides.slice(0, EPILOGUE_SLIDES - 1);
  body.push({ kicker: '', title: 'Until next time', text: '' });
  tv.epilogue = { n: next(tv), slides: body };
}
const epilogueEnd = (tv) => { tv.epilogue = null; };

// Called when the DM changes the scene title: a fade, a chapter card for the new place, and echo countdown.
function onNewScene(s) {
  transition(s.tv, 'fade');
  chapter(s.tv, s.scene.title, s.story ? clockLabel(s.story) : '');
  return echoTick(s.tv);
}

module.exports = {
  TRANSITIONS, defaults, storyDefault, storyLight, storyView, clockLabel, setTime, advance,
  transition, pause, chapter, entrance, quoteAdd, quoteRemove, echoPlant, echoFire, echoCancel, echoTick,
  relicAdd, relicReveal, relicRemove, relicClose, bookSet, epilogueStart, epilogueEnd, onNewScene,
};
