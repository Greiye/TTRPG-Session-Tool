// Persistent character roster (data/characters.json). Characters outlive sessions.
// `secret` and `hooks` are DM-only.
const crypto = require('crypto');
const fs = require('fs');
const { ROSTER_FILE } = require('./config');
const rules = require('./rules');
const { str, int } = require('./util');

const roster = fs.existsSync(ROSTER_FILE) ? JSON.parse(fs.readFileSync(ROSTER_FILE, 'utf8')) : {};

let saveTimer = null;
function writeRoster() {
  const out = Object.fromEntries(Object.entries(roster).map(([id, c]) => {
    const { socketId, ...rest } = c;
    return [id, rest];
  }));
  fs.writeFileSync(ROSTER_FILE + '.tmp', JSON.stringify(out, null, 2));
  fs.renameSync(ROSTER_FILE + '.tmp', ROSTER_FILE);
}
function saveRoster() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeRoster, 500);
}
saveRoster.flush = () => { clearTimeout(saveTimer); writeRoster(); };

function newCharacter({ name, cls, race, player }, systemId) {
  const sys = rules.get(systemId);
  const id = crypto.randomBytes(5).toString('hex');
  roster[id] = {
    id, system: sys.id, name: str(name, 24), player: str(player, 24), race: str(race, 24) || 'Human', cls, level: 1,
    ...sys.newStats(cls),
    hue: crypto.randomInt(360), portrait: null, catchphrase: '', backstory: '', theme: null, secret: '', hooks: '',
  };
  saveRoster();
  return roster[id];
}

// Fields a player may edit on their own character; the DM may edit everything.
function applyEdits(c, f, isDm) {
  if (f.player !== undefined) c.player = str(f.player, 24);
  if (f.race !== undefined) c.race = str(f.race, 24);
  if (f.hue !== undefined) c.hue = int(f.hue, 0, 359, c.hue);
  if (f.catchphrase !== undefined) c.catchphrase = str(f.catchphrase, 120);
  if (f.backstory !== undefined) c.backstory = str(f.backstory, 2000);
  // Animation profile (0e): scales speed and size of this character's on-screen moments.
  if (f.anim && typeof f.anim === 'object') {
    const n = (v, lo, hi, d) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
    c.anim = { speed: n(f.anim.speed, 0.5, 2, c.anim?.speed ?? 1), intensity: n(f.anim.intensity, 0, 2, c.anim?.intensity ?? 1) };
  }
  if (!isDm) return;
  if (f.name !== undefined) c.name = str(f.name, 24) || c.name;
  const sys = rules.get(c.system);
  if (f.cls !== undefined && sys.classes[f.cls]) c.cls = f.cls;
  if (f.level !== undefined) c.level = int(f.level, 1, 20, c.level);
  if (f.maxHp !== undefined) c.maxHp = int(f.maxHp, 1, 999, c.maxHp);
  if (f.hp !== undefined) c.hp = int(f.hp, 0, c.maxHp, c.hp);
  c.hp = Math.min(c.hp, c.maxHp);
  sys.editStats(c, f);
  if (f.theme !== undefined) c.theme = f.theme ? str(f.theme, 80) : null;
  if (f.secret !== undefined) c.secret = str(f.secret, 2000);
  if (f.hooks !== undefined) c.hooks = str(f.hooks, 2000);
}

module.exports = { roster, saveRoster, newCharacter, applyEdits };
