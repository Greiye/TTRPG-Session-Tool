// Game-night preflight (studio review, Nov 16). Run before friends arrive: npm run doctor
// Checks what usually goes wrong at the table, without starting the game: Node version, the data and
// upload folders can be written, both ports are free, the laptop has a Wi-Fi address phones can reach,
// the HTTPS certificate, free disk space and the latest save. Exit code 0 means ready to play.
const fs = require('fs');
const net = require('net');
const path = require('path');

async function checks() {
  const cfg = require('../src/config');
  const { lanAddresses, listenAll } = require('../src/net');
  const out = [];
  const add = (ok, label, detail, warnOnly = false) => out.push({ ok, warn: !ok && warnOnly, label, detail });

  const major = Number(process.versions.node.split('.')[0]);
  add(major >= 20, 'Node version', `${process.versions.node}${major >= 20 ? '' : ' (needs 20 or newer)'}`);

  for (const [label, dir] of [['Data folder', cfg.DATA_DIR], ['Uploads folder', cfg.UPLOAD_DIR]]) {
    const probe = path.join(dir, `.doctor-${process.pid}`);
    try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(probe, 'ok'); fs.unlinkSync(probe); add(true, label, `${dir} can be written`); } catch (e) { add(false, label, `${dir} cannot be written (${e.code || e.message})`); }
  }

  // Same bind as the game (src/net.js listenAll), so an app on the IPv6 side of the port counts as taken.
  const free = (port) => new Promise((res) => {
    const s = net.createServer();
    listenAll(s, port, () => s.close(() => res(null)), (e) => res(e.code));
  });
  const ports = [['Game port', cfg.PORT]];
  if (cfg.HTTPS) ports.push(['Phone port (HTTPS)', cfg.HTTPS_PORT]);
  for (const [label, port] of ports) {
    const err = await free(port);
    add(!err, label, err === 'EADDRINUSE' ? `${port} is in use (is the game already running?)` : err ? `${port}: ${err}` : `${port} is free`);
  }

  const lan = lanAddresses().filter((a) => !a.virtual);
  add(lan.length > 0 || !!process.env.PUBLIC_HOST, 'Wi-Fi address', lan.length ? `phones join at ${lan[0].address}${lan.length > 1 ? ` (also ${lan.slice(1).map((a) => a.address).join(', ')})` : ''}` : 'no network found: connect the laptop to the same Wi-Fi as the phones');

  if (cfg.HTTPS) {
    const { CERT } = require('../src/tls');
    let detail = 'made on first start (phones see a one-time warning)';
    let ok = true;
    if (fs.existsSync(CERT)) {
      try {
        const days = Math.floor((new Date(new (require('crypto').X509Certificate)(fs.readFileSync(CERT)).validTo) - Date.now()) / 864e5);
        ok = days > 14;
        detail = ok ? `valid for ${days} more days` : `expires in ${days} days: delete ${CERT} and start the game to make a new one`;
      } catch { ok = false; detail = `could not read ${CERT}`; }
    }
    add(ok, 'HTTPS certificate', detail, true);
  }

  try {
    const st = fs.statfsSync(cfg.DATA_DIR);
    const gb = (st.bavail * st.bsize) / 1024 ** 3;
    add(gb >= 1, 'Free disk', `${gb.toFixed(1)} GB${gb >= 1 ? '' : ' (low: saves and recordings may fail)'}`, true);
  } catch { /* statfs is missing on very old Node; skip */ }

  const camp = path.join(cfg.DATA_DIR, 'campaign.json');
  if (fs.existsSync(camp)) {
    try {
      const c = JSON.parse(fs.readFileSync(camp, 'utf8'));
      add(true, 'Campaign', `last saved ${c.savedAt || 'unknown'}, ${(c.party || []).length} in the party, scene "${c.scene?.title || 'untitled'}"`);
    } catch (e) { add(false, 'Campaign', `campaign.json cannot be read (${e.message}); the game keeps a copy and starts fresh`, true); }
  } else add(true, 'Campaign', 'none yet: a fresh table starts on the example world');
  return out;
}

async function main() {
  const list = await checks();
  console.log('\n  Game night check\n');
  for (const c of list) console.log(`  ${c.ok ? 'ok  ' : c.warn ? 'warn' : 'FAIL'}  ${c.label.padEnd(20)} ${c.detail}`);
  const bad = list.filter((c) => !c.ok && !c.warn).length;
  console.log(bad ? `\n  ${bad} problem${bad > 1 ? 's' : ''} to fix before playing.\n` : '\n  Ready to play. Start with npm start.\n');
  process.exitCode = bad ? 1 : 0;
}

if (require.main === module) main();
module.exports = { checks };
