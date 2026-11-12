// Phone Downtime tab: choose this week's activity (crafting, training or research) and read the result.
import { socket, $, onState, state } from '../client.js';
import { me } from './identity.js';
import { addTab, tab, onTab } from './tabs.js';

const { esc } = Stage;
addTab('downtime', '⏳ Downtime');
const root = () => $('#tabDowntime');
let sel = null; // kind chosen in the form
let draft = null; // target text typed but not saved yet
let note = '';

function render() {
  const S = state();
  const c = S?.players.find((p) => p.id === me.charId);
  if (!c || tab() !== 'downtime') return;
  // Don't redraw under the player's thumb while they type.
  const a = document.activeElement;
  if (a && root().contains(a) && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
  const dt = S.downtime;
  if (!dt?.n) {
    root().innerHTML = '<div class="card"><h3>Downtime</h3><p class="note">Nothing to do this week. Your DM opens downtime between sessions.</p></div>';
    return;
  }
  const kinds = dt.kinds;
  sel ??= dt.mine?.kind || 'crafting';
  const value = draft ?? dt.mine?.target ?? '';
  root().innerHTML = `
    <div class="card"><h3>Downtime · week ${dt.n}</h3>
      ${dt.open
        ? `<p class="note">Choose what your character does. You can change it until your DM closes the week.</p>
           <div class="chips" role="group" aria-label="Activity">${Object.entries(kinds).map(([k, v]) => `<button class="chip ${k === sel ? 'on' : ''}" data-kind="${k}" aria-pressed="${k === sel}">${esc(v.name)}</button>`).join('')}</div>
           <p class="note">${esc(kinds[sel].hint)}</p>
           <div class="row"><input id="dtTarget" class="grow" maxlength="200" placeholder="What exactly?" value="${esc(value)}" aria-label="What your character does"><button class="btn primary small" data-dt-save>Save</button></div>`
        : `<p class="note">Picks are closed. Your DM resolves them before the next game.</p>
           ${dt.mine ? `<div class="inv"><span><b>${esc(kinds[dt.mine.kind].name)}</b> <small class="muted">${esc(dt.mine.target)}</small></span></div>` : '<p class="note">You made no pick this week.</p>'}`}
      ${note ? `<p class="note" role="status">${esc(note)}</p>` : ''}
    </div>
    ${dt.result ? `<div class="card"><h3>Result</h3><p>${esc(dt.result.text)}</p></div>` : ''}`;
}
onState(render);
onTab((id) => { if (id === 'downtime') note = ''; render(); });

root().addEventListener('input', (e) => { if (e.target.id === 'dtTarget') draft = e.target.value; });
root().addEventListener('click', (e) => {
  const k = e.target.closest('[data-kind]');
  if (k) { sel = k.dataset.kind; render(); return; }
  if (!e.target.closest('[data-dt-save]')) return;
  const target = root().querySelector('#dtTarget')?.value ?? '';
  socket.emit('player:downtime:choose', { kind: sel, target }, (r) => {
    note = r?.error || 'Saved. Your DM resolves it before the next game.';
    if (!r?.error) draft = null;
    navigator.vibrate?.(r?.error ? [40, 40, 40] : 20);
    render();
  });
});
