// Persistent character roster (data/characters.json). Characters outlive sessions.
// `secret` and `hooks` are DM-only.
const crypto = require('crypto');
const fs = require('fs');
const { ROSTER_FILE } = require('./config');
const { CLASSES, SKILL_NAMES } = require('./rules/dnd5e');
const { str, int } = require('./util');

const PRIVATE_FIELDS = ['secret', 'hooks', 'socketId'];
const roster = fs.existsSync(ROSTER_FILE) ? JSON.parse(fs.readFileSync(ROSTER_FILE, 'utf8')) : {};

let saveTimer = null;
function saveRoster() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const out = Object.fromEntries(Object.entries(roster).map(([id, c]) => {
      const { socketId, ...rest } = c;
      return [id, rest];
    }));
    fs.writeFileSync(ROSTER_FILE + '.tmp', JSON.stringify(out, null, 2));
    fs.renameSync(ROSTER_FILE + '.tmp', ROSTER_FILE);
  }, 500);
}

function newCharacter({ name, cls, race, player }) {
  const c = CLASSES[cls];
  const id = crypto.randomBytes(5).toString('hex');
  roster[id] = {
    id, name: str(name, 24), player: str(player, 24), race: str(race, 24) || 'Human', cls, level: 1,
    hp: c.hp, maxHp: c.hp, ac: c.ac, atk: c.atk, dmg: [...c.dmg], init: c.init, skills: { ...c.skills },
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
  if (!isDm) return;
  if (f.name !== undefined) c.name = str(f.name, 24) || c.name;
  if (f.cls !== undefined && CLASSES[f.cls]) c.cls = f.cls;
  if (f.level !== undefined) c.level = int(f.level, 1, 20, c.level);
  if (f.maxHp !== undefined) c.maxHp = int(f.maxHp, 1, 999, c.maxHp);
  if (f.hp !== undefined) c.hp = int(f.hp, 0, c.maxHp, c.hp);
  c.hp = Math.min(c.hp, c.maxHp);
  if (f.ac !== undefined) c.ac = int(f.ac, 1, 40, c.ac);
  if (f.atk !== undefined) c.atk = int(f.atk, -5, 20, c.atk);
  if (f.init !== undefined) c.init = int(f.init, -5, 20, c.init);
  if (f.dmg !== undefined) {
    const m = String(f.dmg).replace(/\s/g, '').match(/^(\d+)d(\d+)([+-]\d+)?$/i);
    if (m) c.dmg = [int(m[1], 1, 20, 1), int(m[2], 2, 20, 6), int(m[3] || 0, -10, 30, 0)];
  }
  if (f.skills) for (const k of SKILL_NAMES) if (f.skills[k] !== undefined) c.skills[k] = int(f.skills[k], -5, 20, c.skills[k]);
  if (f.theme !== undefined) c.theme = f.theme ? str(f.theme, 80) : null;
  if (f.secret !== undefined) c.secret = str(f.secret, 2000);
  if (f.hooks !== undefined) c.hooks = str(f.hooks, 2000);
}
const publicChar = (c) => Object.fromEntries(Object.entries(c).filter(([k]) => !PRIVATE_FIELDS.includes(k)));

module.exports = { roster, saveRoster, newCharacter, applyEdits, publicChar };
