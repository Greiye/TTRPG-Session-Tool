// DM roll calls, dice roller, hidden details (perception-gated items), and the dice log.
import { socket, $, $$, emit, onState, onClick, state } from '../client.js';

const { esc } = Stage;
let presetKey = null;
let skillsKey = null;
let kindNow = 'skill';
const targets = new Set();

const kindKeys = (s, kind) => (kind === 'skill' ? s.rules.skills : (s.rules.abilities || []).map(([k]) => k));
const kindLabel = (s, kind, key) => (kind === 'skill' ? key : `${(s.rules.abilities.find(([k]) => k === key) || [key, key])[1]} ${kind === 'save' ? 'save' : 'check'}`);

onState((s) => {
  const sk = s.rules.id + kind() + s.rules.skills.join();
  if (sk !== skillsKey) {
    skillsKey = sk;
    $('#checkSkill').innerHTML = kindKeys(s, kind()).map((x) => `<option value="${esc(x)}">${esc(kindLabel(s, kind(), x))}</option>`).join('');
    $('#secSkill').innerHTML = s.rules.skills.map((x) => `<option>${esc(x)}</option>`).join('');
    $('#dcLadder').innerHTML = (s.checks?.dcLadder || s.rules.dcLadder || []).map(([l, dc]) => `<button class="btn small dc-chip" data-dc="${dc}" title="${esc(l)}">${dc}</button>`).join('');
  }
  const pk = JSON.stringify((s.checks?.presets || []).map((p) => p.id + p.name));
  if (pk !== presetKey) {
    presetKey = pk;
    $('#callPreset').innerHTML = '<option value="">Custom</option>' + s.checks.presets.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${p.custom ? ' ★' : ''}</option>`).join('');
  }
  // Targets: one chip per character at the table.
  const present = new Set(s.players.map((p) => p.id));
  for (const t of [...targets]) if (!present.has(t)) targets.delete(t);
  $('#callTargets').innerHTML = s.players.map((p) => `<button class="btn small call-tgt ${targets.has(p.id) ? 'on' : ''}" data-tgt="${esc(p.id)}">${p.online ? '🟢' : '⚪'} ${esc(p.name)}</button>`).join('') || '<span class="note">No one at the table.</span>';
  const chk = s.check;
  $('#callStatus').textContent = chk ? `${chk.label}${chk.hideDc ? '' : ` · DC ${chk.dc}`}${chk.mode ? ` · ${chk.mode === 'adv' ? 'adv' : 'dis'}` : ''}` : 'no call active';
  $('#checkResults').innerHTML = chk ? Object.values(chk.results).map((r) => `<div class="item"><span><b>${esc(r.name)}</b> ${r.roll}${r.total !== undefined ? ` → ${r.total}` : ''}</span><span class="${r.pass ? 'pass' : 'fail'}">${r.pass == null ? '' : r.pass ? 'pass' : 'fail'}</span></div>`).join('') || `<p class="note">Waiting on ${chk.targets ? chk.targets.length : 'everyone'}…</p>` : '';
  $('#rollLog').innerHTML = (s.rolls || []).slice(-30).reverse().map((r) => `<div class="item"><span><b>${esc(r.who)}</b> ${esc(r.label)} <small class="muted">${r.dice.map((d) => (d.kept === false ? `~${d.value}` : d.value)).join(', ')}${r.mod ? ` ${r.mod > 0 ? '+' : ''}${r.mod}` : ''} = <b>${r.total}</b>${r.vis === 'dm' ? ' · secret' : ''}</small></span></div>`).join('') || '<p class="note">Rolls appear here.</p>';
  $('#secList').innerHTML = (s.scene.secrets || []).map((x) => `<div class="item"><span><b>${esc(x.text)}</b> <small class="muted">${esc(x.skill)} ${x.dc} · sees ${x.sees?.length || 0} · passive ${x.passive?.length || 0}</small></span>
    <span class="row">${(s.players).map((p) => `<button class="btn small ${Array.isArray(x.shown) && x.shown.includes(p.id) || x.shown === 'all' ? 'on' : ''}" data-sec-who="${esc(x.id)}" data-to="${esc(p.id)}">${esc(p.name)}</button>`).join('')}<button class="btn small ${x.shown === 'all' ? 'on' : ''}" data-sec-who="${esc(x.id)}" data-to="all">All</button><button class="btn small danger" data-sec-del="${esc(x.id)}">✕</button></span></div>`).join('') || '<p class="note">None yet.</p>';
});

function kind() { return $('#callKind').value || 'skill'; }
$('#callKind').onchange = () => { skillsKey = null; };
$('#callPreset').onchange = (e) => {
  const p = (state()?.checks?.presets || []).find((x) => x.id === e.target.value);
  if (!p) return;
  $('#callKind').value = p.kind; skillsKey = null;
  const s = state();
  $('#checkSkill').innerHTML = kindKeys(s, p.kind).map((x) => `<option value="${esc(x)}">${esc(kindLabel(s, p.kind, x))}</option>`).join('');
  $('#checkSkill').value = p.key; $('#checkDc').value = p.dc; $('#callPass').value = p.pass || ''; $('#callFail').value = p.fail || '';
};
$('#presetSave').onclick = () => {
  const name = prompt('Name this preset:');
  if (!name) return;
  emit('dm:preset:save', { name, kind: kind(), key: $('#checkSkill').value, dc: $('#checkDc').value, pass: $('#callPass').value, fail: $('#callFail').value });
};
$('#callTargets').addEventListener('click', (e) => { const b = e.target.closest('[data-tgt]'); if (!b) return; const id = b.dataset.tgt; targets.has(id) ? targets.delete(id) : targets.add(id); b.classList.toggle('on', targets.has(id)); });
$('#dcLadder').addEventListener('click', (e) => { const b = e.target.closest('[data-dc]'); if (b) $('#checkDc').value = b.dataset.dc; });
$('#checkResults').addEventListener('click', () => {});
$('#secAdd').onclick = () => { const text = $('#secText').value.trim(); if (text) { emit('dm:secret:add', { text, skill: $('#secSkill').value, dc: $('#secDc').value }); $('#secText').value = ''; } };
$('#secList').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.secWho) emit('dm:secret:show', { id: b.dataset.secWho, to: b.dataset.to });
  else if (b.dataset.secDel) emit('dm:secret:remove', { id: b.dataset.secDel });
});
const actions = {
  callSend: () => {
    const mode = $('#callMode').value;
    emit('dm:call', { kind: kind(), key: $('#checkSkill').value, dc: $('#checkDc').value, targets: [...targets], mode: mode || null, hideDc: $('#callHide').checked, pass: $('#callPass').value, fail: $('#callFail').value });
  },
  checkClear: () => emit('dm:call', { clear: true }),
  roll: () => { const expr = $('#rollExpr').value.trim(); if (expr) emit('dm:roll', { expr, label: $('#rollLabel').value.trim(), secret: $('#rollSecret').checked, mode: $('#callMode').value || undefined }); },
};
onClick('act', (a) => actions[a]?.());
$('#rollExpr').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); actions.roll(); } });
$('#callKind').addEventListener('change', () => { skillsKey = null; });

// The DM's own screen shows secret rolls and roll calls it made.
socket.on('rollpop', (p) => window.RollPop?.show(p));
socket.on('rollpop:skip', () => window.RollPop?.hide());
