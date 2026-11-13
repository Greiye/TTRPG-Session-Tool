// Phase J table legends: hall of fame awards, trophy shelf, house rules, empty-chair autopilot and the
// TV legends card. DM-only edits; every viewer reads the results through the shared state.
const { state, log, broadcast } = require('../state');
const { roster } = require('../roster');
const legends = require('../legends');
const houserules = require('../houserules');
const absent = require('../absent');

module.exports = function legendSockets(socket) {
  const isDm = () => socket.data.role === 'dm';
  // Handlers ack { ok } or { error }, so the DM screen can show why a change was refused.
  const dm = (event, fn) => socket.on(event, (payload = {}, ack) => {
    if (!isDm()) return ack?.({ error: 'Only the DM can do that.' });
    const r = fn(payload || {}) || { ok: true };
    if (!r.error) broadcast();
    ack?.(r);
  });

  dm('dm:legend:award', ({ cat, charId, detail }) => {
    const c = roster[charId];
    if (!c) return { error: 'Pick a character.' };
    const r = legends.award(cat, { player: c.player || c.name, character: c.name, detail, session: state.scene.title });
    if (r.error) return r;
    log('system', `${c.player || c.name} takes the ${legends.CATS[cat].toLowerCase()} in the hall of fame.`, { tone: 'good' });
    return { ok: true };
  });
  dm('dm:legend:remove', ({ id }) => (legends.removeAward(id) ? { ok: true } : { error: 'No such record.' }));

  dm('dm:trophy:add', ({ name, story }) => {
    const r = legends.addTrophy({ name, story, session: state.scene.title });
    if (r.error) return r;
    log('system', `${r.trophy.name} goes on the trophy shelf.`, { tone: 'good' });
    return { ok: true, id: r.trophy.id };
  });
  dm('dm:trophy:remove', ({ id }) => {
    if (state.trophy?.id === id) state.trophy = null;
    return legends.removeTrophy(id) ? { ok: true } : { error: 'No such trophy.' };
  });
  // Open a trophy's story on the TV (id null closes it). Every open is a new card, so the TV animates again.
  dm('dm:trophy:open', ({ id }) => {
    if (!id) { state.trophy = null; return { ok: true }; }
    if (!legends.trophy(id)) return { error: 'No such trophy.' };
    state.trophy = { id, n: (state.trophy?.n || 0) + 1 };
    return { ok: true };
  });
  // Show the hall or the shelf on the TV (null hides it). Trophy stories take the screen first.
  dm('dm:legends:show', ({ view }) => {
    state.legendsShow = ['hall', 'shelf'].includes(view) ? view : null;
    return { ok: true };
  });

  dm('dm:houserule', ({ id, on }) => houserules.set(state, id, on));

  dm('dm:autopilot', ({ charId, on }) => {
    const r = absent.setAutopilot(state, charId, on);
    if (!r.error) log('system', `${state.players[charId].name} is ${on ? 'on autopilot' : 'back under the DM'}.`, { tone: 'call' });
    return r;
  });
};
