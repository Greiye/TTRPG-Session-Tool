// Creature keyword bank (Mike, Nov 19: "a key word bank? example frog = water, pond, swamp, bog"). Two parts:
// 1. 💡 Ideas in the Creature Designer: words from the bank that match the design's name, race, tags and summary
//    (frog → pond, swamp, slimy, croak…). Tap a word to put it in the field you were typing in (tags if none);
//    🎲 Spark writes one line of flavour into the lore. Nothing is filled in unless the DM taps it.
// 2. The bank itself (Planning › Creatures › 💡 Keyword bank): built-in words plus the DM's own, all editable.
import { $, call, mount, library } from '../client.js';
import { dmKey } from './auth.js';

const { esc } = Stage;
const lib = library('keywords', { headers: () => ({ 'x-dm-key': dmKey() }) });
const GROUPS = {
  habitat: ['🌿', 'Habitat'], look: ['👁', 'Look and feel'], sounds: ['👂', 'Sounds and smells'],
  behaviour: ['🐾', 'Behaviour'], hooks: ['🪝', 'Story hooks'], names: ['🏷', 'Name parts'],
};
const KEYS = Object.keys(GROUPS);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ----- 1. Ideas panel inside the designer -----
const cd = $('#cdDlg');
const form = $('#cdForm');
const panel = document.createElement('details');
panel.className = 'cd-sec kw-ideas';
panel.id = 'kwIdeas';
let open = true;
try { open = localStorage.getItem('kwIdeasOpen') !== '0'; } catch { /* private mode */ }
panel.open = open;
panel.innerHTML = `
<summary><h4>💡 Ideas <small class="muted">from the keyword bank: tap a word to add it where you were typing</small></h4></summary>
<div class="row kw-bar"><input id="kwLook" placeholder="Look up a word: frog, ghost, fire" aria-label="Look up a word" class="grow"><button type="button" class="btn small" id="kwSpark" title="Write one line of flavour into the lore from these words">🎲 Spark</button><button type="button" class="btn small" id="kwBankBtn" title="Edit the keyword bank">✎ Bank</button></div>
<div id="kwHits" class="kw-hits" aria-live="polite"></div>`;
form.querySelector('[name="summary"]').closest('label').after(panel);
panel.addEventListener('toggle', () => { try { localStorage.setItem('kwIdeasOpen', panel.open ? '1' : '0'); } catch { /* private mode */ } });

let matches = [];
let target = null; // the last text field the DM typed in
form.addEventListener('focusin', (e) => {
  const el = e.target;
  if (panel.contains(el)) return;
  if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|)$/.test(el.type))) target = el;
});

function readDesign() {
  const f = form.elements;
  return {
    name: f.name.value, title: f.title.value, race: f.race.value, tags: f.tags.value.split(','), summary: f.summary.value,
    details: [...form.querySelectorAll('[data-rows="details"] [data-k="value"]')].map((el) => ({ value: el.value })),
    text: $('#kwLook').value,
  };
}
function draw() {
  const box = $('#kwHits');
  $('#kwSpark').disabled = !matches.length;
  if (!matches.length) {
    box.innerHTML = '<p class="note">Type a name, race or tags (frog, wolf, ghost, goblin) and matching words show here.</p>';
    return;
  }
  box.innerHTML = matches.map((m, i) => `<div class="kw-hit" style="animation-delay:${i * 40}ms">
    <div class="row kw-head"><b>${esc(m.word)}</b>${m.matched !== m.word ? `<small class="muted">from “${esc(m.matched)}”</small>` : ''}<span class="grow"></span><button type="button" class="btn small" data-kw-edit="${esc(m.id)}" title="Edit this word in the bank">✎</button></div>
    ${KEYS.filter((k) => m[k]?.length).map((k) => `<div class="kw-group"><span class="kw-g" title="${GROUPS[k][1]}">${GROUPS[k][0]}</span>${m[k].map((w) => `<button type="button" class="kw-chip" data-kw="${esc(w)}" data-g="${k}">${esc(w)}</button>`).join('')}</div>`).join('')}
  </div>`).join('');
}
let timer = 0;
let asked = 0;
async function refresh() {
  if (!cd.open) return;
  const n = ++asked;
  const r = await call('dm:keywords:suggest', { design: readDesign() });
  if (n !== asked || r?.error) return;
  const before = matches.map((m) => m.id).join();
  matches = r.matches || [];
  if (matches.map((m) => m.id).join() !== before || !$('#kwHits').children.length) draw();
}
const later = () => { clearTimeout(timer); timer = setTimeout(refresh, 250); };
form.addEventListener('input', (e) => { if (!panel.contains(e.target)) later(); });
// Looking a word up is not an edit of the design (no "unsaved changes" for it).
$('#kwLook').addEventListener('input', (e) => { e.stopPropagation(); later(); });
cd.addEventListener('cd:edit', () => { matches = []; $('#kwLook').value = ''; draw(); later(); });
lib.onChange(() => { if (cd.open) later(); });

