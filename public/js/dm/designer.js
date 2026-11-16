// Creature Designer (Mike, Nov 16, backlog PR W): a DM-only pop-up from Planning > Creatures. Design peoples,
// beasts, monsters and named persons with free stats (any system), skills, abilities, inventory and lore; send
// them to the combat library or the Lore tab; push and pull them as Markdown pages in the lore wiki repo.
import { $, call, mount, library } from '../client.js';
import { dmKey } from './auth.js';

const { esc } = Stage;
const hdr = () => ({ 'x-dm-key': dmKey() });
const lib = library('designs', { headers: hdr });
const KINDS = {
  people: ['🧝', 'People', 'A sentient race or ancestry'],
  beast: ['🐺', 'Beast', 'An animal or mount'],
  monster: ['👹', 'Monster', 'An aberration, demon or horror'],
  person: ['🧑', 'Person', 'One named sentient: NPC, villain, hero'],
};
const DETAILS = {
  people: ['Size', 'Lifespan', 'Homeland', 'Languages', 'Appearance', 'Society', 'Names'],
  beast: ['Size', 'Habitat', 'Diet', 'Temperament', 'Tameable', 'Pack size'],
  monster: ['Size', 'Habitat', 'Origin', 'Threat', 'Weakness'],
  person: ['Role', 'Faction', 'Location', 'Age', 'Personality', 'Wants', 'Fears', 'Voice'],
};
const PRESETS = {
  daggerheart: { name: 'Daggerheart', stats: ['Agility', 'Strength', 'Finesse', 'Instinct', 'Presence', 'Knowledge'], vitals: ['HP', 'Stress', 'Evasion', 'Armor', 'Thresholds', 'Difficulty'] },
  dnd5e: { name: 'D&D 5e', stats: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'], vitals: ['HP', 'AC', 'Speed', 'CR'] },
};
const load = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

// ----- Planning > Creatures card -----
mount(`
<div class="card cd-card" data-tab="designer" data-dm-only data-fold="open" id="cdCard">
  <h3>🐉 Creature Designer <span class="note" id="cdCount"></span></h3>
  <p class="note">Peoples, beasts, monsters and named persons, with stats for any system. Pages sync with the lore wiki.</p>
  <button class="btn primary cd-open" id="cdOpen">🐉 Open Creature Designer</button>
  <div class="cd-recent" id="cdRecent"></div>
</div>`);
mount(`
<div class="card" data-tab="designer" data-dm-only data-fold="closed" data-fold-key="wiki-link" id="cdWikiCard">
  <h3>🔗 Lore wiki <span class="note" id="cdWikiState"></span></h3>
  <div class="row"><label class="chk"><input type="radio" name="cdMode" value="github"> GitHub</label><label class="chk"><input type="radio" name="cdMode" value="folder"> Folder on this laptop</label><label class="chk"><input type="radio" name="cdMode" value="off"> Off</label></div>
  <div class="cd-gh">
    <label class="fld">Repository<input id="cdRepo" placeholder="Greiye/Artheria.ES.3D.Lore.Game"></label>
    <div class="row"><label class="fld grow">Branch<input id="cdBranch" placeholder="main"></label><label class="fld grow">Folder<input id="cdFolder" placeholder="content/creatures"></label></div>
    <label class="fld">Token <small class="muted" id="cdTokenState"></small><input id="cdToken" type="password" autocomplete="off" placeholder="Paste a fine-grained token (Contents: read and write)"></label>
    <p class="note">Make one at GitHub › Settings › Developer settings › Fine-grained tokens, for the lore repo only. It stays on this laptop.</p>
  </div>
  <div class="cd-dir"><label class="fld">Folder of the local clone<input id="cdDir" placeholder="C:\\Users\\you\\Documents\\GitHub\\Artheria.ES.3D.Lore.Game"></label><p class="note">Pages are written into the clone; commit and push them with GitHub Desktop.</p></div>
  <div class="row"><label class="fld grow">Credit as<input id="cdCredit" placeholder="Mike"></label><button class="btn primary" id="cdWikiSave">Save and test</button></div>
  <p class="note" id="cdWikiMsg" aria-live="polite"></p>
</div>`);

// ----- the pop-up -----
const dlg = document.createElement('dialog');
dlg.id = 'cdDlg';
dlg.className = 'cd-dlg';
dlg.setAttribute('aria-labelledby', 'cdHead');
dlg.innerHTML = `
<div class="cd-shell">
  <aside class="cd-side">
    <div class="row"><h3 class="grow" id="cdHead">🐉 Creatures</h3><button class="btn small primary" id="cdNew" title="New design">＋ New</button></div>
    <input id="cdFind" placeholder="Search designs" aria-label="Search designs">
    <div class="cd-tabs" role="tablist"><button class="chip on" data-cd-list="mine" role="tab">Mine</button><button class="chip" data-cd-list="wiki" role="tab">☁ Wiki</button></div>
    <div class="cd-list" id="cdList" role="listbox"></div>
  </aside>
  <section class="cd-main">
    <header class="row cd-top"><div class="cd-kinds" id="cdKinds" role="radiogroup" aria-label="Kind"></div><span class="grow"></span><span class="cd-sync" id="cdSync"></span><button class="btn" id="cdClose" aria-label="Close">✕</button></header>
    <form id="cdForm" class="cd-form" autocomplete="off">
      <div class="cd-hero">
        <label class="cd-art" title="Upload art"><img id="cdImg" alt=""><span id="cdArtHint">🖼<br><small>Art</small></span><input type="file" id="cdArt" accept="image/*,video/webm" hidden></label>
        <div class="grow cd-names">
          <input name="name" class="cd-name" maxlength="60" placeholder="Name" required>
          <input name="title" maxlength="80" placeholder="Epithet: Soldier strain of the Biomancer">
          <div class="row cd-race-row"><label class="fld grow">Race<input name="race" list="cdRaces" maxlength="60" placeholder="One of your peoples, or any"></label><button type="button" class="btn small" id="cdInherit" title="Copy the race's stats, vitals, skills and abilities into this person">⤓ From race</button><datalist id="cdRaces"></datalist></div>
          <input name="tags" maxlength="200" placeholder="Tags: goblin, red-book">
        </div>
      </div>
      <label class="fld">In short<textarea name="summary" rows="2" maxlength="400" placeholder="One or two lines the table can know"></textarea></label>
      <section class="cd-sec" data-sec="details"><h4>📜 Details</h4><div class="cd-rows" data-rows="details"></div><button type="button" class="btn small" data-add="details">＋ Detail</button></section>
      <section class="cd-sec" data-sec="stats"><h4>🎲 Stats <span class="cd-presets"><button type="button" class="btn small" data-preset="daggerheart">Daggerheart</button><button type="button" class="btn small" data-preset="dnd5e">D&amp;D 5e</button></span></h4>
        <div class="cd-rows cd-grid" data-rows="stats"></div><button type="button" class="btn small" data-add="stats">＋ Stat</button>
        <h4 class="cd-sub">❤ Vitals</h4><div class="cd-rows cd-grid" data-rows="vitals"></div><button type="button" class="btn small" data-add="vitals">＋ Vital</button></section>
      <section class="cd-sec" data-sec="skills"><h4>🧠 Skills</h4><div class="cd-rows cd-grid" data-rows="skills"></div><button type="button" class="btn small" data-add="skills">＋ Skill</button></section>
      <section class="cd-sec" data-sec="abilities"><h4>✨ Abilities <small class="muted">a roll (2d6+3) makes it an attack in combat</small></h4><div class="cd-rows" data-rows="abilities"></div><button type="button" class="btn small" data-add="abilities">＋ Ability</button></section>
      <section class="cd-sec" data-sec="inventory"><h4>🎒 Inventory</h4><div class="cd-rows" data-rows="inventory"></div><button type="button" class="btn small" data-add="inventory">＋ Item</button></section>
      <section class="cd-sec"><h4>📖 Lore <small class="muted">Markdown</small></h4><textarea name="lore" rows="6" maxlength="20000" placeholder="History, culture, where they come from. **Sources disagree** is welcome."></textarea></section>
      <section class="cd-sec cd-secret"><h4>🔒 DM only</h4><textarea name="dm" rows="3" maxlength="20000" placeholder="Secrets and hooks. Stays on this laptop unless you choose to push it."></textarea></section>
    </form>
    <footer class="row cd-foot">
      <button class="btn primary" id="cdSave">💾 Save</button>
      <button class="btn" id="cdCombat" title="Add or update a stat block in Combat › Creatures">⚔ To combat</button>
      <button class="btn" id="cdLore" title="Add or update an entry in the Lore tab">📚 To lore</button>
      <span class="grow"></span>
      <label class="chk" title="The lore repo may be public"><input type="checkbox" id="cdWithDm"> with DM notes</label>
      <button class="btn" id="cdMd" title="Download the page as a .md file">⬇ .md</button>
      <button class="btn primary cd-push" id="cdPush">☁ Push to wiki</button>
      <button class="btn small danger" id="cdDel">Delete</button>
    </footer>
    <p class="note cd-msg" id="cdMsg" aria-live="polite"></p>
  </section>
</div>`;
document.body.append(dlg);

let cur = null;      // the design being edited (a plain object, saved on Save)
let listMode = 'mine';
let pages = [];      // wiki pages from the last list
let wiki = null;     // wiki settings view
let dirty = false;

const msg = (t, tone = '') => { const m = $('#cdMsg'); m.textContent = t || ''; m.className = `note cd-msg ${tone}`; if (t) { m.classList.remove('pop'); void m.offsetWidth; m.classList.add('pop'); } };
const blank = (kind = load('cdKind', 'people')) => ({
  kind, name: '', title: '', summary: '', image: null, tags: [], race: '',
  details: DETAILS[kind].map((name) => ({ name, value: '' })), stats: [], vitals: [], skills: [], abilities: [], inventory: [], lore: '', dm: '', wiki: null,
});

// ----- rows -----
const ROW = {
  details: (r) => `<input data-k="name" value="${esc(r.name)}" placeholder="Detail" class="cd-k"><input data-k="value" value="${esc(r.value)}" placeholder="…" class="grow">`,
  stats: (r) => `<input data-k="name" value="${esc(r.name)}" placeholder="Stat" class="cd-k"><input data-k="value" value="${esc(r.value)}" placeholder="+0" class="cd-v">`,
  abilities: (r) => `<div class="cd-ab"><div class="row"><input data-k="name" value="${esc(r.name)}" placeholder="Ability" class="grow cd-abn"><input data-k="cost" value="${esc(r.cost)}" placeholder="Cost / uses" class="cd-cost"><input data-k="roll" value="${esc(r.roll)}" placeholder="Roll" class="cd-roll"></div><textarea data-k="text" rows="2" placeholder="What it does">${esc(r.text)}</textarea></div>`,
  inventory: (r) => `<input data-k="qty" type="number" min="1" value="${r.qty || 1}" class="cd-qty" aria-label="How many"><input data-k="name" value="${esc(r.name)}" placeholder="Item" class="grow"><input data-k="note" value="${esc(r.note)}" placeholder="Note" class="grow">`,
};
ROW.vitals = ROW.stats; ROW.skills = ROW.stats;
const NEW = { details: { name: '', value: '' }, stats: { name: '', value: '' }, vitals: { name: '', value: '' }, skills: { name: '', value: '' }, abilities: { name: '', cost: '', roll: '', text: '' }, inventory: { name: '', qty: 1, note: '' } };

function drawRows(key, fresh = -1) {
  const box = dlg.querySelector(`[data-rows="${key}"]`);
  box.innerHTML = cur[key].map((r, i) => `<div class="cd-row ${i === fresh ? 'fresh' : ''}" data-i="${i}">${ROW[key](r)}<button type="button" class="cd-x" data-del="${key}" title="Remove" aria-label="Remove">✕</button></div>`).join('');
}
function readRows(key) {
  cur[key] = [...dlg.querySelectorAll(`[data-rows="${key}"] .cd-row`)].map((row) => {
    const o = { ...NEW[key] };
    row.querySelectorAll('[data-k]').forEach((el) => { o[el.dataset.k] = el.type === 'number' ? Number(el.value) || 1 : el.value; });
    return o;
  });
}
const ROWS = ['details', 'stats', 'vitals', 'skills', 'abilities', 'inventory'];

function readForm() {
  const f = $('#cdForm').elements;
  for (const k of ['name', 'title', 'summary', 'race', 'lore', 'dm']) cur[k] = f[k].value;
  cur.tags = f.tags.value.split(',').map((t) => t.trim()).filter(Boolean);
  ROWS.forEach(readRows);
  return cur;
}

function drawKinds() {
  $('#cdKinds').innerHTML = Object.entries(KINDS).map(([k, [i, n, hint]]) => `<button type="button" role="radio" aria-checked="${cur.kind === k}" class="cd-kind ${cur.kind === k ? 'on' : ''}" data-kind="${k}" title="${hint}"><i>${i}</i>${n}</button>`).join('');
  dlg.classList.toggle('is-person', cur.kind === 'person');
}
function drawArt() {
  const img = $('#cdImg');
  img.hidden = !cur.image;
  if (cur.image) img.src = cur.image;
  $('#cdArtHint').hidden = !!cur.image;
}
function drawSync() {
  const w = cur.wiki;
  $('#cdSync').innerHTML = w ? `<span class="cd-chip ok" title="${esc(w.path)}">☁ ${esc(w.path.split('/').pop())}</span>` : cur.id ? '<span class="cd-chip">local only</span>' : '<span class="cd-chip">new</span>';
  $('#cdDel').hidden = !cur.id;
  for (const b of ['#cdCombat', '#cdLore', '#cdMd', '#cdPush']) $(b).disabled = !cur.id;
  $('#cdPush').disabled = !cur.id || !wiki?.ready;
  $('#cdPush').title = wiki?.ready ? `Write ${cur.wiki?.path || `${wiki.folder}/<name>.md`} in ${wiki.mode === 'folder' ? 'the local clone' : wiki.repo}` : 'Connect the wiki in Planning › Creatures › Lore wiki';
}
function drawRaces() {
  $('#cdRaces').innerHTML = lib.items.filter((d) => d.kind === 'people').map((d) => `<option value="${esc(d.name)}">`).join('');
}

function edit(d, { animate = true } = {}) {
  cur = structuredClone(d);
  const f = $('#cdForm').elements;
  for (const k of ['name', 'title', 'summary', 'race', 'lore', 'dm']) f[k].value = cur[k] || '';
  f.tags.value = (cur.tags || []).join(', ');
  ROWS.forEach((k) => drawRows(k));
  drawKinds(); drawArt(); drawSync(); drawRaces(); drawList();
  dirty = false;
  msg('');
  if (animate) { const form = $('#cdForm'); form.classList.remove('swap'); void form.offsetWidth; form.classList.add('swap'); form.scrollTop = 0; }
}

// ----- list -----
function drawList() {
  const q = $('#cdFind').value.trim().toLowerCase();
  if (listMode === 'mine') {
    const items = lib.items.filter((d) => !q || `${d.name} ${d.title} ${d.tags.join(' ')} ${d.race}`.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
    $('#cdList').innerHTML = items.map((d) => `<button class="cd-item ${cur?.id === d.id ? 'on' : ''}" data-open="${esc(d.id)}" role="option" aria-selected="${cur?.id === d.id}"><i>${KINDS[d.kind][0]}</i><span><b>${esc(d.name)}</b><small>${esc(d.title || d.race || KINDS[d.kind][1])}</small></span>${d.wiki ? '<em title="In the wiki">☁</em>' : ''}</button>`).join('')
      || `<p class="note">${lib.items.length ? 'Nothing matches.' : 'No designs yet. Press ＋ New.'}</p>`;
    return;
  }
  if (!wiki?.ready) { $('#cdList').innerHTML = '<p class="note">Connect the wiki in Planning › Creatures › Lore wiki.</p>'; return; }
  const shown = pages.filter((p) => !q || p.name.includes(q));
  $('#cdList').innerHTML = shown.map((p) => `<div class="cd-item cd-page"><i>📄</i><span><b>${esc(p.name)}</b><small>${p.design ? (p.behind ? 'changed in the wiki' : 'linked') : 'not on this laptop'}</small></span><button class="btn small" data-pull="${esc(p.name)}" title="Read this page into a design">⤓ Pull</button></div>`).join('')
    || '<p class="note">No pages in the wiki folder yet. Push one.</p>';
}
async function loadPages() {
  if (!wiki?.ready) return drawList();
  $('#cdList').innerHTML = '<p class="note cd-loading">Reading the wiki…</p>';
  const r = await call('dm:wiki:list');
  if (r?.error) { $('#cdList').innerHTML = `<p class="note bad">${esc(r.error)}</p>`; return; }
  pages = r.pages;
  drawList();
}

lib.onChange(() => {
  $('#cdCount').textContent = lib.items.length ? `${lib.items.length}` : '';
  $('#cdRecent').innerHTML = [...lib.items].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5).map((d) => `<button class="chip" data-recent="${esc(d.id)}">${KINDS[d.kind][0]} ${esc(d.name)}</button>`).join('');
  if (dlg.open) { drawList(); drawRaces(); }
});

// ----- open / close -----
async function openDlg(id) {
  wiki = (await call('dm:wiki:get'))?.wiki || wiki;
  const d = id && lib.byId(id);
  edit(d || (cur && !cur.id ? cur : blank()), { animate: false });
  dlg.showModal();
}
$('#cdOpen').onclick = () => openDlg(cur?.id);
$('#cdRecent').addEventListener('click', (e) => { const b = e.target.closest('[data-recent]'); if (b) openDlg(b.dataset.recent); });
const close = () => {
  if (dirty && !confirm('Close without saving your changes?')) return;
  dlg.classList.add('closing');
  setTimeout(() => { dlg.classList.remove('closing'); dlg.close(); }, 180);
};
$('#cdClose').onclick = close;
dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });

