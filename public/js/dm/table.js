// Table tools (Phase I, src/table.js): the DM's cue deck, secret nudges, spotlight balance, bond reminders,
// tension track, foreshadowing, scene framing, montage and TV layouts. One card, one sidebar tab.
import { $, $$, emit, onState, state, mount } from '../client.js';

const { esc } = Stage;
const MODES = ['exploration', 'combat', 'social'];
const LAYOUTS = [['auto', 'Auto'], ['social', 'Social'], ['combat', 'Combat'], ['exploration', 'Exploration'], ['rest', 'Rest']];

mount(`
<div class="card" data-tab="table" data-panel="exploration social combat">
  <h3>Table tools</h3>
  <p class="note">Automation only counts and shows. Every number here is yours to override.</p>

  <h4>TV layout</h4>
  <div class="row" id="tblLayouts"></div>

  <h4>Cue deck <span class="note">one tap sets it all</span></h4>
  <div class="list" id="tblCues"></div>
  <details><summary>New cue</summary>
    <div class="row"><input id="cueName" placeholder="Cue name, e.g. Ambush" class="grow" maxlength="60"></div>
    <div class="row">
      <select id="cueMode" aria-label="Mode"><option value="">Keep mode</option>${MODES.map((m) => `<option value="${m}">${m}</option>`).join('')}</select>
      <select id="cueLight" aria-label="Light"><option value="">Keep light</option>${['day', 'dusk', 'night', 'dawn', 'torchlight'].map((l) => `<option value="${l}">${l}</option>`).join('')}</select>
    </div>
    <div class="row"><select id="cueBd" class="grow" aria-label="Backdrop"></select></div>
    <div class="row"><select id="cueSfx" class="grow" aria-label="One-shot sound"></select></div>
    <div class="row"><input id="cueHTitle" placeholder="Handout title (optional)" class="grow" maxlength="80"></div>
    <div class="row"><textarea id="cueHText" placeholder="Handout text (shown on the TV)" rows="2" class="grow" maxlength="1200"></textarea></div>
    <div class="row"><button class="btn primary" id="cueAdd">Save cue</button></div>
  </details>

  <h4>Secret nudge <span class="note">one phone, silent</span></h4>
  <div class="row"><select id="nudgeTo" class="grow" aria-label="Character"></select></div>
  <div class="row"><input id="nudgeText" placeholder="A line only they see, e.g. The locket is warm." class="grow" maxlength="160"><button class="btn" id="nudgeSend">Send</button></div>
  <div class="list" id="tblNudges"></div>

  <h4>Spotlight balance <span class="note">DM only</span></h4>
  <div id="tblBalance" class="list"></div>
  <div class="row"><button class="btn small" id="balReset">Reset counts for this scene</button></div>

  <h4>Bonds to call back</h4>
  <div id="tblBonds" class="list"></div>

  <h4>Tension <span class="note">dread bar on the TV</span></h4>
  <div class="row">
    <button class="btn small" data-tension="-1">−</button>
    <span id="tenVal">0</span> / 10
    <button class="btn small" data-tension="1">+</button>
    <input id="tenLabel" placeholder="Label" maxlength="30" aria-label="Tension label">
    <button class="btn small" id="tenOn">Show on TV</button>
  </div>

  <h4>Foreshadowing</h4>
  <div class="row"><input id="fsText" placeholder="Plant a hint, e.g. The stranger knows your name." class="grow" maxlength="200"><button class="btn" id="fsAdd">Plant</button></div>
  <div id="tblHints" class="list"></div>

  <h4>Scene framing <span class="note">tokens go to phones; spent details become canon</span></h4>
  <div id="tblFraming" class="list"></div>
  <div id="tblCanon" class="list"></div>

  <h4>Montage <span class="note">one prompt, answers revealed together</span></h4>
  <div class="row"><input id="monPrompt" placeholder="What did you dream last night?" class="grow" maxlength="160"><button class="btn" id="monAsk">Ask</button></div>
  <div class="row"><span id="monStatus" class="note"></span><button class="btn small" id="monReveal">Reveal on TV</button><button class="btn small" id="monClose">Close</button></div>
  <div id="tblMontage" class="list"></div>

  <div class="row"><span class="note" id="sessNo"></span><button class="btn small" id="sessNext">Next session</button></div>
</div>`, '#atmo');

const card = document.querySelector('[data-tab="table"]');
const names = (s) => Object.fromEntries([...(s.players || []), ...(s.roster || [])].map((p) => [p.id, p.name]));
let drawn = '';

