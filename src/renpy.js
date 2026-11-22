// Ren'Py export (Mike, Nov 21): a storybook session as a Ren'Py project folder Mike can open, edit and finish.
// Built from the journal (src/storybook.js), like the story pack, and follows the same rule: only what the table
// saw. DM-only lines stay on the laptop.
//
// The zip holds a game/ folder to copy into a new Ren'Py project (it replaces the launcher's script.rpy):
//   game/characters.rpy   one Character per speaker (colour from their hue) and one image per look and emotion
//   game/script.rpy       label start: scene changes, show/hide with emotions, dialogue, narration, and
//                         comments for rolls, checks, music, weather and time of day (easy to turn into code)
//   game/images/bg/, game/images/chars/, game/images/sprites/   the pictures we have
// Missing art becomes a Ren'Py Placeholder, so the script runs before the art is done.
// Written to be read and edited by hand: one statement per line, comments say where each block came from.
const fs = require('fs');
const path = require('path');
const config = require('./config');
const storybook = require('./storybook');
const { slug } = require('./util');
const { fileOf } = require('./storypack');

const VIDEO = /\.(webm|mp4|ogv)$/i;
const STILL = /\.(png|jpe?g|webp|gif|bmp)$/i;
// Names Ren'Py or Python already use: a speaker called "Center" must not replace the `center` transform.
const RESERVED = new Set(('narrator extend centered vcentered nvl adv config store renpy im ui layout style gui persistent menu show hide scene with label '
  + 'jump call return pause play stop queue voice image define default init python if else elif while pass and or not in is for len str int list '
  + 'dict set print black text left right center truecenter top dissolve fade move ease zoom none true false bg side').split(' '));
const KIND_STORY = new Set(['narrate', 'npc', 'say', 'action', 'combat', 'shop', 'downtime', 'quote', 'entrance', 'relic', 'echo']);

