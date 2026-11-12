// Save points: named snapshots of the campaign (state + characters) the DM can load again.
import { $, emit, onState, onClick } from '../client.js';

const { esc } = Stage;
let key = null;
onState((s) => {
  const k = JSON.stringify(s.saves || []);
  if (k === key) return;
  key = k;
  $('#saves').innerHTML = (s.saves || []).map((x) => `<div class="item cr-item"><span>💾 <b>${esc(x.name)}</b> <small class="muted">${esc(x.scene || '')} · ${new Date(x.savedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</small></span>
    <span class="row"><button class="btn small" data-save-load="${esc(x.id)}">Load</button><button class="btn small danger" data-save-del="${esc(x.id)}">✕</button></span></div>`).join('');
});
$('#saveBtn').onclick = () => { emit('dm:save:create', { name: $('#saveName').value.trim() || `Save ${new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}` }); $('#saveName').value = ''; };
onClick('save-load', (id) => confirm('Load this save point? The table goes back to how it was then. Make a save point first if you want to keep the current state.') && emit('dm:save:load', { id }));
onClick('save-del', (id) => confirm('Delete this save point?') && emit('dm:save:delete', { id }));
