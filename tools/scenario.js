// Scenario seeder (test tool): one command loads a ready table for testing. A party of four, the example world
// map with Millbrook's town map, the example dungeon, a shop with items and a combat-ready encounter (creatures
// on the field, combat mode, initiative not rolled yet). All of it is PLACEHOLDER data: names start with
// "PLACEHOLDER" so nobody mistakes it for the real campaign.
//
// It never touches the real save. The scenario lives in its own profile folder, profiles/<name>/ (data and
// uploads), and the server is pointed at it with DATA_DIR / UPLOAD_DIR. The seeding goes through the real DM
// socket events, so the result is exactly what the DM screen would have made.
//
// Usage: npm run scenario                     seed profiles/scenario/ and start the game on it (port 3000)
//        npm run scenario -- --seed-only      seed and exit; start later with the same command
//        npm run scenario -- --name combat2   a second profile, profiles/combat2/
//        npm run scenario -- --fresh          wipe that profile first (only ever inside profiles/)
// A profile that is already seeded is started as it is, so a test session can be resumed.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const ROOT = path.join(__dirname, '..');
const PROFILES = path.join(ROOT, 'profiles');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const P = 'PLACEHOLDER';

const PARTY = [
  { name: `${P} Brann`, cls: 'Fighter', race: 'Dwarf', level: 3 },
  { name: `${P} Mira`, cls: 'Rogue', race: 'Halfling', level: 3 },
  { name: `${P} Quill`, cls: 'Wizard', race: 'Gnome', level: 3 },
  { name: `${P} Oak`, cls: 'Cleric', race: 'Human', level: 3 },
];
const SHOP = {
  name: `${P} General Store`,
  npc: `${P} Shopkeeper`,
  text: ['name,price,stock,note,category',
    `${P} Healing Potion,50,5,Heals 2d4+2,potion`,
    `${P} Rope (50 ft),1,10,Hempen,gear`,
    `${P} Torch,0.01,20,Burns for an hour,gear`,
    `${P} Longsword,15,2,1d8 slashing,weapon`,
    `${P} Shield,10,3,+2 AC,armor`].join('\n'),
};
const ENEMIES = [
  { name: `${P} Goblin A`, hp: 7, ac: 15, atk: 4, dmg: '1d6+2' },
  { name: `${P} Goblin B`, hp: 7, ac: 15, atk: 4, dmg: '1d6+2' },
  { name: `${P} Bugbear`, hp: 27, ac: 16, atk: 4, dmg: '2d8+2' },
];
const GOLD = 100;

function args(argv) {
  const a = { name: 'scenario', seedOnly: false, fresh: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--seed-only') a.seedOnly = true;
    else if (argv[i] === '--fresh') a.fresh = true;
    else if (argv[i] === '--name') a.name = argv[++i];
  }
  if (!/^[a-z0-9_-]{1,40}$/i.test(a.name || '')) throw new Error('--name takes letters, digits, - and _ only.');
  return a;
}

// The profile folder for a name, always inside profiles/ (so --fresh can never reach data/).
function profileDir(name) {
  const dir = path.join(PROFILES, name);
  if (path.dirname(dir) !== PROFILES) throw new Error('Bad profile name.');
  return dir;
}
const envFor = (dir) => ({ TEST_MODE: '0', DATA_DIR: path.join(dir, 'data'), UPLOAD_DIR: path.join(dir, 'uploads') });
const isSeeded = (dir) => fs.existsSync(path.join(dir, 'data', 'campaign.json'));

function boot(dir, env = {}) {
  const p = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, ...envFor(dir), ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
  return new Promise((res, rej) => {
    let out = '';
    p.stdout.on('data', (d) => { out += d; if (/running/.test(out)) res({ p, out }); });
    p.on('exit', (code) => rej(new Error(`Server exited (${code}). ${out.trim()}`)));
  });
}

