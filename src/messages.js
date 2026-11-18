// Phone messaging (Phase 4): one transfer system for handouts (9), whisper reveals (10),
// post-combat spoils (11). The dialogue vote (12) was removed (Mike, Nov 18).
//
// Every item has a `vis` (see visibility.js): 'all', 'dm', or { to: [charId], screen: bool }.
// Sharing to the TV is `vis.screen = true`; the TV only ever sees items that are shared.
const { str, int } = require('./util');


function handout(f, id, roster) {
  const to = f.to === 'all' || !Array.isArray(f.to) ? 'all' : f.to.filter((x) => roster[x]);
  return {
    id, kind: 'handout', title: str(f.title, 80) || 'Handout', text: str(f.text, 1200), image: f.image ? str(f.image, 200) : null,
    vis: { to: to === 'all' ? ['*'] : to, screen: false }, read: {}, at: Date.now(),
  };
}

// Post-combat spoils: items dropped on phones. Each claim is a request; the DM awards.
function spoil(f, id) {
  const items = (Array.isArray(f.items) ? f.items : []).map((i) => ({ name: str(i.name, 60), qty: int(i.qty, 1, 999, 1) })).filter((i) => i.name).slice(0, 20);
  if (!items.length) return null;
  return { id, kind: 'spoil', title: str(f.title, 80) || 'Spoils', items, claims: {}, awarded: null, vis: { to: ['*'], screen: false }, at: Date.now() };
}

// Handouts and phrases pop up on phones (Mike, Nov 16) and stay until the player presses Continue.
// `read` maps charId -> time; a phone only learns whether it has read the item itself.
const POPS = new Set(['handout', 'phrase']);
const isPop = (h) => POPS.has(h.kind || 'handout');
function markRead(h, charId) {
  if (!h || !isPop(h)) return false;
  h.read = h.read || {};
  if (h.read[charId]) return false;
  h.read[charId] = Date.now();
  return true;
}
// Phone view of the read map: just `seen` for this character.
function readFor(h, viewer) {
  if (viewer.role === 'dm' || !isPop(h)) return h;
  const { read, ...rest } = h;
  return { ...rest, seen: viewer.role === 'player' && !!read?.[viewer.charId] };
}
// Who has voted (DM only). Phones never see who picked what.

module.exports = { handout, spoil, isPop, markRead, readFor };
