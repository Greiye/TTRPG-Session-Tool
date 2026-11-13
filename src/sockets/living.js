// Living world events (see src/living.js). The DM sets and overrides; automated results come from ticks,
// travel and the soundboard. Every result is written to the log (DM-only ones stay off phones and the TV).
const { state, log, broadcast } = require('../state');
const { actorOf } = require('../control');
const living = require('../living');

// Write a result's entries to the log and broadcast. Returns the result for the caller's ack.
function flush(r) {
  if (!r || r.error) return r;
  for (const e of r.entries || []) log('narrate', e.text, { tone: e.tone, vis: e.vis || undefined });
  broadcast();
  return r;
}

module.exports = function livingSockets(socket) {
  const isDm = () => socket.data.role === 'dm';
  const L = () => state.living;
  // DM events: refused for anyone else, answered through the ack, and broadcast once.
  const dm = (event, fn) => socket.on(event, (payload = {}, ack) => {
    if (!isDm()) return ack?.({ error: 'DM only.' });
    const r = fn(payload || {}) || {};
    if (r.error) return ack?.(r);
    if (r.entries) flush(r);
    else broadcast();
    ack?.({ ok: true, ...(r.id ? { id: r.id } : {}), ...(r.pending ? { pending: r.pending } : {}) });
  });

  // Clocks (between sessions and during travel)
  dm('dm:living:clock:add', (f) => living.addClock(L(), f));
  dm('dm:living:clock:advance', ({ id, delta, why }) => living.advance(state, id, delta, why));
  dm('dm:living:clock:remove', ({ id }) => { L().clocks = L().clocks.filter((c) => c.id !== id); });

  // Towns: standing, trade, roads between them, and shop links
  dm('dm:living:town:add', (f) => {
    const r = living.addTown(L(), f || {});
    return r.town ? { ...r, id: r.town.id } : r;
  });
  dm('dm:living:town:shift', ({ id, delta }) => ({ entries: living.shiftRep(state, { kind: 'town', id }, Number(delta) || 0, 'DM', 'dm') }));
  dm('dm:living:town:trade', ({ id, mode }) => living.setTrade(L(), id, mode));
  dm('dm:living:town:remove', ({ id }) => living.removeTown(state, id));
  dm('dm:living:link', ({ a, b, on }) => living.linkTowns(L(), a, b, !!on));
  dm('dm:living:shop', ({ id, town, night }) => living.setShop(state, id, { town, night }));

  // Rumours
  dm('dm:living:rumour:add', (f) => {
    const r = living.addRumour(state, f || {});
    return r.rumour ? { ...r, id: r.rumour.id } : r;
  });
  dm('dm:living:rumour:spread', ({ id, town }) => living.spreadTo(state, id, town));
  dm('dm:living:rumour:remove', ({ id }) => { L().rumours = L().rumours.filter((r) => r.id !== id); });

  // Weather, tension, and the world ticks (a session ends, or the party travels to a town)
  dm('dm:living:weather', ({ weather }) => living.setWeather(L(), weather));
  dm('dm:living:tension', ({ delta }) => living.bump(state, delta, 'DM'));
  dm('dm:living:session', () => living.onSession(state));
  dm('dm:living:travel', ({ town }) => living.onTravel(state, town));

  // Canon: the DM decides what a player proposed
  dm('dm:living:canon:decide', ({ id, approve }) => living.decideCanon(state, id, !!approve));

  // Oracles: the DM writes tables, rolls them, and accepts or overrides the result
  dm('dm:living:oracle:add', (f) => {
    const r = living.addOracle(L(), f || {});
    return r.oracle ? { ...r, id: r.oracle.id } : r;
  });
  dm('dm:living:oracle:roll', ({ id }) => living.roll(state, id));
  dm('dm:living:oracle:decide', ({ id, action, text }) => living.decideOracle(state, id, action, text));
  dm('dm:living:oracle:remove', ({ id }) => { L().oracles = L().oracles.filter((o) => o.id !== id); });

  // One-tap override: take back any recorded change
  dm('dm:living:undo', ({ id }) => living.undo(state, id));

  // Phone: a player proposes canon. The DM sees it first; nothing reaches the table until approved.
  socket.on('player:living:canon', ({ text, kind } = {}, ack) => {
    const p = actorOf(state, socket);
    if (!p) return ack?.({ error: 'Claim a character first.' });
    const r = living.propose(L(), { by: p.name, byId: p.id, text, kind });
    if (r.error) return ack?.(r);
    broadcast();
    ack?.({ ok: true });
  });
};

module.exports.flush = flush;
