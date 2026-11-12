// Phone messaging (Phase 4): one transfer system for handouts (9), whisper reveals (10),
// post-combat spoils (11) and the dialogue vote (12).
//
// Every item has a `vis` (see visibility.js): 'all', 'dm', or { to: [charId], screen: bool }.
// Sharing to the TV is `vis.screen = true`; the TV only ever sees items that are shared.
const { str, int } = require('./util');

const VOTE_OPTIONS = ['Yes', 'No', 'Unsure'];

function handout(f, id, roster) {
  const to = f.to === 'all' || !Array.isArray(f.to) ? 'all' : f.to.filter((x) => roster[x]);
  return {
    id, kind: 'handout', title: str(f.title, 80) || 'Handout', text: str(f.text, 1200), image: f.image ? str(f.image, 200) : null,
    vis: { to: to === 'all' ? ['*'] : to, screen: false }, at: Date.now(),
  };
}

// Post-combat spoils: items dropped on phones. Each claim is a request; the DM awards.
function spoil(f, id) {
  const items = (Array.isArray(f.items) ? f.items : []).map((i) => ({ name: str(i.name, 60), qty: int(i.qty, 1, 999, 1) })).filter((i) => i.name).slice(0, 20);
  if (!items.length) return null;
  return { id, kind: 'spoil', title: str(f.title, 80) || 'Spoils', items, claims: {}, awarded: null, vis: { to: ['*'], screen: false }, at: Date.now() };
}

// Dialogue vote: the party votes on the choice wheel. Each phone votes once; the DM sees counts.
function vote(choices, id) {
  const opts = (choices?.length ? choices : VOTE_OPTIONS).map((x) => str(x, 120)).filter(Boolean).slice(0, 4);
  return { id, kind: 'vote', options: opts, votes: {}, open: true, vis: 'all', at: Date.now() };
}
function tally(v) {
  const counts = v.options.map(() => 0);
  for (const i of Object.values(v.votes)) if (counts[i] !== undefined) counts[i]++;
  return counts;
}

module.exports = { VOTE_OPTIONS, handout, spoil, vote, tally };