// Drive a running server through the DM's own socket events. Returns the final DM state.
async function seed(url, { key } = {}) {
  const s = io(url, { transports: ['websocket'], forceNew: true, rejectUnauthorized: false });
  let last = null;
  s.on('state', (st) => { last = st; });
  await new Promise((res, rej) => { s.on('connect', res); s.on('connect_error', rej); });
  const call = (ev, data) => new Promise((res) => s.emit(ev, data, res));
  const until = async (fn, what, ms = 4000) => {
    const end = Date.now() + ms;
    for (;;) { let v; try { v = fn(last); } catch { v = false; } if (v) return v; if (Date.now() > end) throw new Error(`Seeding stalled at: ${what}`); await wait(25); }
  };
  try {
    const auth = await call('dm:auth', { key });
    if (!auth?.ok || auth.role !== 'dm') throw new Error('Could not sign in as the DM (pass the DM key, or run it on the laptop).');
    // World: the example world map (Millbrook has the starter town) and the example dungeon.
    s.emit('dm:mode', { mode: 'exploration' });
    s.emit('dm:worldmap:example', {});
    s.emit('dm:dungeon:example', {});
    await until((st) => st.worldMap?.nodes?.length && st.town?.maps?.w1 && st.dungeon?.nodes?.length, 'world map, town and dungeon');
    // Party: create each character (DM editor), seat them, give them gold for the shop.
    for (const c of PARTY) s.emit('dm:char:save', { ...c, player: P, backstory: `${P} character for testing.` });
    const cards = await until((st) => { const r = PARTY.map((c) => st.roster.find((x) => x.name === c.name)); return r.every(Boolean) && r; }, 'party');
    for (const c of cards) { s.emit('dm:char:add', { id: c.id }); s.emit('dm:sheet', { id: c.id, gold: GOLD }); }
    await until((st) => cards.every((c) => st.players.some((x) => x.id === c.id)), 'seating the party');
    // Shop.
    if (!last.shops?.some((x) => x.name === SHOP.name)) {
      const r = await call('dm:shop:import', SHOP);
      if (r?.error) throw new Error(`Shop: ${r.error}`);
    }
    // Encounter: creatures on the field, combat mode (the TV shows "Get ready"), initiative left to the DM.
    for (const e of ENEMIES) if (!last.combat.enemies.some((x) => x.name === e.name)) s.emit('dm:enemy:add', e);
    s.emit('dm:mode', { mode: 'combat' });
    return await until((st) => st.mode === 'combat' && ENEMIES.every((e) => st.combat.enemies.some((x) => x.name === e.name)) && st, 'encounter');
  } finally {
    s.close();
  }
}

// Wait until the debounced save has written the seeded state (Windows kills a child without running its exit hooks).
async function saved(dir, ms = 8000) {
  const file = path.join(dir, 'data', 'campaign.json');
  const end = Date.now() + ms;
  for (;;) {
    try {
      const c = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (c.mode === 'combat' && ENEMIES.every((e) => c.combat.enemies.some((x) => x.name === e.name)) && c.party.length >= PARTY.length) return c;
    } catch { /* not written yet */ }
    if (Date.now() > end) throw new Error('The seeded state was not saved in time.');
    await wait(100);
  }
}

async function main() {
  const a = args(process.argv.slice(2));
  const dir = profileDir(a.name);
  if (a.fresh && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  const rel = path.relative(ROOT, dir);
  if (!isSeeded(dir)) {
    console.log(`  Seeding ${P} scenario into ${rel}/ (your real data/ is not touched)...`);
    const port = 4800 + Math.floor(Math.random() * 900);
    const { p } = await boot(dir, { PORT: port, HTTPS: '0' });
    try {
      const st = await seed(`http://127.0.0.1:${port}`);
      await saved(dir);
      console.log(`  Seeded: ${st.players.length} characters, ${st.shops.length} shop(s), ${st.combat.enemies.length} creatures, world map, town and dungeon.`);
    } finally {
      await new Promise((r) => { p.on('exit', r); p.kill(); });
    }
  } else console.log(`  ${rel}/ is already seeded; starting it as it is (add --fresh to reseed).`);
  if (a.seedOnly) return console.log(`  Start it with: npm run scenario${a.name !== 'scenario' ? ` -- --name ${a.name}` : ''}`);
  console.log(`  Starting the game on ${rel}/ ...`);
  const p = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, ...envFor(dir) }, stdio: 'inherit' });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => p.kill(sig));
  p.on('exit', (code) => process.exit(code ?? 0));
}

if (require.main === module) main().catch((e) => { console.error(`  ${e.message}`); process.exit(1); });
module.exports = { seed, profileDir, envFor, PARTY, SHOP, ENEMIES, PROFILES };
