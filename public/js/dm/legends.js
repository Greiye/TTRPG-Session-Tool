// DM Legends card (phase J): award the hall of fame, keep the trophy shelf and open a trophy's story on
// the TV, put the hall or the shelf on the TV, switch house rules, and put empty chairs on autopilot.
// The server does the rules (src/legends.js, src/houserules.js, src/absent.js).
import { $, call, onState, state } from '../client.js';

const { esc, hallHtml } = Stage;
let lastKey = '';

const flash = (id, msg) => { const el = $(id); if (el) el.textContent = msg; };
const report = (id, r, ok) => flash(id, r?.error || ok);

$('#legAward').onclick = async () => {
  const charId = $('#legWho').value;
  if (!charId) return flash('#legStatus', 'Pick a character first.');
  const r = await call('dm:legend:award', { cat: $('#legCat').value, charId, detail: $('#legDetail').value.trim() });
  report('#legStatus', r, 'Recorded in the hall of fame.');
  if (r?.ok) $('#legDetail').value = '';
};
$('#legShowHall').onclick = () => call('dm:legends:show', { view: 'hall' });
$('#legShowShelf').onclick = () => call('dm:legends:show', { view: 'shelf' });
$('#legHide').onclick = () => call('dm:legends:show', { view: null });

$('#trAdd').onclick = async () => {
  const name = $('#trName').value.trim();
  if (!name) return flash('#trStatus', 'Name the trophy.');
  const r = await call('dm:trophy:add', { name, story: $('#trStory').value.trim() });
  report('#trStatus', r, `${name} is on the shelf.`);
  if (r?.ok) { $('#trName').value = ''; $('#trStory').value = ''; }
};
$('#trClose').onclick = () => call('dm:trophy:open', { id: null });

$('#legCard').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  if (d.legDel) await call('dm:legend:remove', { id: d.legDel });
  else if (d.trOpen) await call('dm:trophy:open', { id: d.trOpen });
  else if (d.trDel) await call('dm:trophy:remove', { id: d.trDel });
  else if (d.autopilot) {
    const r = await call('dm:autopilot', { charId: d.autopilot, on: d.on !== 'true' });
    flash('#chairStatus', r?.error || '');
  }
});
$('#legCard').addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset.ruleId) {
    const r = await call('dm:houserule', { id: t.dataset.ruleId, on: t.checked });
    if (r?.error) { t.checked = !t.checked; flash('#ruleStatus', r.error); }
  }
});

onState((s) => {
  const L = s.legends;
  if (!L) return;
  // Character picker for awards: every character at the table, plus the roster.
  const opts = (s.roster || []).map((c) => `<option value="${esc(c.id)}">${esc(c.player || c.name)} · ${esc(c.name)}</option>`).join('');
  const who = $('#legWho');
  if (who.dataset.key !== opts) { who.innerHTML = opts || '<option value="">No characters yet</option>'; who.dataset.key = opts; }

  const awards = [...(L.kill || []), ...(L.plan || [])];
  const trophies = L.trophies || [];
  const rules = s.houseRuleList || [];
  const seats = (s.players || []).filter((p) => !p.online); // socketId is never sent to the DM; online is
  const key = JSON.stringify([L, rules, seats.map((p) => [p.id, p.name, s.absent?.[p.id]?.autopilot]), s.trophy?.id, s.legendsShow, (s.roster || []).length]);
  if (key === lastKey) return;
  lastKey = key;

  $('#legBoard').innerHTML = hallHtml(L);
  $('#legAwards').innerHTML = awards.map((a) => `<div class="item"><span><b>${esc(a.player)}</b> <small class="muted">${esc(L.cats[a.cat])} · ${esc(a.character)}${a.detail ? ` · ${esc(a.detail)}` : ''}</small></span><button class="btn small danger" data-leg-del="${esc(a.id)}" aria-label="Remove record">✕</button></div>`).join('') || '<p class="note">No awards yet.</p>';
  $('#trList').innerHTML = trophies.map((t) => `<div class="item"><span><b>${esc(t.name)}</b>${s.trophy?.id === t.id ? ' <small class="muted">· on the TV</small>' : ''}</span><span class="row"><button class="btn small" data-tr-open="${esc(t.id)}">▶ Story</button><button class="btn small danger" data-tr-del="${esc(t.id)}" aria-label="Remove trophy">✕</button></span></div>`).join('') || '<p class="note">The shelf is empty.</p>';
  $('#ruleList').innerHTML = rules.map((r) => `<label class="row" title="${esc(r.text)}"><input type="checkbox" data-rule-id="${esc(r.id)}" ${r.on ? 'checked' : ''}> <span><b>${esc(r.label)}</b> <small class="muted">${esc(r.text)}</small></span></label>`).join('') || '<p class="note">No house rules.</p>';
  $('#chairList').innerHTML = seats.map((p) => {
    const auto = !!s.absent?.[p.id]?.autopilot;
    return `<div class="item"><span><b>${esc(p.name)}</b> <small class="muted">${esc(p.player || '')} · ${auto ? 'autopilot' : 'empty chair'}</small></span><button class="btn small" data-autopilot="${esc(p.id)}" data-on="${auto}">${auto ? 'Hand back' : 'Autopilot'}</button></div>`;
  }).join('') || '<p class="note">Every character has a phone.</p>';
});
