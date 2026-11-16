// Phone shop pop-up (Mike, Nov 14 and 15): no Shops tab. Players shop only when the DM pops a shop up. The
// phone shows the shop's name and its wares as buttons (name and price), plus a Sell list. Press and hold a
// ware to open its description card, and buy from there (Mike, Nov 16). The merchant banner is TV only.
// "Leave shop" shows "Waiting for the others" with a "Shop again" button; when everyone has left, the
// server closes the pop-up on the TV and every phone.
import { socket, onState, state } from '../client.js';
import { me } from './identity.js';
import { holdButton } from '../dm/hold.js';

const { esc } = Stage;
let note = '';
let view = 'buy';
let detail = null; // the ware whose description card is open
let drawn = ''; // last HTML drawn, so state updates that change nothing leave a hold in progress alone
const HOLD_MS = 450;

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
  if (!c || !shop) { el.hidden = true; return; }
  // Don't redraw under the player's thumb while they type a quantity.
  const a = document.activeElement;
  if (!el.hidden && a && el.contains(a) && a.tagName === 'INPUT') return;
  const head = `<h3 class="shop-title">🛒 ${esc(shop.name)}</h3>`; // the merchant banner shows on the TV only
  if (pop.mine) {
    const html = `<div class="camp-box card shop-wait">${head}
      <p class="shop-wait-msg">Waiting for the others.</p>
      <p class="note">${pop.shopping ? `${pop.shopping} still shopping` : ''}</p>
      <button class="bigbtn" data-done="0">Shop again</button>
    </div>`;
    draw(el, html);
    return;
  }
  const wares = shop.items.slice(0, 60);
  const coin = `<span class="gold-coin small" aria-label="${gp(c.gold)} gold"><span aria-hidden="true">🪙</span><b>${gp(c.gold)}</b></span>`;
  const sel = detail && wares.find((i) => i.id === detail);
  if (sel) { // description card: hold a ware to get here; buy from it
    draw(el, `<div class="camp-box card shop-box-p shop-detail">
      <div class="row"><h3 class="grow">${esc(sel.name)}</h3>${coin}</div>
      <p class="shop-desc">${sel.note ? esc(sel.note) : '<span class="note">No description.</span>'}</p>
      <p class="note">${gp(sel.price)} gp each${sel.stock === null ? '' : sel.stock ? ` · ${sel.stock} left` : ' · sold out'}</p>
      ${shop.blocked ? `<p class="note warn">${esc(shop.blocked)}</p>` : ''}
      <div class="row inv"><input type="number" min="1" max="${sel.stock ?? 999}" value="1" data-qty aria-label="Quantity" style="width:64px"><button class="bigbtn primary grow" data-buy="${esc(sel.id)}" ${shop.blocked || sel.stock === 0 ? 'disabled' : ''}>Buy</button></div>
      ${note ? `<p class="note" role="status">${esc(note)}</p>` : ''}
      <button class="btn" data-back>← Back to the shop</button>
    </div>`, 'pop');
    return;
  }
  const buy = `<div class="shop-pgrid">${wares.map((i) => `<button class="shop-ware hold-btn ${i.stock === 0 ? 'out' : ''}" data-ware="${esc(i.id)}" aria-label="${esc(i.name)}, ${gp(i.price)} gp. Hold for details."><i class="hold-fill"></i><span hidden></span><span class="ware-txt"><b>${esc(i.name)}</b><em>${gp(i.price)} gp</em></span></button>`).join('') || '<p class="note">Nothing for sale.</p>'}</div>
    <p class="note">Press and hold an item to see it and buy.</p>`;
  const sell = (pop.sell || []).map((i) => `<div class="inv"><span><b>${esc(i.name)}</b> <small class="muted">you have ${i.qty} · ${gp(i.offer)} gp each</small></span>
    <span class="row"><input type="number" min="1" max="${i.qty}" value="1" data-qty aria-label="Quantity of ${esc(i.name)} to sell" style="width:56px"><button class="btn small" data-sell="${esc(i.id)}" ${shop.blocked ? 'disabled' : ''}>Sell</button></span></div>`).join('')
    || '<p class="note">Nothing in your pack that this merchant buys. Merchants buy what they sell, at half price.</p>';
  draw(el, `<div class="camp-box card shop-box-p">
    <div class="row">${head}<span class="grow"></span>${coin}</div>
    ${shop.standing ? `<div class="chips"><span class="chip"><b>${esc(shop.standing)}</b><small>standing</small></span></div>` : ''}
    ${shop.blocked ? `<p class="note warn">${esc(shop.blocked)}</p>` : ''}
    <div class="row seg-pick" role="tablist"><button class="btn small ${view === 'buy' ? 'on' : ''}" data-view="buy" role="tab" aria-selected="${view === 'buy'}">Buy</button><button class="btn small ${view === 'sell' ? 'on' : ''}" data-view="sell" role="tab" aria-selected="${view === 'sell'}">Sell</button></div>
    <div class="list shop-list">${view === 'buy' ? buy : sell}</div>
    ${note ? `<p class="note" role="status">${esc(note)}</p>` : ''}
    <button class="bigbtn" data-done="1">Leave shop</button>
  </div>`);
}

// Draw only when the HTML changed. A newly shown sheet (or the description card) unfolds in.
function draw(el, html, anim) {
  if (html === drawn && !el.hidden) return;
  const was = el.hidden;
  drawn = html;
  el.innerHTML = html;
  el.querySelectorAll('[data-ware]').forEach((b) => {
    if (b.classList.contains('out')) return;
    // holdButton writes its status into the first <span>, a hidden one here, so the name and price stay.
    holdButton(b, { ms: HOLD_MS, idle: '', holding: '', ready: '', onFire: () => { detail = b.dataset.ware; note = ''; navigator.vibrate?.(15); render(); } });
  });
  if (was) el.hidden = false;
  if (was || anim) window.Anim?.play(el.firstElementChild, 'unfold', null);
}

function onClick(e) {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const pop = state()?.shopPop;
  if (!pop) return;
  if (b.dataset.back != null) { detail = null; note = ''; render(); return; }
  if (b.dataset.view) { view = b.dataset.view; note = ''; render(); return; }
  if (b.dataset.done) { socket.emit('player:shop:done', { done: b.dataset.done === '1' }); navigator.vibrate?.(20); return; }
  const qty = Math.max(1, Math.floor(Number(b.closest('.inv')?.querySelector('[data-qty]')?.value) || 1));
  if (b.dataset.buy) navigator.vibrate?.(20);
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
  if (S.shopPop && S.shopPop.n !== lastN) { lastN = S.shopPop.n; note = ''; view = 'buy'; detail = null; }
  render();
});
