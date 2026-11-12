// Spectator suggestions: the DM sees them as they come in and can dismiss one.
import { $, emit, onState, onClick } from '../client.js';

const { esc } = Stage;

onState((s) => {
  const list = (s.suggestions || []).slice().reverse();
  $('#suggests').innerHTML = list.length
    ? `<h3>Spectator suggestions <span class="note">${list.length}</span></h3>${list.map((x) => `<div class="row"><span class="grow"><b>${esc(x.name)}:</b> ${esc(x.text)}</span><button class="btn small" data-dismiss="${x.id}" title="Dismiss">✕</button></div>`).join('')}`
    : '';
});
onClick('dismiss', (id) => emit('dm:suggestion:dismiss', { id: Number(id) }));
