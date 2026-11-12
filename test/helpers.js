// Shared test harness: boot the server on a temp data dir and drive it over Socket.IO.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { io } = require('socket.io-client');

const ROOT = path.join(__dirname, '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function harness(name) {
  const PORT = 4200 + Math.floor(Math.random() * 1500);
  const URL = `http://127.0.0.1:${PORT}`;
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), `tavern-${name}-`));
  let failures = 0;
  const sockets = [];
  const h = {
    PORT, URL, TMP, wait,
    ok(cond, msg) { console.log(`${cond ? '  ok  ' : '  FAIL'} ${msg}`); if (!cond) failures++; },
    boot(env = {}) {
      const p = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT, DATA_DIR: path.join(TMP, 'data'), UPLOAD_DIR: path.join(TMP, 'uploads'), DM_KEY: 'dmkey', CODM_KEY: 'codmkey', HTTPS: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
      p.stderr.on('data', (d) => process.stderr.write(d));
      return new Promise((res) => p.stdout.on('data', (d) => { if (/running/.test(d)) res(p); }));
    },
    client() {
      const s = io(URL, { transports: ['websocket'], forceNew: true });
      sockets.push(s);
      s.last = null;
      s.on('state', (st) => { s.last = st; });
      return new Promise((res) => s.on('connect', () => res(s)));
    },
    call: (s, ev, data) => new Promise((res) => s.emit(ev, data, res)),
    stop: (p) => new Promise((res) => { p.on('exit', res); p.kill(); }),
    async dm() { const s = await h.client(); await h.call(s, 'dm:auth', {}); return s; },
    async room() { return (await (await fetch(`${URL}/api/join-info`)).json()).room; },
    async player(room, name, cls = 'Fighter') { const s = await h.client(); s.me = await h.call(s, 'join', { name, cls, room }); return s; },
    // Wait until fn() is truthy (state updates are async); returns the value or false on timeout.
    async until(fn, ms = 2000) { const end = Date.now() + ms; for (;;) { let v; try { v = fn(); } catch { v = false; } if (v) return v; if (Date.now() > end) return false; await wait(25); } },
    async done(srv) {
      for (const s of sockets) s.close();
      if (srv) await h.stop(srv);
      fs.rmSync(TMP, { recursive: true, force: true });
      console.log(failures ? `\n${name}: ${failures} failing` : `${name}: all passed`);
      process.exit(failures ? 1 : 0);
    },
  };
  return h;
}
module.exports = { harness, wait, ROOT };
