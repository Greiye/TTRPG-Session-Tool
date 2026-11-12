const socket = io();
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const { esc, hpBar, EMO } = Stage;
let SKILLS = [];
const emit = (ev, data = {}) => socket.emit(ev, data);
window.dmEmit = emit;

let S = null;
Settings.mount({ table: { get: () => S?.settings.display || {}, set: (display) => emit('dm:settings', { display }) } });
let filled = false;

// ---------- auth: localhost is trusted, otherwise ?key= ----------
socket.on('connect', () => socket.emit('dm:auth', { key: new URLSearchParams(location.search).get('key') || localStorage.dmKey }, ({ ok }) => { $('#auth').hidden = ok; }));
$('#authBtn').onclick = () => socket.emit('dm:auth', { key: $('#key').value.trim() }, ({ ok }) => {
  $('#auth').hidden = ok;
  if (ok) localStorage.dmKey = $('#key').value.trim();
});

$('#emotions').innerHTML = Object.entries(EMO).map(([k, e], i) => `<button class="btn" data-emo="${k}" title="${i + 1}"><span>${e.icon}</span>${e.label}</button>`).join('');

const dmKey = () => new URLSearchParams(location.search).get('key') || localStorage.dmKey || '';
const renderAtmo = Atmo.mount($('#atmo'), { emit, key: dmKey });
// The laptop is the speaker only when no /screen tab is open (e.g. TV mirroring the laptop).
AudioOut.init(socket, { isOutput: (s) => !s || !s.screens });

// ---------- render ----------
// Skill lists and the system picker follow the active rules adapter.
let rulesKey = null;
function renderRules(s) {
  const key = s.rules.id + s.rules.skills.join();
  if (key === rulesKey) return;
  rulesKey = key;
  SKILLS = s.rules.skills;
  $('#checkSkill').innerHTML = SKILLS.map((k) => `<option>${esc(k)}</option>`).join('');
  $('#skillInputs').innerHTML = SKILLS.map((k) => `<label class="fld">${esc(k)}<input type="number" data-skill="${esc(k)}" min="-5" max="20"></label>`).join('');
  $('#system').innerHTML = s.systems.map((x) => `<option value="${x.id}" ${x.id === s.rules.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
}
$('#system').onchange = (e) => {
  if (confirm('Switch rules system? Checks and new characters will use it.')) emit('dm:system', { id: e.target.value });
  else e.target.value = S.rules.id;
};

// Room code and which network address the QR points at.
let lanKey = null;
function renderJoin(s) {
  $('#roomCode').textContent = s.room;
  const key = JSON.stringify([s.lan, s.settings.host]);
  if (key === lanKey || !s.lan) return;
  lanKey = key;
  $('#hostSel').innerHTML = '<option value="">Auto</option>' + s.lan.map((a) => `<option value="${esc(a.address)}" ${a.address === s.settings.host ? 'selected' : ''}>${esc(a.address)} (${esc(a.name)}${a.virtual ? ', virtual' : ''})</option>`).join('');
}
$('#roomNew').onclick = () => confirm('Make a new room code? Phones that are already seated keep playing.') && emit('dm:room:new');
$('#hostSel').onchange = (e) => emit('dm:host', { host: e.target.value });

socket.on('state', (s) => {
  S = s;
  renderRules(s);
  renderJoin(s);
  Stage.stage($('#stage'), s);

  if (!filled) {
    filled = true;
    $('#sceneTitle').value = s.scene.title;
    $('#sceneText').value = s.scene.text;
    $('#sceneTheme').value = s.scene.theme;
    $('#scenePoi').value = s.scene.poi.join(', ');
    $('#npcName').value = s.social.npc.name;
    $('#npcHue').value = s.social.npc.hue;
    s.social.choices.forEach((c, i) => { $$('.choice')[i].value = c; });
  }

  $$('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === s.mode));
  $$('[data-panel]').forEach((p) => { p.hidden = !p.dataset.panel.split(' ').includes(s.mode); });
  $$('[data-emo]').forEach((b) => b.classList.toggle('on', b.dataset.emo === s.social.npc.emotion));

  renderAtmo(s);
  renderChars();
  $('#codmCount').textContent = s.codms ? `🟢 ${s.codms} connected` : 'not connected';

  const turn = s.combat.active ? s.combat.order[s.combat.turn]?.id : null;
  $('#party').innerHTML = s.players.map((p) => `
    <div class="item ${turn === p.id ? 'turn' : ''}">
      <span>${p.online ? '🟢' : '⚪'} <b>${esc(p.name)}</b> <small class="muted">${esc(p.cls)} AC${p.ac}</small></span>
      ${hpBar(p)}
      <span class="row"><button class="btn small" data-hp="${p.id}" data-d="-5">-5</button><button class="btn small" data-hp="${p.id}" data-d="-1">-1</button><button class="btn small" data-hp="${p.id}" data-d="1">+1</button><button class="btn small" data-hp="${p.id}" data-d="5">+5</button><button class="btn small danger" data-kick="${p.id}">✕</button></span>
    </div>`).join('') || '<p class="note">No players yet. They scan the QR on the TV.</p>';

  $('#enemies').innerHTML = s.combat.enemies.map((e) => `
    <div class="item ${turn === e.id ? 'turn' : ''}">
      <span>👹 <b>${esc(e.name)}</b> <small class="muted">AC${e.ac} +${e.atk}</small></span>
      ${hpBar(e)}
      <span class="row"><button class="btn small" data-hp="${e.id}" data-d="-5">-5</button><button class="btn small" data-hp="${e.id}" data-d="-1">-1</button><button class="btn small" data-hp="${e.id}" data-d="1">+1</button><button class="btn small danger" data-rm="${e.id}">✕</button></span>
    </div>`).join('');

  const foe = s.combat.enemies.find((e) => e.id === turn);
  $('#enemyTurn').innerHTML = foe && foe.hp > 0
    ? `<div class="note">${esc(foe.name)}'s turn. Attack:</div><div class="row">${s.players.filter((p) => p.hp > 0).map((p) => `<button class="btn small primary" data-atk="${p.id}">${esc(p.name)}</button>`).join('')}</div>`
    : turn ? '<div class="note">Waiting on the player\'s phone… (or Next turn)</div>' : '';
});

