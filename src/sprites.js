// Sprite picks (layered sprites, steps 5-6): which uploaded sprite an NPC or character wears, and its state.
// The DM sets these; the state follows the emotion buttons, and the sprite's own manifest decides what it looks like.
const ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const STATE = /^[a-z0-9_-]{1,30}$/;

// { id, state } or null. Invalid ids are refused by returning undefined.
function clean(sprite) {
  if (sprite === null) return null;
  if (!sprite || typeof sprite !== 'object') return undefined;
  if (!ID.test(String(sprite.id || ''))) return undefined;
  const state = STATE.test(String(sprite.state || '')) ? String(sprite.state) : 'neutral';
  return { id: String(sprite.id), state };
}

module.exports = { clean, ID, STATE };