onState((s) => {
  if (!card) return;
  const bdLib = s.backdrop?.library || [];
  const sfxLib = [...(s.audio?.loops || []), ...(s.audio?.library || [])];
  const nm = names(s);
  const players = s.players || [];
  const key = JSON.stringify([s.cues, s.nudges, s.balance, s.dueBonds, s.tension, s.foreshadow, s.framing, s.tokens, s.canon, s.montage, s.stageLayout, s.sessionNo, players.map((p) => p.id + (p.bond ? p.bond.text : '')), bdLib.length, sfxLib.length, s.myNudges]);
  if (key === drawn) return;
  drawn = key;

  $('#tblLayouts').innerHTML = LAYOUTS.map(([k, l]) => `<button class="btn small ${s.stageLayout === k ? 'primary' : ''}" data-layout="${k}" aria-pressed="${s.stageLayout === k}">${l}</button>`).join('');

  $('#tblCues').innerHTML = (s.cues || []).map((c) => `<div class="item"><span><b>${esc(c.name)}</b><br><small>${[c.mode, c.light, c.backdrop && 'backdrop', c.layers?.length && `${c.layers.length} layers`, c.sfx && 'sound', c.handout && 'handout'].filter(Boolean).join(' · ') || 'no changes'}</small></span><span class="row"><button class="btn primary small" data-fire="${esc(c.id)}">Fire</button><button class="btn small" data-cue-rm="${esc(c.id)}" aria-label="Remove cue">✕</button></span></div>`).join('') || '<p class="note">No cues yet. Save one from the form below.</p>';
  fillSelect('#cueBd', [['', 'Keep backdrop'], ...bdLib.map((b) => [b.id, b.name || b.id])]);
  fillSelect('#cueSfx', [['', 'No one-shot'], ...sfxLib.map((t) => [t.id, t.name || t.id]), ...['thunder', 'hit', 'magic', 'roar', 'bell', 'door', 'clash'].map((x) => [x, `Built-in: ${x}`])]);

  const pick = $('#nudgeTo');
  const was = pick.value;
  pick.innerHTML = players.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('') || '<option value="">No characters yet</option>';
  if (was && players.some((p) => p.id === was)) pick.value = was;
  $('#tblNudges').innerHTML = (s.nudges || []).slice(-6).reverse().map((n) => `<div class="item"><span><b>${esc(n.name)}</b>: ${esc(n.text)}<br><small>${({ sent: 'waiting for a reply', shared: 'shared aloud', kept: 'kept to themselves' })[n.status] || n.status}</small></span></div>`).join('');

  const bal = s.balance || [];
  $('#tblBalance').innerHTML = bal.map((r) => `<div class="item"><span><b>${esc(r.name)}</b> ${r.quiet ? '<em class="note">quiet, give them a moment</em>' : ''}<br><div class="meter"><i style="width:${r.share}%"></i></div><small>${r.acts} acts · ${r.talk} spoken · ${r.share}%</small></span></div>`).join('') || '<p class="note">No one has acted yet.</p>';

  $('#tblBonds').innerHTML = (s.dueBonds || []).map((b) => `<div class="item"><span><b>${esc(b.name)}</b> ↔ ${esc(b.toName)}<br><small>${esc(b.text)}</small></span><button class="btn small" data-bond-called="${esc(b.charId)}">Called back</button></div>`).join('') || '<p class="note">No bonds are waiting for a call-back.</p>';

  const t = s.tension || {};
  $('#tenVal').textContent = t.value ?? 0;
  $('#tenLabel').placeholder = t.label || 'Label';
  $('#tenOn').textContent = t.on ? 'Hide from TV' : 'Show on TV';
  $('#tenOn').classList.toggle('primary', !!t.on);

  $('#tblHints').innerHTML = (s.foreshadow || []).map((h) => `<div class="item"><span>${h.paid ? '✔ ' : '○ '}${esc(h.text)}${h.paid ? `<br><small>Paid off: ${esc(h.payoff || '—')}</small>` : ''}</span><span class="row">${h.paid ? `<button class="btn small" data-unpay="${esc(h.id)}">Undo</button>` : `<input class="payoff" data-payoff-for="${esc(h.id)}" placeholder="How it pays off" maxlength="200"><button class="btn small" data-pay="${esc(h.id)}">Paid off</button>`}<button class="btn small" data-hint-rm="${esc(h.id)}" aria-label="Remove hint">✕</button></span></div>`).join('') || '<p class="note">No hints planted yet.</p>';

  $('#tblFraming').innerHTML = players.map((p) => `<div class="item"><span><b>${esc(p.name)}</b> · ${(s.framing && s.framing[p.id]) || 0} token(s)</span><button class="btn small" data-grant="${esc(p.id)}">+1 token</button></div>`).join('') || '<p class="note">No characters yet.</p>';
  $('#tblCanon').innerHTML = (s.canon || []).slice().reverse().map((c) => `<div class="item"><span><b>${esc(c.by)}</b>: ${esc(c.text)}</span><button class="btn small" data-canon-rm="${esc(c.id)}" aria-label="Remove from canon">✕</button></div>`).join('') || '<p class="note">No framed details yet.</p>';

  const m = s.montage || {};
  $('#monStatus').textContent = m.prompt ? (m.reveal ? 'Revealed' : m.open ? `${m.count}/${m.total} answered` : 'Closed') : 'No prompt yet';
  $('#monReveal').disabled = !m.prompt || m.reveal;
  // The DM view holds answers as { charId: text }; after the reveal the same view is a list with names.
  const answers = Array.isArray(m.answers) ? m.answers.map((a) => [a.name, a.text]) : Object.entries(m.answers || {}).map(([id, text]) => [nm[id] || id, text]);
  $('#tblMontage').innerHTML = answers.map(([who, text]) => `<div class="item"><span><b>${esc(who)}</b>: ${esc(text)}</span></div>`).join('') || (m.prompt ? '<p class="note">Waiting for answers.</p>' : '');

  $('#sessNo').textContent = `Session ${s.sessionNo || 1}`;
});