// ---------- actions ----------
const actions = {
  narrate: () => { emit('dm:narrate', { text: $('#narrate').value }); $('#narrate').value = ''; },
  scene: () => emit('dm:scene', { title: $('#sceneTitle').value, text: $('#sceneText').value, theme: $('#sceneTheme').value, poi: $('#scenePoi').value.split(',').map((x) => x.trim()) }),
  check: () => emit('dm:check', { skill: $('#checkSkill').value, dc: $('#checkDc').value }),
  checkClear: () => emit('dm:check', { skill: null }),
  combatStart: () => emit('dm:combat:start'),
  combatNext: () => emit('dm:combat:next'),
  combatEnd: () => emit('dm:combat:end'),
  enemyAdd: () => emit('dm:enemy:add', { name: $('#enName').value, hp: $('#enHp').value, ac: $('#enAc').value, atk: $('#enAtk').value, dmg: $('#enDmg').value }),
  say: () => { emit('dm:say', { text: $('#line').value }); $('#line').value = ''; },
  choices: () => emit('dm:choices', { choices: $$('.choice').map((i) => i.value) }),
  choicesClear: () => { $$('.choice').forEach((i) => (i.value = '')); emit('dm:choices', { choices: [] }); },
  reset: () => confirm('Reset log, remove enemies and heal the party?') && emit('dm:reset'),
};

document.addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  if (d.act) actions[d.act]?.();
  else if (d.mode) emit('dm:mode', { mode: d.mode });
  else if (d.emo) emit('dm:emotion', { emotion: d.emo });
  else if (d.hp) emit('dm:hp', { id: d.hp, delta: Number(d.d) });
  else if (d.kick) confirm('Remove this player?') && emit('dm:kick', { id: d.kick });
  else if (d.rm) emit('dm:enemy:remove', { id: d.rm });
  else if (d.atk) emit('dm:enemy:attack', { target: d.atk });
  else if (d.preset) {
    const [name, hp, ac, atk, dmg] = d.preset.split(',');
    const n = (S?.combat.enemies.filter((e) => e.name.startsWith(name)).length || 0) + 1;
    emit('dm:enemy:add', { name: `${name} ${n}`, hp, ac, atk, dmg });
  }
});

$('#narrate').addEventListener('keydown', (e) => e.key === 'Enter' && actions.narrate());
$('#line').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); actions.say(); } });
$('#npcName').addEventListener('change', (e) => emit('dm:npc', { name: e.target.value }));
$('#npcHue').addEventListener('input', (e) => emit('dm:npc', { hue: Number(e.target.value) }));

