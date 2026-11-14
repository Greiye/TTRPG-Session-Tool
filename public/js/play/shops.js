// Phone shop pop-up (Mike, Nov 14): no Shops tab. Players shop only when the DM pops a shop up; the phone
// then gets a buy list and a sell list, and a Done button so the TV can count who is still shopping.
// Closing the sheet without Done hides it for this pop-up; the DM's next pop-up brings it back.
import { socket, onState, state } from '../client.js';
import { me } from './identity.js';

const { esc } = Stage;
let note = '';
let view = 'buy';
let dismissedFor = 0; // pop-up number this phone closed

// 15 -> "15", 2.5 -> "2.5", 0.02 -> "0.02"
const gp = (n) => Number(n || 0).toFixed(2).replace(/\.?0+$/, '');

function sheet() {
  let el = document.getElementById('shopSheet');
  if (!el) {
    el = document.createElement('div');
    el.id = 'shopSheet';
    el.className = 'camp-sheet shop-sheet';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Shop');
    document.body.appendChild(el);
    el.addEventListener('click', onClick);
  }
  return el;
}

function render() {
  const S = state();
  const el = sheet();
  const pop = S?.shopPop;
  const c = S?.players.find((p) => p.id === me.charId);
  const shop = pop && (S.shops || []).find((x) => x.id === pop.shopId);
  if (!c || !shop || dismissedFor === pop.n) { el.hidden = true; return; }
  // Don't redraw under the player's thumb while they type a quantity.
  const a = document.activeElement;
  if (!el.hidden && a && el.contains(a) && a.tagName === 'INPUT') return;
  const buy = shop.items.map((i) => `<div class="inv"><span><b>${esc(i.name)}</b> <small class="muted">${gp(i.price)} gp${i.stock === null ? '' : ` · ${i.stock} left`}${i.note ? ` · ${esc(i.note)}` : ''}</small></span>
    <span class="row"><input type="number" min="1" max="${i.stock ?? 999}" value="1" data-qty aria-label="Quantity of ${esc(i.name)}" style="width:56px"><button class="btn small" data-buy="${esc(i.id)}" ${i.stock === 0 || shop.blocked ? 'disabled' : ''}>Buy</button></span></div>`).join('') || '<p class="note">Nothing for sale.</p>';
  const sell = (pop.sell || []).map((i) => `<div class="inv"><span><b>${esc(i.name)}</b> <small class="muted">you have ${i.qty} · ${gp(i.offer)} gp each</small></span>
    <span class="row"><input type="number" min="1" max="${i.qty}" value="1" data-qty aria-label="Quantity of ${esc(i.name)} to sell" style="width:56px"><button class="btn small" data-sell="${esc(i.id)}" ${shop.blocked ? 'disabled' : ''}>Sell</button></span></div>`).join('')
    || '<p class="note">Nothing in your pack that this merchant buys. Merchants buy what they sell, at half price.</p>';
  el.innerHTML = `<div class="camp-box card">
    <div class="row"><h3 class="grow">🛒 ${esc(shop.name)}${shop.npc ? ` <span class="note">${esc(shop.npc)}</span>` : ''}</h3><button class="btn small" data-close aria-label="Close">✕</button></div>
    <div class="chips"><span class="chip"><b>${gp(c.gold)} gp</b><small>your gold</small></span>${shop.standing ? `<span class="chip"><b>${esc(shop.standing)}</b><small>standing</small></span>` : ''}</div>
    ${shop.blocked ? `<p class="note warn">${esc(shop.blocked)}</p>` : ''}
    <div class="row seg-pick" role="tablist"><button class="btn small ${view === 'buy' ? 'on' : ''}" data-view="buy" role="tab" aria-selected="${view === 'buy'}">Buy</button><button class="btn small ${view === 'sell' ? 'on' : ''}" data-view="sell" role="tab" aria-selected="${view === 'sell'}">Sell</button></div>
    <div class="list shop-list">${view === 'buy' ? buy : sell}</div>
    ${note ? `<p class="note" role="status">${esc(note)}</p>` : ''}
    <button class="bigbtn" data-done="${pop.mine ? 0 : 1}">${pop.mine ? 'Keep shopping' : '✓ Done shopping'}</button>
  </div>`;
  if (el.hidden) { el.hidden = false; window.Anim?.play(el.firstElementChild, 'unfold', null); }
}

function onClick(e) {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const pop = state()?.shopPop;
  if (!pop) return;
  if (b.dataset.close != null) { dismissedFor = pop.n; render(); return; }
  if (b.dataset.view) { view = b.dataset.view; note = ''; render(); return; }
  if (b.dataset.done) { socket.emit('player:shop:done', { done: b.dataset.done === '1' }); navigator.vibrate?.(20); return; }
  const qty = Math.max(1, Math.floor(Number(b.closest('.inv')?.querySelector('[data-qty]')?.value) || 1));
  const done = (r, verb) => {
    note = r?.error ? r.error : `${verb}. You have ${gp(r.gold)} gp.`;
    navigator.vibrate?.(r?.error ? [40, 40, 40] : 20);
    render();
  };
  if (b.dataset.buy) socket.emit('player:buy', { shopId: pop.shopId, itemId: b.dataset.buy, qty }, (r) => done(r, 'Bought'));
  if (b.dataset.sell) socket.emit('player:sell', { shopId: pop.shopId, invId: b.dataset.sell, qty }, (r) => done(r, 'Sold'));
}

let lastN = 0;
onState((S) => {
  if (S.shopPop && S.shopPop.n !== lastN) { lastN = S.shopPop.n; note = ''; view = 'buy'; }
  render();
});
