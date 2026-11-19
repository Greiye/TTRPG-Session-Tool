// End of session (Mike, Nov 16): a red 1 s hold button at the bottom of the tools sidebar. The TV shows
// "End of Session", phones show "Thanks for playing.", and this dialog offers a save point and the logs.
import { $, emit, onState, state } from '../client.js';
import { dmKey, masterRole } from './auth.js';
import { holdButton } from './hold.js';

const KIND_NAMES = { action: 'Actions', check: 'Checks', combat: 'Combat', downtime: 'Downtime', narrate: 'Narration', npc: 'NPC speech', say: 'Player speech', shop: 'Shops', system: 'System', notice: 'Notices', roll: 'Dice' };
const esc = (s) => Stage.esc(s); // shared escaper (public/stage.js)
const dlg = $('#endDlg');
const qs = dmKey() ? `?key=${encodeURIComponent(dmKey())}` : '';
$('#endTranscript').href = `/api/transcript.md${qs}`;
$('#endStory').href = `/story${qs}`;

holdButton($('#endSession'), { ms: 1000, idle: 'End Session', holding: 'Keep holding…', onFire: () => emit('dm:session:end') });

const time = (t) => (t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
// The story log plus the dice log, oldest first, as one list.
function entries(s) {
  const rolls = (s.rolls || []).map((r) => ({ id: `r${r.id}`, t: r.t || r.at, kind: 'roll', text: `${r.who || ''}: ${r.label || 'roll'} = ${r.total}${r.dc ? ` vs DC ${r.dc}` : ''}${r.outcome ? ` (${r.outcome})` : ''}` }));
  return [...(s.log || []), ...rolls].sort((a, b) => (a.t || 0) - (b.t || 0));
}
function drawLog() {
  const s = state();
  if (!s || !dlg.open) return;
  const all = entries(s);
  const sel = $('#endLogKind');
  const kinds = [...new Set(all.map((e) => e.kind))].sort();
  if (sel.dataset.k !== kinds.join()) {
    const cur = sel.value;
    sel.innerHTML = `<option value="">Every type</option>${kinds.map((k) => `<option value="${k}">${KIND_NAMES[k] || k}</option>`).join('')}`;
    sel.value = kinds.includes(cur) ? cur : '';
    sel.dataset.k = kinds.join();
  }
  const kind = sel.value;
  const q = $('#endLogFind').value.trim().toLowerCase();
  const shown = all.filter((e) => (!kind || e.kind === kind) && (!q || String(e.text || '').toLowerCase().includes(q)));
  $('#endLog').innerHTML = shown.length
    ? shown.map((e, i) => `<div class="end-log-row k-${esc(e.kind)}" style="--i:${Math.min(i, 30)}"><small>${time(e.t)}</small><b>${esc(KIND_NAMES[e.kind] || e.kind)}</b><span>${esc(e.text)}</span></div>`).join('')
    : '<p class="note">Nothing matches.</p>';
}
$('#endLogFind').addEventListener('input', drawLog);
$('#endLogKind').addEventListener('change', drawLog);

function open(s) {
  const n = s.ended?.session;
  $('#endSaveName').value = `End of session${n ? ` ${n}` : ''} · ${new Date().toLocaleDateString([], { dateStyle: 'medium' })}`;
  $('#endSaved').textContent = '';
  if (!dlg.open) dlg.showModal();
  drawLog();
  $('#endLog').scrollTop = $('#endLog').scrollHeight;
}
$('#endSave').onclick = () => {
  const name = $('#endSaveName').value.trim() || 'End of session';
  emit('dm:save:create', { name });
  $('#endSaved').textContent = `Saved “${name}”. Load it any time from Campaign data.`;
};
$('#endClose').onclick = () => dlg.close();
$('#endResume').onclick = () => { emit('dm:session:resume'); dlg.close(); };

let seen = null;
onState((s) => {
  const bar = $('.end-session-bar');
  if (bar) bar.hidden = !!masterRole();
  const b = $('#endSession');
  b.classList.toggle('ended', !!s.ended);
  b.title = s.ended ? 'The session has ended. Press to reopen the end-of-session window.' : 'Press and hold for 1 second to end the session';
  const n = s.ended?.n || null;
  if (n && n !== seen && !masterRole()) open(s);
  if (!n && dlg.open) dlg.close();
  seen = n;
  drawLog();
});
// Once ended, a plain click reopens the dialog (the hold would do nothing: the server ignores a second end).
$('#endSession').addEventListener('click', () => { const s = state(); if (s?.ended && !masterRole()) open(s); });
