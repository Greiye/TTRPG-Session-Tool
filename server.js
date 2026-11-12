// Tavern Screen: Jackbox-style D&D host. Laptop runs this server, TV shows /screen,
// DM drives /dm, players join /play from phones via QR code on the same Wi-Fi.
const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const fs = require('fs');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT) || 3000;
const DM_KEY = process.env.DM_KEY || crypto.randomBytes(3).toString('hex');
// Co-DM runs atmosphere (backdrops, effects, music, SFX) from their own device; no game controls.
const CODM_KEY = process.env.CODM_KEY || crypto.randomBytes(3).toString('hex');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

function lanAddress() {
  if (process.env.PUBLIC_HOST) return process.env.PUBLIC_HOST;
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return 'localhost';
}
const joinUrl = () => `http://${lanAddress()}:${PORT}/play`;
const codmUrl = () => `http://${lanAddress()}:${PORT}/codm?key=${CODM_KEY}`;

// ---------- rules data ----------
const CLASSES = {
  Fighter: { hp: 28, ac: 17, atk: 5, dmg: [1, 10, 3], init: 1, skills: { Athletics: 5, Perception: 3, Intimidation: 2, Insight: 1, Persuasion: 0, Deception: 0, Stealth: 1, Investigation: 0, Survival: 3, Arcana: 0 } },
  Rogue: { hp: 22, ac: 15, atk: 6, dmg: [1, 6, 4], init: 4, skills: { Athletics: 0, Perception: 5, Intimidation: 0, Insight: 3, Persuasion: 2, Deception: 6, Stealth: 7, Investigation: 5, Survival: 1, Arcana: 1 } },
  Wizard: { hp: 16, ac: 12, atk: 6, dmg: [2, 6, 0], init: 2, skills: { Athletics: -1, Perception: 1, Intimidation: 0, Insight: 3, Persuasion: 0, Deception: 0, Stealth: 2, Investigation: 6, Survival: 1, Arcana: 7 } },
  Cleric: { hp: 24, ac: 18, atk: 5, dmg: [1, 8, 3], init: 0, skills: { Athletics: 2, Perception: 4, Intimidation: 0, Insight: 6, Persuasion: 3, Deception: -1, Stealth: -1, Investigation: 0, Survival: 2, Arcana: 1 } },
  Ranger: { hp: 24, ac: 15, atk: 7, dmg: [1, 8, 4], init: 3, skills: { Athletics: 2, Perception: 6, Intimidation: 0, Insight: 2, Persuasion: 0, Deception: 0, Stealth: 6, Investigation: 2, Survival: 6, Arcana: 0 } },
  Bard: { hp: 20, ac: 14, atk: 5, dmg: [1, 8, 3], init: 2, skills: { Athletics: 0, Perception: 2, Intimidation: 3, Insight: 3, Persuasion: 7, Deception: 6, Stealth: 2, Investigation: 1, Survival: 0, Arcana: 2 } },
};
const EFFECTS = ['rain', 'snow', 'fog', 'embers', 'lightning', 'darkness', 'blood', 'magic'];
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MEDIA_TYPES = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'weba', 'audio/flac': 'flac',
};
const AUDIO_EXT = ['mp3', 'ogg', 'wav', 'm4a', 'aac', 'weba', 'flac'];
const BUILTIN_SFX = ['thunder', 'hit', 'magic', 'roar', 'bell'];
const PORTRAIT_DIR = path.join(UPLOAD_DIR, 'portraits');
const DATA_DIR = path.join(__dirname, 'data');
const ROSTER_FILE = path.join(DATA_DIR, 'characters.json');
fs.mkdirSync(PORTRAIT_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
const EMOTIONS = ['neutral', 'happy', 'angry', 'sad', 'fearful', 'surprised', 'suspicious', 'smug'];

const d = (sides) => 1 + crypto.randomInt(sides);
const rollDice = ([n, sides, mod]) => {
  const rolls = Array.from({ length: n }, () => d(sides));
  return { rolls, total: rolls.reduce((a, b) => a + b, 0) + mod, expr: `${n}d${sides}${mod ? (mod > 0 ? '+' : '') + mod : ''}` };
};
const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);

