// Persistent roster: list, edit dialog (incl. DM-only hooks/secret), spotlight, whisper, seat.
// Full character data (with DM-only fields) arrives on dm:roster.
import { socket, $, emit, onState, state } from '../client.js';
import { dmKey } from './auth.js';

const { esc } = Stage;
const BUILTIN_THEMES = { thunder: 'Thunder', hit: 'Sword hit', magic: 'Spell', roar: 'Roar', bell: 'Bell' };
const FIELDS = ['name', 'player', 'race', 'cls', 'level', 'hp', 'maxHp', 'ac', 'atk', 'dmg', 'init', 'hue', 'catchphrase', 'theme', 'backstory', 'hooks', 'secret'];
const TEXT_FIELDS = ['player', 'race', 'catchphrase', 'theme', 'backstory', 'hooks', 'secret'];
let ROSTER = [];
let editing = null;
let skillsKey = null;

socket.on('dm:roster', (list) => { ROSTER = list; render(); });
onState((s) => {
  const k = s.rules.skills.join();
  if (k !== skillsKey) {
    skillsKey = k;
    $('#skillInputs').innerHTML = s.rules.skills.map((x) => `<label class="fld">${esc(x)}<input type="number" data-skill="${esc(x)}" min="-5" max="20"></label>`).join('');
    // Sheet fields (item 2): ability scores, speed, spell slots per level, languages.
    $('#sheetInputs').innerHTML = `
      ${s.rules.abilities.length ? `<div class="skills-grid" style="grid-template-columns:repeat(6,1fr)">${s.rules.abilities.map(([k, label]) => `<label class="fld">${esc(label.slice(0, 3).toUpperCase())}<input type="number" data-ab="${k}" min="1" max="30"></label>`).join('')}</div>` : ''}
      <div class="row">
        <label class="fld" style="width:70px">Speed<input type="number" data-sheet="speed" step="5"></label>
        ${s.rules.slotLevels ? `<label class="fld grow">Spell slots <small>(per level, e.g. 4 3 2)</small><input data-sheet="slots" placeholder="none"></label>` : ''}
        <label class="fld grow">Languages <small>(comma separated)</small><input data-sheet="languages" list="langList"></label>
        <datalist id="langList">${s.rules.languages.map((l) => `<option>${esc(l)}</option>`).join('')}</datalist>
      </div>`;
  }
  render();
});

function render() {
  const S = state();
  const atTable = new Set((S?.players || []).map((p) => p.id));
  $('#chars').innerHTML = ROSTER.map((c) => `
    <div class="char-row" style="--hue:${c.hue}">
      ${Stage.avatar(c, 'av-row')}
      <div class="char-info">
        <b>${esc(c.name)}</b> <small class="muted">${esc([c.race, c.cls].filter(Boolean).join(' '))} ${c.level}${c.player ? ` · ${esc(c.player)}` : ''}</small>
        <small>${c.online ? '🟢 online' : atTable.has(c.id) ? '⚪ at table, away' : '· not at table'}</small>
        ${c.hooks ? `<small class="hooks">🪝 ${esc(c.hooks)}</small>` : ''}
      </div>
      <div class="char-btns">
        <button class="btn small" data-edit="${c.id}" title="Edit">✎</button>
        <button class="btn small" data-spot="${c.id}" title="Spotlight on TV" ${atTable.has(c.id) ? '' : 'disabled'}>⭐</button>
        <button class="btn small" data-whisper="${c.id}" title="Whisper to their phone" ${c.online ? '' : 'disabled'}>🤫</button>
        ${atTable.has(c.id) ? '' : `<button class="btn small" data-seat="${c.id}" title="Add to table">➕</button>`}
      </div>
    </div>`).join('') || '<p class="note">No saved characters yet. Players create one when they join, or add them here.</p>';
  Anim.hydrate($('#chars'));
}

