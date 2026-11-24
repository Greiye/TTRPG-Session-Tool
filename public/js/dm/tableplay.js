// Table play on the DM page (PR AD, Nov 24): players asking to roll, the key bank, the last battle cry, what the
// party last did with an NPC, NPC voices, and the phone tips reset. Server: src/tableplay.js.
import { $, emit, call, onState, state } from '../client.js';

const { esc } = Stage;

// ----- asks and the last battle cry: a small bar at the bottom of the page, over any tab -----
const bar = document.createElement('div');
bar.className = 'ask-bar';
bar.setAttribute('role', 'region');
bar.setAttribute('aria-label', 'Players asking to roll');
document.body.append(bar);
let barKey = '';
let cryGone = 0; // cry number whose row has timed out here
function drawBar(s) {
  const asks = s.asks || [];
  const cry = s.cry && s.cry.n !== cryGone ? s.cry : null;
  const key = JSON.stringify([asks, cry]);
  if (key === barKey) return;
  const before = new Set([...bar.querySelectorAll('[data-row]')].map((x) => x.dataset.row));
  const dcs = Object.fromEntries([...bar.querySelectorAll('[data-dc]')].map((x) => [x.dataset.dc, x.value])); // a DC being typed survives another ask
  const focus = bar.contains(document.activeElement) ? document.activeElement.dataset.dc : null;
  barKey = key;
  const dcLabel = esc(s.rules?.dcLabel || 'DC');
  bar.innerHTML = asks.map((a) => `<div class="ask-row" data-row="a${a.id}"><span><b>${esc(a.name)}</b> asks to roll <b>${esc(a.label)}</b></span>
      <button class="btn small primary" data-ask-go="${a.id}">🎲 Roll it</button>
      <label class="note tight">${dcLabel} <input type="number" min="1" max="40" data-dc="${a.id}" value="${esc(dcs[a.id] || '')}" aria-label="${dcLabel} for ${esc(a.name)}"></label>
      <button class="btn small" data-ask-dc="${a.id}">Set ${dcLabel}</button>
      <button class="btn small" data-ask-no="${a.id}" aria-label="Say no to ${esc(a.name)}">✕</button></div>`).join('')
    + (cry ? `<div class="ask-row cry" data-row="c${cry.n}"><span>💬 <b>${esc(cry.who)}</b> “${esc(cry.text)}”</span><button class="btn small" data-cry-hide>Hide</button></div>` : '');
  if (focus) bar.querySelector(`[data-dc="${CSS.escape(focus)}"]`)?.focus();
  bar.querySelectorAll('[data-row]').forEach((x) => { if (!before.has(x.dataset.row)) Anim.play(x, 'slideUp', null); });
  if (cry && !before.has(`c${cry.n}`)) setTimeout(() => { cryGone = cry.n; if (state()) drawBar(state()); }, 20000);
}
bar.addEventListener('click', (e) => {
  const d = e.target.closest('button')?.dataset;
  if (!d) return;
  if (d.askGo) emit('dm:ask:answer', { id: Number(d.askGo) });
  else if (d.askNo) emit('dm:ask:answer', { id: Number(d.askNo), no: true });
  else if (d.askDc) {
    const input = bar.querySelector(`[data-dc="${CSS.escape(d.askDc)}"]`);
    if (!input.value) return input.focus();
    emit('dm:ask:answer', { id: Number(d.askDc), dc: Number(input.value) });
  } else if (d.cryHide !== undefined) emit('dm:cry:hide');
});
bar.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset.dc) bar.querySelector(`[data-ask-dc="${CSS.escape(e.target.dataset.dc)}"]`).click(); });

// ----- key bank card (Rolls tab): one row of one-tap rolls per character, and the list per profession -----
let bankKey = ''; let clsKey = '';
function drawBank(s) {
  if (!s.keyBank) return;
  const key = JSON.stringify(s.players.map((p) => [p.id, p.name, p.keys]));
  if (key !== bankKey) {
    bankKey = key;
    $('#kbParty').innerHTML = s.players.map((p) => `<div class="row kb-row"><b>${esc(p.name)}</b>${(p.keys || []).map((k) => `<button class="btn small" data-quick="${esc(p.id)}" data-skill="${esc(k.skill)}" title="Roll ${esc(k.label)} for ${esc(p.name)} now">${esc(k.label)} ${k.bonus >= 0 ? '+' : ''}${k.bonus}</button>`).join('')}</div>`).join('') || '<p class="note">Nobody at the table yet.</p>';
  }
  const ck = s.keyBank.map((x) => x.cls).join();
  if (ck !== clsKey) {
    clsKey = ck;
    $('#kbCls').innerHTML = s.keyBank.map((x) => `<option value="${esc(x.cls)}">${esc(x.cls)}</option>`).join('');
  }
  showKeys(s);
}
function showKeys(s = state()) {
  const x = s?.keyBank?.find((y) => y.cls === $('#kbCls').value);
  if (x && document.activeElement !== $('#kbKeys')) $('#kbKeys').value = x.keys;
}
$('#kbCls').addEventListener('change', () => { $('#kbMsg').textContent = ''; showKeys(); });
$('#kbSave').addEventListener('click', async () => {
  const r = await call('dm:keybank', { cls: $('#kbCls').value, text: $('#kbKeys').value });
  $('#kbMsg').textContent = r?.error || 'Saved.';
});
$('#kbParty').addEventListener('click', (e) => { const b = e.target.closest('[data-quick]'); if (b) emit('dm:quickroll', { id: b.dataset.quick, skill: b.dataset.skill }); });
$('#tipsReset').addEventListener('click', async () => { await call('dm:tips:reset'); $('#tipsMsg').textContent = 'Every phone shows its tips again.'; });