// ---------- persistent character roster ----------
// Characters outlive sessions (data/characters.json). `secret` and `hooks` are DM-only.
const SKILL_NAMES = Object.keys(CLASSES.Fighter.skills);
const PRIVATE_FIELDS = ['secret', 'hooks', 'socketId'];
const roster = fs.existsSync(ROSTER_FILE) ? JSON.parse(fs.readFileSync(ROSTER_FILE, 'utf8')) : {};
let saveTimer = null;
function saveRoster() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const out = Object.fromEntries(Object.entries(roster).map(([id, c]) => {
      const { socketId, ...rest } = c;
      return [id, rest];
    }));
    fs.writeFileSync(ROSTER_FILE + '.tmp', JSON.stringify(out, null, 2));
    fs.renameSync(ROSTER_FILE + '.tmp', ROSTER_FILE);
  }, 500);
}
const str = (v, n) => String(v ?? '').trim().slice(0, n);
const int = (v, lo, hi, dflt) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : dflt; };

function newCharacter({ name, cls, race, player }) {
  const c = CLASSES[cls];
  const id = crypto.randomBytes(5).toString('hex');
  roster[id] = {
    id, name: str(name, 24), player: str(player, 24), race: str(race, 24) || 'Human', cls, level: 1,
    hp: c.hp, maxHp: c.hp, ac: c.ac, atk: c.atk, dmg: [...c.dmg], init: c.init, skills: { ...c.skills },
    hue: crypto.randomInt(360), portrait: null, catchphrase: '', backstory: '', theme: null, secret: '', hooks: '',
  };
  saveRoster();
  return roster[id];
}

// Fields a player may edit on their own character; the DM may edit everything.
function applyEdits(c, f, isDm) {
  if (f.player !== undefined) c.player = str(f.player, 24);
  if (f.race !== undefined) c.race = str(f.race, 24);
  if (f.hue !== undefined) c.hue = int(f.hue, 0, 359, c.hue);
  if (f.catchphrase !== undefined) c.catchphrase = str(f.catchphrase, 120);
  if (f.backstory !== undefined) c.backstory = str(f.backstory, 2000);
  if (!isDm) return;
  if (f.name !== undefined) c.name = str(f.name, 24) || c.name;
  if (f.cls !== undefined && CLASSES[f.cls]) c.cls = f.cls;
  if (f.level !== undefined) c.level = int(f.level, 1, 20, c.level);
  if (f.maxHp !== undefined) c.maxHp = int(f.maxHp, 1, 999, c.maxHp);
  if (f.hp !== undefined) c.hp = int(f.hp, 0, c.maxHp, c.hp);
  c.hp = Math.min(c.hp, c.maxHp);
  if (f.ac !== undefined) c.ac = int(f.ac, 1, 40, c.ac);
  if (f.atk !== undefined) c.atk = int(f.atk, -5, 20, c.atk);
  if (f.init !== undefined) c.init = int(f.init, -5, 20, c.init);
  if (f.dmg !== undefined) {
    const m = String(f.dmg).replace(/\s/g, '').match(/^(\d+)d(\d+)([+-]\d+)?$/i);
    if (m) c.dmg = [int(m[1], 1, 20, 1), int(m[2], 2, 20, 6), int(m[3] || 0, -10, 30, 0)];
  }
  if (f.skills) for (const k of SKILL_NAMES) if (f.skills[k] !== undefined) c.skills[k] = int(f.skills[k], -5, 20, c.skills[k]);
  if (f.theme !== undefined) c.theme = f.theme ? str(f.theme, 80) : null;
  if (f.secret !== undefined) c.secret = str(f.secret, 2000);
  if (f.hooks !== undefined) c.hooks = str(f.hooks, 2000);
}
const publicChar = (c) => Object.fromEntries(Object.entries(c).filter(([k]) => !PRIVATE_FIELDS.includes(k)));

// ---------- game state ----------
const state = {
  mode: 'exploration', // exploration | combat | social
  scene: {
    title: 'The Sunken Crossroads',
    text: 'Rain hammers a mossy crossroads. A toppled shrine leans against an oak, and fresh cart tracks vanish into the fog toward the old mill.',
    theme: 'forest',
    poi: ['Toppled shrine', 'Cart tracks', 'Old mill in the fog'],
  },
  players: {}, // character id -> roster entry, for characters at the table this session
  spotlight: null, // { id, kind: 'intro' | 'nat20' } shown briefly on the TV
  check: null, // { skill, dc, results: { token: {...} } }
  combat: { active: false, round: 0, turn: 0, order: [], enemies: [] },
  social: {
    npc: { name: 'Mirela the Innkeeper', emotion: 'neutral', hue: 28 },
    line: { speaker: 'npc', text: 'Welcome, travelers. Mind the mud on my floors.', emotion: 'neutral' },
    choices: [],
    caption: '',
  },
  // Uploads survive restarts (files on disk); `image` null means use the scene theme.
  backdrop: { image: null, effects: [], library: [] },
  audio: { library: [], music: null, playing: false, volume: 0.6, sfxVolume: 0.9, builtins: BUILTIN_SFX },
  log: [],
};

