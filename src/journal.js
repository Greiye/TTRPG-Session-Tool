// Party journal: shared phone notes (clues, NPC names, places). Every phone and the DM see all entries.
// The DM can copy an entry into the recap quiz (client side, public/js/dm/journal.js).
// Visibility: the TV and spectators see nothing; see visibility.js.
const { str } = require('./util');

const MAX_ENTRIES = 200;
const MAX_TEXT = 300;
const KINDS = ['clue', 'npc', 'note'];

// Newest first. `by` is the author's character id; `name` is kept so the entry reads even if the character is gone.
function add(journal, author, { text, kind } = {}) {
  const t = str(text, MAX_TEXT).trim();
  if (!t) return null;
  const entry = {
    id: `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    kind: KINDS.includes(kind) ? kind : 'note',
    text: t,
    by: author.id,
    name: str(author.name, 60),
    at: Date.now(),
  };
  journal.unshift(entry);
  if (journal.length > MAX_ENTRIES) journal.length = MAX_ENTRIES;
  return entry;
}

// A phone may remove its own entries; the DM may remove any.
function remove(journal, id, viewer) {
  const i = journal.findIndex((e) => e.id === id);
  if (i < 0) return false;
  if (viewer.role !== 'dm' && journal[i].by !== viewer.charId) return false;
  journal.splice(i, 1);
  return true;
}

module.exports = { MAX_ENTRIES, MAX_TEXT, KINDS, add, remove };
