// Secret player objectives (item 9): a private goal per character.
// Visibility: only that character's phone and the DM see it (vis = { to: [charId] }) until the DM reveals it.
// Revealing sends it to every phone and the TV (vis = { to: ['*'], screen: true }).
const { str } = require('./util');

const MAX_OBJECTIVES = 60;

// f: { charId, title, text }. Returns null when the character is unknown or the title is empty.
function create(f, id, roster) {
  const c = roster[f.charId];
  const title = str(f.title, 80);
  if (!c || !title) return null;
  return { id, kind: 'objective', charId: c.id, name: c.name, title, text: str(f.text, 600), revealed: false, vis: { to: [c.id], screen: false }, at: Date.now() };
}

// Reveal or hide one objective. Hiding puts it back to its owner's phone and the DM.
function setRevealed(list, id, on) {
  const o = list.find((x) => x.id === id);
  if (!o) return;
  o.revealed = !!on;
  o.vis = o.revealed ? { to: ['*'], screen: true } : { to: [o.charId], screen: false };
}

module.exports = { MAX_OBJECTIVES, create, setRevealed };