function mediaItem(file) {
  const ext = path.extname(file).slice(1);
  return { id: file, url: `/uploads/${file}`, video: ext === 'mp4' || ext === 'webm', audio: AUDIO_EXT.includes(ext), name: file.replace(/^\w+-/, '').replace(/\.\w+$/, '') };
}
for (const f of fs.readdirSync(UPLOAD_DIR)) {
  if (!Object.values(MEDIA_TYPES).includes(path.extname(f).slice(1))) continue;
  const item = mediaItem(f);
  (item.audio ? state.audio.library : state.backdrop.library).push(item);
}

let seq = 0;
function log(kind, text, extra = {}) {
  state.log.push({ id: ++seq, t: Date.now(), kind, text, ...extra });
  if (state.log.length > 80) state.log.shift();
}

function publicState() {
  const players = Object.values(state.players).map((p) => ({ ...publicChar(p), online: !!p.socketId }));
  const cards = Object.values(roster).map((c) => ({ id: c.id, name: c.name, player: c.player, race: c.race, cls: c.cls, level: c.level, hue: c.hue, portrait: c.portrait, online: !!c.socketId }));
  const screens = [...io.sockets.sockets.values()].filter((x) => x.data.screen).length;
  const codms = [...io.sockets.sockets.values()].filter((x) => x.data.role === 'codm').length;
  return { ...state, players, roster: cards, screens, codms, emotions: EMOTIONS, effects: EFFECTS, classes: Object.keys(CLASSES), joinUrl: joinUrl() };
}
let pending = false;
function broadcast() {
  if (pending) return;
  pending = true;
  setImmediate(() => {
    pending = false;
    io.emit('state', publicState());
    io.to('dms').emit('dm:roster', Object.values(roster).map(({ socketId, ...c }) => ({ ...c, online: !!socketId })));
    saveRoster();
  });
}

let spotlightTimer = null;
function spotlight(id, kind) {
  clearTimeout(spotlightTimer);
  state.spotlight = { id, kind };
  spotlightTimer = setTimeout(() => { state.spotlight = null; broadcast(); }, kind === 'intro' ? 8000 : 5000);
  playTheme(roster[id]);
}
function playTheme(c) {
  if (!c?.theme) return;
  if (BUILTIN_SFX.includes(c.theme)) io.emit('sfx', { builtin: c.theme });
  else {
    const t = state.audio.library.find((x) => x.id === c.theme);
    if (t) io.emit('sfx', { url: t.url });
  }
}

function combatant(id) {
  return state.players[id] || state.combat.enemies.find((e) => e.id === id);
}
function currentTurnId() {
  const c = state.combat;
  return c.active && c.order.length ? c.order[c.turn % c.order.length].id : null;
}
function advanceTurn() {
  const c = state.combat;
  if (!c.order.length) return;
  for (let i = 0; i < c.order.length; i++) {
    c.turn++;
    if (c.turn >= c.order.length) { c.turn = 0; c.round++; log('combat', `Round ${c.round} begins.`); }
    const who = combatant(c.order[c.turn].id);
    if (who && who.hp > 0) break;
  }
  const who = combatant(currentTurnId());
  if (who) log('combat', `${who.name}'s turn.`);
  if (who && !who.enemy) playTheme(who);
}
function applyDamage(target, amount) {
  target.hp = Math.max(0, Math.min(target.maxHp, target.hp - amount));
  if (target.hp === 0) log('combat', `${target.name} is down!`, { tone: 'bad' });
  if (state.combat.active && state.combat.enemies.length && state.combat.enemies.every((e) => e.hp === 0)) {
    log('combat', 'All enemies defeated. Victory!', { tone: 'good' });
  }
}
function attack(attacker, target, atk, dmg) {
  const r = d(20);
  const total = r + atk;
  const crit = r === 20;
  const hit = crit || (r !== 1 && total >= target.ac);
  let text = `${attacker.name} attacks ${target.name}: d20(${r})${sign(atk)} = ${total} vs AC ${target.ac}`;
  if (hit) {
    const dm = rollDice(crit ? [dmg[0] * 2, dmg[1], dmg[2]] : dmg);
    text += ` ${crit ? 'CRIT' : 'HIT'} for ${dm.total} (${dm.expr})`;
    log('combat', text, { tone: 'good', roll: r });
    if (crit && !attacker.enemy) spotlight(attacker.id, 'nat20');
    applyDamage(target, dm.total);
  } else {
    log('combat', `${text} MISS`, { tone: 'bad', roll: r });
  }
}