// Put a word where the DM was typing: tags get ", word"; the name gets " word" (name parts); other
// fields get it at the cursor, after a comma if the text runs straight into it.
function insert(word) {
  const el = target && form.contains(target) ? target : form.elements.tags;
  const v = el.value;
  if (el === form.elements.tags) {
    const have = v.split(',').map((t) => t.trim().toLowerCase());
    if (!have.includes(word.toLowerCase())) el.value = v.trim() ? `${v.replace(/[\s,]+$/, '')}, ${word}` : word;
  } else {
    const at = el.selectionStart ?? v.length;
    const end = el.selectionEnd ?? at;
    const prev = v.slice(0, at);
    const sep = !prev.trim() || /[\s(]$/.test(prev) ? '' : el === form.elements.name || /[,;:.!?]$/.test(prev) ? ' ' : ', ';
    el.value = prev + sep + word + v.slice(end);
    const pos = (prev + sep + word).length;
    try { el.setSelectionRange(pos, pos); } catch { /* not every input has a cursor */ }
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.classList.remove('kw-got'); void el.offsetWidth; el.classList.add('kw-got');
}
panel.addEventListener('mousedown', (e) => { if (e.target.closest('.kw-chip')) e.preventDefault(); }); // keep the cursor where it was
panel.addEventListener('click', (e) => {
  const chip = e.target.closest('.kw-chip');
  if (chip) { insert(chip.dataset.kw); chip.classList.add('used'); return; }
  const ed = e.target.closest('[data-kw-edit]');
  if (ed) openBank(ed.dataset.kwEdit);
});
$('#kwBankBtn').onclick = () => openBank(matches[0]?.id);

// 🎲 Spark: one random word from each group across the matches, as one line at the end of the lore.
function spark() {
  const all = (k) => matches.flatMap((m) => m[k] || []);
  const [h, l, s, b, hook] = ['habitat', 'look', 'sounds', 'behaviour', 'hooks'].map((k) => (all(k).length ? pick(all(k)) : ''));
  const bits = [h && `Found near ${h}`, l && l, s && `smells or sounds of ${s}`, b && b].filter(Boolean);
  return `${bits.join('; ')}.${hook ? ` Hook: ${hook}.` : ''}`.replace(/^\./, '').trim();
}
$('#kwSpark').onclick = () => {
  if (!matches.length) return;
  const lore = form.elements.lore;
  const line = spark();
  lore.value = lore.value.trim() ? `${lore.value.replace(/\s+$/, '')}\n\n${line}` : line;
  lore.dispatchEvent(new Event('input', { bubbles: true }));
  lore.classList.remove('kw-got'); void lore.offsetWidth; lore.classList.add('kw-got');
  lore.scrollIntoView({ block: 'nearest', behavior: document.documentElement.dataset.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
};

// ----- 2. The bank (its own pop-up, opened from Planning › Creatures or from ✎ in the ideas panel) -----
mount(`
<div class="card" data-tab="designer" data-dm-only data-fold="closed" data-fold-key="kw-bank" id="kwCard">
  <h3>💡 Keyword bank <span class="note" id="kwCount"></span></h3>
  <p class="note">Words that spark creature ideas: frog = pond, swamp, slimy, croak. The Creature Designer suggests them. Add your own or change any.</p>
  <button class="btn" id="kwOpen">💡 Open keyword bank</button>
</div>`);
const dlg = document.createElement('dialog');
dlg.id = 'kwDlg';
dlg.className = 'cd-dlg kw-dlg';
dlg.setAttribute('aria-labelledby', 'kwHead');
dlg.innerHTML = `
<div class="cd-shell">
  <aside class="cd-side">
    <div class="row"><h3 class="grow" id="kwHead">💡 Keywords</h3><button class="btn small primary" id="kwNew">＋ New</button></div>
    <input id="kwFind" placeholder="Search words" aria-label="Search words">
    <div class="cd-list" id="kwList" role="listbox"></div>
  </aside>
  <section class="cd-main">
    <header class="row cd-top"><span class="grow note" id="kwState"></span><button class="btn" id="kwClose" aria-label="Close">✕</button></header>
    <form id="kwForm" class="cd-form" autocomplete="off">
      <label class="fld">Word<input name="word" maxlength="40" placeholder="frog" required></label>
      <label class="fld">Also matches <small class="muted">other names that should find this word, comma separated</small><input name="also" maxlength="600" placeholder="toad, newt"></label>
      ${KEYS.map((k) => `<label class="fld">${GROUPS[k][0]} ${GROUPS[k][1]}<textarea name="${k}" rows="2" maxlength="1500" placeholder="comma separated"></textarea></label>`).join('')}
    </form>
    <footer class="row cd-foot">
      <button class="btn primary" id="kwSave">💾 Save</button>
      <span class="grow"></span>
      <button class="btn small" id="kwReset" title="Put the built-in words back">↺ Reset</button>
      <button class="btn small danger" id="kwDel">Delete</button>
    </footer>
    <p class="note cd-msg" id="kwMsg" aria-live="polite"></p>
  </section>
</div>`;
document.body.append(dlg);

let cur = null;
const blank = () => ({ id: '', word: '', also: [], ...Object.fromEntries(KEYS.map((k) => [k, []])) });
const say = (t, tone = '') => { const m = $('#kwMsg'); m.textContent = t || ''; m.className = `note cd-msg ${tone}`; if (t) { m.classList.remove('pop'); void m.offsetWidth; m.classList.add('pop'); } };
function drawBank() {
  const q = $('#kwFind').value.trim().toLowerCase();
  const items = lib.items.filter((e) => !q || [e.word, ...e.also].some((w) => w.includes(q)));
  $('#kwList').innerHTML = items.map((e) => `<button class="cd-item ${cur?.id === e.id ? 'on' : ''}" data-kw-open="${esc(e.id)}" role="option" aria-selected="${cur?.id === e.id}"><span><b>${esc(e.word)}</b><small>${esc(e.also.join(', ') || e.habitat.slice(0, 3).join(', '))}</small></span>${e.builtin ? (e.edited ? '<em title="Built-in, changed by you">✎</em>' : '') : '<em title="Your own word">★</em>'}</button>`).join('')
    || `<p class="note">${lib.items.length ? 'Nothing matches.' : 'No words yet.'}</p>`;
}
function editEntry(e) {
  cur = structuredClone(e || blank());
  const f = $('#kwForm').elements;
  f.word.value = cur.word;
  f.also.value = cur.also.join(', ');
  for (const k of KEYS) f[k].value = (cur[k] || []).join(', ');
  $('#kwState').textContent = !cur.id ? 'New word' : cur.builtin ? (cur.edited ? 'Built-in, changed by you' : 'Built-in') : 'Your own word';
  $('#kwReset').hidden = !(cur.builtin && cur.edited);
  $('#kwDel').hidden = !cur.id;
  $('#kwDel').textContent = cur.builtin ? 'Remove' : 'Delete';
  say('');
  drawBank();
  const fm = $('#kwForm'); fm.classList.remove('swap'); void fm.offsetWidth; fm.classList.add('swap');
}
function openBank(id) {
  editEntry(lib.byId(id) || (id ? null : lib.items[0]) || null);
  if (!dlg.open) dlg.showModal();
}
const reload = (r, word) => {
  const i = lib.items.findIndex((x) => x.id === (r.entry?.id || word));
  if (r.entry) { if (i >= 0) lib.items[i] = r.entry; else lib.items.push(r.entry); lib.items.sort((a, b) => a.word.localeCompare(b.word)); }
  else if (i >= 0) lib.items.splice(i, 1);
};
$('#kwOpen').onclick = () => openBank();
$('#kwNew').onclick = () => { editEntry(null); $('#kwForm').elements.word.focus(); };
$('#kwFind').addEventListener('input', drawBank);
$('#kwList').addEventListener('click', (e) => { const b = e.target.closest('[data-kw-open]'); if (b) editEntry(lib.byId(b.dataset.kwOpen)); });
$('#kwForm').addEventListener('submit', (e) => e.preventDefault());
$('#kwSave').onclick = async () => {
  const f = $('#kwForm').elements;
  if (!f.word.value.trim()) { f.word.reportValidity(); return; }
  const r = await call('dm:keywords:save', { id: cur.id, word: f.word.value, also: f.also.value, ...Object.fromEntries(KEYS.map((k) => [k, f[k].value])) });
  if (r?.error) return say(r.error, 'bad');
  if (cur.id && cur.id !== r.entry.id) reload({}, cur.id);
  reload(r);
  editEntry(r.entry);
  say(`Saved ${r.entry.word}.`, 'good');
  later();
};
$('#kwDel').onclick = async () => {
  if (!cur.id || !confirm(cur.builtin ? `Remove the built-in word ${cur.word} from the bank? You can add it again with ＋ New.` : `Delete ${cur.word}?`)) return;
  const r = await call('dm:keywords:delete', { id: cur.id });
  if (r?.error) return say(r.error, 'bad');
  reload({}, cur.id);
  editEntry(lib.items[0] || null);
  later();
};
$('#kwReset').onclick = async () => {
  const r = await call('dm:keywords:reset', { id: cur.id });
  if (r?.error) return say(r.error, 'bad');
  reload(r);
  editEntry(r.entry);
  say(`${r.entry.word} is back to the built-in words.`, 'good');
  later();
};
const closeBank = () => { dlg.classList.add('closing'); setTimeout(() => { dlg.classList.remove('closing'); dlg.close(); }, 180); };
$('#kwClose').onclick = closeBank;
dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeBank(); });
lib.onChange(() => { $('#kwCount').textContent = lib.items.length ? `${lib.items.length} words` : ''; if (dlg.open) drawBank(); });
draw();
