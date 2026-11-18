// DM Legends card (phase J): award the hall of fame, keep the trophy shelf and open a trophy's story on
// the TV, put the hall or the shelf on the TV, and put empty chairs on autopilot. The House rules section was
// removed (Mike, Nov 16). The server does the rules (src/legends.js, src/absent.js).
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
// Show/hide toggles (Mike, Nov 18): each button shows its view, and reads Hide while that view is up.
const flip = (view) => call('dm:legends:show', { view: state()?.legendsShow === view ? null : view });
$('#legShowHall').onclick = () => flip('hall');
$('#legShowShelf').onclick = () => flip('shelf');
function drawShow(s) {
  for (const [id, view, name] of [['#legShowHall', 'hall', 'hall'], ['#legShowShelf', 'shelf', 'shelf']]) {
    const on = s.legendsShow === view;
    const b = $(id);
    b.textContent = on ? `Hide ${name} from TV` : `Show ${name} on TV`;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  }
}

$('#trAdd').onclick = async () => {
  const name = $('#trName').value.trim();
  if (!name) return flash('#trStatus', 'Name the trophy.');
  const r = await call('dm:trophy:add', { name, story: $('#trStory').value.trim() });
  report('#trStatus', r, `${name} is on the shelf.`);
  if (r?.ok) { $('#trName').value = ''; $('#trStory').value = ''; }
};

$('#legCard').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  if (d.legDel) await call('dm:legend:remove', { id: d.legDel });
  else if (d.trOpen) await call('dm:trophy:open', { id: state()?.trophy?.id === d.trOpen ? null : d.trOpen });
  else if (d.trDel) await call('dm:trophy:remove', { id: d.trDel });
  else if (d.autopilot) {
    const r = await call('dm:autopilot', { charId: d.autopilot, on: d.on !== 'true' });
    flash('#chairStatus', r?.error || '');
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
  const seats = (s.players || []).filter((p) => !p.online); // socketId is never sent to the DM; online is
  const key = JSON.stringify([L, seats.map((p) => [p.id, p.name, s.absent?.[p.id]?.autopilot]), s.trophy?.id, s.legendsShow, (s.roster || []).length]);
  drawShow(s);
  if (key === lastKey) return;
  lastKey = key;

  $('#legBoard').innerHTML = hallHtml(L);
  $('#legAwards').innerHTML = awards.map((a) => `<div class="item"><span><b>${esc(a.player)}</b> <small class="muted">${esc(L.cats[a.cat])} · ${esc(a.character)}${a.detail ? ` · ${esc(a.detail)}` : ''}</small></span><button class="btn small danger" data-leg-del="${esc(a.id)}" aria-label="Remove record">✕</button></div>`).join('') || '<p class="note">No awards yet.</p>';
  $('#trList').innerHTML = trophies.map((t) => `<div class="item"><span><b>${esc(t.name)}</b>${s.trophy?.id === t.id ? ' <small class="muted">· on the TV</small>' : ''}</span><span class="row"><button class="btn small ${s.trophy?.id === t.id ? 'on' : ''}" data-tr-open="${esc(t.id)}" aria-pressed="${s.trophy?.id === t.id}">${s.trophy?.id === t.id ? '■ Hide story' : '▶ Show story'}</button><button class="btn small danger" data-tr-del="${esc(t.id)}" aria-label="Remove trophy">✕</button></span></div>`).join('') || '<p class="note">The shelf is empty.</p>';
  $('#chairList').innerHTML = seats.map((p) => {
    const auto = !!s.absent?.[p.id]?.autopilot;
    return `<div class="item"><span><b>${esc(p.name)}</b> <small class="muted">${esc(p.player || '')} · ${auto ? 'autopilot' : 'empty chair'}</small></span><button class="btn small" data-autopilot="${esc(p.id)}" data-on="${auto}">${auto ? 'Hand back' : 'Autopilot'}</button></div>`;
  }).join('') || '<p class="note">Every character has a phone.</p>';
});
