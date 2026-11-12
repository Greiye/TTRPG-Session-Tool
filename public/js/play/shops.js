// Phone Shops tab (item 27): open NPC shops, the prices and stock, and buying with the character's gold.
import { socket, $, onState, state } from '../client.js';
import { me } from './identity.js';
import { addTab, tab, onTab } from './tabs.js';

const { esc } = Stage;
addTab('shop', '🛒 Shops');
const root = () => $('#tabShop');
let note = '';

// 15 -> "15", 2.5 -> "2.5", 0.02 -> "0.02"
const gp = (n) => Number(n || 0).toFixed(2).replace(/\.?0+$/, '');

function render() {
  const S = state();
  const c = S?.players.find((p) => p.id === me.charId);
  if (!c || tab() !== 'shop') return;
  // Don't redraw under the player's thumb while they type a quantity.
  const a = document.activeElement;
  if (a && root().contains(a) && a.tagName === 'INPUT') return;
  const shops = S.shops || [];
  root().innerHTML = `
    <div class="card"><h3>Your gold</h3><div class="chips"><span class="chip"><b>${gp(c.gold)} gp</b></span></div></div>
    ${(S.factions || []).length ? `<div class="card"><h3>Standing</h3><div class="chips">${S.factions.map((f) => `<span class="chip">${esc(f.name)} <small class="muted">${esc(f.label)}</small></span>`).join('')}</div></div>` : ''}
    ${shops.map((s) => `<div class="card"><h3>${esc(s.name)} ${s.npc ? `<span class="note">${esc(s.npc)}</span>` : ''}${s.standing ? ` <span class="note">${esc(s.standing)}</span>` : ''}</h3>
      <div class="list">${s.items.map((i) => `<div class="inv"><span><b>${esc(i.name)}</b> <small class="muted">${gp(i.price)} gp${i.stock === null ? '' : ` · ${i.stock} left`}${i.note ? ` · ${esc(i.note)}` : ''}</small></span>
        <span class="row"><input type="number" min="1" max="${i.stock ?? 999}" value="1" data-qty aria-label="Quantity of ${esc(i.name)}" style="width:56px"><button class="btn small" data-buy="${esc(s.id)}|${esc(i.id)}" ${i.stock === 0 ? 'disabled' : ''}>Buy</button></span></div>`).join('') || '<p class="note">Nothing for sale.</p>'}</div>
    </div>`).join('') || '<div class="card"><p class="note">No shop is open right now. Your DM opens shops when you reach a merchant.</p></div>'}
    ${note ? `<p class="note" role="status">${esc(note)}</p>` : ''}`;
}
onState(render);
onTab((id) => { if (id === 'shop') note = ''; render(); });

root().addEventListener('click', (e) => {
  const b = e.target.closest('[data-buy]');
  if (!b || b.disabled) return;
  const [shopId, itemId] = b.dataset.buy.split('|');
  const qty = Math.max(1, Math.floor(Number(b.closest('.inv').querySelector('[data-qty]').value) || 1));
  socket.emit('player:buy', { shopId, itemId, qty }, (r) => {
    note = r?.error ? r.error : `Bought. You have ${gp(r.gold)} gp left.`;
    navigator.vibrate?.(r?.error ? [40, 40, 40] : 20);
    render();
  });
});
