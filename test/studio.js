// Studio review additions (Nov 16): crash safety net, port message, game-night check, placeholder art,
// playtest bots. Usage: node test/studio.js
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { io } = require('socket.io-client');

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tavern-studio-'));
let PORT; do PORT = 4100 + Math.floor(Math.random() * 400); while (PORT === 4190); // 4190 is on fetch's blocked-port list
const URL = `http://127.0.0.1:${PORT}`;
const ENV = { ...process.env, LOBBY: '0', TEST_MODE: '0', PORT, HTTPS_PORT: PORT + 1000, DATA_DIR: path.join(TMP, 'data'), UPLOAD_DIR: path.join(TMP, 'uploads'), DM_KEY: 'dmkey' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ok  ' : '  FAIL'} ${msg}`); if (!cond) failures++; };
const until = async (fn, ms = 4000) => { for (let t = 0; t < ms; t += 50) { if (fn()) return true; await wait(50); } return false; };

function boot(env = ENV) {
  const p = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  p.out = '';
  p.stdout.on('data', (d) => { p.out += d; });
  p.stderr.on('data', (d) => { p.out += d; });
  return p;
}

(async () => {
  // ----- safety net -----
  {
    const { install, portError } = require('../src/safety');
    const proc = new EventEmitter();
    const lines = [];
    let flushed = 0;
    install(proc, { log: (m) => lines.push(m), flush: () => { flushed++; } });
    proc.emit('unhandledRejection', new Error('wiki push timed out'));
    proc.emit('unhandledRejection', new Error('wiki push timed out'));
    proc.emit('uncaughtException', new Error('timer blew up'));
    ok(lines.length === 2, 'a background error is logged once per message');
    ok(/keeps running/.test(lines[0]), 'the log says the game keeps running');
    ok(flushed === 3, 'every error saves the campaign right away');
    install(proc, { log: () => {}, flush: () => { throw new Error('disk full'); } });
    let threw = false;
    try { proc.emit('uncaughtException', new Error('again')); } catch { threw = true; }
    ok(!threw, 'a failed save inside the safety net does not throw');
    ok(/already in use/.test(portError({ code: 'EADDRINUSE' }, 3000)), 'a taken port gets a plain message');
    ok(portError({ code: 'ENOENT' }, 3000) === null, 'other errors are not hidden');
  }

  // ----- a taken port -----
  {
    const blocker = net.createServer().listen(PORT, '0.0.0.0');
    await new Promise((r) => blocker.once('listening', r));
    const p = boot();
    const code = await new Promise((r) => p.on('exit', r));
    ok(code === 1 && /already in use/.test(p.out) && !/at Server/.test(p.out), 'starting twice says the port is in use, without a stack trace');
    blocker.close();
    await wait(100);
  }

  // ----- game-night check -----
  {
    const run = (env) => new Promise((res) => {
      const p = spawn(process.execPath, ['tools/doctor.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      p.stdout.on('data', (d) => { out += d; });
      p.on('exit', (code) => res({ code, out }));
    });
    const a = await run(ENV);
    ok(/Data folder\s+.*can be written/.test(a.out) && /Game port\s+\d+ is free/.test(a.out), 'doctor checks folders and ports');
    const blocker = net.createServer().listen(PORT, '0.0.0.0');
    await new Promise((r) => blocker.once('listening', r));
    const b = await run(ENV);
    ok(b.code === 1 && /is in use/.test(b.out), 'doctor fails when the game port is taken');
    blocker.close();
    await wait(100);
  }

  // ----- placeholder art -----
  const gen = require('../tools/make-placeholders');
  {
    const files = fs.readdirSync(gen.OUT).filter((f) => f.endsWith('.svg'));
    ok(files.length === gen.PORTRAITS.length + gen.TOKENS.length + Object.keys(gen.BACKDROPS).length, 'every placeholder is on disk');
    ok(files.every((f) => f.startsWith('placeholder-')), 'placeholder file names start with placeholder-');
    ok(files.every((f) => fs.readFileSync(path.join(gen.OUT, f), 'utf8').includes('PLACEHOLDER')), 'every placeholder image says PLACEHOLDER');
    ok(files.every((f) => !/#[0-9a-f]{3,8}\b/i.test(fs.readFileSync(path.join(gen.OUT, f), 'utf8'))), 'placeholders use named hsl colours, no hex codes');
    const { PARTY } = require('../src/testparty');
    ok(PARTY.every((d) => files.includes(`placeholder-portrait-${d.cls.toLowerCase()}.svg`)), 'every test party class has a placeholder portrait');
    ok(fs.existsSync(path.join(gen.OUT, 'README.md')), 'the placeholder folder has a README');
  }

  // ----- server: placeholders in use, playtest bots -----
  const srv = boot();
  await until(() => /running/.test(srv.out));
  const dm = io(URL, { transports: ['websocket'], forceNew: true });
  dm.on('state', (s) => { dm.last = s; });
  await new Promise((r) => dm.on('connect', r));
  await new Promise((r) => dm.emit('dm:auth', {}, r));
  await until(() => dm.last);
  const r = await fetch(`${URL}/samples/placeholders/placeholder-backdrop-combat-arena.svg`);
  ok(r.ok && /svg/.test(r.headers.get('content-type')), 'placeholder backdrops are served');
  const { SAMPLE_BACKDROPS, defaultBackdrop } = require('../src/media');
  ok(['explore-road', 'combat-arena', 'social-tavern'].every((k) => SAMPLE_BACKDROPS.some((b) => b.id === `placeholder-${k}` && b.name.startsWith('[Placeholder]'))), 'one placeholder backdrop per pillar is in the library');
  ok(defaultBackdrop(SAMPLE_BACKDROPS).id === 'sample-artheria-village', 'the Artheria village stays the default backdrop');

  dm.emit('dm:testparty');
  await until(() => Object.keys(dm.last.players || {}).length >= 12 || (dm.last.players || []).length >= 12);
  const party = Array.isArray(dm.last.players) ? dm.last.players : Object.values(dm.last.players || {});
  ok(party.filter((p) => p.name.startsWith('[Test]')).every((p) => /placeholder-portrait-/.test(p.portrait || '')), 'the test party gets placeholder portraits');

  const { bot } = require('../tools/playtest-bots');
  const room = (await fetch(`${URL}/api/join-info`).then((x) => x.json())).room;
  const bots = [bot(URL, room, 0, () => {}), bot(URL, room, 1, () => {})];
  const botIds = () => (Array.isArray(dm.last.players) ? dm.last.players : []).filter((p) => p.name.startsWith('[Bot]')).map((p) => p.id);
  ok(await until(() => botIds().length === 2), 'two playtest bots join the party');
  dm.emit('dm:check', { skill: 'Perception', dc: 5 });
  ok(await until(() => botIds().every((id) => dm.last.check?.results?.[id]), 6000), 'bots answer a roll call');
  // Group Map View (Nov 18): once one bot asks for the map, the other joins and the TV shows it.
  const tvWas = !!dm.last.worldMap?.onTv;
  bots[0].emit('player:mapview', { on: true });
  ok(await until(() => !!dm.last.worldMap?.onTv !== tvWas, 6000), 'bots vote for the Group Map View');

  for (const b of bots) b.close();
  dm.close();
  srv.kill();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
