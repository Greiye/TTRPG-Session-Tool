// Session recorder (test tool, off unless asked for): writes every socket event the server receives, with its
// ack reply, plus connects, disconnects, failed handlers and log lines, to a JSON Lines file. tools/replay.js plays
// a recording back against a server to reproduce a bug.
//
// Turn it on with `npm run record` (node server.js --record) or RECORD=1; RECORD=<path> picks the file.
// The default file is recordings/session-<time>.jsonl. The first line is a header holding the campaign and
// roster files as they were when recording started, so a replay can start from the same table.
// DM and helper keys are never written: they show as "<key>", and the ack carries the role instead.
const fs = require('fs');
const path = require('path');
const config = require('./config');

const VERSION = 1;
const MAX_STR = 200000; // a pasted picture as a data URL is cut, not stored whole
const RESERVED = new Set(['disconnect', 'disconnecting', 'error']);
let file = null;
let t0 = 0;
let keys = [];

const wanted = () => process.argv.includes('--record') || !!process.env.RECORD;

function defaultFile() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return path.join(config.ROOT, 'recordings', `session-${stamp}.jsonl`);
}

// Key strings become "<key>"; very long strings are cut. Functions (acks) are dropped.
function clean(v, depth = 0) {
  if (typeof v === 'string') return keys.includes(v) ? '<key>' : v.length > MAX_STR ? `${v.slice(0, MAX_STR)}…[cut]` : v;
  if (typeof v === 'function' || v === undefined) return undefined;
  if (!v || typeof v !== 'object' || depth > 40) return v;
  if (Array.isArray(v)) return v.map((x) => clean(x, depth + 1) ?? null);
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x, depth + 1)]).filter(([, x]) => x !== undefined));
}

function write(rec) {
  if (!file) return;
  try { fs.appendFileSync(file, JSON.stringify({ t: Date.now() - t0, ...rec }) + '\n'); } catch (e) {
    console.warn(`  Recorder stopped: ${e.message}`);
    file = null;
  }
}

function readData(name) {
  try { return JSON.parse(fs.readFileSync(path.join(config.DATA_DIR, name), 'utf8')); } catch { return null; }
}

// Start recording (once). Returns the file path, or null when recording is off.
function start(state, target = process.env.RECORD) {
  if (file) return file;
  if (!wanted() && !target) return null;
  file = path.resolve(target && target !== '1' ? target : defaultFile());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  t0 = Date.now();
  keys = [config.DM_KEY, config.CODM_KEY, config.BATTLE_KEY, config.SOCIAL_KEY, config.MUSIC_KEY].filter(Boolean);
  fs.writeFileSync(file, '');
  write({ type: 'header', version: VERSION, startedAt: new Date(t0).toISOString(), room: state?.room ?? null,
    files: { campaign: readData('campaign.json'), characters: readData('characters.json') } });
  console.log(`  Recording   : ${path.relative(config.ROOT, file) || file}`);
  return file;
}

// Hook one connection: every incoming packet is written before its handlers run; the ack reply is written too.
function attach(socket) {
  if (!file) return;
  const sid = socket.id;
  write({ type: 'connect', sid });
  socket.use((packet, next) => {
    const [event, ...args] = packet;
    if (RESERVED.has(event)) return next();
    const last = args[args.length - 1];
    const hasAck = typeof last === 'function';
    const n = (attach.n = (attach.n || 0) + 1);
    write({ type: 'in', sid, n, event, args: clean(hasAck ? args.slice(0, -1) : args), ack: hasAck });
    if (hasAck) {
      packet[packet.length - 1] = (...reply) => {
        write({ type: 'ack', sid, n, event, reply: clean(event === 'dm:auth' ? reply.map((r) => ({ ok: r?.ok, role: r?.role })) : reply) });
        return last(...reply);
      };
    }
    next();
  });
  socket.on('disconnect', (reason) => write({ type: 'disconnect', sid, reason }));
}

const failed = (socket, event, message) => write({ type: 'error', sid: socket?.id, event, message });
const logLine = (entry) => { if (file) write({ type: 'log', kind: entry.kind, text: entry.text }); };
const stop = () => { const f = file; file = null; return f; };
const active = () => file;

module.exports = { start, attach, failed, logLine, stop, active, clean, VERSION };
