// Creature attack bonuses and damage dice are DM-only; phones and the TV see only the outcome.
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tavern-redact-'));
process.env.DATA_DIR = path.join(TMP, 'data');
process.env.UPLOAD_DIR = path.join(TMP, 'uploads');

const state = require('../src/state');
const game = require('../src/game');
const { viewState } = require('../src/visibility');

const goblin = { id: 'e1', name: 'Goblin', atk: 4, dmg: [1, 6, 2], ac: 12, hp: 7, maxHp: 7, side: 'enemy', enemy: true };
const mira = { id: 'p1', name: 'Mira', ac: 1, hp: 20, maxHp: 20, tempHp: 0, atk: 5, dmg: [1, 8, 3], init: 0, skills: {} };
state.state.combat.enemies.push(goblin);
state.state.players[mira.id] = mira;
for (let i = 0; i < 20; i++) game.attack(goblin, mira, {});

const publicText = (v) => v.log.map((l) => l.text).join('\n');
// Minimal snapshot in the shape viewState() expects (fullState needs a live socket server).
const live = state.state;
const base = { system: 'dnd5e', players: [], combat: live.combat, log: live.log, rolls: [], handouts: [], scene: live.scene, settings: live.settings };
const viewPlayer = viewState(base, { role: 'player', charId: 'p1' });
const viewTv = viewState(base, { role: 'screen' });
const viewDm = viewState(base, { role: 'dm' });

assert(!/d20\(|\+4|1d6\+2|\(\d+d\d+/.test(publicText(viewPlayer)), 'phone log has no creature roll or damage breakdown');
assert(!/d20\(|\+4|1d6\+2/.test(publicText(viewTv)), 'TV log has no creature roll or damage breakdown');
assert(/Goblin attacks Mira: (HIT|CRIT)\.|Goblin attacks Mira: MISS\./.test(publicText(viewPlayer)), 'phone log still shows each attack outcome');
// Health numbers are for the DM only by default (Mike, Nov 17): no "for N" on phones or the TV.
assert(!/ for \d+/.test(publicText(viewPlayer)) && !/ for \d+/.test(publicText(viewTv)), 'phone and TV logs carry no damage numbers');
// Mira strikes back: a player's attack is redacted the same way, with the full line for the DM.
for (let i = 0; i < 10; i++) { goblin.hp = 7; game.attack(mira, goblin, {}); }
const v2 = viewState({ ...base, log: live.log }, { role: 'player', charId: 'p1' });
assert(/Mira attacks Goblin: (HIT|CRIT|MISS)\./.test(publicText(v2)) && !/ for \d+|d20\(/.test(publicText(v2)), 'a player attack shows the outcome without numbers');
assert(/Mira attacks Goblin: d20\(/.test(publicText(viewState({ ...base, log: live.log }, { role: 'dm' }))), 'the DM sees the player attack in full');
// The table setting "Health numbers: Everyone" brings the numbers back.
live.settings.display.numbers = 'all';
for (let i = 0; i < 20; i++) game.attack(goblin, mira, {});
assert(/Goblin attacks Mira: (HIT|CRIT) for \d+\./.test(publicText(viewState({ ...base, log: live.log }, { role: 'player', charId: 'p1' }))), 'with numbers for everyone the phone log shows damage');
assert(/d20\(/.test(publicText(viewDm)), 'DM log keeps the full breakdown');
console.log('log redaction: all passed');
// Library files flush on a short timer; let them land before the temp dir goes.
setTimeout(() => { fs.rmSync(TMP, { recursive: true, force: true }); process.exit(0); }, 500);