// ----- editing -----
$('#cdForm').addEventListener('input', () => { dirty = true; });
$('#cdForm').addEventListener('submit', (e) => e.preventDefault());
$('#cdKinds').addEventListener('click', (e) => {
  const b = e.target.closest('[data-kind]');
  if (!b || b.dataset.kind === cur.kind) return;
  readForm();
  const was = cur.kind;
  cur.kind = b.dataset.kind;
  keep('cdKind', cur.kind);
  // Swap the starter details only if none were filled in.
  if (cur.details.every((r) => !r.value) && cur.details.map((r) => r.name).join() === DETAILS[was].join()) { cur.details = DETAILS[cur.kind].map((name) => ({ name, value: '' })); drawRows('details'); }
  dirty = true;
  drawKinds();
});
dlg.addEventListener('click', (e) => {
  const add = e.target.closest('[data-add]');
  if (add) {
    const k = add.dataset.add;
    readRows(k);
    cur[k].push({ ...NEW[k] });
    drawRows(k, cur[k].length - 1);
    dlg.querySelector(`[data-rows="${k}"] .cd-row:last-child input, [data-rows="${k}"] .cd-row:last-child textarea`)?.focus();
    dirty = true;
    return;
  }
  const del = e.target.closest('[data-del]');
  if (del) {
    const row = del.closest('.cd-row');
    row.classList.add('leaving');
    setTimeout(() => { row.remove(); readRows(del.dataset.del); }, 160);
    dirty = true;
    return;
  }
  const pre = e.target.closest('[data-preset]');
  if (pre) {
    readForm();
    const p = PRESETS[pre.dataset.preset];
    const fill = (have, names) => { const old = new Map(have.map((r) => [r.name.toLowerCase(), r.value])); return [...names.map((n) => ({ name: n, value: old.get(n.toLowerCase()) || '' })), ...have.filter((r) => !names.some((n) => n.toLowerCase() === r.name.toLowerCase()) && r.value)]; };
    cur.stats = fill(cur.stats, p.stats);
    cur.vitals = fill(cur.vitals, p.vitals);
    drawRows('stats', -2); drawRows('vitals');
    dlg.querySelectorAll('[data-rows="stats"] .cd-row, [data-rows="vitals"] .cd-row').forEach((r, i) => { r.style.animationDelay = `${i * 30}ms`; r.classList.add('fresh'); });
    dirty = true;
  }
});
$('#cdInherit').onclick = () => {
  readForm();
  const race = lib.items.find((d) => d.kind === 'people' && d.name.toLowerCase() === cur.race.trim().toLowerCase());
  if (!race) return msg('Pick one of your peoples as the race first.', 'bad');
  const merge = (mine, theirs, key = 'name') => [...mine.filter((r) => r[key]), ...theirs.filter((t) => !mine.some((r) => r[key].toLowerCase() === t[key].toLowerCase()))];
  for (const k of ['stats', 'vitals', 'skills', 'abilities']) { cur[k] = merge(cur[k], race[k]); drawRows(k); }
  dlg.querySelectorAll('.cd-row').forEach((r) => r.classList.add('fresh'));
  dirty = true;
  msg(`Copied what ${race.name} have. Your own values were kept.`, 'good');
};
$('#cdArt').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const res = await fetch('/api/assets/creature', { method: 'POST', headers: { 'content-type': file.type, ...hdr() }, body: file });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return msg(out.error || 'Upload failed.', 'bad');
  cur.image = out.url;
  dirty = true;
  drawArt();
};

