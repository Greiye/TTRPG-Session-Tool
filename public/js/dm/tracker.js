// Phase 6 on the DM page: segment clocks. Conditions and concentration are badges on the hero portrait
// (public/js/dm/conds.js, Mike Nov 16); rests are applied when camp ends (public/js/dm/camp.js).
import { $, emit, onState } from '../client.js';

const { esc } = Stage;

onState((s) => {
  $('#clockList').innerHTML = (s.clocks || []).map((c) => `<div class="item"><span class="clock-row">${Stage.pie(c.segments, c.filled, 'dm:' + c.id, 'mini')}<b>${esc(c.name)}</b> <small class="muted">${c.filled}/${c.segments}</small></span><span class="clock-row"><button class="btn small" data-clock="${c.id}" data-d="-1">−</button><button class="btn small" data-clock="${c.id}" data-d="1">+</button><button class="btn small danger" data-clock-del="${c.id}">✕</button></span></div>`).join('') || '<p class="note">No clocks yet.</p>';
});

$('#clockList').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.clockDel) emit('dm:clock:remove', { id: b.dataset.clockDel });
  else emit('dm:clock:fill', { id: b.dataset.clock, delta: Number(b.dataset.d) });
});
$('#clockAdd').onclick = () => { const name = $('#clockName').value.trim(); if (name) { emit('dm:clock:add', { name, segments: $('#clockSegs').value }); $('#clockName').value = ''; } };
