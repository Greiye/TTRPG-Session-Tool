// DM Downtime card: open a week, open or close picks, and write each character's result.
// Only the DM, and the character who made the pick, see the result (src/downtime.js).
import { $, emit, onState, state } from '../client.js';

const { esc } = Stage;

$('#dtStart').onclick = () => {
  const dt = state()?.downtime;
  if (dt?.n && Object.keys(dt.picks || {}).length && !confirm('Start a new week? This week’s picks and results are cleared.')) return;
  emit('dm:downtime:start');
};
$('#dtOpen').onclick = () => emit('dm:downtime:open', { open: !state()?.downtime?.open });

onState((s) => {
  const dt = s.downtime || { n: 0, open: false, picks: {}, results: {}, kinds: {} };
  $('#dtStatus').textContent = dt.n ? `week ${dt.n} · ${dt.open ? 'picks open' : 'picks closed'}` : 'no week yet';
  $('#dtOpen').textContent = dt.open ? 'Close picks' : 'Open picks';
  $('#dtOpen').disabled = !dt.n;

  // Keep a result the DM is typing: skip the redraw while focus is in the list.
  if (document.activeElement?.closest('#dtList')) return;
  $('#dtList').innerHTML = s.players.map((p) => {
    const pk = dt.picks[p.id];
    const res = dt.results[p.id];
    return `<div class="item"><span><b>${esc(p.name)}</b> <small class="muted">${pk ? `${esc(dt.kinds[pk.kind]?.name || pk.kind)}: ${esc(pk.target)}` : dt.n ? 'no pick yet' : ''}</small></span></div>
      ${pk ? `<div class="row"><textarea rows="2" class="grow" data-dt-in="${esc(p.id)}" aria-label="Result for ${esc(p.name)}" placeholder="What happens. Only ${esc(p.name)} and you see this.">${esc(res?.text || '')}</textarea><button class="btn small" data-dt-res="${esc(p.id)}">Save</button></div>` : ''}`;
  }).join('') || '<p class="note">Add characters first.</p>';
});

$('#dtList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-dt-res]');
  if (!b) return;
  const pid = b.dataset.dtRes;
  emit('dm:downtime:resolve', { pid, text: document.querySelector(`[data-dt-in="${pid}"]`).value });
});
