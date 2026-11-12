// HTTP routes: pages, uploads, QR codes.
const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { PUBLIC_DIR, UPLOAD_DIR, PORTRAIT_DIR, DM_KEY, CODM_KEY } = require('./config');
const { joinUrl, codmUrl, isLocalAddr } = require('./net');
const { state, broadcast } = require('./state');
const { roster } = require('./roster');
const { MEDIA_TYPES, mediaItem } = require('./media');

const QR_COLORS = { dark: '#1b1420', light: '#f4ead5' };

module.exports = function routes(app) {
  app.use(express.static(PUBLIC_DIR));
  app.get('/', (_req, res) => res.redirect('/dm'));
  for (const page of ['dm', 'screen', 'play', 'codm']) {
    app.get(`/${page}`, (_req, res) => res.sendFile(path.join(PUBLIC_DIR, `${page}.html`)));
  }
  app.use('/uploads', express.static(UPLOAD_DIR));
  const dmOnly = (req) => isLocalAddr(req.socket.remoteAddress) || req.query.key === DM_KEY;

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
    if (!dmOnly(req)) return res.sendStatus(403);
    res.type('image/svg+xml').send(await QRCode.toString(codmUrl(), { type: 'svg', margin: 1, color: QR_COLORS }));
  });
  app.get('/api/codm-url', (req, res) => {
    if (!dmOnly(req)) return res.sendStatus(403);
    res.json({ url: codmUrl() });
  });
  app.get('/qr.svg', async (_req, res) => {
    res.set('cache-control', 'no-store');
    res.type('image/svg+xml').send(await QRCode.toString(joinUrl(state.room), { type: 'svg', margin: 1, color: QR_COLORS }));
  });
  // Short link to type by hand: http://<ip>:3000/j/ABCD
  app.get(['/j/:room', '/join/:room'], (req, res) => res.redirect(`/play?room=${encodeURIComponent(req.params.room.toUpperCase())}`));
  app.get('/api/join-info', (req, res) => (dmOnly(req) ? res.json({ room: state.room, url: joinUrl(state.room) }) : res.sendStatus(403)));
};
