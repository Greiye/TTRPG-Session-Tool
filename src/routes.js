// HTTP routes: pages, uploads, QR codes.
const express = require('express');
const path = require('path');
const QRCode = require('qrcode');
const { PUBLIC_DIR, UPLOAD_DIR, MODEL_DIR, DM_KEY, CODM_KEY, BATTLE_KEY, SOCIAL_KEY, MUSIC_KEY } = require('./config');
const roles = require('./roles');
const { joinUrl, codmUrl, isLocalAddr } = require('./net');
const { state, broadcast } = require('./state');
const { roster } = require('./roster');
const { mediaItem } = require('./media');
const assets = require('./assets');
const layered = require('./layered');

const QR_COLORS = { dark: '#1b1420', light: '#f4ead5' };

module.exports = function routes(app) {
  app.use(express.static(PUBLIC_DIR));
  app.get('/', (_req, res) => res.redirect('/dm'));
  for (const page of ['dm', 'screen', 'play', 'codm', 'story']) {
    app.get(`/${page}`, (_req, res) => res.sendFile(path.join(PUBLIC_DIR, `${page}.html`)));
  }
  // Upload filenames are unique per upload, so browsers may cache them forever.
  app.use('/uploads', express.static(UPLOAD_DIR, { immutable: true, maxAge: '365d' }));
  // Placeholder soundboard loops, generated in memory (src/placeholder-sounds.js). Anything else is a 404.
  app.get('/sounds/:file', (req, res) => {
    const wav = require('./placeholder-sounds').wavFor(req.params.file.replace(/\.wav$/, ''));
    if (!wav) return res.status(404).end();
    res.type('audio/wav').set('Cache-Control', 'public, max-age=86400').send(wav);
  });
  // Speech models for the offline (Vosk) engine. Only files in MODEL_DIR are served; nothing else.
  app.use('/models', express.static(MODEL_DIR, { maxAge: '1d', dotfiles: 'deny', index: false }));
  const dmOnly = (req) => isLocalAddr(req.socket.remoteAddress) || [DM_KEY, CODM_KEY].includes(req.query.key); // the co-DM is a second DM

  // One upload endpoint for every asset kind (see assets.js). Body is the raw file; content-type says what it is.
  const raw = express.raw({ type: () => true, limit: Math.max(...Object.values(assets.KINDS).map((k) => k.maxBytes)) });
  const isDm = (req) => isLocalAddr(req.socket.remoteAddress) || [DM_KEY, CODM_KEY].includes(req.get('x-dm-key'));
  const isCodm = (req) => req.get('x-dm-key') === CODM_KEY;
  // Battle or Social Master, by the key their page sends (src/roles.js).
  const masterOf = (req) => ({ [BATTLE_KEY]: 'battle', [SOCIAL_KEY]: 'social', [MUSIC_KEY]: 'music' })[req.get('x-dm-key')] || null;
  const isBattle = (req) => masterOf(req) === 'battle';
  const fail = (res, e) => res.status(e.status || 500).json({ error: e.status ? e.message : 'Upload failed' });

  async function upload(req, res, kind) {
    if (kind === 'portrait') return portrait(req, res);
    const atmo = kind === 'backdrop' || kind === 'audio';
    if (!isDm(req) && !(atmo && isCodm(req)) && !roles.canUpload(masterOf(req), kind)) return res.status(403).json({ error: atmo ? 'DM or co-DM only' : 'DM only' });
    try {
      const a = await assets.store(kind, req.body, req.get('content-type'), { name: req.query.name });
      if (!atmo) return res.json(a);
      const item = mediaItem(a.file);
      if (item.audio) state.audio.library.push(item);
      else {
        state.backdrop.library.push(item);
        if (req.query.live === '1') state.backdrop.image = item;
      }
      broadcast();
      res.json(item);
    } catch (e) { fail(res, e); }
  }
  // Portraits: the DM, or the phone currently playing that character (proved by its socket id).
  async function portrait(req, res) {
    const c = roster[req.params.id || req.query.id];
    if (!c) return res.status(404).json({ error: 'No such character' });
    const sid = req.get('x-socket-id');
    if (!isDm(req) && !(sid && c.socketId === sid)) return res.status(403).json({ error: 'Not your character' });
    try {
      const a = await assets.store('portrait', req.body, req.get('content-type'), { name: 'portrait', prefix: `${c.id}-${Date.now().toString(36)}` });
      assets.removeUrl(c.portrait);
      c.portrait = a.url;
      broadcast();
      res.json({ url: c.portrait });
    } catch (e) { fail(res, e); }
  }
  app.post('/api/assets/:kind', raw, (req, res) => upload(req, res, req.params.kind));
  // Older endpoints, kept for existing pages.
  app.post('/api/media', raw, (req, res) => upload(req, res, String(req.get('content-type')).startsWith('audio/') ? 'audio' : 'backdrop'));
  app.post('/api/portrait/:id', raw, portrait);
  // Layered sprites: DM only, one file per request. ?file=manifest.json | layers/<name>.png | anim/<name>.webm
  app.post('/api/layered/:kind/:id', raw, async (req, res) => {
    if (!isDm(req)) return res.status(403).json({ error: 'DM only' });
    try {
      const out = await layered.storeLayered(req.params.kind, req.params.id, String(req.query.file || ''), req.body);
      res.json(out);
    } catch (e) { fail(res, e); }
  });
  // Oversized bodies get a readable JSON error instead of a stack trace.
  app.use((err, _req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'File too big.' });
    next(err);
  });
  // The HTTPS certificate, so a phone can trust it and skip the warning (see README).
  app.get('/tavern-cert.crt', (_req, res) => {
    const { CERT } = require('./tls');
    if (!require('fs').existsSync(CERT)) return res.sendStatus(404);
    res.type('application/x-x509-ca-cert').sendFile(CERT);
  });
  // ----- Arthuria data exchange (0l) -----
  const bundle = require('./bundle');
  const stamp = () => new Date().toISOString().slice(0, 10);
  app.get('/api/export', (req, res) => {
    if (!dmOnly(req)) return res.sendStatus(403);
    res.attachment(`campaign-${stamp()}.tavern.json`).json(bundle.exportBundle({ includeDmNotes: req.query.notes !== '0' }));
  });
  app.post('/api/import', express.json({ limit: '200mb' }), (req, res) => {
    if (!isDm(req)) return res.sendStatus(403);
    const out = bundle.importBundle(req.body);
    if (out.error) return res.status(400).json(out);
    broadcast();
    res.json(out);
  });
  // Back up everything (S5): data/ and uploads/ as one zip, written to a temp file, then sent.
  app.get('/api/backup', (req, res) => {
    if (!dmOnly(req)) return res.sendStatus(403);
    try { require('./state').flushAll(); } catch { /* the savers report their own errors */ }
    const backup = require('./backup');
    const name = backup.fileName();
    const tmp = path.join(require('os').tmpdir(), `${Date.now()}-${name}`);
    try { backup.writeZip(tmp); } catch (e) { return res.status(500).json({ error: `Backup failed: ${e.message}` }); }
    res.download(tmp, name, () => require('fs').rm(tmp, { force: true }, () => {}));
  });
  // Storybook (src/storybook.js, src/storypack.js): past sessions for the replay viewer at /story, the Keep star,
  // and the story pack zip. DM only: the timeline holds DM-only lines (the pack never does).
  const storybook = require('./storybook');
  const storyDm = (req) => dmOnly(req) || isDm(req);
  app.get('/api/story/sessions', (req, res) => (storyDm(req) ? res.json(storybook.list()) : res.sendStatus(403)));
  app.get('/api/story/sessions/:id', (req, res) => {
    if (!storyDm(req)) return res.sendStatus(403);
    const s = storybook.read(req.params.id);
    if (!s) return res.sendStatus(404);
    res.json({ ...s, motion: require('./state').state.settings?.display?.motion || 'auto' });
  });
  app.post('/api/story/sessions/:id/keep', express.json(), (req, res) => {
    if (!storyDm(req)) return res.sendStatus(403);
    const { item, on } = req.body || {};
    if (typeof item !== 'number' && typeof item !== 'string') return res.status(400).json({ error: 'Which item?' });
    const r = storybook.keep({ id: item, on: on !== false, session: req.params.id });
    res.status(r.error ? 404 : 200).json(r);
  });
  // pack.zip: the story pack (src/storypack.js); renpy.zip: a Ren'Py project folder (src/renpy.js).
  app.get('/api/story/sessions/:id/:kind(pack|renpy).zip', (req, res) => {
    if (!storyDm(req)) return res.sendStatus(403);
    const pack = require(req.params.kind === 'renpy' ? './renpy' : './storypack').build(req.params.id, { keptOnly: req.query.kept === '1' });
    if (!pack) return res.sendStatus(404);
    const tmp = path.join(require('os').tmpdir(), `${Date.now()}-${pack.name}`);
    try { require('./backup').writeZip(tmp, pack.files); } catch (e) { return res.status(500).json({ error: `Export failed: ${e.message}` }); }
    res.download(tmp, pack.name, () => require('fs').rm(tmp, { force: true }, () => {}));
  });
  app.get('/api/transcript.md', (req, res) => {
    if (!dmOnly(req)) return res.sendStatus(403);
    res.attachment(`session-${stamp()}.md`).type('text/markdown').send(bundle.transcript());
  });
  // ----- libraries (items 3, 3b): fetched over HTTP because they are too big to broadcast -----
  const creatures = require('./creatures');
  const spells = require('./spells');
  const srd = require('./srd');
  app.get('/api/creatures', (req, res) => (isDm(req) || dmOnly(req) || isBattle(req) ? res.json(creatures.lib.list()) : res.sendStatus(403)));
  app.get('/api/designs', (req, res) => (isDm(req) || dmOnly(req) ? res.json(require('./designer').lib.list()) : res.sendStatus(403)));
  app.get('/api/keywords', (req, res) => (isDm(req) || dmOnly(req) ? res.json(require('./keywords').list()) : res.sendStatus(403)));
  app.get('/api/items', (req, res) => (isDm(req) || dmOnly(req) ? res.json(require('./itemlib').lib.list()) : res.sendStatus(403)));
  app.get('/api/spells', (_req, res) => res.json(spells.lib.list()));
  app.post('/api/srd/import', express.json({ limit: '60mb' }), (req, res) => {
    if (!isDm(req) && !isBattle(req)) return res.sendStatus(403);
    const out = srd.importJson(req.body, typeof req.query.source === 'string' ? req.query.source.slice(0, 60) : undefined);
    broadcast();
    res.json(out);
  });
  app.get('/api/srd/search', async (req, res) => {
    if (!isDm(req) && !dmOnly(req) && !isBattle(req)) return res.sendStatus(403);
    try { res.json({ results: await srd.search(req.query.kind === 'spell' ? 'spell' : 'monster', req.query.q || '') }); } catch (e) {
      res.status(502).json({ error: `Could not reach Open5e (${e.message}). The laptop needs internet for search; importing a JSON file works offline.` });
    }
  });
  app.get('/api/script.md', (req, res) => {
    if (!dmOnly(req)) return res.sendStatus(403);
    res.attachment(`script-${stamp()}.md`).type('text/markdown').send(bundle.script());
  });
  app.get('/api/recap.md', (req, res) => {
    if (!dmOnly(req)) return res.sendStatus(403);
    res.attachment(`recap-${stamp()}.md`).type('text/markdown').send(bundle.recap());
  });
  app.get('/api/version', (_req, res) => res.json({ version: require('../package.json').version }));
  app.get('/api/templates', (_req, res) => res.json(Object.fromEntries(Object.entries(require('./world').TEMPLATES).map(([k, t]) => [k, t.name]))));
  app.get('/api/assets', (_req, res) => res.json(Object.fromEntries(Object.entries(assets.KINDS).map(([k, v]) => [k, { formats: v.ext, maxMB: v.maxBytes / assets.MB }]))));

  // Co-DM invites, DM only: ?role=codm (atmosphere, default), battle, social or music.
  const inviteRole = (req) => (['battle', 'social', 'music'].includes(req.query.role) ? req.query.role : 'codm');
  app.get('/codm-qr.svg', async (req, res) => {
    if (!dmOnly(req)) return res.sendStatus(403);
    res.type('image/svg+xml').send(await QRCode.toString(codmUrl(inviteRole(req)), { type: 'svg', margin: 1, color: QR_COLORS }));
  });
  app.get('/api/codm-url', (req, res) => {
    if (!dmOnly(req)) return res.sendStatus(403);
    res.json({ url: codmUrl(inviteRole(req)) });
  });
  // The join QR carries the room code, so only the laptop (or a TV opened with ?key=) may fetch it.
  app.get('/qr.svg', async (req, res) => {
    if (!dmOnly(req)) return res.sendStatus(403);
    res.set('cache-control', 'no-store');
    res.type('image/svg+xml').send(await QRCode.toString(joinUrl(state.room), { type: 'svg', margin: 1, color: QR_COLORS }));
  });
  // Short link to type by hand: http://<ip>:3000/j/ABCD
  app.get(['/j/:room', '/join/:room'], (req, res) => res.redirect(`/play?room=${encodeURIComponent(req.params.room.toUpperCase())}`));
  app.get('/api/join-info', (req, res) => (dmOnly(req) ? res.json({ room: state.room, url: joinUrl(state.room) }) : res.sendStatus(403)));
};
