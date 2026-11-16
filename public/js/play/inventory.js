// Phone Inventory tab: gold and the items the character carries. The DM gives items (DM Items tab) and sets
// gold; players use items up (−) or drop them. Changes go to the server at once (player:sheet).
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
let lastGold = null; // gold last drawn: a change bumps the number

function render() {
  const S = state();
  const c = S?.players.find((p) => p.id === me.charId);
  if (!c || tab() !== 'inventory') return;
  const a = document.activeElement;
  if (a && root().contains(a) && a.tagName === 'INPUT') return; // don't redraw under a typing thumb
  const items = c.inventory || [];
  root().innerHTML = `
    <div class="card"><div class="gold-coin${lastGold != null && lastGold !== c.gold ? ' bump' : ''}" aria-label="${gp(c.gold)} gold"><span aria-hidden="true">🪙</span><b>${gp(c.gold)}</b></div></div>
    <div class="card"><h3>🎒 Items <span class="note">${items.length}</span></h3>
      <div class="list">${items.map((i) => `<div class="inv ${primed && !shown.has(i.id) ? 'inv-new' : ''}" data-item="${esc(i.id)}"><span><b>${esc(i.name)}</b>${i.note ? `<small class="muted"> ${esc(i.note)}</small>` : ''}</span><span class="row"><button class="btn small" data-inv="${esc(i.id)}" data-q="${i.qty - 1}" ${i.qty ? '' : 'disabled'} aria-label="One less ${esc(i.name)}">−</button><b>${i.qty}</b><button class="btn small danger" data-inv-del="${esc(i.id)}" aria-label="Remove ${esc(i.name)}">✕</button></span></div>`).join('') || '<p class="note">Nothing yet. The DM hands out items.</p>'}</div>
    </div>`;
  items.forEach((i) => shown.add(i.id));
  lastGold = c.gold;
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
