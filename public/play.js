const socket = io();
Settings.mount();
const $ = (s) => document.querySelector(s);
const { esc, hpBar, vn, logFeed, checkBanner } = Stage;
// Classes and skill buttons come from the active rules system (S.rules), so 5e and Daggerheart share this UI.

// Identity on this device: room code (from the QR), the character we sit in, and its device token.
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) { localStorage.tavernRoom = urlRoom.toUpperCase(); history.replaceState(null, '', '/play'); }
let room = localStorage.tavernRoom || '';
let charId = localStorage.tavernChar;
const token = () => localStorage[`tavernToken:${charId}`];
let cls = null;
let S = null;
let lastMode = null;

let classKey = null;
function renderClasses() {
  const key = JSON.stringify(S.rules.classes);
  if (key === classKey) return;
  classKey = key;
  $('#classes').innerHTML = Object.entries(S.rules.classes).map(([k, v]) => `<button class="cls" data-cls="${esc(k)}"><b>${esc(k)}</b><small>${esc(v)}</small></button>`).join('');
}
$('#classes').onclick = (e) => {
  const b = e.target.closest('[data-cls]');
  if (!b) return;
  cls = b.dataset.cls;
  document.querySelectorAll('.cls').forEach((x) => x.classList.toggle('sel', x === b));
};
$('#newBtn').onclick = () => { $('#newForm').hidden = false; $('#newBtn').hidden = true; $('#name').focus(); };

function showJoin(msg = '') {
  $('#joinErr').textContent = msg;
  $('#roomForm').hidden = !!room;
  $('#joinView').hidden = false;
  $('#gameView').hidden = true;
  $('#profile').hidden = true;
  renderRoster();
}

const JOIN_ERRORS = { room: 'Wrong or old room code. Scan the QR on the TV again, or type the code shown there.' };
function join(payload) {
  socket.emit('join', { room, ...payload }, (res) => {
    if (res.error) {
      if (res.error === 'gone') { localStorage.removeItem('tavernChar'); charId = null; return showJoin(); }
      if (res.error === 'room') { room = ''; localStorage.removeItem('tavernRoom'); return showJoin(JOIN_ERRORS.room); }
      if (res.error === 'in-use') {
        if (confirm('Someone is already playing this character on another phone. Take over?')) return join({ ...payload, takeover: true });
        return showJoin();
      }
      $('#joinErr').textContent = res.error;
      return;
    }
    charId = localStorage.tavernChar = res.id;
    localStorage[`tavernToken:${res.id}`] = res.token;
    room = localStorage.tavernRoom = res.room;
    $('#joinView').hidden = true;
    $('#gameView').hidden = false;
    renderWhispers();
    render();
  });
}
$('#joinBtn').onclick = () => join({ name: $('#name').value, cls, race: $('#race').value, player: $('#player').value });
$('#roster').onclick = (e) => {
  const b = e.target.closest('[data-claim]');
  if (!b) return;
  const id = b.dataset.claim;
  join({ id, token: localStorage[`tavernToken:${id}`] });
};
$('#roomForm').onsubmit = (e) => {
  e.preventDefault();
  const code = $('#roomIn').value.trim().toUpperCase();
  socket.emit('room:check', { room: code }, ({ ok }) => {
    if (!ok) return showJoin('That code doesn\'t match the one on the TV.');
    room = localStorage.tavernRoom = code;
    showJoin();
  });
};
socket.on('connect', () => { if (charId && token()) join({ id: charId, token: token() }); else showJoin(); });
socket.on('taken', () => showJoin('Your character was opened on another device, or the DM removed it.'));

socket.on('state', (s) => {
  S = s;
  // Server restarted or DM removed us from the table: back to the picker.
  if (!$('#gameView').hidden && !s.players.some((p) => p.id === charId)) showJoin();
  renderClasses();
  if (!$('#joinView').hidden) renderRoster();
  render();
});

function renderRoster() {
  if (!S) return;
  $('#roster').innerHTML = S.roster.map((c) => `
    <button class="rcard" data-claim="${esc(c.id)}" data-online="${c.online ? 1 : 0}" style="--hue:${c.hue}">
      ${Stage.avatar(c, 'av-rc')}
      <b>${esc(c.name)}</b><small>${esc([c.race, c.cls].filter(Boolean).join(' '))}${c.level > 1 ? ` ${c.level}` : ''}</small>
      ${c.player ? `<small class="muted">${esc(c.player)}</small>` : ''}${c.online ? '<em>in use</em>' : ''}
    </button>`).join('');
  Anim.hydrate($('#roster'));
  if (!S.roster.length) { $('#newForm').hidden = false; $('#newBtn').hidden = true; }
  $('#roomForm').hidden = !!room;
}