const clock = (t) => (t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
// A Ren'Py say string: backslash and quote escaped, [ and { doubled so names in brackets are not read as tags.
const rs = (s) => `"${String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\[/g, '[[').replace(/\{/g, '{{').replace(/\r?\n/g, '\\n')}"`;
// A comment line: never let text start a new line of code.
const note = (s) => `# ${String(s ?? '').replace(/\r?\n/g, ' ')}`;
const ident = (s) => String(s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);
const attr = (s) => ident(s) || 'neutral';

function hex(hue, s = 55, l = 68) {
  const h = (((Number(hue) || 0) % 360) + 360) % 360 / 360;
  const S = s / 100, L = l / 100;
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S, p = 2 * L - q;
  const f = (t) => { t = (t + 1) % 1; const v = t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; return Math.round(v * 255).toString(16).padStart(2, '0'); };
  return `#${f(h + 1 / 3)}${f(h)}${f(h - 1 / 3)}`;
}

// Layered sprite as a list of files per state, the same way the TV composes it (public/stage.js layeredInner).
function layersOf(spriteId) {
  if (!/^[\w-]{1,40}$/.test(String(spriteId || ''))) return null;
  const root = path.join(config.UPLOAD_DIR, 'layered');
  let m;
  try { m = JSON.parse(fs.readFileSync(path.join(root, spriteId, 'manifest.json'), 'utf8')); } catch { return null; }
  if (!Array.isArray(m.layers)) return null;
  const baseDir = m.base && /^shared\/[\w-]{1,40}$/.test(m.base) ? path.join(root, m.base) : path.join(root, spriteId);
  return (state) => {
    const ov = (m.states || {})[state] || {};
    const replaced = new Set(Object.keys(ov));
    const shown = new Set(m.layers.map((l) => l.id).filter((x) => !replaced.has(x)).concat(Object.values(ov)));
    return m.layers.filter((l) => shown.has(l.id) && /^layers\/[\w-]+\.png$/.test(l.file)).sort((a, b) => a.z - b.z)
      .map((l) => path.join(l.from === 'base' ? baseDir : path.join(root, spriteId), l.file)).filter((f) => fs.existsSync(f));
  };
}

// Returns { name, files, counts } for src/backup.js writeZip, or null.
function build(id, { keptOnly = false } = {}) {
  const s = storybook.read(id);
  if (!s) return null;
  const title = s.title || 'Session';
  const folder = `renpy-${s.id}-${slug(title, 40) || 'session'}`;
  const files = [];
  const add = (name, data) => files.push({ name: `${folder}/${name}`, data });
  const copied = new Map(); // disk file -> path inside game/
  const copy = (full, sub) => {
    if (copied.has(full)) return copied.get(full);
    let name = path.basename(full).toLowerCase().replace(/[^a-z0-9._-]+/g, '_');
    const taken = new Set(copied.values());
    for (let i = 2; taken.has(`images/${sub}/${name}`); i++) name = name.replace(/(\.\w+)$/, `-${i}$1`);
    const rel = `images/${sub}/${name}`;
    copied.set(full, rel);
    files.push({ name: `${folder}/game/${rel}`, full });
    return rel;
  };

  const items = s.items.filter((x) => x.public && (!keptOnly || x.kept));

  // ----- speakers -----
  const chars = new Map(); // display name -> { v, name, hue, portrait, sprite, emotions:Set, player }
  const used = new Set();
  const charFor = (name, look = {}) => {
    if (!name) return null;
    let c = chars.get(name);
    if (!c) {
      let v = ident(name) || 'someone';
      if (/^\d/.test(v)) v = `c_${v}`;
      if (RESERVED.has(v)) v = `${v}_c`;
      for (let i = 2; used.has(v); i++) v = `${ident(name) || 'someone'}_${i}`;
      used.add(v);
      c = { v, name, hue: null, portrait: null, sprite: null, emotions: new Set(), player: false };
      chars.set(name, c);
    }
    if (look.hue !== null && look.hue !== undefined && c.hue === null) c.hue = look.hue;
    if (look.portrait && !c.portrait) c.portrait = look.portrait;
    if (look.sprite && !c.sprite) c.sprite = look.sprite;
    if (look.player) c.player = true;
    return c;
  };
  // Pass 1: everyone who speaks, with their look from the mood at that moment.
  for (const x of items) {
    const m = x.mood || {};
    if (x.kind === 'npc' && x.who) charFor(x.who, m.npc === x.who ? { hue: m.npcHue, portrait: m.npcPortrait, sprite: m.npcSprite } : {}).emotions.add(attr(x.emotion));
    if ((x.kind === 'say' || x.kind === 'action') && x.who) {
      const p = (m.party || []).find((q) => q.name === x.who) || {};
      const c = charFor(x.who, { hue: p.hue, portrait: p.portrait, sprite: p.sprite, player: true });
      if (m.mode === 'social') c.emotions.add(attr(x.emotion || p.emotion));
    }
  }

  // ----- backdrops -----
  const bgs = new Map(); // url -> { tag, rel?, video? }
  const bgFor = (url) => {
    if (!url) return null;
    if (bgs.has(url)) return bgs.get(url);
    const full = fileOf(url);
    const baseName = decodeURIComponent(url.split('?')[0].split('/').pop() || 'scene').replace(/\.\w+$/, '');
    let tag = ident(baseName) || 'scene';
    const tags = new Set([...bgs.values()].map((b) => b.tag));
    for (let i = 2; tags.has(tag); i++) tag = `${ident(baseName) || 'scene'}_${i}`;
    const b = { tag, url, rel: full ? copy(full, 'bg') : null, video: VIDEO.test(url) };
    bgs.set(url, b);
    return b;
  };

  // ----- script.rpy -----
  const out = [];
  const say = (line) => out.push(`    ${line}`);
  let lastScene = null, lastBg, lastMode = null, lastMusic = null, lastWeather = null, lastTime = null;
  const onStage = new Map(); // tag -> { side, emotion }
  const hideAll = () => { for (const tag of onStage.keys()) say(`hide ${tag}`); onStage.clear(); };
  const show = (c, emotion, side) => {
    const was = onStage.get(c.v);
    const e = attr(emotion);
    c.emotions.add(e);
    if (was && was.emotion === e && was.side === side) return;
    say(`show ${c.v} ${e} at ${side}${was ? '' : '\n    with dissolve'}`);
    onStage.set(c.v, { side, emotion: e });
  };

  out.push(note(`${title}: exported from the Tavern Screen storybook (session ${s.id}).`));
  out.push(note('Edit freely: every line below is plain Ren\'Py. Rolls, checks, music, weather and time of day are comments.'));
  out.push('');
  out.push('label start:');
  if (!items.length) say('"Nothing happened in this session yet."');
  for (const x of items) {
    const m = x.mood || {};
    // Scene or backdrop change: a new scene clears the stage.
    const bg = bgFor(m.backdrop);
    if (m.scene !== lastScene || (bg?.tag || null) !== lastBg) {
      if (out.length > 4) out.push('');
      if (m.scene && m.scene !== lastScene) say(note(`Scene: ${m.scene}${m.mode ? ` (${m.mode})` : ''}, ${clock(x.t)}`));
      say(bg ? `scene bg ${bg.tag}` : 'scene black');
      say('with fade');
      onStage.clear();
      lastScene = m.scene;
      lastBg = bg?.tag || null;
    }
    if (m.mode !== lastMode) {
      if (lastMode === 'social') hideAll();
      if (m.mode && m.mode !== 'social' && lastMode !== null) say(note(`${m.mode} begins`));
      lastMode = m.mode;
    }
    if ((m.music || null) !== lastMusic) {
      lastMusic = m.music || null;
      say(lastMusic ? `# play music "audio/${slug(lastMusic, 40) || 'music'}.ogg"  # music: ${lastMusic.replace(/\r?\n/g, ' ')}` : '# stop music');
    }
    if ((m.weather || null) !== lastWeather) { lastWeather = m.weather || null; if (lastWeather) say(note(`weather: ${lastWeather}`)); }
    if ((m.time || null) !== lastTime) { lastTime = m.time || null; if (lastTime) say(note(`time of day: ${lastTime}`)); }
    if (x.kept) say(note(`★ kept moment (${clock(x.t)})`));

    if (!KIND_STORY.has(x.kind)) { say(note(`${x.kind}: ${x.text}`)); continue; }
    const social = m.mode === 'social';
    if (x.kind === 'npc' && x.who) {
      const c = charFor(x.who);
      if (social) {
        // One NPC stands on the right: a new speaker replaces the last one.
        for (const [tag, v] of onStage) if (v.side === 'right' && tag !== c.v) { say(`hide ${tag}`); onStage.delete(tag); }
        show(c, x.emotion, 'right');
      }
      say(`${c.v} ${rs(x.text)}`);
    } else if ((x.kind === 'say' || x.kind === 'action') && x.who) {
      const c = charFor(x.who);
      if (social) {
        const p = (m.party || []).find((q) => q.name === x.who) || {};
        for (const [tag, v] of onStage) if (v.side === 'left' && tag !== c.v) { say(`hide ${tag}`); onStage.delete(tag); }
        show(c, x.emotion || p.emotion, 'left');
      }
      say(`${c.v} ${rs(x.said || x.text)}`);
    } else say(rs(x.text));
  }
  say('return');
  out.push('');

  // ----- characters.rpy -----
  const defs = [note(`Speakers and pictures for "${title}". Replace a Placeholder with a file path when the art is ready,`),
    note('e.g.  image mirela happy = "images/chars/mirela_happy.png"'), ''];
  for (const c of chars.values()) {
    defs.push(`define ${c.v} = Character(${rs(c.name)}${c.hue !== null ? `, color="${hex(c.hue)}"` : ''}, image="${c.v}")${c.player ? '  # a player character' : ''}`);
  }
  defs.push('');
  for (const b of bgs.values()) {
    if (b.rel) defs.push(b.video ? `image bg ${b.tag} = Movie(play="${b.rel}")` : `image bg ${b.tag} = "${b.rel}"`);
    else defs.push(`image bg ${b.tag} = Placeholder("bg", text=${rs(b.tag)})  # was ${b.url}`);
  }
  if (bgs.size) defs.push('');
  let pictures = 0, placeholders = 0;
  for (const c of chars.values()) {
    if (!c.emotions.size) continue;
    const layers = c.sprite ? layersOf(c.sprite.id) : null;
    const portrait = c.portrait ? fileOf(c.portrait) : null;
    for (const e of [...c.emotions].sort()) {
      const parts = layers ? layers(e) : [];
      if (parts.length) {
        const rels = parts.map((f) => copy(f, `sprites/${c.v}`));
        defs.push(`image ${c.v} ${e} = Composite((512, 512),${rels.map((r) => `\n    (0, 0), "${r}"`).join(',')})`);
        pictures++;
      } else if (portrait && (STILL.test(portrait) || VIDEO.test(portrait))) {
        const rel = copy(portrait, 'chars');
        defs.push(VIDEO.test(portrait) ? `image ${c.v} ${e} = Movie(play="${rel}")` : `image ${c.v} ${e} = "${rel}"`);
        pictures++;
      } else {
        defs.push(`image ${c.v} ${e} = Placeholder(text=${rs(`${c.name} (${e})`)})`);
        placeholders++;
      }
    }
  }
  defs.push('');

  add('game/characters.rpy', defs.join('\n'));
  add('game/script.rpy', out.join('\n'));
  const counts = { lines: items.filter((x) => KIND_STORY.has(x.kind)).length, speakers: chars.size, backdrops: bgs.size, pictures, placeholders };
  add('README.md', [
    `# ${title} (Ren'Py)`,
    '',
    `Exported from the storybook, session ${s.id}. ${counts.lines} lines, ${counts.speakers} speakers, ${counts.backdrops} backdrops, ${counts.placeholders} placeholder pictures.`,
    keptOnly ? '\nThis export holds the kept moments only.' : '',
    '',
    'Only what the table saw is in here.',
    '',
    '1. In the Ren\'Py launcher, make a new project.',
    '2. Copy this `game/` folder over the project\'s `game/` folder (it replaces `script.rpy`).',
    '3. Launch. Missing art shows as grey placeholders until you swap in real files in `characters.rpy`.',
    '',
    '| File | What |',
    '|---|---|',
    '| `game/script.rpy` | The session: scenes, who is on stage and their emotion, every line. Rolls, checks and music are comments |',
    '| `game/characters.rpy` | One `Character` per speaker and one `image` per look (`name emotion`) |',
    '| `game/images/` | Backdrops, portraits and sprite layers that were on screen |',
    '',
    'Players stand on the left, NPCs on the right. Music lines are commented out: drop the files in `game/audio/` and remove the `#`.',
    '',
  ].join('\n'));
  return { name: `${folder}.zip`, files, counts };
}

module.exports = { build, rs, ident, hex };
