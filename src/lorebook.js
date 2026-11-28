// Lore sync (Mike, Nov 19): keep the Lore tab and Mike's lore repo (Greiye/Artheria.ES.3D.Lore.Game) in step,
// over the same connection as the Creature Designer's wiki (src/wiki.js: GitHub token or a local clone).
//
//   Pull  reads content/lore/ (red books), content/artifacts/ (characters, songs, food, art) and content/table/
//         (pages this tool wrote) into Lore tab entries. Each entry remembers its page (its record's `sync`), so a second
//         pull updates it instead of adding a copy.
//   Push  writes the entries made at the table (and edits to pages that came from content/table/) to
//         content/table/<name>.md. The lore game's build only reads content/lore and content/artifacts, so a
//         pushed page can never break its deploy. Library books are never written: edit those in the lore repo.
//
// DM notes and the Share tick never leave the laptop. Format: docs/lore-sync.md.
const crypto = require('crypto');
const wiki = require('./wiki');
const lore = require('./lore');
const { frontmatter } = require('./designer');
const { slug } = require('./util');

const READ = ['content/lore', 'content/artifacts', 'content/table'];
const TABLE = 'content/table';
const TEXT_MAX = 2000; // the Lore tab's text limit (src/lore.js)
const hash = (t) => crypto.createHash('sha1').update(String(t)).digest('hex').slice(0, 16);

// Which Lore tab category a page belongs in: its `cat:` (pages this tool wrote), else its folder, type and tags.
const TAG_CAT = [
  [/^(dungeon|ruin|ruins|cave|crypt)$/, 'dungeon'],
  [/^(place|location|town|city|village|region|start-area)$/, 'location'],
  [/^(character|npc|villain|hero|person)$/, 'npc'],
  [/^(creature|beast|monster)$/, 'creature'],
  [/^(item|artifact|weapon|relic)$/, 'item'],
];
function catOf(folder, data) {
  if (lore.CATS[data.cat]) return data.cat;
  if (folder === 'content/artifacts' && data.type === 'character') return 'npc';
  const tags = (Array.isArray(data.tags) ? data.tags : []).map((t) => String(t).toLowerCase());
  for (const [re, cat] of TAG_CAT) if (tags.some((t) => re.test(t))) return cat;
  return folder === 'content/lore' ? 'book' : 'note';
}

// A page as a Lore tab entry: the title, and the body without its "# Title" line, cut to the text limit.
function fromPage(folder, text) {
  const { data, body } = frontmatter(String(text || ''));
  let t = body.replace(/^\s*#\s+.*\r?\n?/, '').trim();
  const name = String(data.title || /^#\s+(.+)$/m.exec(body)?.[1] || '').trim().slice(0, 80);
  if (t.length > TEXT_MAX) t = `${t.slice(0, TEXT_MAX - 1).replace(/\s+\S*$/, '')}…`;
  return { cat: catOf(folder, data), name, text: t };
}

const q = (s) => JSON.stringify(String(s ?? ''));
const day = (ms) => new Date(ms || Date.now()).toISOString().slice(0, 10);

// An entry as a content/table page, in the lore repo's front-block style. Never the DM note or Share.
function toPage(e, { author = 'mike', credit = 'Mike' } = {}) {
  return [
    '---',
    `title: ${q(e.name)}`,
    `contributor: ${q(author)}`,
    `credit_as: ${q(credit)}`,
    `created: ${day(e.created || e.at)}`,
    'type: table',
    `cat: ${e.cat}`,
    `tags: [${e.cat}, table]`,
    `game_id: ${e.id}`,
    '---',
    `# ${e.name}`,
    '',
    String(e.text || '').trim(),
  ].join('\n').trimEnd() + '\n';
}

const pageName = (e) => (e.src?.folder === TABLE ? e.src.path.split('/').pop().replace(/\.md$/i, '') : slug(e.name) || e.id);
// Changed at the table since the last pull or push.
const dirty = (e) => !e.src || (e.at || 0) > (e.src.at || 0);
// Pages from content/table, and entries made at the table. Records from Arthuria are edited in Arthuria.
const canPush = (e) => (e.src ? e.src.folder === TABLE : e.source !== 'arthuria');

// Pull every page into the Lore tab (the world store, src/entities.js). A page that has not changed since the
// last sync is skipped; one that changed while its entry was also edited at the table keeps the table's words
// (counted in `kept`).
async function pull(w) {
  const out = { added: 0, updated: 0, same: 0, kept: [], errors: [] };
  for (const folder of READ) {
    for (const p of await wiki.list(folder)) {
      const list = lore.list(w);
      const prev = list.find((e) => e.src?.path === p.path);
      if (prev && p.sha && prev.src.sha === p.sha) { out.same++; continue; }
      let page;
      try { page = await wiki.read(p.name, folder); } catch (err) { out.errors.push(`${p.path}: ${err.message}`); continue; }
      const h = hash(page.text);
      const got = fromPage(folder, page.text);
      if (!got.name) { out.errors.push(`${p.path}: no title`); continue; }
      const src = { folder, path: page.path, sha: page.sha || '', hash: h, at: Date.now() };
      const match = prev || list.find((e) => !e.src && e.cat === got.cat && e.name.toLowerCase() === got.name.toLowerCase());
      if (!match) {
        const r = lore.add(w, got);
        if (r.error) { out.errors.push(`${p.path}: ${r.error}`); continue; }
        lore.setSync(w, r.id, { ...src, at: lore.view(w[r.id]).at });
        out.added++;
        continue;
      }
      if (match.src?.hash === h) { lore.setSync(w, match.id, { ...src, at: match.src.at }); out.same++; continue; }
      if (match.src && dirty(match)) { out.kept.push(match.name); continue; }
      if (match.text === got.text && match.name === got.name) { lore.setSync(w, match.id, src); out.same++; continue; }
      const r = lore.edit(w, { id: match.id, name: got.name, text: got.text });
      if (r.error) { out.errors.push(`${p.path}: ${r.error}`); continue; }
      lore.setSync(w, r.id, { ...src, at: Date.now() });
      out.updated++;
    }
  }
  return out;
}

// Push the entries changed at the table to content/table/. One page that moved on in the repo since the last
// sync is not overwritten (listed in `conflicts`) unless `force`.
async function push(w, { force = false, ids } = {}) {
  const c = wiki.cfg();
  const out = { pushed: 0, conflicts: [], errors: [] };
  const todo = lore.list(w).filter((e) => canPush(e) && (ids ? ids.includes(e.id) : dirty(e)));
  for (const e of todo) {
    const text = toPage(e, { author: c.author, credit: c.credit });
    try {
      const r = await wiki.write(pageName(e), text, { folder: TABLE, sha: e.src?.sha || '', force, message: `${e.src ? 'Update' : 'Add'} ${e.name} from the Tavern Screen lore` });
      if (r.conflict) { out.conflicts.push(e.name); continue; }
      lore.setSync(w, e.id, { folder: TABLE, path: r.path, sha: r.sha || '', hash: hash(text), at: Date.now() });
      out.pushed++;
    } catch (err) {
      out.errors.push(`${e.name}: ${err.message}`);
      if (err.status === 401 || err.status === 403) break; // the same answer for every page
    }
  }
  return out;
}

// What the Lore tab shows next to the buttons: how many entries wait to be pushed.
const pending = (w) => lore.list(w).filter((e) => canPush(e) && dirty(e)).length;

module.exports = { READ, TABLE, catOf, fromPage, toPage, canPush, pull, push, pending };