// Number keys 1-8 switch emotions while not typing.
document.addEventListener('keydown', (e) => {
  if (S?.mode !== 'social' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  const k = Object.keys(EMO)[Number(e.key) - 1];
  if (k) emit('dm:emotion', { emotion: k });
});

// ---------- co-DM invite (QR carries the co-DM key, so it's only shown here) ----------
const keyQs = dmKey() ? `?key=${encodeURIComponent(dmKey())}` : '';
$('#codmQr').src = `/codm-qr.svg${keyQs}`;
fetch(`/api/codm-url${keyQs}`).then((r) => r.json()).then(({ url }) => { $('#codmUrl').textContent = url; }).catch(() => {});
$('#codmToggle').onclick = () => { $('#codmInvite').hidden = !$('#codmInvite').hidden; };

// ---------- characters (persistent roster; full data incl. DM-only fields arrives on dm:roster) ----------
let ROSTER = [];
let editing = null;
const BUILTIN_THEMES = { thunder: 'Thunder', hit: 'Sword hit', magic: 'Spell', roar: 'Roar', bell: 'Bell' };

socket.on('dm:roster', (list) => { ROSTER = list; renderChars(); });

function renderChars() {
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
}

function openChar(c) {
  editing = c || null;
  const f = $('#charForm').elements;
  $('#charTitle').textContent = c ? c.name : 'New character';
  f.cls.innerHTML = S.classes.map((k) => `<option>${k}</option>`).join('');
  f.theme.innerHTML = '<option value="">None</option>' + Object.entries(BUILTIN_THEMES).map(([k, v]) => `<option value="${k}">🔊 ${v}</option>`).join('')
    + S.audio.library.map((t) => `<option value="${esc(t.id)}">🎵 ${esc(t.name)}</option>`).join('');
  const v = c || { name: '', player: '', race: '', cls: 'Fighter', level: 1, hp: '', maxHp: '', ac: '', atk: '', dmg: [1, 8, 0], init: '', skills: {}, hue: 40, catchphrase: '', theme: '', backstory: '', hooks: '', secret: '' };
  for (const k of ['name', 'player', 'race', 'cls', 'level', 'hp', 'maxHp', 'ac', 'atk', 'init', 'hue', 'catchphrase', 'backstory', 'hooks', 'secret']) f[k].value = v[k] ?? '';
  f.theme.value = v.theme || '';
  f.dmg.value = c ? `${v.dmg[0]}d${v.dmg[1]}${v.dmg[2] ? (v.dmg[2] > 0 ? '+' : '') + v.dmg[2] : ''}` : '';
  document.querySelectorAll('[data-skill]').forEach((i) => { i.value = v.skills[i.dataset.skill] ?? ''; });
  $('#charAv').innerHTML = Stage.avatar(v, 'av-dlg');
  $('#charPhotoBtn').hidden = !c;
  $('#charDelete').hidden = !c;
  $('#charDlg').showModal();
}

$('#charNew').onclick = () => openChar(null);
$('#charForm').elements.hue.oninput = (e) => $('#charAv').firstElementChild?.style.setProperty('--hue', e.target.value);
$('#charSave').onclick = () => {
  const f = $('#charForm').elements;
  if (!f.name.value.trim()) return f.name.reportValidity();
  const data = { id: editing?.id };
  for (const k of ['name', 'player', 'race', 'cls', 'level', 'hp', 'maxHp', 'ac', 'atk', 'dmg', 'init', 'hue', 'catchphrase', 'theme', 'backstory', 'hooks', 'secret']) {
    if (f[k].value !== '' || ['player', 'race', 'catchphrase', 'theme', 'backstory', 'hooks', 'secret'].includes(k)) data[k] = f[k].value;
  }
  data.skills = {};
  document.querySelectorAll('[data-skill]').forEach((i) => { if (i.value !== '') data.skills[i.dataset.skill] = i.value; });
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
  if (res.ok) $('#charAv').innerHTML = `<img class="av av-dlg" src="${esc(out.url)}" alt="">`;
  else alert(out.error || 'Upload failed');
};

$('#chars').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  if (d.edit) openChar(ROSTER.find((c) => c.id === d.edit));
  else if (d.spot) emit('dm:spotlight', { id: d.spot });
  else if (d.seat) emit('dm:char:add', { id: d.seat });
  else if (d.whisper) {
    const c = ROSTER.find((x) => x.id === d.whisper);
    const text = prompt(`Whisper to ${c.name} (only their phone sees it):`);
    if (text) socket.emit('dm:whisper', { id: c.id, text }, ({ ok }) => { if (!ok) alert(`${c.name}'s phone isn't connected.`); });
  }
});
