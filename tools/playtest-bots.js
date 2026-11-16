// Playtest bots: fake friends on phones, for testing the TV and DM screens alone.
// Each bot joins the running game like a phone, then answers what the table asks of it:
// roll calls, party votes, world map votes, message pop-ups, the dungeon gate, social lines
// and its own combat turns (attack the first standing enemy). Bots are named "[Bot] ..." so
// they are easy to spot and remove from the roster afterwards. Nothing here is a real player.
//
// Usage: npm run bots            (4 bots on http://localhost:3000)
//        npm run bots -- 6       (6 bots)
//        BOTS_URL=http://127.0.0.1:3123 npm run bots -- 2
// Stop with Ctrl+C. The bots leave their seats empty, like a phone going to sleep.
const { io } = require('socket.io-client');

const NAMES = ['Ash', 'Bryn', 'Cato', 'Dell', 'Eris', 'Fenn', 'Gale', 'Hollis'];
const CLASSES = ['Fighter', 'Rogue', 'Wizard', 'Cleric', 'Ranger', 'Bard', 'Druid', 'Paladin'];
const LINES = ['We mean no harm.', 'What do you know about the old road?', 'Name your price.', 'I do not trust this one.', 'Tell us more.'];
const EMOTIONS = ['neutral', 'happy', 'angry', 'sad', 'afraid', 'surprised'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const later = (fn) => setTimeout(fn, 400 + Math.random() * 1200); // feel like people, not a script

function bot(url, room, i, log = console.log) {
  const name = `[Bot] ${NAMES[i % NAMES.length]}`;
  const s = io(url, { transports: ['websocket'], forceNew: true, rejectUnauthorized: false });
  const done = new Set(); // keys of things this bot already answered, so it acts once per prompt
  const once = (key, fn) => { if (done.has(key)) return; done.add(key); later(fn); };
  let me = null;
  s.on('connect', () => {
    s.emit('join', { name, cls: CLASSES[i % CLASSES.length], player: 'Bot', room }, (r) => {
      if (r?.error) return log(`  ${name}: could not join (${r.error})`);
      me = r.id;
      log(`  ${name} joined`);
    });
  });
  s.on('state', (st) => { if (me) react(st); });
  function react(st) {
    const chk = st.check;
    if (chk && (!chk.targets || chk.targets.includes(me)) && !chk.results?.[me]) {
      once(`check:${chk.id}`, () => s.emit('player:check', { skill: chk.key, kind: chk.kind, key: chk.key }));
    }
    const v = st.vote;
    if (v?.open && v.votes?.[me] === undefined && v.options?.length) once(`vote:${v.id}`, () => s.emit('player:vote', { index: Math.floor(Math.random() * v.options.length) }));
    const wv = st.worldMap?.vote;
    if (wv?.open && !wv.votes?.[me] && wv.candidates?.length) once(`wvote:${wv.id ?? wv.candidates.join()}`, () => s.emit('player:worldmap:vote', { node: pick(wv.candidates) }));
    for (const h of st.handouts || []) if (!h.read?.[me]) once(`read:${h.id}`, () => s.emit('player:handout:read', { id: h.id }));
    const gate = st.dungeon?.gate;
    if (gate && !(gate.ready || []).includes(me)) once(`gate:${gate.id}`, () => s.emit('player:dungeon:ready', { on: true }));
    const convo = st.social?.convo;
    if (st.mode === 'social' && convo?.live && !convo.ending) once(`say:${convo.n}`, () => s.emit('player:social:say', { text: pick(LINES), emotion: pick(EMOTIONS) }));
    const c = st.combat;
    if (c?.active && c.order?.length && c.order[c.turn % c.order.length]?.id === me) {
      const foe = (c.enemies || []).find((e) => e.side !== 'ally' && (e.hp ?? 1) > 0);
      once(`turn:${c.round}:${c.turn}`, () => s.emit('player:combat', foe ? { act: 'attack', target: foe.id } : { act: 'dodge' }));
    }
  }
  return s;
}

async function main() {
  const n = Math.max(1, Math.min(8, Number(process.argv[2]) || 4));
  const url = process.env.BOTS_URL || `http://localhost:${process.env.PORT || 3000}`;
  const info = await fetch(`${url}/api/join-info`).then((r) => r.json()).catch(() => null);
  if (!info?.room) { console.error(`  No game found at ${url}. Start it first (npm start).`); process.exit(1); }
  console.log(`  Sending ${n} playtest bot${n > 1 ? 's' : ''} to room ${info.room} at ${url}`);
  const bots = Array.from({ length: n }, (_, i) => bot(url, info.room, i));
  process.on('SIGINT', () => { for (const b of bots) b.close(); process.exit(0); });
}

if (require.main === module) main();
module.exports = { bot };
