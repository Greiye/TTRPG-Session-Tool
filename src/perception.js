// Perception-gated items (item 6): things in the scene only characters with a high enough passive
// score notice on their own. The DM can also reveal one to everybody, or to chosen characters.
//
// secret: { id, text, skill, dc, shown: 'all' | [charId...], noticed: [charId...] }
//   noticed = who has been told already (so each phone is told once).
const { str, int } = require('./util');

function notices(sys, c, secret) {
  if (!sys.skills.includes(secret.skill)) return false;
  return sys.passive(c, secret.skill) >= secret.dc;
}
const canSee = (sys, c, s) => s.shown === 'all' || (Array.isArray(s.shown) && s.shown.includes(c.id)) || notices(sys, c, s);

function make(f, sys, id) {
  const text = str(f.text, 300);
  if (!text) return null;
  const skill = sys.skills.includes(f.skill) ? f.skill : sys.skills.includes('Perception') ? 'Perception' : sys.skills[0];
  return { id, text, skill, dc: int(f.dc, 1, 40, 13), shown: [], noticed: [] };
}

// Tell each character about secrets they can newly see. `tell(c, secret)` posts the private note.
function scan(state, sys, tell) {
  for (const s of state.scene.secrets || []) {
    for (const c of Object.values(state.players)) {
      if (s.noticed.includes(c.id) || !canSee(sys, c, s)) continue;
      s.noticed.push(c.id);
      tell(c, s);
    }
  }
}

// What one viewer gets of the scene's secrets.
function view(scene, viewer, sys, players) {
  const list = scene?.secrets || [];
  if (viewer.role === 'dm') {
    return list.map((s) => ({ ...s, sees: players.filter((p) => canSee(sys, p, s)).map((p) => p.id), passive: players.filter((p) => notices(sys, p, s)).map((p) => p.id) }));
  }
  const pub = ({ id, text }) => ({ id, text });
  if (viewer.role === 'player') { const c = players.find((p) => p.id === viewer.charId); return c ? list.filter((s) => canSee(sys, c, s)).map(pub) : []; }
  if (['screen', 'codm', 'spectator'].includes(viewer.role)) return list.filter((s) => s.shown === 'all').map(pub);
  return [];
}

module.exports = { notices, canSee, make, scan, view };