// ----- actions -----
async function save({ quiet = false } = {}) {
  readForm();
  if (!cur.name.trim()) { $('#cdForm').elements.name.reportValidity(); return null; }
  const r = await call('dm:design:save', cur);
  if (r?.error) { msg(r.error, 'bad'); return null; }
  cur = structuredClone(r.design);
  dirty = false;
  drawSync();
  if (!quiet) { msg(`Saved ${cur.name}.`, 'good'); flash('#cdSave'); }
  // The list refetches on the next state; show the new design at once.
  if (!lib.byId(cur.id)) lib.items.push(cur);
  drawList();
  return cur;
}
function flash(sel) { const b = $(sel); b.classList.remove('done'); void b.offsetWidth; b.classList.add('done'); }
$('#cdSave').onclick = () => save();
$('#cdNew').onclick = () => { if (dirty && !confirm('Start a new design without saving?')) return; edit(blank()); $('#cdForm').elements.name.focus(); };
$('#cdDel').onclick = async () => {
  if (!cur.id || !confirm(`Delete ${cur.name} from this laptop? Its wiki page stays.`)) return;
  await call('dm:design:delete', { id: cur.id });
  lib.items = lib.items.filter((d) => d.id !== cur.id);
  edit(blank());
};
$('#cdCombat').onclick = async () => {
  if (!(await save({ quiet: true }))) return;
  const r = await call('dm:design:combat', { id: cur.id });
  msg(r.error || (r.updated ? `Updated ${cur.name} in Combat › Creatures.` : `${cur.name} is in Combat › Creatures.`), r.error ? 'bad' : 'good');
  if (!r.error) flash('#cdCombat');
};
$('#cdLore').onclick = async () => {
  if (!(await save({ quiet: true }))) return;
  const r = await call('dm:design:lore', { id: cur.id });
  msg(r.error || (r.updated ? `Updated ${cur.name} in the Lore tab.` : `${cur.name} is in the Lore tab under ${cur.kind === 'person' ? 'NPCs' : 'Creatures'}.`), r.error ? 'bad' : 'good');
  if (!r.error) flash('#cdLore');
};
$('#cdMd').onclick = async () => {
  if (!(await save({ quiet: true }))) return;
  const r = await call('dm:design:markdown', { id: cur.id, dm: $('#cdWithDm').checked });
  if (r?.error) return msg(r.error, 'bad');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([r.text], { type: 'text/markdown' }));
  a.download = `${r.name}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
async function push(force = false) {
  if (!(await save({ quiet: true }))) return;
  const b = $('#cdPush');
  b.classList.add('busy'); b.disabled = true;
  const r = await call('dm:wiki:push', { id: cur.id, dm: $('#cdWithDm').checked, force });
  b.classList.remove('busy'); b.disabled = false;
  if (r?.conflict) {
    if (confirm(`${r.error}\n\nOK overwrites the wiki page with this design. Cancel keeps it, so you can pull it first.`)) return push(true);
    return msg('Not pushed. Pull the page from ☁ Wiki to see what changed.', 'bad');
  }
  if (r?.error) return msg(r.error, 'bad');
  cur.wiki = { path: r.path, sha: r.sha, at: Date.now() };
  drawSync();
  flash('#cdPush');
  msg(wiki.mode === 'folder' ? `Wrote ${r.path} in the local clone. Commit it in GitHub Desktop.` : `${r.created ? 'Added' : 'Updated'} ${r.path} on ${wiki.branch}.`, 'good');
  if (listMode === 'wiki') loadPages();
}
$('#cdPush').onclick = () => push();

// List: mine or wiki, search, open, pull.
dlg.querySelector('.cd-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cd-list]');
  if (!b) return;
  listMode = b.dataset.cdList;
  dlg.querySelectorAll('[data-cd-list]').forEach((x) => x.classList.toggle('on', x === b));
  if (listMode === 'wiki') loadPages(); else drawList();
});
$('#cdFind').addEventListener('input', drawList);
$('#cdList').addEventListener('click', async (e) => {
  const o = e.target.closest('[data-open]');
  if (o) { if (dirty && !confirm('Open another design without saving?')) return; edit(lib.byId(o.dataset.open)); return; }
  const p = e.target.closest('[data-pull]');
  if (!p) return;
  const linked = pages.find((x) => x.name === p.dataset.pull)?.design;
  if (linked && !confirm('Pull this page over the design on this laptop? DM notes that were never pushed are kept.')) return;
  p.disabled = true; p.textContent = '…';
  const r = await call('dm:wiki:pull', { name: p.dataset.pull });
  if (r?.error) { p.disabled = false; p.textContent = '⤓ Pull'; return msg(r.error, 'bad'); }
  const i = lib.items.findIndex((d) => d.id === r.design.id);
  if (i >= 0) lib.items[i] = r.design; else lib.items.push(r.design);
  edit(r.design);
  msg(`${r.updated ? 'Updated' : 'Pulled'} ${r.design.name} from the wiki.`, 'good');
  loadPages();
});
dlg.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); } });

// ----- wiki settings card -----
function drawWiki() {
  if (!wiki) return;
  document.querySelectorAll('[name="cdMode"]').forEach((r) => { r.checked = r.value === wiki.mode; });
  $('#cdRepo').value = wiki.repo; $('#cdBranch').value = wiki.branch; $('#cdFolder').value = wiki.folder; $('#cdDir').value = wiki.dir; $('#cdCredit').value = wiki.credit;
  $('#cdTokenState').textContent = wiki.tokenFromEnv ? '(set by LORE_GITHUB_TOKEN)' : wiki.hasToken ? '(saved; paste to replace)' : '(none yet)';
  $('#cdWikiCard').dataset.mode = wiki.mode;
  $('#cdWikiState').textContent = wiki.ready ? (wiki.mode === 'folder' ? '● folder' : '● connected') : '○ not connected';
  $('#cdWikiState').classList.toggle('on', wiki.ready);
}
document.querySelectorAll('[name="cdMode"]').forEach((r) => r.addEventListener('change', () => { $('#cdWikiCard').dataset.mode = r.value; }));
$('#cdWikiSave').onclick = async () => {
  const mode = document.querySelector('[name="cdMode"]:checked')?.value || 'github';
  const r = await call('dm:wiki:config', { mode, repo: $('#cdRepo').value, branch: $('#cdBranch').value, folder: $('#cdFolder').value, dir: $('#cdDir').value, credit: $('#cdCredit').value, author: $('#cdCredit').value.toLowerCase().replace(/[^a-z0-9]+/g, '-'), token: $('#cdToken').value });
  $('#cdToken').value = '';
  if (r?.error) { $('#cdWikiMsg').textContent = r.error; return; }
  wiki = r.wiki;
  drawWiki();
  if (!wiki.ready) { $('#cdWikiMsg').textContent = mode === 'off' ? 'The wiki is off. Designs stay on this laptop.' : 'Saved. Add a token (or a folder) to connect.'; return; }
  $('#cdWikiMsg').textContent = 'Testing…';
  const t = await call('dm:wiki:list');
  $('#cdWikiMsg').textContent = t?.error ? `Saved, but: ${t.error}` : `Connected: ${t.pages.length} page${t.pages.length === 1 ? '' : 's'} in ${wiki.folder}.`;
};
// Ask once the page knows it is the DM (the wiki is DM only).
window.addEventListener('dm:role', (e) => { if (!e.detail) call('dm:wiki:get').then((r) => { if (r?.wiki) { wiki = r.wiki; drawWiki(); } }); });
