// Story pack (docs/exports.md, export 1): one zip per session for the friends who turn sessions into art, music
// and comics. Built from the storybook journal (src/storybook.js), never from the live state.
//
// What goes out follows the DM control rules in docs/exports.md: only what the table saw (public lines, rolls and
// moments), no DM-only fields, character names only. DM-only and private lines stay in the journal on the laptop.
//   README.md                         what each file is for
//   story/transcript.md, script.md, recap.md
//   moments.json, moments.md          the kept moments with their mood
//   music/mood.csv                    the mood timeline (scene, mode, NPC emotion, weather, time of day, music)
//   art/backdrops/, art/portraits/    the pictures that were on screen and the heroes who spoke
const fs = require('fs');
const path = require('path');
const config = require('./config');
const storybook = require('./storybook');
const { slug } = require('./util');

const clock = (t) => (t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const moodText = (m) => (m ? [m.scene, m.mode, m.npc && `${m.npc}${m.emotion && m.emotion !== 'neutral' ? ` (${m.emotion})` : ''}`, m.weather, m.time, m.music && `music: ${m.music}`].filter(Boolean).join(' · ') : '');

// A picture URL the game served, as a file on disk: uploads and the bundled samples only.
function fileOf(url) {
  if (typeof url !== 'string') return null;
  const roots = [['/uploads/', config.UPLOAD_DIR], ['/samples/', path.join(config.PUBLIC_DIR, 'samples')]];
  for (const [prefix, root] of roots) {
    if (!url.startsWith(prefix)) continue;
    const abs = path.join(root, path.normalize(decodeURIComponent(url.slice(prefix.length))));
    if (!abs.startsWith(root + path.sep) || !fs.existsSync(abs)) return null;
    return abs;
  }
  return null;
}

function moments(items) {
  return items.filter((x) => x.kept).map((x) => ({ t: new Date(x.t).toISOString(), time: clock(x.t), kind: x.kind, who: x.who || undefined, emotion: x.emotion || undefined,
    text: x.text, auto: x.auto || undefined, mood: x.mood || undefined }));
}

// The mood timeline: one row each time the mood changed, from the journal's mood records.
function moodRows(items) {
  const rows = [];
  let prev = '';
  for (const x of items) {
    const k = JSON.stringify(x.mood || {});
    if (k === prev) continue;
    prev = k;
    const m = x.mood || {};
    rows.push([new Date(x.t).toISOString(), clock(x.t), m.scene, m.mode, m.npc, m.emotion, m.weather, m.time, m.music]);
  }
  return [['iso_time', 'time', 'scene', 'mode', 'npc', 'emotion', 'weather', 'time_of_day', 'music'], ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

// Returns { name, files: [{ name, data } | { name, full }] } for src/backup.js writeZip, or null.
function build(id, { keptOnly = false } = {}) {
  const s = storybook.read(id);
  if (!s) return null;
  const pub = s.items.filter((x) => x.public);
  const story = pub.filter((x) => x.type !== 'roll' && (!keptOnly || x.kept));
  const title = s.title || 'Session';
  const folder = `story-${s.id}-${slug(title, 40) || 'session'}`;
  const bundle = require('./bundle');
  const kept = moments(pub);
  const files = [];
  const add = (name, data) => files.push({ name: `${folder}/${name}`, data });

  add('story/transcript.md', bundle.transcript({ title, entries: story }));
  add('story/script.md', bundle.script({ title, entries: story }));
  add('story/recap.md', bundle.recap({ title, entries: story }));
  add('moments.json', JSON.stringify({ format: 'tavern-story-moments', version: 1, session: s.id, title, moments: kept }, null, 2));
  add('moments.md', [`# Kept moments: ${title}`, '', ...(kept.length ? kept.map((m) => `- **${m.time}** ${m.who ? `**${m.who}**${m.emotion && m.emotion !== 'neutral' ? ` _(${m.emotion})_` : ''}: ` : ''}${m.text}${m.mood ? `  \n  _${moodText(m.mood)}_` : ''}`) : ['_No kept moments. Press the ☆ Keep star during play, or in the storybook._']), ''].join('\n'));
  add('music/mood.csv', moodRows(pub));

  // Pictures: every backdrop that was on screen, and the portraits of heroes who spoke or rolled.
  const seen = new Set();
  const art = (url, sub) => {
    const full = fileOf(url);
    if (!full || seen.has(full)) return;
    seen.add(full);
    files.push({ name: `${folder}/art/${sub}/${path.basename(full)}`, full });
  };
  for (const x of pub) if (x.mood?.backdrop) art(x.mood.backdrop, 'backdrops');
  const names = new Set(pub.map((x) => x.who).filter(Boolean));
  for (const c of Object.values(require('./roster').roster)) if (c.portrait && names.has(c.name)) art(c.portrait, 'portraits');

  const counts = { lines: story.length, kept: kept.length, pictures: seen.size };
  add('README.md', [
    `# ${title}`,
    '',
    `Story pack from the session that started ${s.startedAt ? new Date(s.startedAt).toLocaleString() : s.id}. ${counts.lines} lines, ${counts.kept} kept moments, ${counts.pictures} pictures.`,
    keptOnly ? '\nThis pack holds the kept moments only.' : '',
    '',
    'Only what the table saw is in here. Character names only.',
    '',
    '| File | For |',
    '|---|---|',
    '| `story/transcript.md` | The session as it happened, scene by scene |',
    '| `story/script.md` | The same as a script: speakers, emotions, stage directions. Good for comics and voice work |',
    '| `story/recap.md` | A short recap |',
    '| `moments.md`, `moments.json` | The kept moments, each with its mood (scene, NPC emotion, weather, time of day, music) |',
    '| `music/mood.csv` | Mood timeline for scoring: one row per change. Opens in a spreadsheet |',
    '| `art/backdrops/`, `art/portraits/` | The pictures that were on screen and the heroes who spoke |',
    '',
  ].join('\n'));
  return { name: `${folder}.zip`, files, counts };
}

module.exports = { build, moodRows, fileOf };
