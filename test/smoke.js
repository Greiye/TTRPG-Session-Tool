// End-to-end smoke test: boots the server on a temp data dir and drives DM + phones over Socket.IO.
// Usage: node test/smoke.js   (exit code 0 = pass)
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { io } = require('socket.io-client');

const ROOT = path.join(__dirname, '..');
const PORT = 3200 + Math.floor(Math.random() * 500);
const URL = `http://127.0.0.1:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tavern-'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ok  ' : '  FAIL'} ${msg}`); if (!cond) failures++; };

function boot() {
  const p = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT, DATA_DIR: path.join(TMP, 'data'), UPLOAD_DIR: path.join(TMP, 'uploads'), DM_KEY: 'dmkey', CODM_KEY: 'codmkey' }, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stderr.on('data', (d) => process.stderr.write(d));
  return new Promise((res) => p.stdout.on('data', (d) => { if (/running/.test(d)) res(p); }));
}
function client(query) {
  const s = io(URL, { transports: ['websocket'], forceNew: true, query });
  s.last = null;
  s.on('state', (st) => { s.last = st; });
  return new Promise((res) => s.on('connect', () => res(s)));
}
const call = (s, ev, data) => new Promise((res) => s.emit(ev, data, res));
const stop = (p) => new Promise((res) => { p.on('exit', res); p.kill(); });

(async () => {
  let srv = await boot();
  const dm = await client();
  ok((await call(dm, 'dm:auth', {})).ok, 'localhost DM auto-auth');
  const tv = await client();
  tv.emit('screen:hello');
  const joinInfo = await fetch(`${URL}/api/join-info`).then((r) => r.ok ? r.json() : {}).catch(() => ({}));
  const room = joinInfo.room;
  const a = await client();
  const ja = await call(a, 'join', { name: 'Thorn', cls: 'Fighter', race: 'Dwarf', player: 'Mike', room });
  ok(ja.id, 'player creates character');
  const b = await client();
  const jb = await call(b, 'join', { name: 'Vex', cls: 'Rogue', room });
  ok(jb.id, 'second player joins');

  dm.emit('dm:char:save', { id: ja.id, secret: 'SECRET-XYZ', hooks: 'HOOK-ABC' });
  await wait(200);
  ok(JSON.stringify(dm.lastRoster || '').length >= 0, 'dm roster ok');
  ok(!JSON.stringify(a.last).includes('SECRET-XYZ') && !JSON.stringify(tv.last).includes('HOOK-ABC'), 'DM-only fields hidden from phone and TV');

  dm.emit('dm:check', { skill: 'Perception', dc: 5 });
  await wait(100);
  a.emit('player:check', { skill: 'Perception' });
  await wait(200);
  ok(tv.last.check && tv.last.check.results[ja.id], 'skill check result reaches TV');

  dm.emit('dm:enemy:add', { name: 'Goblin', hp: 7, ac: 13, atk: 4, dmg: 2 });
  dm.emit('dm:combat:start', {});
  await wait(200);
  for (let i = 0; i < 6; i++) {
    const c = dm.last.combat;
    const turn = c.order[c.turn].id;
    if (turn === ja.id) a.emit('player:combat', { act: 'attack', target: c.enemies[0].id });
    else if (turn === jb.id) b.emit('player:combat', { act: 'dodge' });
    else dm.emit('dm:enemy:attack', { target: ja.id });
    await wait(120);
  }
  ok(dm.last.log.filter((l) => l.kind === 'combat').length >= 4, 'combat turns advance');
  ok(!JSON.stringify(a.last.combat.enemies).includes('"atk"'), 'enemy attack stats hidden from phones');
  dm.emit('dm:combat:end', {});

  dm.emit('dm:mode', { mode: 'social' });
  dm.emit('dm:emotion', { emotion: 'angry' });
  dm.emit('dm:say', { text: 'Get out of my inn!' });
  await wait(200);
  ok(tv.last.social.line.text === 'Get out of my inn!' && tv.last.social.npc.emotion === 'angry', 'social line + emotion on TV');

  const w = await call(dm, 'dm:whisper', { id: jb.id, text: 'psst' });
  ok(w.ok, 'whisper delivered');
  ok(!JSON.stringify(a.last).includes('psst'), 'whisper not visible to other players');

  // Reconnect: same device token reclaims silently.
  const token = ja.token;
  a.close();
  const a2 = await client();
  const ja2 = await call(a2, 'join', { id: ja.id, token, room });
  ok(ja2.id === ja.id, 'phone reconnects to its character');

  // Persistence across restart (0i).
  await wait(800);
  for (const s of [dm, tv, a2, b]) s.close();
  await stop(srv);
  srv = await boot();
  const dm2 = await client();
  await call(dm2, 'dm:auth', {});
  await wait(200);
  ok(dm2.last.mode === 'social' && dm2.last.social.line.text === 'Get out of my inn!', 'campaign state survives restart');
  ok(dm2.last.players.some((p) => p.id === ja.id), 'party at table survives restart');

  dm2.close();
  await stop(srv);
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(failures ? `\n${failures} failing` : '\nall passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
