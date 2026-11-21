// LAN address detection for the join QR code.
// Prefers private ranges (192.168/10/172.16-31) and skips virtual adapters (Docker, WSL, VPNs, VirtualBox).
const os = require('os');
const { PORT, CODM_KEY, BATTLE_KEY, SOCIAL_KEY, MUSIC_KEY, HTTPS, HTTPS_PORT } = require('./config');

const VIRTUAL = /^(docker|br-|veth|vbox|vmnet|virbr|vEthernet|utun|tun|tap|zt|tailscale|wg|lo)/i;
const privateRank = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3);

function lanAddresses() {
  const out = [];
  for (const [name, ifaces] of Object.entries(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family !== 'IPv4' || i.internal || i.address.startsWith('169.254.')) continue;
      out.push({ name, address: i.address, virtual: VIRTUAL.test(name) });
    }
  }
  return out.sort((a, b) => a.virtual - b.virtual || privateRank(a.address) - privateRank(b.address));
}

let chosenHost = null; // DM override from the UI, persisted in state.settings.host
const setHost = (h) => { chosenHost = h || null; };
function lanAddress() {
  if (process.env.PUBLIC_HOST) return process.env.PUBLIC_HOST;
  if (chosenHost) return chosenHost;
  return lanAddresses()[0]?.address || 'localhost';
}
// Phones get the HTTPS address when it's on, so their mic works later (item 13).
const baseUrl = () => (HTTPS ? `https://${lanAddress()}:${HTTPS_PORT}` : `http://${lanAddress()}:${PORT}`);
const joinUrl = (room) => `${baseUrl()}/play${room ? `?room=${room}` : ''}`;
// Co-DM invite links: all four open the DM page with their key.
const codmUrl = (role = 'codm') => (role === 'battle' ? `${baseUrl()}/dm?key=${BATTLE_KEY}`
  : role === 'social' ? `${baseUrl()}/dm?key=${SOCIAL_KEY}`
  : role === 'music' ? `${baseUrl()}/dm?key=${MUSIC_KEY}` : `${baseUrl()}/dm?key=${CODM_KEY}`); // the co-DM is a second DM
const isLocalAddr = (a) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(a);

// Does anything already answer on this port on the laptop itself (IPv4 or IPv6 loopback)?
function portAnswers(port, timeoutMs = 400) {
  const probe = (host) => new Promise((res) => {
    const s = require('net').connect({ port, host });
    const done = (v) => { s.destroy(); res(v); };
    s.setTimeout(timeoutMs, () => done(false));
    s.once('connect', () => done(true)).once('error', () => done(false));
  });
  return Promise.all([probe('127.0.0.1'), probe('::1')]).then((r) => r.some(Boolean));
}

// Listen on every address, IPv6 and IPv4 together ('::'). Windows lets two programs share a port when they
// bind different wildcards (0.0.0.0 vs ::), so the game used to start beside another app and the browser's
// localhost reached that app ("Cannot GET /dm"). So first check that nothing answers on the port.
// Falls back to 0.0.0.0 only on a computer without IPv6.
function listenAll(server, port, onReady, onError) {
  portAnswers(port).then((taken) => {
    if (taken) return onError(Object.assign(new Error(`port ${port} in use`), { code: 'EADDRINUSE' }));
    attempt('::');
  });
  const attempt = (host) => {
    const fail = (e) => {
      server.off('listening', ready);
      if (host === '::' && ['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(e.code)) attempt('0.0.0.0');
      else onError(e);
    };
    const ready = () => { server.off('error', fail); onReady(); };
    server.once('error', fail).once('listening', ready);
    server.listen(port, host);
  };
}

module.exports = { lanAddresses, lanAddress, setHost, baseUrl, joinUrl, codmUrl, isLocalAddr, listenAll };
