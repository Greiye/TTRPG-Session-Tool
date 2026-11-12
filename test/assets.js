// Upload pipeline: limits, sniffing, auth, WebM portrait re-encode.
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const PORT = 3700 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tavern-as-'));
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, HTTPS_PORT: PORT + 1000, DATA_DIR: TMP + '/d', UPLOAD_DIR: TMP + '/u' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => srv.stdout.on('data', (d) => /running/.test(d) && r()));
  const post = (url, body, type, headers = {}) => fetch(B + url, { method: 'POST', body, headers: { 'content-type': type, ...headers } });
  let r = await post('/api/assets/map?name=Cave', png, 'image/png');
  assert.strictEqual(r.status, 200); const m = await r.json();
  assert(m.url.startsWith('/uploads/maps/') && fs.existsSync(path.join(TMP, 'u/maps', m.file)));
  const g = await fetch(B + m.url);
  assert(/immutable/.test(g.headers.get('cache-control')), 'immutable cache header');
  r = await post('/api/assets/map', Buffer.from('MZ not a png at all'), 'image/png');
  assert.strictEqual(r.status, 415, 'sniff rejects fake PNG');
  r = await post('/api/assets/map', png, 'audio/mpeg');
  assert.strictEqual(r.status, 415, 'wrong format for kind');
  r = await post('/api/assets/nope', png, 'image/png');
  assert.strictEqual(r.status, 404);
  r = await post('/api/assets/backdrop', Buffer.alloc(61 * 1024 * 1024, 1), 'image/png');
  assert.strictEqual(r.status, 413, 'size limit');
  if (spawnSync('ffmpeg', ['-version']).status === 0) {
    const src = path.join(TMP, 'in.webm');
    spawnSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=24', '-t', '1', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', src]);
    r = await post('/api/assets/creature?name=Wolf', fs.readFileSync(src), 'video/webm');
    assert.strictEqual(r.status, 200);
    const w = await r.json();
    const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path.join(TMP, 'u/creatures', w.file)]).stdout.toString().trim();
    assert.strictEqual(probe, '384,384', 'webm re-encoded to 384x384');
  }
  await new Promise((res) => { srv.on('exit', res); srv.kill(); });
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log('assets: all passed');
})().catch((e) => { console.error(e); process.exit(1); });
