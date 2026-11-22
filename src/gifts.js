// "Received 'Rope'" (Mike, Nov 21): when the DM gives a character an item (Items tab, item cards, a dropped
// card), that character's phone gets a short notification. Purchases are the player's own doing: no toast.
const hub = require('./hub');

// Quantities by inventory line before a change.
const before = (c) => new Map((c?.inventory || []).map((i) => [i.id, i.qty]));

// What the character gained since `prev`, and tell its phone. Returns [{ name, qty }].
function tell(c, prev) {
  const got = (c?.inventory || []).map((i) => ({ name: i.name, qty: i.qty - (prev.get(i.id) ?? 0) })).filter((x) => x.qty > 0);
  if (got.length && c.socketId) hub.io?.to(c.socketId).emit('item:received', { items: got });
  return got;
}

module.exports = { before, tell };
