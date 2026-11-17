// Session replay (test tool): plays a recording from src/recorder.js back against a server, to reproduce a bug.
// Each recorded client gets its own socket. Events are sent in order; an event that had an ack waits for its
// reply. Ids the server hands out (character ids, seat tokens, the room code) are learned from the replies and
// swapped into later events, so a replay works on a server with a different room code or fresh ids.
//
// Usage: npm run replay -- <file>                       against the game on http://localhost:3000
//        npm run replay -- <file> --url http://127.0.0.1:3123 --key <DM key>
//        npm run replay -- <file> --boot                start a throwaway server from the recording's header
//                                                       (the campaign as it was when recording began)
//        --keep          with --boot: leave that server running afterwards to look at it (Ctrl+C stops it)
//        --realtime      keep the recorded gaps between events (default: as fast as acks allow)
//        --until <n>     stop after the n-th recorded event (to find the event that breaks things)
//        --verbose       print every event and the recorded log lines
// --boot never touches data/: the throwaway server lives in a temp folder that is removed afterwards.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { io } = require('socket.io-client');

const ROOT = path.join(__dirname, '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BOOT_KEYS = { dm: 'replay-dm', battle: 'replay-battle', social: 'replay-social', music: 'replay-music' };

function parse(text) {
  const lines = String(text).split(/\r?\n/).filter(Boolean).map((l, i) => {
    try { return JSON.parse(l); } catch { throw new Error(`Line ${i + 1} is not JSON.`); }
  });
  const header = lines[0]?.type === 'header' ? lines.shift() : null;
  if (!header) throw new Error('Not a session recording (no header line).');
  return { header, records: lines };
}

// Swap learned ids into a payload: exact string matches only.
function remap(v, map) {
  if (typeof v === 'string') return map.has(v) ? map.get(v) : v;
  if (Array.isArray(v)) return v.map((x) => remap(x, map));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [map.has(k) ? map.get(k) : k, remap(x, map)]));
  return v;
}
// Learn old -> new from a recorded reply and the live one: same path, different string.
function learn(old, now, map) {
  if (typeof old === 'string' && typeof now === 'string') { if (old !== now && old.length >= 3) map.set(old, now); return; }
  if (!old || !now || typeof old !== 'object' || typeof now !== 'object') return;
  for (const k of Object.keys(old)) learn(old[k], now[k], map);
}

