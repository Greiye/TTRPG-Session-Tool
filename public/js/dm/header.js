// Top bar: rules system picker, room code, and which network address the join QR uses.
import { $, emit, call, onState, state } from '../client.js';

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
// The join QR is hidden on the TV by default (Mike, Nov 15): tick to show it.
$('#showJoin').onchange = (e) => emit('dm:settings', { display: { hideJoin: !e.target.checked } });
onState((s) => { $('#showJoin').checked = s.settings?.display?.hideJoin === false; });
// TV landing page (src/lobby.js, Nov 18): the DM can also press Start game, once one player has joined.
onState((s) => {
  const b = $('#lobbyStart');
  if (!b) return;
  b.hidden = !s.lobby;
  b.disabled = !(s.players || []).some((p) => p.online);
});
$('#lobbyStart')?.addEventListener('click', () => call('lobby:start', {}));

// Test mode (Nov 18): on by default with one test player; the button turns it off (or back on).
onState((s) => {
  const on = !!s.settings?.testMode;
  const b = $('#testMode');
  b.setAttribute('aria-pressed', String(on));
  b.classList.toggle('on', on);
  b.textContent = on ? '🧪 Test mode on' : '🧪 Test mode off';
  document.body.classList.toggle('test-mode', on);
});
$('#testMode').addEventListener('click', () => emit('dm:testmode', { on: !state().settings?.testMode }));

// Top bar minimize (Mike, Nov 14): ▴ folds the bar to its title line; ▾ brings it back. Saved on this laptop.
const BAR_KEY = 'dmBarMin';
function setBar(min) {
  document.body.classList.toggle('bar-min', min);
  const b = $('#barMin');
  b.textContent = min ? '▾' : '▴';
  b.title = min ? 'Show the top bar' : 'Minimize the top bar';
  b.setAttribute('aria-label', b.title);
  b.setAttribute('aria-expanded', String(!min));
  try { localStorage.setItem(BAR_KEY, min ? '1' : ''); } catch { /* private mode */ }
}
$('#barMin').onclick = () => setBar(!document.body.classList.contains('bar-min'));
try { if (localStorage.getItem(BAR_KEY)) setBar(true); } catch { /* private mode */ }
