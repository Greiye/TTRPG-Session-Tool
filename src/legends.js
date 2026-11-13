// Table legends (phase J): records that outlive a campaign. They live in data/legends.json, not in
// campaign.json, so a new campaign or a save-point restore never wipes them.
//   - Hall of fame: "most natural 1s" is counted from the dice log; "best kill" and "worst plan" are DM awards.
//     Every record is tied to the player's real name (roster `player`), not only to the character.
//   - Trophy shelf: items the group won, each with the story of how they won it.
const crypto = require('crypto');
const { LEGENDS_FILE } = require('./config');
const { readJson, writeJson } = require('./store');
const { str } = require('./util');

const MAX_AWARDS = 500;
const MAX_TROPHIES = 40;
const CATS = { nat1: 'Most natural 1s', kill: 'Best kill', plan: 'Worst plan' };
const AWARD_CATS = ['kill', 'plan']; // DM-awarded; nat1 is counted automatically
const SHOWN = 8; // rows per category on the TV and phones

const fresh = () => ({ nat1: {}, awards: [], trophies: [] });
let data = normalize(readJson(LEGENDS_FILE));
function normalize(d) {
  const f = fresh();
  if (!d || typeof d !== 'object') return f;
  return {
    nat1: d.nat1 && typeof d.nat1 === 'object' ? d.nat1 : f.nat1,
    awards: Array.isArray(d.awards) ? d.awards : f.awards,
    trophies: Array.isArray(d.trophies) ? d.trophies : f.trophies,
  };
}

let timer = null;
function save() { clearTimeout(timer); timer = setTimeout(() => writeJson(LEGENDS_FILE, data), 300); }
function flush() { clearTimeout(timer); writeJson(LEGENDS_FILE, data); }

const newId = () => crypto.randomBytes(4).toString('hex');
const playerOf = (c) => str(c.player, 24) || c.name; // the real player's name, falling back to the character

// One natural 1 on a d20 by this character's player. Counted across every campaign.
function recordNat1(c) {
  if (!c) return null;
  const player = playerOf(c);
  const key = player.toLowerCase();
  const row = (data.nat1[key] ||= { player, character: c.name, count: 0 });
  row.character = c.name; // most recent character, so the row reads even after a new character
  row.count += 1;
  save();
  return row;
}

// A DM award in the hall of fame. Returns { entry } or { error }.
function award(cat, { player, character, detail, session } = {}) {
  if (!AWARD_CATS.includes(cat)) return { error: 'Pick best kill or worst plan.' };
  const who = str(player, 24);
  if (!who) return { error: 'Pick a character.' };
  const entry = { id: newId(), cat, player: who, character: str(character, 24) || who, detail: str(detail, 200), session: str(session, 80), at: Date.now() };
  data.awards.unshift(entry);
  if (data.awards.length > MAX_AWARDS) data.awards.length = MAX_AWARDS;
  save();
  return { entry };
}
function removeAward(id) {
  const before = data.awards.length;
  data.awards = data.awards.filter((e) => e.id !== id);
  if (data.awards.length !== before) save();
  return data.awards.length !== before;
}

// A trophy on the shelf. `story` is the tale the TV tells when the DM opens it.
function addTrophy({ name, story, session } = {}) {
  const n = str(name, 60);
  if (!n) return { error: 'A trophy needs a name.' };
  if (data.trophies.length >= MAX_TROPHIES) return { error: 'The shelf is full. Remove a trophy first.' };
  const trophy = { id: newId(), name: n, story: str(story, 800), session: str(session, 80), at: Date.now() };
  data.trophies.unshift(trophy);
  save();
  return { trophy };
}
function removeTrophy(id) {
  const before = data.trophies.length;
  data.trophies = data.trophies.filter((t) => t.id !== id);
  if (data.trophies.length !== before) save();
  return data.trophies.length !== before;
}
const trophy = (id) => data.trophies.find((t) => t.id === id) || null;

// What every viewer sees. Plain data only: no secrets live in the legends.
function view() {
  const byCat = (cat) => data.awards.filter((e) => e.cat === cat).slice(0, SHOWN);
  const nat1 = Object.values(data.nat1)
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count || a.player.localeCompare(b.player))
    .slice(0, SHOWN);
  return { cats: CATS, nat1, kill: byCat('kill'), plan: byCat('plan'), trophies: data.trophies };
}

module.exports = { CATS, AWARD_CATS, MAX_AWARDS, MAX_TROPHIES, SHOWN, recordNat1, award, removeAward, addTrophy, removeTrophy, trophy, view, flush, _data: () => data };
