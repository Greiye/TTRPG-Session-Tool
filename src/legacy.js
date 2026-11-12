// Character death and legacy. A fallen character leaves the party, gets a memorial card on the TV,
// and keeps a death record (cause, epitaph, date) that is exported to Arthuria with the bundle.
const hub = require('./hub');
const { state, log, broadcast } = require('./state');
const { roster, saveRoster } = require('./roster');
const { release } = require('./session');
const { str } = require('./util');

// Mark a character dead. Idempotent: a second call on a fallen character only updates the record.
function fall(id, { cause, epitaph } = {}) {
  const c = roster[id];
  if (!c) return { error: 'No such character.' };
  const first = !c.death;
  c.death = { at: new Date().toISOString(), cause: str(cause, 200), epitaph: str(epitaph, 300), session: state.scene.title };
  c.hp = 0;
  const sock = c.socketId ? hub.io.sockets.sockets.get(c.socketId) : null;
  release(c);
  sock?.emit('fallen'); // after release(), which sends 'taken', so the phone shows the fallen message
  delete state.players[id];
  state.combat.order = state.combat.order.filter((o) => o.id !== id);
  state.memorial = { id, name: c.name, race: c.race, cls: c.cls, level: c.level, hue: c.hue, portrait: c.portrait || null, cause: c.death.cause, epitaph: c.death.epitaph, n: (state.memorial?.n || 0) + 1 };
  if (first) log('system', `${c.name} has fallen.`, { tone: 'bad' });
  saveRoster();
  return { ok: true };
}

// Bring a character back (a DM mistake, or a resurrection in play). Does not seat them again.
function revive(id) {
  const c = roster[id];
  if (!c || !c.death) return { error: 'Not fallen.' };
  delete c.death;
  if (state.memorial?.id === id) state.memorial = null;
  log('system', `${c.name} is back among the living.`, { tone: 'good' });
  saveRoster();
  return { ok: true };
}

const clearMemorial = () => { state.memorial = null; };

module.exports = { fall, revive, clearMemorial };
