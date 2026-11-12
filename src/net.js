// LAN address detection for the join QR code.
// Prefers private ranges (192.168/10/172.16-31) and skips virtual adapters (Docker, WSL, VPNs, VirtualBox).
const os = require('os');
const { PORT, CODM_KEY, HTTPS, HTTPS_PORT } = require('./config');

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
const codmUrl = () => `${baseUrl()}/codm?key=${CODM_KEY}`;
const isLocalAddr = (a) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(a);

module.exports = { lanAddresses, lanAddress, setHost, baseUrl, joinUrl, codmUrl, isLocalAddr };