function fillSelect(sel1, opts) {
  const el = $(sel1);
  const cur = el.value;
  el.innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
  if (cur && opts.some(([v]) => v === cur)) el.value = cur;
}

const val = (id) => $(id).value.trim();
const clear = (...ids) => ids.forEach((id) => { $(id).value = ''; });

card.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.layout) emit('dm:layout', { name: d.layout });
  else if (d.fire) emit('dm:cue:fire', { id: d.fire });
  else if (d.cueRm) emit('dm:cue:remove', { id: d.cueRm });
  else if (d.tension) emit('dm:tension', { value: Number($('#tenVal').textContent) + Number(d.tension) });
  else if (d.bondCalled) emit('dm:bond:called', { charId: d.bondCalled });
  else if (d.pay) { const v = card.querySelector(`[data-payoff-for="${d.pay}"]`)?.value.trim(); if (v) emit('dm:foreshadow:pay', { id: d.pay, payoff: v }); }
  else if (d.unpay) emit('dm:foreshadow:unpay', { id: d.unpay });
  else if (d.hintRm) emit('dm:foreshadow:remove', { id: d.hintRm });
  else if (d.grant) emit('dm:framing:grant', { charId: d.grant, n: 1 });
  else if (d.canonRm) emit('dm:canon:remove', { id: d.canonRm });
});

$('#cueAdd').onclick = () => {
  const name = val('#cueName');
  if (!name) return;
  const ht = val('#cueHText');
  emit('dm:cue:add', {
    name, mode: $('#cueMode').value || null, light: $('#cueLight').value || null,
    backdrop: $('#cueBd').value || null, sfx: $('#cueSfx').value || null,
    handout: ht ? { title: val('#cueHTitle') || 'Handout', text: ht } : null,
  });
  clear('#cueName', '#cueHTitle', '#cueHText');
};
$('#nudgeSend').onclick = () => {
  const text = val('#nudgeText');
  if (text && $('#nudgeTo').value) { emit('dm:nudge', { charId: $('#nudgeTo').value, text }); clear('#nudgeText'); }
};
$('#balReset').onclick = () => emit('dm:balance:reset');
$('#tenOn').onclick = () => emit('dm:tension', { on: !state()?.tension?.on, label: val('#tenLabel') || undefined });
$('#tenLabel').onchange = (e) => emit('dm:tension', { label: e.target.value.trim() });
$('#fsAdd').onclick = () => { const t = val('#fsText'); if (t) { emit('dm:foreshadow:add', { text: t }); clear('#fsText'); } };
$('#monAsk').onclick = () => { const p = val('#monPrompt'); if (p) { emit('dm:montage:ask', { prompt: p }); clear('#monPrompt'); } };
$('#monReveal').onclick = () => emit('dm:montage:reveal');
$('#monClose').onclick = () => emit('dm:montage:close');
$('#sessNext').onclick = () => emit('dm:session:next');
