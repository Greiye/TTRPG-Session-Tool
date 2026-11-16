// Lore tab events (src/lore.js). DM only: Battle and Social Masters never get these (src/roles.js).
const { state, broadcast } = require('../state');
const lore = require('../lore');

module.exports = function loreSockets(socket) {
  const dm = (event, fn) => socket.on(event, (f = {}, ack) => {
    if (socket.data.role !== 'dm') return ack?.({ error: 'DM only.' });
    const r = fn(f || {});
    ack?.(r);
    if (!r?.error) broadcast();
  });
  dm('dm:lore:add', (f) => lore.add(state.lore, f));
  dm('dm:lore:edit', (f) => lore.edit(state.lore, f));
  dm('dm:lore:remove', ({ id }) => (lore.remove(state.lore, id) ? { ok: true } : { error: 'No such entry.' }));
  dm('dm:lore:pull', () => ({ ok: true, added: lore.pull(state.lore, state) }));
};