// ---------- whispers ----------
// The server keeps each player's whispers (S.whispers holds only this player's); the event just pops one up.
socket.on('whisper', (w) => {
  $('#whisperText').textContent = w.text;
  $('#whisperPop').hidden = false;
  navigator.vibrate?.([60, 60, 60]);
});
$('#whisperOk').onclick = () => { $('#whisperPop').hidden = true; };
let whisperKey = '';
function renderWhispers() {
  const list = (S?.whispers || []).filter((w) => w.to === charId).slice().reverse();
  const key = charId + list.map((w) => w.id).join();
  if (key === whisperKey) return; // keep the <details> open/closed state between renders
  whisperKey = key;
  $('#whispers').innerHTML = list.length ? `<details class="card whispers"><summary>🤫 Whispers from the DM (${list.length})</summary>${list.map((w) => `<p>${esc(w.text)}</p>`).join('')}</details>` : '';
}

// ---------- profile editor ----------
function openProfile() {
  const me = S.players.find((p) => p.id === charId);
  if (!me) return;
  $('#profAv').innerHTML = Stage.avatar(me, 'av-prof');
  Anim.hydrate($('#profAv'));
  $('#pPlayer').value = me.player || '';
  $('#pRace').value = me.race || '';
  $('#pCatch').value = me.catchphrase || '';
  $('#pBack').value = me.backstory || '';
  $('#pHue').value = me.hue ?? 40;
  $('#photoStatus').textContent = '';
  $('#profile').hidden = false;
  $('#gameView').hidden = true;
}
function closeProfile() { $('#profile').hidden = true; $('#gameView').hidden = false; render(); }
$('#profClose').onclick = closeProfile;
$('#profSave').onclick = () => {
  socket.emit('player:profile', { player: $('#pPlayer').value, race: $('#pRace').value, catchphrase: $('#pCatch').value, backstory: $('#pBack').value, hue: Number($('#pHue').value) });
  closeProfile();
};
$('#pHue').oninput = () => { $('#profAv').firstElementChild?.style.setProperty('--hue', $('#pHue').value); };

// Phone photos are huge: center-crop to a 512px square JPEG before uploading.
function squareJpeg(file, size = 512) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.85);
    };
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = URL.createObjectURL(file);
  });
}
async function uploadPhoto(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  $('#photoStatus').textContent = 'Uploading…';
  try {
    // Animated WebM portraits go up as-is; the server crops and re-encodes them.
    const video = file.type === 'video/webm';
    const blob = video ? file : await squareJpeg(file);
    const res = await fetch(`/api/portrait/${charId}`, { method: 'POST', headers: { 'content-type': video ? 'video/webm' : 'image/jpeg', 'x-socket-id': socket.id }, body: blob });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    $('#profAv').innerHTML = Anim.media(out.url, 'av av-prof');
    Anim.hydrate($('#profAv'));
    $('#photoStatus').textContent = 'Saved!';
  } catch (err) {
    $('#photoStatus').textContent = err.message;
  }
}
$('#camIn').onchange = (e) => uploadPhoto(e.target);
$('#fileIn').onchange = (e) => uploadPhoto(e.target);

function render() {
  if (!S || !charId || $('#gameView').hidden) return;
  const me = S.players.find((p) => p.id === charId);
  if (!me) return;
  if (lastMode && lastMode !== S.mode && navigator.vibrate) navigator.vibrate(80);
  lastMode = S.mode;

  $('#me').innerHTML = `${Stage.avatar(me, 'av-me')}<div class="me-info"><b>${esc(me.name)}</b><small class="muted">${esc([me.race, me.cls].filter(Boolean).join(' '))} · ${esc(S.rules.defenseLabel)} ${me.ac} · ${S.mode}</small></div><button class="btn small" id="profBtn">✎ Profile</button>${hpBar(me)}`;
  Anim.hydrate($('#me'));
  $('#profBtn').onclick = openProfile;
  $('#say').placeholder = S.mode === 'social' ? 'Say something in character…' : 'What do you do?';
  $('#sayForm').hidden = S.mode === 'combat';
  $('#main').innerHTML = S.mode === 'combat' ? combatView(me) : S.mode === 'social' ? socialView(me) : exploreView(me);
  $('#log').innerHTML = logFeed(S, 6);
  renderWhispers();
}

