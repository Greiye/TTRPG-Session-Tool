// Phone Inventory tab: gold and the items the character carries. Players add, count and remove their own
// items; the DM sets gold. Changes go to the server at once (player:sheet), so the DM sees them live.
import { socket, $, onState, state } from '../client.js';
import { me } from './identity.js';
import { addTab, tab, onTab } from './tabs.js';

const { esc } = Stage;
addTab('inventory', '🎒 Inventory');
const root = () => $('#tabInventory');
const send = (patch) => socket.emit('player:sheet', patch);
const gp = (n) => Number(n || 0).toFixed(2).replace(/\.?0+$/, '');
const shown = new Set(); // item ids already on screen; a new one slides in once
let primed = false;

function render() {
  const S = state();
  const c = S?.players.find((p) => p.id === me.charId);
  if (!c || tab() !== 'inventory') return;
  const a = document.activeElement;
  if (a && root().contains(a) && a.tagName === 'INPUT') return; // don't redraw under a typing thumb
  const items = c.inventory || [];
  root().innerHTML = `
    <div class="card"><h3>💰 Gold</h3><div class="chips"><span class="chip"><b>${gp(c.gold)} gp</b></span></div><p class="note">The DM sets your gold.</p></div>
    <div class="card"><h3>🎒 Items <span class="note">${items.length}</span></h3>
      <div class="list">${items.map((i) => `<div class="inv ${primed && !shown.has(i.id) ? 'inv-new' : ''}" data-item="${esc(i.id)}"><span><b>${esc(i.name)}</b>${i.note ? `<small class="muted"> ${esc(i.note)}</small>` : ''}</span><span class="row"><button class="btn small" data-inv="${esc(i.id)}" data-q="${i.qty - 1}" ${i.qty ? '' : 'disabled'} aria-label="One less ${esc(i.name)}">−</button><b>${i.qty}</b><button class="btn small" data-inv="${esc(i.id)}" data-q="${i.qty + 1}" aria-label="One more ${esc(i.name)}">+</button><button class="btn small danger" data-inv-del="${esc(i.id)}" aria-label="Remove ${esc(i.name)}">✕</button></span></div>`).join('') || '<p class="note">Nothing yet.</p>'}</div>
      <form class="row" id="invForm"><input id="invName" class="grow" maxlength="60" placeholder="Add an item" autocomplete="off"><input id="invQty" type="number" min="0" value="1" style="width:64px" aria-label="Quantity"><button class="btn">Add</button></form>
    </div>`;
  items.forEach((i) => shown.add(i.id));
  primed = true;
}
onState(render);
onTab((id) => { if (id === 'inventory') render(); });

root().addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (b.dataset.inv) send({ inv: { op: 'set', id: b.dataset.inv, qty: Number(b.dataset.q) } });
  else if (b.dataset.invDel) {
    const row = b.closest('.inv');
    row?.classList.add('inv-gone'); // fade out, then remove
    setTimeout(() => send({ inv: { op: 'del', id: b.dataset.invDel } }), 180);
  } else return;
  navigator.vibrate?.(20);
});
root().addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.id !== 'invForm') return;
  const name = $('#invName').value.trim();
  if (name) send({ inv: { op: 'add', name, qty: Number($('#invQty').value) || 1 } });
  document.activeElement?.blur();
});
