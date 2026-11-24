// Lore tab events (src/lore.js) and the lore repo sync (src/lorebook.js). DM only: Battle and Social Masters
// never get these (src/roles.js).
const { state, broadcast } = require('../state');
const lore = require('../lore');
const lorebook = require('../lorebook');
const wiki = require('../wiki');

module.exports = function loreSockets(socket) {
  const dm = (event, fn) => socket.on(event, async (f = {}, ack) => {
    if (socket.data.role !== 'dm') return ack?.({ error: 'DM only.' });
    let r;
    try { r = await fn(f || {}); } catch (e) { r = { error: e.name === 'TimeoutError' ? 'GitHub did not answer in time. Is the laptop online?' : e.message }; }
    ack?.(r);
    if (!r?.error) broadcast();
  });
  dm('dm:lore:add', (f) => lore.add(state.world, f));
  dm('dm:lore:edit', (f) => lore.edit(state.world, f)); // { ok, id }: a new category can mean a new ID
  dm('dm:lore:remove', ({ id }) => (lore.remove(state.world, id) ? { ok: true } : { error: 'No such entry.' }));
  dm('dm:lore:pull', () => ({ ok: true, added: lore.pull(state.world, state) }));

  // ----- lore repo sync -----
  const needWiki = () => (wiki.ready() ? null : { error: 'Connect the lore repo first (Planning › 🐉 Creatures › wiki settings).' });
  dm('dm:lore:sync', () => ({ ok: true, ready: wiki.ready(), repo: wiki.cfg().repo, mode: wiki.cfg().mode, pending: lorebook.pending(state.world) }));
  dm('dm:lore:repo:pull', async () => needWiki() || { ok: true, ...(await lorebook.pull(state.world)) });
  dm('dm:lore:repo:push', async ({ force, ids }) => needWiki() || { ok: true, ...(await lorebook.push(state.world, { force: !!force, ids: Array.isArray(ids) ? ids.map(String) : undefined })) });
};