function checkPrompt(me) {
  const c = S.check;
  if (!c) return '';
  const done = c.results[me.id];
  return `${checkBanner(S)}
    <button class="bigbtn" data-skill="${esc(c.skill)}" ${done ? 'disabled' : ''}>${done ? `Rolled ${done.total}` : `🎲 Roll ${esc(c.skill)} (${fmt(me.skills[c.skill])})`}</button>`;
}

const fmt = (n) => { n = n ?? 0; return n >= 0 ? `+${n}` : `${n}`; };
const skillButtons = (me, list) => `<div class="grid3">${list.map((k) => `<button class="btn" data-skill="${esc(k)}">${esc(k)}<br><small class="muted">${fmt(me.skills[k])}</small></button>`).join('')}</div>`;

function exploreView(me) {
  const sc = S.scene;
  return `<div class="card"><h3>${esc(sc.title)}</h3><p style="margin:0">${esc(sc.text)}</p></div>
    ${checkPrompt(me)}
    ${sc.poi.length ? `<div class="grid2">${sc.poi.map((p) => `<button class="btn" data-do="I investigate the ${esc(p.toLowerCase())}.">🔍 ${esc(p)}</button>`).join('')}</div>` : ''}
    ${skillButtons(me, S.rules.skillGroups.exploration)}`;
}

function socialView(me) {
  return `<div class="vn-mini">${vn(S, { compact: true })}</div>
    ${checkPrompt(me)}
    ${S.social.choices.length ? `<div class="list">${S.social.choices.map((c, i) => `<button class="btn" style="text-align:left;padding:12px" data-choice="${i}">💬 ${esc(c)}</button>`).join('')}</div>` : ''}
    ${skillButtons(me, S.rules.skillGroups.social)}`;
}

function combatView(me) {
  const c = S.combat;
  if (!c.active) return '<div class="card"><p class="turn-banner">⚔️ Steel yourself…</p><p class="muted" style="text-align:center">Waiting for the DM to roll initiative.</p></div>';
  const turnId = c.order[c.turn]?.id;
  const who = [...S.players, ...c.enemies].find((x) => x.id === turnId);
  const order = `<div class="card"><h3>Round ${c.round}</h3>${c.order.map((o) => {
    const x = [...S.players, ...c.enemies].find((y) => y.id === o.id);
    return x ? `<div class="${o.id === turnId ? '' : 'muted'}">${o.id === turnId ? '▸ ' : ''}${o.init} · ${esc(x.name)} ${x.enemy ? `(${x.hp}/${x.maxHp})` : ''}${x.hp === 0 ? ' 💀' : ''}</div>` : '';
  }).join('')}</div>`;
  if (me.hp === 0) return `<div class="card"><p class="turn-banner" style="color:var(--bad)">You are down</p><p class="muted" style="text-align:center">Hope a cleric is nearby.</p></div>${order}`;
  if (turnId !== me.id) return `<div class="card"><p style="text-align:center;font-size:18px">${esc(who?.name || '…')}'s turn</p></div>${order}`;
  const foes = c.enemies.filter((e) => e.hp > 0);
  return `<p class="turn-banner">YOUR TURN</p>
    <div class="card"><h3>Attack (+${me.atk}, ${me.dmg[0]}d${me.dmg[1]}+${me.dmg[2]})</h3>
      <div class="grid2">${foes.map((e) => `<button class="btn primary" data-attack="${e.id}">🗡 ${esc(e.name)}<br><small>AC ${e.ac} · ${e.hp}hp</small></button>`).join('') || '<span class="muted">No targets</span>'}</div></div>
    <div class="grid3">
      <button class="btn" data-act="dodge">🛡 Dodge</button><button class="btn" data-act="dash">💨 Dash</button><button class="btn" data-act="hide">👤 Hide</button>
      <button class="btn" data-act="help">🤝 Help</button><button class="btn" data-act="potion">🧪 Potion</button>
    </div>${order}`;
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.skill) socket.emit('player:check', { skill: d.skill });
  else if (d.do) socket.emit('player:action', { text: d.do });
  else if (d.choice) socket.emit('player:choice', { index: Number(d.choice) });
  else if (d.attack) socket.emit('player:combat', { act: 'attack', target: d.attack });
  else if (d.act) socket.emit('player:combat', { act: d.act });
  else return;
  navigator.vibrate?.(30);
});

$('#sayForm').onsubmit = (e) => {
  e.preventDefault();
  const text = $('#say').value.trim();
  if (text) socket.emit('player:action', { text });
  $('#say').value = '';
};
