// Downtime events (see src/downtime.js). Phones choose; the DM opens the week and writes results.
const { state, log, broadcast } = require('../state');
const { roster } = require('../roster');
const downtime = require('../downtime');

const { actorOf } = require('../control');

module.exports = function downtimeSockets(socket) {
  const isDm = () => socket.data.role === 'dm';
  const me = () => actorOf(state, socket); // while the DM holds a character, its phone cannot choose

  // DM: start a new week. Picks reset and open at once.
  socket.on('dm:downtime:start', () => {
    if (!isDm()) return;
    state.downtime = downtime.start(state.downtime);
    log('system', `Downtime week ${state.downtime.n} opens. Choose your activities before the next session.`, { tone: 'call' });
    broadcast();
  });

  // DM: open or close picks for the current week.
  socket.on('dm:downtime:open', ({ open } = {}) => {
    if (!isDm() || !state.downtime?.n) return;
    state.downtime.open = !!open;
    broadcast();
  });

  // DM: write one character's result (empty clears it). The character gets a private log line.
  socket.on('dm:downtime:resolve', ({ pid, text } = {}) => {
    if (!isDm() || !downtime.resolve(state.downtime, pid, text)) return;
    const c = roster[pid];
    if (c && String(text || '').trim()) log('downtime', `${c.name}'s downtime is resolved.`, { tone: 'good', vis: { to: [pid] } });
    broadcast();
  });

  // Phone: choose this week's activity. Replaces an earlier choice while picks are open.
  socket.on('player:downtime:choose', ({ kind, target } = {}, ack) => {
    const p = me();
    if (!p) return ack?.({ error: 'Claim a character first.' });
    const r = downtime.choose(state.downtime, p.id, kind, target);
    if (r.error) return ack?.(r);
    broadcast();
    ack?.({ ok: true });
  });
};