// ---------- http ----------
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_req, res) => res.redirect('/dm'));
app.get('/dm', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'dm.html')));
app.get('/screen', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'screen.html')));
app.get('/play', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'play.html')));
app.use('/uploads', express.static(UPLOAD_DIR));
app.get('/codm', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'codm.html')));
const isLocalAddr = (a) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(a);
// Images/videos go to the backdrop library, audio to the music/SFX library. DM or co-DM only.
app.post('/api/media', express.raw({ type: Object.keys(MEDIA_TYPES), limit: '60mb' }), (req, res) => {
  const key = req.get('x-dm-key');
  if (!isLocalAddr(req.socket.remoteAddress) && key !== DM_KEY && key !== CODM_KEY) return res.status(403).json({ error: 'DM or co-DM only' });
  const ext = MEDIA_TYPES[(req.get('content-type') || '').split(';')[0]];
  if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) return res.status(415).json({ error: 'Use an image (PNG/JPG/WebP/GIF), video (MP4/WebM) or audio (MP3/OGG/WAV/M4A).' });
  const name = String(req.query.name || 'media').replace(/\.\w+$/, '').replace(/[^\w -]/g, '').slice(0, 40) || 'media';
  const id = `${crypto.randomBytes(4).toString('hex')}-${name.replace(/ /g, '_')}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, id), req.body);
  const item = mediaItem(id);
  if (item.audio) state.audio.library.push(item);
  else {
    state.backdrop.library.push(item);
    if (req.query.live === '1') state.backdrop.image = item;
  }
  broadcast();
  res.json(item);
});
// Portraits: the DM, or the phone currently playing that character (proved by its socket id).
app.post('/api/portrait/:id', express.raw({ type: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], limit: '12mb' }), (req, res) => {
  const c = roster[req.params.id];
  if (!c) return res.status(404).json({ error: 'No such character' });
  const key = req.get('x-dm-key');
  const sid = req.get('x-socket-id');
  const allowed = isLocalAddr(req.socket.remoteAddress) || key === DM_KEY || (sid && c.socketId === sid);
  if (!allowed) return res.status(403).json({ error: 'Not your character' });
  const ext = MEDIA_TYPES[(req.get('content-type') || '').split(';')[0]];
  if (!ext || !req.body?.length) return res.status(415).json({ error: 'Use a PNG, JPG, WebP or GIF image.' });
  if (c.portrait) fs.rm(path.join(PORTRAIT_DIR, path.basename(c.portrait)), () => {});
  const file = `${c.id}-${Date.now().toString(36)}.${ext}`;
  fs.writeFileSync(path.join(PORTRAIT_DIR, file), req.body);
  c.portrait = `/uploads/portraits/${file}`;
  broadcast();
  res.json({ url: c.portrait });
});
app.get('/codm-qr.svg', async (req, res) => {
  if (!isLocalAddr(req.socket.remoteAddress) && req.query.key !== DM_KEY) return res.sendStatus(403);
  res.type('image/svg+xml').send(await QRCode.toString(codmUrl(), { type: 'svg', margin: 1, color: { dark: '#1b1420', light: '#f4ead5' } }));
});
app.get('/api/codm-url', (req, res) => {
  if (!isLocalAddr(req.socket.remoteAddress) && req.query.key !== DM_KEY) return res.sendStatus(403);
  res.json({ url: codmUrl() });
});
app.get('/qr.svg', async (_req, res) => {
  res.type('image/svg+xml').send(await QRCode.toString(joinUrl(), { type: 'svg', margin: 1, color: { dark: '#1b1420', light: '#f4ead5' } }));
});

// ---------- sockets ----------
const isLocal = (s) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(s.handshake.address);

io.on('connection', (socket) => {
  socket.emit('state', publicState());

  // ----- players -----
  // Claim a saved character (by id) or create a new one. Claiming from a new phone takes it over.
  socket.on('join', ({ id, name, cls, race, player } = {}, ack) => {
    let c = roster[id];
    if (!c) {
      if (id) return ack?.({ error: 'gone' });
      if (!str(name, 24) || !CLASSES[cls]) return ack?.({ error: 'Pick a name and class.' });
      c = newCharacter({ name, cls, race, player });
    }
    if (c.socketId && c.socketId !== socket.id) io.to(c.socketId).emit('taken');
    c.socketId = socket.id;
    socket.data.charId = c.id;
    if (!state.players[c.id]) {
      state.players[c.id] = c;
      log('system', `${c.name} the ${c.race ? c.race + ' ' : ''}${c.cls} joined the party.`);
    }
    ack?.({ id: c.id, socketId: socket.id });
    broadcast();
  });

  // A socket only acts for a character while it holds the claim.
  const me = () => {
    const c = state.players[socket.data.charId];
    return c && c.socketId === socket.id ? c : null;
  };

  socket.on('player:profile', (f = {}) => {
    const c = me();
    if (!c) return;
    applyEdits(c, f, false);
    broadcast();
  });

  socket.on('player:check', ({ skill }) => {
    const p = me();
    if (!p || !(skill in p.skills)) return;
    const r = d(20); const total = r + p.skills[skill];
    const chk = state.check;
    if (r === 20) spotlight(p.id, 'nat20');
    if (chk && chk.skill === skill && !chk.results[p.id]) {
      const pass = total >= chk.dc;
      chk.results[p.id] = { name: p.name, roll: r, total, pass };
      log('check', `${p.name} ${skill}: d20(${r})${sign(p.skills[skill])} = ${total} ${pass ? 'SUCCESS' : 'FAIL'}`, { tone: pass ? 'good' : 'bad', roll: r });
    } else {
      log('check', `${p.name} ${skill}: d20(${r})${sign(p.skills[skill])} = ${total}`, { roll: r });
    }
    broadcast();
  });

  socket.on('player:action', ({ text }) => {
    const p = me();
    text = String(text || '').trim().slice(0, 200);
    if (!p || !text) return;
    if (state.mode === 'social') {
      state.social.line = { speaker: p.name, text, emotion: 'neutral', player: true, pid: p.id };
      log('say', text, { who: p.name });
    } else log('action', text, { who: p.name });
    broadcast();
  });

  socket.on('player:choice', ({ index }) => {
    const p = me();
    const choice = state.social.choices[index];
    if (!p || !choice) return;
    log('say', choice, { who: p.name });
    state.social.line = { speaker: p.name, text: choice, emotion: 'neutral', player: true, pid: p.id };
    broadcast();
  });

  socket.on('player:combat', ({ act, target }) => {
    const p = me();
    if (!p || currentTurnId() !== p.id || p.hp <= 0) return;
    if (act === 'attack') {
      const t = state.combat.enemies.find((e) => e.id === target && e.hp > 0);
      if (!t) return;
      attack(p, t, p.atk, p.dmg);
    } else if (['dodge', 'dash', 'help', 'hide'].includes(act)) {
      log('combat', `${p.name} takes the ${act[0].toUpperCase() + act.slice(1)} action.`);
    } else if (act === 'potion') {
      const h = rollDice([2, 4, 2]);
      p.hp = Math.min(p.maxHp, p.hp + h.total);
      log('combat', `${p.name} drinks a potion and heals ${h.total}.`, { tone: 'good' });
    }
    advanceTurn();
    broadcast();
  });

  socket.on('disconnect', () => {
    const p = me();
    if (p && p.socketId === socket.id) p.socketId = null;
    broadcast();
  });

  // TV pages announce themselves so the DM laptop knows whether it should output audio.
  socket.on('screen:hello', () => { socket.data.screen = true; broadcast(); });

  // ----- roles: DM (localhost or DM_KEY), co-DM (CODM_KEY) -----
  socket.on('dm:auth', ({ key } = {}, ack) => {
    socket.data.role = isLocal(socket) || key === DM_KEY ? 'dm' : key === CODM_KEY ? 'codm' : null;
    if (socket.data.role === 'dm') socket.join('dms'); else socket.leave('dms');
    ack?.({ ok: !!socket.data.role, role: socket.data.role });
    broadcast();
  });

  const dm = (event, fn) => socket.on(event, (payload = {}) => {
    if (socket.data.role !== 'dm') return;
    fn(payload);
    broadcast();
  });
  const atmo = (event, fn) => socket.on(event, (payload = {}) => {
    if (!socket.data.role) return;
    fn(payload);
    broadcast();
  });

  dm('dm:mode', ({ mode }) => {
    if (!['exploration', 'combat', 'social'].includes(mode)) return;
    state.mode = mode;
    state.check = null;
    log('system', `— ${mode.toUpperCase()} —`);
  });
  dm('dm:scene', ({ title, text, theme, poi }) => {
    Object.assign(state.scene, {
      title: String(title ?? state.scene.title).slice(0, 80),
      text: String(text ?? state.scene.text).slice(0, 600),
      theme: String(theme ?? state.scene.theme),
      poi: Array.isArray(poi) ? poi.map((s) => String(s).slice(0, 60)).filter(Boolean).slice(0, 8) : state.scene.poi,
    });
  });
  dm('dm:narrate', ({ text }) => { if (text) log('narrate', String(text).slice(0, 400)); });
  dm('dm:check', ({ skill, dc }) => {
    if (!skill) { state.check = null; return; }
    state.check = { skill, dc: Number(dc) || 10, results: {} };
    log('check', `DM calls for a ${skill} check (DC ${state.check.dc}).`, { tone: 'call' });
  });

  dm('dm:enemy:add', ({ name, hp, ac, atk, dmg }) => {
    hp = Math.max(1, Number(hp) || 10);
    state.combat.enemies.push({
      id: 'e' + (++seq), name: String(name || 'Goblin').slice(0, 24), hp, maxHp: hp,
      ac: Number(ac) || 12, atk: Number(atk) || 4, dmg: [1, 6, Number(dmg) || 2], enemy: true,
    });
  });
  dm('dm:enemy:remove', ({ id }) => {
    state.combat.enemies = state.combat.enemies.filter((e) => e.id !== id);
    state.combat.order = state.combat.order.filter((o) => o.id !== id);
  });
  dm('dm:combat:start', () => {
    const c = state.combat;
    const all = [...Object.values(state.players), ...c.enemies];
    c.order = all.map((x) => ({ id: x.id, init: d(20) + (x.init || 0) })).sort((a, b) => b.init - a.init);
    Object.assign(c, { active: true, round: 1, turn: 0 });
    state.mode = 'combat';
    log('combat', `Roll initiative! ${c.order.map((o) => `${combatant(o.id).name} ${o.init}`).join(', ')}`, { tone: 'call' });
    const who = combatant(currentTurnId());
    if (who) log('combat', `${who.name}'s turn.`);
    if (who && !who.enemy) playTheme(who);
  });
  dm('dm:combat:end', () => {
    Object.assign(state.combat, { active: false, order: [], turn: 0, round: 0 });
    log('combat', 'Combat ends.');
  });
  dm('dm:combat:next', () => advanceTurn());
  dm('dm:enemy:attack', ({ target }) => {
    const e = combatant(currentTurnId());
    const t = state.players[target];
    if (e?.enemy && t && e.hp > 0) { attack(e, t, e.atk, e.dmg); advanceTurn(); }
  });
  dm('dm:hp', ({ id, delta }) => {
    const t = combatant(id);
    if (t) { applyDamage(t, -Number(delta) || 0); }
  });

  dm('dm:npc', ({ name, hue }) => {
    if (name) state.social.npc.name = String(name).slice(0, 40);
    if (hue !== undefined) state.social.npc.hue = Number(hue) % 360;
  });
  dm('dm:emotion', ({ emotion }) => {
    if (!EMOTIONS.includes(emotion)) return;
    state.social.npc.emotion = emotion;
    if (!state.social.line.player) state.social.line.emotion = emotion;
  });
  dm('dm:say', ({ text }) => {
    text = String(text || '').trim().slice(0, 500);
    if (!text) return;
    const { npc } = state.social;
    state.social.line = { speaker: npc.name, text, emotion: npc.emotion };
    state.social.caption = '';
    log('npc', text, { who: npc.name, emotion: npc.emotion });
  });
  dm('dm:caption', ({ text }) => { state.social.caption = String(text || '').slice(0, 500); });
  dm('dm:choices', ({ choices }) => {
    state.social.choices = (choices || []).map((c) => String(c).trim().slice(0, 120)).filter(Boolean).slice(0, 4);
  });
  // ----- atmosphere: DM and co-DM -----
  atmo('atmo:backdrop', ({ id }) => {
    state.backdrop.image = state.backdrop.library.find((b) => b.id === id) || null;
  });
  atmo('atmo:delete', ({ id }) => {
    const { backdrop: bd, audio } = state;
    const item = [...bd.library, ...audio.library].find((b) => b.id === id);
    if (!item) return;
    bd.library = bd.library.filter((b) => b !== item);
    audio.library = audio.library.filter((b) => b !== item);
    if (bd.image?.id === id) bd.image = null;
    if (audio.music?.id === id) Object.assign(audio, { music: null, playing: false });
    fs.rm(path.join(UPLOAD_DIR, path.basename(id)), () => {});
  });
  atmo('atmo:effect', ({ effect, on }) => {
    if (!EFFECTS.includes(effect)) return;
    const fx = new Set(state.backdrop.effects);
    if (on ?? !fx.has(effect)) fx.add(effect); else fx.delete(effect);
    state.backdrop.effects = [...fx];
  });
  atmo('atmo:effects:clear', () => { state.backdrop.effects = []; });
  atmo('atmo:music', ({ id }) => {
    const track = state.audio.library.find((t) => t.id === id) || null;
    Object.assign(state.audio, { music: track, playing: !!track });
  });
  atmo('atmo:music:toggle', () => { if (state.audio.music) state.audio.playing = !state.audio.playing; });
  atmo('atmo:volume', ({ music, sfx }) => {
    const clamp = (v) => Math.max(0, Math.min(1, Number(v)));
    if (music !== undefined) state.audio.volume = clamp(music);
    if (sfx !== undefined) state.audio.sfxVolume = clamp(sfx);
  });
  // One-shot SFX are events, not state, so late joiners don't replay them.
  socket.on('atmo:sfx', ({ id } = {}) => {
    if (!socket.data.role) return;
    if (BUILTIN_SFX.includes(id)) io.emit('sfx', { builtin: id });
    else {
      const t = state.audio.library.find((x) => x.id === id);
      if (t) io.emit('sfx', { url: t.url });
    }
  });
  // ----- characters -----
  dm('dm:char:save', (f) => {
    let c = roster[f.id];
    if (!c) {
      if (!str(f.name, 24) || !CLASSES[f.cls]) return;
      c = newCharacter(f);
    }
    applyEdits(c, f, true);
  });
  dm('dm:char:delete', ({ id }) => {
    const c = roster[id];
    if (!c) return;
    if (c.socketId) io.to(c.socketId).emit('taken');
    if (c.portrait) fs.rm(path.join(PORTRAIT_DIR, path.basename(c.portrait)), () => {});
    delete state.players[id];
    state.combat.order = state.combat.order.filter((o) => o.id !== id);
    delete roster[id];
  });
  dm('dm:char:add', ({ id }) => {
    const c = roster[id];
    if (c && !state.players[id]) { state.players[id] = c; log('system', `${c.name} joins the party.`); }
  });
  dm('dm:spotlight', ({ id }) => { if (roster[id]) spotlight(id, 'intro'); });
  // Whispers go only to that player's phone; the DM gets an ack saying whether it was delivered.
  socket.on('dm:whisper', ({ id, text } = {}, ack) => {
    if (socket.data.role !== 'dm') return;
    const c = roster[id];
    text = str(text, 500);
    if (!c || !text) return ack?.({ ok: false });
    if (c.socketId) io.to(c.socketId).emit('whisper', { text, at: Date.now() });
    ack?.({ ok: !!c.socketId });
  });

  dm('dm:kick', ({ id }) => {
    const p = state.players[id];
    if (!p) return;
    if (p.socketId) io.to(p.socketId).emit('taken');
    p.socketId = null;
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
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Tavern Screen running\n`);
  console.log(`  DM controls : http://localhost:${PORT}/dm`);
  console.log(`  TV screen   : http://localhost:${PORT}/screen`);
  console.log(`  Players     : ${joinUrl()}  (QR on the TV)`);
  console.log(`  Co-DM       : ${codmUrl()}  (QR on the DM page)`);
  console.log(`  Remote DM   : http://${lanAddress()}:${PORT}/dm?key=${DM_KEY}\n`);
});
