// Creature Designer and lore wiki events (PR W). DM only: Battle and Social Masters never get these.
const { state, broadcast } = require('../state');
const designer = require('../designer');
const keywords = require('../keywords');
const wiki = require('../wiki');
const lore = require('../lore');
const creatures = require('../creatures');
const items = require('../itemlib');
const { roster, saveRoster } = require('../roster');
const { applySheet } = require('../sheet');

module.exports = function designerSockets(socket) {
  const dm = (event, fn) => socket.on(event, async (f = {}, ack) => {
    if (socket.data.role !== 'dm') return ack?.({ error: 'DM only.' });
    let r;
    try { r = await fn(f || {}); } catch (e) { r = { error: e.name === 'TimeoutError' ? 'GitHub did not answer in time. Is the laptop online?' : e.message }; }
    ack?.(r);
    if (!r?.error) broadcast();
  });
  const get = (id) => designer.lib.get(id);

  dm('dm:design:save', (f) => {
    if (!String(f.name || '').trim()) return { error: 'Give it a name.' };
    return { ok: true, design: designer.save(f) };
  });
  dm('dm:design:delete', ({ id }) => (designer.lib.remove(id) ? { ok: true } : { error: 'No such design.' }));
  dm('dm:design:markdown', ({ id, dm: withDm }) => {
    const d = get(id);
    if (!d) return { error: 'No such design.' };
    const c = wiki.cfg();
    return { ok: true, name: designer.fileSlug(d), text: designer.toMarkdown(d, { dm: !!withDm, author: c.author, credit: c.credit }) };
  });
  // Into the combat creature library: a new stat block, or the one made from this design before.
  dm('dm:design:combat', ({ id }) => {
    const d = get(id);
    if (!d) return { error: 'No such design.' };
    const prev = creatures.lib.list().find((c) => c.source === 'designer' && (c.designId === d.id || c.name === d.name));
    const block = creatures.upsert({ ...designer.toStatBlock(d), id: prev?.id });
    block.designId = d.id;
    creatures.lib.touch();
    return { ok: true, id: block.id, updated: !!prev };
  });
  // Into the Lore tab: a new entry, or an update of the one with the same name.
  dm('dm:design:lore', ({ id }) => {
    const d = get(id);
    if (!d) return { error: 'No such design.' };
    const e = designer.toLore(d);
    const prev = state.lore.find((x) => x.cat === e.cat && x.name.toLowerCase() === e.name.toLowerCase());
    if (prev) return { ...lore.edit(state.lore, { id: prev.id, text: e.text, dm: e.dm }), updated: true };
    return lore.add(state.lore, e);
  });

  // ----- keyword bank (Nov 19): suggestions for a design, and the DM's own words -----
  dm('dm:keywords:suggest', (f) => ({ ok: true, groups: keywords.GROUPS, matches: keywords.suggest(f.design || {}, { limit: 6 }) }));
  dm('dm:keywords:save', (f) => keywords.save(f));
  dm('dm:keywords:delete', ({ id }) => keywords.remove(String(id || '')));
  dm('dm:keywords:reset', ({ id }) => keywords.reset(String(id || '')));

  // ----- Item Designer and item cards (Nov 18) -----
  dm('dm:item:save', (f) => {
    if (!String(f.name || '').trim()) return { error: 'Give it a name.' };
    return { ok: true, item: items.save(f) };
  });
  dm('dm:item:delete', ({ id }) => (items.lib.remove(id) ? { ok: true } : { error: 'No such item.' }));
  dm('dm:item:samples', () => { items.seed(); return { ok: true }; });
  // Give a card to characters: one more of an item they already carry by that name, or a new pack entry.
  dm('dm:item:give', ({ id, to, qty }) => {
    const it = items.lib.get(id);
    if (!it) return { error: 'No such item.' };
    const ids = (Array.isArray(to) ? to : [to]).filter((x) => state.players[x] && roster[x]);
    if (!ids.length) return { error: 'Pick who gets it.' };
    const n = Math.max(1, Math.min(9999, Math.floor(Number(qty)) || 1));
    for (const cid of ids) {
      const c = roster[cid];
      const have = (c.inventory || []).find((i) => i.name.toLowerCase() === it.name.toLowerCase());
      if (have) applySheet(c, { inv: { op: 'set', id: have.id, qty: have.qty + n } }, true);
      else applySheet(c, { inv: { op: 'add', name: it.name, qty: n, note: it.note, img: it.image, icon: items.KINDS[it.kind], rarity: it.rarity } }, true);
    }
    saveRoster();
    return { ok: true, given: ids.length };
  });

  // ----- wiki -----
  dm('dm:wiki:get', () => ({ ok: true, wiki: wiki.view() }));
  dm('dm:wiki:config', (f) => ({ ok: true, wiki: wiki.configure(f) }));
  // Pages in the wiki folder, each marked with the design it belongs to (if any).
  dm('dm:wiki:list', async () => {
    const pages = await wiki.list();
    const mine = designer.lib.list();
    return { ok: true, pages: pages.map((p) => {
      const d = mine.find((x) => x.wiki?.path === p.path) || mine.find((x) => designer.fileSlug(x) === p.name);
      return { ...p, design: d?.id || null, behind: !!(d?.wiki?.sha && p.sha && d.wiki.sha !== p.sha) };
    }) };
  });
  // Pull one page into a design: updates the design linked to it, or makes a new one.
  dm('dm:wiki:pull', async ({ name }) => {
    const page = await wiki.read(name);
    const mine = designer.lib.list();
    const prev = mine.find((x) => x.wiki?.path === page.path) || mine.find((x) => designer.fileSlug(x) === name);
    const d = designer.fromMarkdown(page.text, prev || {});
    d.wiki = { path: page.path, sha: page.sha, at: Date.now() };
    designer.lib.set(d);
    return { ok: true, design: d, updated: !!prev };
  });
  // Push a design to its page. A page changed on GitHub since the last pull comes back as { conflict }.
  dm('dm:wiki:push', async ({ id, dm: withDm, force }) => {
    const d = get(id);
    if (!d) return { error: 'No such design.' };
    const c = wiki.cfg();
    const name = d.wiki?.path ? d.wiki.path.split('/').pop().replace(/\.md$/i, '') : designer.fileSlug(d);
    const r = await wiki.write(name, designer.toMarkdown(d, { dm: !!withDm, author: c.author, credit: c.credit }), { sha: d.wiki?.sha, force: !!force });
    if (r.conflict) return { conflict: true, error: 'This page changed in the wiki since you last pulled it. Pull it first, or overwrite it.' };
    d.wiki = { path: r.path, sha: r.sha, at: Date.now() };
    designer.lib.touch();
    return { ok: true, ...r };
  });
};
