// Tavern Screen: Jackbox-style D&D host. Laptop runs this server, TV shows /screen,
// DM drives /dm, players join /play from phones via QR code on the same Wi-Fi.
// This file only wires modules together; see src/ for the pieces.
const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const hub = require('./src/hub');
const { PORT, DM_KEY, HTTPS, HTTPS_PORT } = require('./src/config');
const { baseUrl, joinUrl, codmUrl, isLocalAddr } = require('./src/net');

const app = express();
// Plain HTTP stays for the laptop itself (localhost is already a secure origin) and as a fallback.
// Other devices hitting HTTP pages are sent to HTTPS so the phone mic works.
if (HTTPS) {
  app.use((req, res, next) => {
    if (req.secure || isLocalAddr(req.socket.remoteAddress) || req.method !== 'GET' || !/^\/(play|dm|codm|screen|j\/|join\/)/.test(req.path)) return next();
    res.redirect(`${baseUrl()}${req.originalUrl}`);
  });
}
const servers = [http.createServer(app)];
if (HTTPS) servers.push(https.createServer(require('./src/tls').loadOrCreate(), app));
hub.io = new Server();
for (const s of servers) hub.io.attach(s);

require('./src/routes')(app);
require('./src/sockets')(hub.io);

let ready = 0;
const listening = () => {
  if (++ready < servers.length) return;
  const { state } = require('./src/state');
  console.log(`\n  Tavern Screen running\n`);
  console.log(`  DM controls : http://localhost:${PORT}/dm`);
  console.log(`  TV screen   : http://localhost:${PORT}/screen`);
  console.log(`  Players     : ${joinUrl(state.room)}  (QR on the TV, room ${state.room})`);
  console.log(`  Co-DM       : ${codmUrl()}  (QR on the DM page)`);
  console.log(`  Remote DM   : ${baseUrl()}/dm?key=${DM_KEY}`);
  if (HTTPS) console.log(`  HTTPS       : on, port ${HTTPS_PORT}. Phones show a one-time certificate warning; see README.`);
  console.log('');
};
servers[0].listen(PORT, '0.0.0.0', listening);
if (HTTPS) servers[1].listen(HTTPS_PORT, '0.0.0.0', listening);
