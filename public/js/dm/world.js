// Phase 2 to 7 DM controls: messages (handouts, phrases, vote, spoils), mood music, lights,
// templates, NPC relations.
import { socket, $, emit, onState, onClick, state } from '../client.js';

const { esc } = Stage;
const MODES = [['#moodExp', 'exploration'], ['#moodCom', 'combat'], ['#moodSoc', 'social']];
const LIGHTS = ['day', 'dusk', 'night', 'dawn', 'torchlight'];
let libKey = null; let tplKey = null; let relKey = null;

onState((s) => {
  const lk = s.audio.library.map((t) => t.id + t.name).join();
  if (lk !== libKey) {
    libKey = lk;
    for (const [sel, mode] of MODES) {
      const cur = s.moodMap?.[mode] || '';
      $(sel).innerHTML = `<option value="">— none —</option>` + s.audio.library.map((t) => `<option value="${esc(t.id)}" ${t.id === cur ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
    }
    $('#hoTo').innerHTML = '<option value="all">All phones</option>' + s.players.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    $('#objWho').innerHTML = s.players.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('') || '<option value="">No one in the party</option>';
  }
  // Secret objectives (item 9): the DM sees them all; reveal sends one to every phone and the TV.
  $('#objList').innerHTML = (s.objectives || []).slice().reverse().map((o) => `<div class="item"><span>🎯 <b>${esc(o.title)}</b> <small class="muted">${esc(o.name)} · ${o.revealed ? 'revealed to the table' : 'secret'}</small></span><span class="row"><button class="btn small ${o.revealed ? 'on' : ''}" data-obj-reveal="${esc(o.id)}" title="Show to all phones and the TV">Reveal</button><button class="btn small danger" data-obj-del="${esc(o.id)}">✕</button></span></div>`).join('');
  $('#lightSel').innerHTML = LIGHTS.map((l) => `<option ${(s.scene.light || 'day') === l ? 'selected' : ''}>${l}</option>`).join('');
  $('#bulbOn').checked = !!s.bulbsOn;
  $('#bulbInfo').textContent = s.bulbsTargets ? `${s.bulbsTargets} bulb(s) configured` : 'No bulbs configured (BULBS_* env vars)';
  const tk = JSON.stringify(s.templates || {});
  if (tk !== tplKey && s.templates) { tplKey = tk; $('#tplSel').innerHTML = Object.entries(s.templates).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join(''); }
  // Messages
  $('#msgList').innerHTML = (s.handouts || []).slice(-12).reverse().map((h) => {
    const who = h.vis?.to ? (h.vis.to.includes('*') ? 'all phones' : h.vis.to.map((id) => s.players.find((p) => p.id === id)?.name || '?').join(', ')) : '';
    if (h.kind === 'spoil') return `<div class="item"><span>🎁 <b>${esc(h.title)}</b> <small class="muted">${h.items.map((i) => `${i.qty}× ${esc(i.name)}`).join(', ')} · ${Object.keys(h.claims).length} claim(s)${h.awarded ? ` · to ${esc(s.players.find((p) => p.id === h.awarded)?.name || '?')}` : ''}</small></span>
      <span class="row">${Object.values(h.claims).map((c) => `<small class="muted">${esc(c.name)}${c.note ? `: "${esc(c.note)}"` : ''}</small>`).join(' ')}${h.awarded ? '' : Object.keys(h.claims).map((id) => `<button class="btn small" data-award="${esc(h.id)}" data-char="${esc(id)}">Give ${esc(s.players.find((p) => p.id === id)?.name || '?')}</button>`).join('')}</span></div>`;
    if (h.kind === 'phrase') return `<div class="item"><span>🔤 <b>${esc(h.lang)}</b>: ${esc(h.text)} <small class="muted">phones see glyphs${h.revealed ? ' · revealed' : ''}</small></span><span class="row"><button class="btn small ${h.revealed ? 'on' : ''}" data-reveal="${esc(h.id)}">Reveal</button><button class="btn small danger" data-msg-del="${esc(h.id)}">✕</button></span></div>`;
    const shared = h.vis?.screen ? 'on' : '';
    return `<div class="item"><span>📜 <b>${esc(h.title)}</b> <small class="muted">${esc(who)}</small></span><span class="row"><button class="btn small ${shared}" data-share="${esc(h.id)}" title="Show on the TV">📺</button><button class="btn small danger" data-msg-del="${esc(h.id)}">✕</button></span></div>`;
  }).join('') || '<p class="note">Handouts, phrases and spoils appear here.</p>';
  const v = s.vote;
  $('#voteTally').textContent = v ? v.options.map((o, i) => `${o}: ${v.counts?.[i] ?? 0}`).join(' · ') + (v.open ? '  (open)' : '  (closed)') : '';
  // NPC relations
  const npcs = s.entities?.filter((x) => x.type === 'npc') || [];
  const nk = npcs.map((n) => n.id + n.name).join();
  if (nk !== relKey) { relKey = nk; $('#relNpc').innerHTML = npcs.map((n) => `<option value="${esc(n.id)}">${esc(n.name)}</option>`).join('') || '<option value="">Add NPCs in the library first</option>'; }
  const npc = $('#relNpc').value;
  $('#relList').innerHTML = s.players.map((p) => {
    const cur = s.relations?.[npc]?.[p.id] || 'neutral';
    return `<div class="item"><span><b>${esc(p.name)}</b></span><span class="row">${['friendly', 'neutral', 'wary', 'hostile'].map((st) => `<button class="btn small ${cur === st ? 'on' : ''}" data-rel="${esc(p.id)}" data-stance="${st}">${st}</button>`).join('')}</span></div>`;
  }).join('') || '<p class="note">Add characters first.</p>';
});

for (const [sel, mode] of MODES) $(sel).onchange = (e) => emit('dm:mood', { mode, track: e.target.value || null });
$('#lightSel').onchange = (e) => emit('dm:light', { light: e.target.value });
$('#bulbOn').onchange = (e) => emit('dm:bulbs', { on: e.target.checked });
$('#relNpc').onchange = () => { relKey = null; };
$('#relList').addEventListener('click', (e) => { const b = e.target.closest('[data-rel]'); if (b) emit('dm:relation', { npc: $('#relNpc').value, charId: b.dataset.rel, stance: b.dataset.stance }); });
$('#objList').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.objReveal) emit('dm:objective:reveal', { id: b.dataset.objReveal, on: !b.classList.contains('on') });
  else if (b.dataset.objDel) emit('dm:objective:remove', { id: b.dataset.objDel });
});
$('#msgList').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  if (d.award) emit('dm:spoil:award', { id: d.award, charId: d.char });
  else if (d.reveal) emit('dm:phrase:reveal', { id: d.reveal, on: !b.classList.contains('on') });
  else if (d.share) { const h = state().handouts.find((x) => x.id === d.share); emit('dm:share', { id: d.share, on: !h?.vis?.screen }); }
  else if (d.msgDel) emit('dm:handout:remove', { id: d.msgDel });
});
onClick('act', (a) => {
  if (a === 'handout') { const title = $('#hoTitle').value.trim(); const text = $('#hoText').value.trim(); if (title || text) { const to = $('#hoTo').value; emit('dm:handout', { title, text, to: to === 'all' ? 'all' : [to] }); $('#hoTitle').value = ''; $('#hoText').value = ''; } }
  if (a === 'objective') { const charId = $('#objWho').value; const title = $('#objTitle').value.trim(); if (charId && title) { emit('dm:objective', { charId, title, text: $('#objText').value.trim() }); $('#objTitle').value = ''; $('#objText').value = ''; } }
  if (a === 'phrase') { const text = $('#phText').value.trim(); const lang = $('#phLang').value.trim(); if (text && lang) { emit('dm:phrase', { lang, text }); $('#phText').value = ''; } }
  if (a === 'voteStart') emit('dm:vote:start', { options: $('#voteOpts').value.split(',').map((x) => x.trim()).filter(Boolean) });
  if (a === 'voteClose') emit('dm:vote:close', {});
  if (a === 'voteClear') emit('dm:vote:clear', {});
  if (a === 'spoil') { const items = $('#spItems').value.split(',').map((x) => x.trim()).filter(Boolean).map((x) => { const m = x.match(/^(.*?)\s+(\d+)$/); return m ? { name: m[1], qty: Number(m[2]) } : { name: x, qty: 1 }; }); if (items.length) emit('dm:spoil', { title: $('#spTitle').value.trim() || 'Spoils', items }); }
  if (a === 'tpl') emit('dm:template', { key: $('#tplSel').value });
});
