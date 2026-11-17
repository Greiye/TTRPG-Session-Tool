// Session recorder (src/recorder.js) and replay (tools/replay.js): a recorded session plays back on a fresh
// server from the recording's starting state and ends in the same place. Keys never reach the file.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { harness, ROOT } = require('./helpers');
const { parse, replay, remap, learn, bootServer, BOOT_KEYS } = require('../tools/replay');
const h = harness('replay');
const { ok, until } = h;

// Pure helpers.
const m = new Map();
learn([{ id: 'c12', token: 'aaa111', room: 'ABCD', n: 1 }], [{ id: 'c40', token: 'bbb222', room: 'WXYZ', n: 1 }], m);
ok(m.get('c12') === 'c40' && m.get('aaa111') === 'bbb222' && m.get('ABCD') === 'WXYZ', 'replay learns new ids from replies');
ok(JSON.stringify(remap([{ id: 'c12', ids: ['c12', 'x'], votes: { c12: 1 } }], m)) === '[{"id":"c40","ids":["c40","x"],"votes":{"c40":1}}]', 'learned ids are swapped into later events');
let threw = false;
try { parse('{"type":"in"}'); } catch { threw = true; }
ok(threw, 'a file without a header is refused');

(async () => {
  const file = path.join(h.TMP, 'rec.jsonl');
  const srv = await h.boot({ RECORD: file });
  const dmSock = await h.client();
  await h.call(dmSock, 'dm:auth', { key: 'dmkey' });
  const room = await h.room();
  const p = await h.player(room, 'Recorded Rook', 'Rogue');
  ok(p.me?.id, 'a phone joins while recording');
  dmSock.emit('dm:enemy:add', { name: 'Replay Rat', hp: 3, ac: 10 });
  dmSock.emit('dm:mode', { mode: 'combat' });
  dmSock.emit('dm:sheet', { id: p.me.id, gold: 42 });
  p.emit('this:event:does:not:exist', { x: 1 });
  ok(await until(() => dmSock.last?.mode === 'combat' && dmSock.last.combat.enemies.length === 1), 'the recorded table reached combat');
  await h.wait(300);
  await h.stop(srv);

  const text = fs.readFileSync(file, 'utf8');
  const rec = parse(text);
  ok(rec.header.version === 1 && rec.header.room === room, 'the header holds the room and version');
  ok(!text.includes('dmkey'), 'the DM key is not in the recording');
  const ins = rec.records.filter((r) => r.type === 'in').map((r) => r.event);
  ok(['dm:auth', 'join', 'dm:enemy:add', 'dm:mode', 'dm:sheet'].every((e) => ins.includes(e)), 'inputs are recorded in order');
  ok(rec.records.some((r) => r.type === 'ack' && r.event === 'join' && r.reply[0].id === p.me.id), 'ack replies are recorded');
  ok(rec.records.some((r) => r.type === 'log' && /Recorded Rook/.test(r.text)), 'log lines are recorded');
  ok(rec.records.some((r) => r.type === 'ack' && r.event === 'dm:auth' && r.reply[0].role === 'dm' && !('key' in r.reply[0])), 'sign-ins record the role, not the key');

  // Replay on a throwaway server started from the header (a different room code, fresh ids).
  const tmp = path.join(h.TMP, 'replay');
  const boot = await bootServer(rec.header, tmp);
  const { summary, final } = await replay(rec, { url: boot.url, keys: BOOT_KEYS, say: () => {} });
  ok(summary.sent === ins.length, 'every recorded event is sent');
  ok(summary.mismatches.length === 0, `replies match the recording (${JSON.stringify(summary.mismatches)})`);
  const rook = final?.players.find((x) => x.name === 'Recorded Rook');
  ok(final?.mode === 'combat' && final.combat.enemies.some((e) => e.name === 'Replay Rat'), 'the replay ends in combat with the same creature');
  ok(rook && rook.gold === 42, 'an event that used the recorded character id reached the new character');
  await new Promise((r) => { boot.p.on('exit', r); boot.p.kill(); });

  // The CLI: --boot --until stops early and cleans up.
  const out = execFileSync(process.execPath, ['tools/replay.js', file, '--boot', '--until', '2'], { cwd: ROOT, encoding: 'utf8' });
  ok(/Replaying 2 of/.test(out) && /Sent 2 events/.test(out), 'the CLI replays up to --until');
  h.done();
})();