const skillInputs = () => $('#skillInputs').querySelectorAll('[data-skill]');
const sheet = (sel) => $('#sheetInputs').querySelectorAll(sel);
function open(c) {
  const S = state();
  editing = c || null;
  const f = $('#charForm').elements;
  $('#charTitle').textContent = c ? c.name : 'New character';
  f.cls.innerHTML = S.classes.map((k) => `<option>${esc(k)}</option>`).join('');
  f.theme.innerHTML = '<option value="">None</option>' + Object.entries(BUILTIN_THEMES).map(([k, v]) => `<option value="${k}">🔊 ${v}</option>`).join('')
    + S.audio.library.map((t) => `<option value="${esc(t.id)}">🎵 ${esc(t.name)}</option>`).join('');
  const v = c || { name: '', player: '', race: '', cls: S.classes[0], level: 1, hp: '', maxHp: '', ac: '', atk: '', dmg: [1, 8, 0], init: '', skills: {}, hue: 40, catchphrase: '', theme: '', backstory: '', hooks: '', secret: '' };
  for (const k of FIELDS) if (k !== 'dmg' && k !== 'theme') f[k].value = v[k] ?? '';
  f.theme.value = v.theme || '';
  f.dmg.value = c ? `${v.dmg[0]}d${v.dmg[1]}${v.dmg[2] ? (v.dmg[2] > 0 ? '+' : '') + v.dmg[2] : ''}` : '';
  skillInputs().forEach((i) => { i.value = v.skills[i.dataset.skill] ?? ''; });
  sheet('[data-ab]').forEach((i) => { i.value = v.abilities?.[i.dataset.ab] ?? ''; });
  sheet('[data-sheet]').forEach((i) => {
    const k = i.dataset.sheet;
    i.value = k === 'speed' ? v.speed ?? '' : k === 'languages' ? (v.languages || []).join(', ')
      : Array.from({ length: Math.max(0, ...Object.keys(v.slots || {}).map(Number)) }, (_, l) => v.slots[l + 1]?.max || 0).join(' ');
  });
  $('#charAv').innerHTML = Stage.avatar(v, 'av-dlg');
  Anim.hydrate($('#charAv'));
  $('#charPhotoBtn').hidden = !c;
  $('#charDelete').hidden = !c;
  $('#charDlg').showModal();
}

$('#charNew').onclick = () => open(null);
$('#charForm').elements.hue.oninput = (e) => $('#charAv').firstElementChild?.style.setProperty('--hue', e.target.value);
$('#charSave').onclick = () => {
  const f = $('#charForm').elements;
  if (!f.name.value.trim()) return f.name.reportValidity();
  const data = { id: editing?.id };
  for (const k of FIELDS) if (f[k].value !== '' || TEXT_FIELDS.includes(k)) data[k] = f[k].value;
  data.skills = {};
  skillInputs().forEach((i) => { if (i.value !== '') data.skills[i.dataset.skill] = i.value; });
  data.abilities = {};
  sheet('[data-ab]').forEach((i) => { if (i.value !== '') data.abilities[i.dataset.ab] = i.value; });
  sheet('[data-sheet]').forEach((i) => {
    const k = i.dataset.sheet;
    if (k === 'speed') { if (i.value !== '') data.speed = i.value; } else if (k === 'languages') data.languages = i.value.split(',').map((x) => x.trim()).filter(Boolean);
    else { const max = i.value.trim().split(/[\s,/]+/).map(Number); data.slotMax = Object.fromEntries(Array.from({ length: 9 }, (_, l) => [l + 1, max[l] || 0])); }
  });
  emit('dm:char:save', data);
  $('#charDlg').close();
};
$('#charDelete').onclick = () => {
  if (editing && confirm(`Delete ${editing.name} permanently?`)) { emit('dm:char:delete', { id: editing.id }); $('#charDlg').close(); }
};
$('#charPhoto').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file || !editing) return;
  const res = await fetch(`/api/portrait/${editing.id}`, { method: 'POST', headers: { 'content-type': file.type, 'x-dm-key': dmKey() }, body: file });
  const out = await res.json().catch(() => ({}));
  if (res.ok) { $('#charAv').innerHTML = Anim.media(out.url, 'av av-dlg'); Anim.hydrate($('#charAv')); } else alert(out.error || 'Upload failed');
};

$('#chars').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  if (d.edit) open(ROSTER.find((c) => c.id === d.edit));
  else if (d.spot) emit('dm:spotlight', { id: d.spot });
  else if (d.seat) emit('dm:char:add', { id: d.seat });
  else if (d.whisper) {
    const c = ROSTER.find((x) => x.id === d.whisper);
    const text = prompt(`Whisper to ${c.name} (only their phone sees it):`);
    if (text) socket.emit('dm:whisper', { id: c.id, text }, ({ ok }) => { if (!ok) alert(`${c.name}'s phone isn't connected.`); });
  }
});
