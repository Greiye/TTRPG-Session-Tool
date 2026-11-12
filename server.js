// Tavern Screen: Jackbox-style D&D host. Laptop runs this server, TV shows /screen,
// DM drives /dm, players join /play from phones via QR code on the same Wi-Fi.
// This file only wires modules together; see src/ for the pieces.
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const hub = require('./src/hub');
const { PORT, DM_KEY } = require('./src/config');
const { lanAddress, joinUrl, codmUrl } = require('./src/net');

const app = express();
const server = http.createServer(app);
hub.io = new Server(server);

require('./src/routes')(app);
require('./src/sockets')(hub.io);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Tavern Screen running\n`);
  console.log(`  DM controls : http://localhost:${PORT}/dm`);
  console.log(`  TV screen   : http://localhost:${PORT}/screen`);
  console.log(`  Players     : ${joinUrl()}  (QR on the TV)`);
  console.log(`  Co-DM       : ${codmUrl()}  (QR on the DM page)`);
  console.log(`  Remote DM   : http://${lanAddress()}:${PORT}/dm?key=${DM_KEY}\n`);
});
