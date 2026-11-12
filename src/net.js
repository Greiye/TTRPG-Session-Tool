// LAN address detection for the join QR code.
const os = require('os');
const { PORT, CODM_KEY } = require('./config');

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
const isLocalAddr = (a) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(a);

module.exports = { lanAddress, joinUrl, codmUrl, isLocalAddr };
