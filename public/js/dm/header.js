// Top bar: rules system picker, room code, and which network address the join QR uses.
import { $, emit, onState, state } from '../client.js';

const { esc } = Stage;
let rulesKey = null;
let lanKey = null;

onState((s) => {
  const rk = s.rules.id + s.systems.map((x) => x.id).join();
  if (rk !== rulesKey) {
    rulesKey = rk;
    $('#system').innerHTML = s.systems.map((x) => `<option value="${x.id}" ${x.id === s.rules.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  }
  $('#roomCode').textContent = s.room || '';
  const lk = JSON.stringify([s.lan, s.settings.host]);
  if (lk !== lanKey && s.lan) {
    lanKey = lk;
    $('#hostSel').innerHTML = '<option value="">Auto</option>' + s.lan.map((a) => `<option value="${esc(a.address)}" ${a.address === s.settings.host ? 'selected' : ''}>${esc(a.address)} (${esc(a.name)}${a.virtual ? ', virtual' : ''})</option>`).join('');
  }
});

$('#system').onchange = (e) => {
  if (confirm('Switch rules system? Checks and new characters will use it.')) emit('dm:system', { id: e.target.value });
  else e.target.value = state().rules.id;
};
$('#roomNew').onclick = () => confirm('Make a new room code? Phones that are already seated keep playing.') && emit('dm:room:new');
$('#hostSel').onchange = (e) => emit('dm:host', { host: e.target.value });
$('#hideJoin').onchange = (e) => emit('dm:settings', { display: { hideJoin: e.target.checked } });
onState((s) => { $('#hideJoin').checked = !!s.settings?.display?.hideJoin; });
