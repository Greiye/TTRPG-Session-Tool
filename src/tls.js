// HTTPS for phones (0g, decided by Mike): browsers only allow the microphone and Chrome speech
// recognition on secure origins, and a phone reaching the laptop by LAN IP isn't one over plain HTTP.
//
// We make a self-signed certificate for this laptop (localhost + every LAN IP) on first start and
// keep it in data/certs/. It's regenerated when the laptop's IPs change or it nears expiry.
// Phones see a one-time "not private" warning; to remove it, install /tavern-cert.crt on the phone
// (README explains), or point HTTPS_CERT / HTTPS_KEY at a certificate you trust (e.g. from mkcert).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('./config');
const { lanAddresses } = require('./net');

const DIR = path.join(DATA_DIR, 'certs');
const CERT = path.join(DIR, 'tavern-cert.pem');
const KEY = path.join(DIR, 'tavern-key.pem');

function wantedNames() {
  const ips = [...new Set(['127.0.0.1', ...lanAddresses().map((a) => a.address), ...(process.env.PUBLIC_HOST ? [process.env.PUBLIC_HOST] : [])])];
  return { ips: ips.filter((h) => /^[\d.]+$/.test(h)), dns: ['localhost', ...(process.env.PUBLIC_HOST && !/^[\d.]+$/.test(process.env.PUBLIC_HOST) ? [process.env.PUBLIC_HOST] : [])] };
}

function stillGood(pem, { ips, dns }) {
  try {
    const x = new crypto.X509Certificate(pem);
    if (new Date(x.validTo) - Date.now() < 30 * 864e5) return false;
    const san = x.subjectAltName || '';
    return ips.every((ip) => san.includes(`IP Address:${ip}`)) && dns.every((d) => san.includes(`DNS:${d}`));
  } catch { return false; }
}

function loadOrCreate() {
  if (process.env.HTTPS_CERT && process.env.HTTPS_KEY) {
    return { cert: fs.readFileSync(process.env.HTTPS_CERT), key: fs.readFileSync(process.env.HTTPS_KEY), custom: true };
  }
  const names = wantedNames();
  if (fs.existsSync(CERT) && fs.existsSync(KEY) && stillGood(fs.readFileSync(CERT), names)) {
    return { cert: fs.readFileSync(CERT), key: fs.readFileSync(KEY) };
  }
  const selfsigned = require('selfsigned');
  const altNames = [...names.dns.map((value) => ({ type: 2, value })), ...names.ips.map((ip) => ({ type: 7, ip }))];
  const pems = selfsigned.generate([{ name: 'commonName', value: 'Tavern Screen (this laptop)' }, { name: 'organizationName', value: 'Tavern Screen' }], {
    days: 825, keySize: 2048, algorithm: 'sha256',
    extensions: [{ name: 'basicConstraints', cA: true }, { name: 'keyUsage', keyCertSign: true, digitalSignature: true, keyEncipherment: true }, { name: 'extKeyUsage', serverAuth: true }, { name: 'subjectAltName', altNames }],
  });
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(KEY, pems.private, { mode: 0o600 });
  fs.writeFileSync(CERT, pems.cert);
  console.log(`  Made a new HTTPS certificate for ${[...names.dns, ...names.ips].join(', ')}`);
  return { cert: pems.cert, key: pems.private };
}

module.exports = { loadOrCreate, CERT };