function bootServer(header, dir) {
  const data = path.join(dir, 'data');
  fs.mkdirSync(data, { recursive: true });
  if (header.files?.campaign) fs.writeFileSync(path.join(data, 'campaign.json'), JSON.stringify(header.files.campaign));
  if (header.files?.characters) fs.writeFileSync(path.join(data, 'characters.json'), JSON.stringify(header.files.characters));
  let port;
  do port = 4800 + Math.floor(Math.random() * 1000); while (port === 5060 || port === 5061);
  const env = { ...process.env, PORT: port, HTTPS: '0', DATA_DIR: data, UPLOAD_DIR: path.join(dir, 'uploads'),
    DM_KEY: BOOT_KEYS.dm, CODM_KEY: 'replay-codm', BATTLE_KEY: BOOT_KEYS.battle, SOCIAL_KEY: BOOT_KEYS.social, MUSIC_KEY: BOOT_KEYS.music };
  delete env.RECORD;
  const p = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const failures = [];
  const seen = (d) => { for (const m of String(d).matchAll(/Event "([^"]+)" failed and was ignored: (.*)/g)) failures.push({ event: m[1], message: m[2] }); };
  p.stderr.on('data', seen);
  return new Promise((res, rej) => {
    let out = '';
    p.stdout.on('data', (d) => { seen(d); out += d; if (/running/.test(out)) res({ p, url: `http://127.0.0.1:${port}`, failures }); });
    p.on('exit', (code) => rej(new Error(`Replay server exited (${code}).`)));
  });
}

// Play the records against url. Returns a summary and the final state the DM sees.
async function replay({ header, records }, { url, keys = {}, realtime = false, until = Infinity, verbose = false, say = console.log }) {
  const map = new Map();
  const info = await fetch(`${url}/api/join-info`).then((r) => r.json()).catch(() => null);
  if (!info) throw new Error(`No game found at ${url}. Start it first, or use --boot.`);
  if (header.room && info.room) map.set(header.room, info.room);
  const sockets = new Map();
  const open = (sid) => {
    if (sockets.has(sid)) return sockets.get(sid);
    const s = io(url, { transports: ['websocket'], forceNew: true, rejectUnauthorized: false });
    const ready = new Promise((res, rej) => { s.on('connect', res); s.on('connect_error', rej); });
    const entry = { s, ready };
    sockets.set(sid, entry);
    return entry;
  };
  const acks = new Map(records.filter((r) => r.type === 'ack').map((r) => [r.n, r.reply]));
  const summary = { sent: 0, mismatches: [], recordedErrors: records.filter((r) => r.type === 'error') };
  let prevT = 0;
  for (const r of records) {
    if (r.type === 'in' && r.n > until) break;
    if (realtime && r.t > prevT) await wait(Math.min(r.t - prevT, 30000));
    prevT = r.t;
    if (r.type === 'connect') { await open(r.sid).ready; continue; }
    if (r.type === 'disconnect') { sockets.get(r.sid)?.s.close(); sockets.delete(r.sid); continue; }
    if (r.type === 'log') { if (verbose) say(`      log  ${r.kind}: ${r.text}`); continue; }
    if (r.type === 'error') { say(`  recorded failure in "${r.event}": ${r.message}`); continue; }
    if (r.type !== 'in') continue;
    const { s, ready } = open(r.sid);
    await ready;
    let args = remap(r.args || [], map);
    // A recorded sign-in carries "<key>": sign in with the key for the role the recording got.
    const recorded = acks.get(r.n);
    if (r.event === 'dm:auth') {
      const role = recorded?.[0]?.role;
      args = [{ key: role ? keys[role] || keys.dm : undefined }];
    }
    summary.sent++;
    if (verbose) say(`  #${r.n} ${r.event} ${JSON.stringify(args[0] ?? '').slice(0, 120)}`);
    if (!r.ack) { s.emit(r.event, ...args); await wait(realtime ? 0 : 15); continue; }
    const reply = await Promise.race([new Promise((res) => s.emit(r.event, ...args, (...x) => res(x))), wait(4000).then(() => null)]);
    if (!reply) { summary.mismatches.push({ n: r.n, event: r.event, why: 'no reply' }); continue; }
    if (recorded) {
      learn(recorded, reply, map);
      const was = recorded[0]?.error;
      const now = reply[0]?.error;
      if (r.event === 'dm:auth' ? recorded[0]?.role !== reply[0]?.role : !!was !== !!now) summary.mismatches.push({ n: r.n, event: r.event, recorded: recorded[0], replayed: r.event === 'dm:auth' ? { ok: reply[0]?.ok, role: reply[0]?.role } : reply[0] });
    }
  }
  // Let the last events settle, then read what the DM sees.
  await wait(300);
  const watcher = io(url, { transports: ['websocket'], forceNew: true, rejectUnauthorized: false });
  const final = await new Promise((res) => {
    watcher.on('connect', () => watcher.emit('dm:auth', { key: keys.dm }, () => {}));
    let t = null;
    watcher.on('state', (st) => { clearTimeout(t); t = setTimeout(() => res(st), 150); });
    setTimeout(() => res(null), 3000);
  });
  watcher.close();
  for (const { s } of sockets.values()) s.close();
  return { summary, final };
}

function args(argv) {
  const a = { file: null, url: null, key: null, boot: false, keep: false, realtime: false, until: Infinity, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--url') a.url = argv[++i];
    else if (v === '--key') a.key = argv[++i];
    else if (v === '--boot') a.boot = true;
    else if (v === '--keep') a.keep = true;
    else if (v === '--realtime') a.realtime = true;
    else if (v === '--verbose') a.verbose = true;
    else if (v === '--until') a.until = Number(argv[++i]) || Infinity;
    else if (!v.startsWith('--')) a.file = v;
  }
  return a;
}

async function main() {
  const a = args(process.argv.slice(2));
  if (!a.file) { console.error('  Usage: npm run replay -- <recording.jsonl> [--boot] [--url URL --key DMKEY]'); process.exit(1); }
  const rec = parse(fs.readFileSync(a.file, 'utf8'));
  const inputs = rec.records.filter((r) => r.type === 'in').length;
  let srv = null;
  let tmp = null;
  let url = a.url || `http://localhost:${process.env.PORT || 3000}`;
  let keys = { dm: a.key || undefined };
  if (a.boot) {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tavern-replay-'));
    srv = await bootServer(rec.header, tmp);
    url = srv.url;
    keys = BOOT_KEYS;
    console.log(`  Throwaway server from the recording's starting state: ${url}/dm?key=${BOOT_KEYS.dm}`);
  }
  console.log(`  Replaying ${Math.min(inputs, a.until)} of ${inputs} events from ${path.basename(a.file)} (recorded ${rec.header.startedAt})`);
  try {
    const { summary, final } = await replay(rec, { url, keys, realtime: a.realtime, until: a.until, verbose: a.verbose });
    console.log(`  Sent ${summary.sent} events.`);
    for (const m of summary.mismatches) console.log(`  Differs at #${m.n} ${m.event}: recorded ${JSON.stringify(m.recorded ?? null)}, now ${JSON.stringify(m.replayed ?? m.why)}`);
    if (srv) for (const f of srv.failures) console.log(`  Server failure in "${f.event}": ${f.message}`);
    if (final) console.log(`  Now: mode ${final.mode}, ${final.players.length} at the table, ${final.combat.enemies.length} creatures, round ${final.combat.round}.`);
    if (srv && a.keep) {
      console.log('  Server left running. Ctrl+C stops it.');
      await new Promise((res) => process.once('SIGINT', res));
    }
  } finally {
    if (srv) await new Promise((r) => { srv.p.on('exit', r); srv.p.kill(); });
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (require.main === module) main().catch((e) => { console.error(`  ${e.message}`); process.exit(1); });
module.exports = { parse, replay, remap, learn, bootServer, BOOT_KEYS };