// ----- NPC memory: asked for when a conversation opens or its people change -----
let memKey = '';
let memAsk = 0;
async function drawMemory(s) {
  const live = s.mode === 'social' && s.social.convo?.live;
  const box = $('#npcMemory');
  if (!live) { memKey = ''; box.hidden = true; return; }
  const npcs = (s.social.cast || []).map((c) => c.name);
  const pcs = (s.social.party || []).map((id) => s.players.find((p) => p.id === id)?.name).filter(Boolean);
  const key = JSON.stringify([s.social.convo.n, npcs, pcs]);
  if (key === memKey) return;
  memKey = key;
  const mine = ++memAsk;
  const r = await call('dm:npc:memory', { npcs, pcs });
  if (mine !== memAsk) return; // the people changed while this was on its way
  const list = r?.moments || [];
  const was = box.hidden;
  box.hidden = !list.length;
  box.innerHTML = `<h3>🧠 Last time <span class="note">kept moments, only you see this</span></h3><ul>${list.map((m) => `<li><b>${esc(m.npc)}</b> <small class="muted">${esc([new Date(m.t).toLocaleDateString(), m.scene].filter(Boolean).join(' · '))}</small><br>${m.who ? `${esc(m.who)}: ` : ''}${esc(m.text)}</li>`).join('')}</ul>`;
  if (was && list.length) Anim.play(box, 'unfold', null);
}

// ----- NPC voice: on the NPC card, for whoever is speaking now -----
const DEF = { voice: '', pitch: 1, rate: 1, mute: false };
const voiceOf = (s) => ({ ...DEF, ...(Object.hasOwn(s.tts?.npcs || {}, s.social.npc.name) ? s.tts.npcs[s.social.npc.name] : {}) });
let voiceKey = '';
function drawVoice(s) {
  if (!s.tts) return;
  const list = TablePlay.voices();
  const v = voiceOf(s);
  const key = JSON.stringify([s.tts.on, v, s.social.npc.name, list.map((x) => x.name)]);
  const box = $('#npcVoice');
  if (key === voiceKey || box.contains(document.activeElement)) return;
  voiceKey = key;
  box.innerHTML = `<h3>Voice <span class="note">${esc(s.social.npc.name)}</span></h3>
    ${list.length ? `<div class="row"><select class="grow" data-v="voice" aria-label="Voice"><option value="">Default voice</option>${list.map((x) => `<option value="${esc(x.name)}" ${x.name === v.voice ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select><button class="btn small" data-v-test>▶ Preview</button></div>
    <label class="slider">Pitch <input type="range" min="0.5" max="1.8" step="0.1" data-v="pitch" value="${v.pitch}"></label>
    <label class="slider">Speed <input type="range" min="0.6" max="1.6" step="0.1" data-v="rate" value="${v.rate}"></label>
    <div class="row"><button class="btn small ${v.mute ? 'on' : ''}" data-v-mute aria-pressed="${v.mute}">${v.mute ? '🔇 Muted' : '🔊 Mute this NPC'}</button>
    <button class="btn small ${s.tts.on ? 'on' : ''}" data-v-on aria-pressed="${s.tts.on}">${s.tts.on ? 'TV reads NPC lines: on' : 'TV reads NPC lines: off'}</button></div>`
    : '<p class="note">This laptop has no installed voices.</p>'}`;
}
$('#npcVoice').addEventListener('change', (e) => { const k = e.target.dataset.v; if (k) { emit('dm:tts:npc', { name: state().social.npc.name, [k]: k === 'voice' ? e.target.value : Number(e.target.value) }); e.target.blur(); } });
$('#npcVoice').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  const s = state();
  if (!b || !s) return;
  b.blur(); // so the next state can redraw the card
  if (b.hasAttribute('data-v-test')) TablePlay.speak($('#line').value.trim() || `${s.social.npc.name} speaks.`, voiceOf(s), s.audio?.master ?? 1);
  else if (b.hasAttribute('data-v-mute')) emit('dm:tts:npc', { name: s.social.npc.name, mute: !voiceOf(s).mute });
  else if (b.hasAttribute('data-v-on')) emit('dm:tts', { on: !s.tts.on });
});
window.speechSynthesis?.addEventListener?.('voiceschanged', () => { if (state()) drawVoice(state()); }); // the list arrives late

onState((s) => { drawBar(s); drawBank(s); drawMemory(s); drawVoice(s); });
