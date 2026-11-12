// Creature library (stat blocks): search, add to the encounter, edit, and SRD / Open5e import.
import { socket, $, emit, call, library } from '../client.js';
import { dmKey } from './auth.js';

const { esc } = Stage;
const SIDE = { enemy: '👹', ally: '🛡', neutral: '🕊' };
const hdr = () => ({ 'x-dm-key': dmKey() });
const lib = library('creatures', { headers: hdr });
let editing = null;
let art = null;

function render() {
  const q = $('#crSearch').value.trim().toLowerCase();
  const list = lib.items.filter((c) => !q || `${c.name} ${c.kind} ${c.side}`.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  $('#crList').innerHTML = list.slice(0, 40).map((c) => `
    <div class="item cr-item">
      <span>${SIDE[c.side]} <b>${esc(c.name)}</b>${c.boss ? ' 👑' : ''} <small class="muted">${c.cr ? `CR ${esc(c.cr)} · ` : ''}HP ${c.hp} · AC ${c.ac}${c.speed.fly ? ` · fly ${c.speed.fly}` : ''}</small></span>
      <span class="row"><button class="btn small primary" data-spawn="${esc(c.id)}" title="Add one to the encounter">+1</button><button class="btn small" data-spawn="${esc(c.id)}" data-n="3" title="Add three">+3</button><button class="btn small" data-credit="${esc(c.id)}" title="Edit stat block">✎</button></span>
    </div>`).join('') + (list.length > 40 ? `<p class="note">${list.length - 40} more. Type to narrow the list.</p>` : '') || '<p class="note">No stat blocks match.</p>';
}
lib.onChange(render);
$('#crSearch').oninput = render;

const attackLine = (a) => [a.name, (a.atk >= 0 ? '+' : '') + a.atk, a.dmg, a.type, a.range].join(' | ').replace(/( \| )+$/, '');
function open(c) {
  editing = c || null;
  art = c?.image || null;
  const f = $('#crForm').elements;
  $('#crTitle').textContent = c ? c.name : 'New creature';
  const v = c || { name: '', side: 'enemy', kind: '', cr: '', hp: 10, ac: 12, init: 0, speed: { walk: 30, fly: 0, swim: 0, climb: 0 }, attacks: [], traits: [], notes: '', boss: false, title: '' };
  for (const k of ['name', 'side', 'kind', 'cr', 'hp', 'ac', 'init', 'notes', 'title']) f[k].value = v[k] ?? '';
  for (const k of ['walk', 'fly', 'swim', 'climb']) f[k].value = v.speed[k] || (k === 'walk' ? 0 : '');
  f.boss.checked = !!v.boss;
  f.attacks.value = v.attacks.map(attackLine).join('\n');
  f.traits.value = v.traits.map((t) => `${t.name}: ${t.text}`).join('\n');
  $('#crDelete').hidden = !c;
  $('#crDlg').showModal();
}
function read() {
  const f = $('#crForm').elements;
  const cells = (line) => line.split('|').map((x) => x.trim());
  return {
    id: editing?.id, name: f.name.value, side: f.side.value, kind: f.kind.value, cr: f.cr.value, hp: f.hp.value, ac: f.ac.value, init: f.init.value,
    speed: { walk: f.walk.value, fly: f.fly.value, swim: f.swim.value, climb: f.climb.value },
    attacks: f.attacks.value.split('\n').map(cells).filter((a) => a[0]).map(([name, atk, dmg, type, range]) => ({ name, atk: parseInt(atk, 10) || 0, dmg, type, range })),
    traits: f.traits.value.split('\n').filter((l) => l.trim()).map((l) => { const i = l.indexOf(':'); return i < 0 ? { name: '', text: l.trim() } : { name: l.slice(0, i).trim(), text: l.slice(i + 1).trim() }; }),
    notes: f.notes.value, boss: f.boss.checked, title: f.title.value, image: art, source: editing?.source,
  };
}
$('#crNew').onclick = () => open(null);
$('#crSave').onclick = async () => {
  if (!$('#crForm').elements.name.value.trim()) return $('#crForm').elements.name.reportValidity();
  await call('dm:creature:save', read());
  $('#crDlg').close();
};
$('#crDelete').onclick = () => { if (editing && confirm(`Delete the ${editing.name} stat block?`)) { emit('dm:creature:delete', { id: editing.id }); $('#crDlg').close(); } };
$('#crArt').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const res = await fetch('/api/assets/creature', { method: 'POST', headers: { 'content-type': file.type, ...hdr() }, body: file });
  const out = await res.json().catch(() => ({}));
  if (res.ok) { art = out.url; $('#crArtBtn').firstChild.textContent = 'Art uploaded ✓ '; } else alert(out.error || 'Upload failed');
};
$('#crList').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.spawn) emit('dm:creature:spawn', { id: b.dataset.spawn, count: Number(b.dataset.n) || 1 });
  else if (b.dataset.credit) open(lib.byId(b.dataset.credit));
});

// ----- import -----
let found = [];
const status = (t) => { $('#srdStatus').textContent = t; };
$('#crImportBtn').onclick = () => { $('#crImport').hidden = !$('#crImport').hidden; };
$('#srdFile').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  status('Importing…');
  try {
    const res = await fetch(`/api/srd/import?source=${encodeURIComponent(file.name.replace(/\.json$/i, ''))}`, { method: 'POST', headers: { 'content-type': 'application/json', ...hdr() }, body: await file.text() });
    const out = await res.json();
    status(res.ok ? `Imported ${out.monsters} creatures and ${out.spells} spells${out.skipped ? `, skipped ${out.skipped} entries` : ''}.` : `Import failed: ${out.error || res.status}`);
  } catch (err) { status(`Import failed: ${err.message}`); }
};
async function search() {
  const q = $('#srdQ').value.trim();
  if (!q) return;
  status('Searching Open5e…');
  const kind = $('#srdKind').value;
  const res = await fetch(`/api/srd/search?kind=${kind}&q=${encodeURIComponent(q)}`, { headers: hdr() });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) { status(out.error || 'Search failed.'); return; }
  found = out.results.map((x) => ({ kind, x }));
  status(found.length ? '' : 'Nothing found.');
  $('#srdResults').innerHTML = found.map(({ x }, i) => `<div class="item cr-item"><span><b>${esc(x.name)}</b> <small class="muted">${kind === 'spell' ? `level ${x.level} ${esc(x.school)}` : `CR ${esc(x.cr)} · HP ${x.hp} · AC ${x.ac}`}</small></span><button class="btn small" data-take="${i}">Save</button></div>`).join('');
}
$('#srdGo').onclick = search;
$('#srdQ').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
$('#srdResults').addEventListener('click', (e) => {
  const b = e.target.closest('[data-take]');
  if (!b) return;
  const { kind, x } = found[Number(b.dataset.take)];
  socket.emit(kind === 'spell' ? 'dm:spell:save' : 'dm:creature:save', x, () => { b.textContent = 'Saved ✓'; b.disabled = true; });
});
