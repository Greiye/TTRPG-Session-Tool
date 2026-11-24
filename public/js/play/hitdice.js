// Hit dice pop-up (Mike, Nov 21): after a short rest, when the DM offers, or from the sheet's "Spend hit dice".
// Pick how many dice with − and +, then Roll: each heals a roll of the die plus CON (src/rests.js spendHitDice).
// "Not now" closes it. The DM can still change HP afterwards.
import { socket, onState, state } from '../client.js';
import { me } from './identity.js';
import { sheetPop } from '../dialog.js';

let pop = null;
let el = null;
let seen = null; // hdOffer.n this phone already showed
let count = 1;

const left = (c) => Math.max(0, (c.level || 1) - (c.hitDice?.used || 0));

function close() {
  if (!el) return;
  pop.close();
  pop = null; el = null;
}

function draw(c, why) {
  const { esc } = Stage;
  const n = left(c);
  count = Math.max(1, Math.min(count, n));
  el.querySelector('.pop-sheet').innerHTML = `<h3>🎲 ${esc(why)}</h3>
    <p class="hd-hurt">${Stage.numbersHidden(state()) ? esc(Stage.hpWord(c.hp, c.maxHp)) : `HP ${c.hp} / ${c.maxHp}`}</p>
    <p class="note">You have ${n} hit di${n === 1 ? 'e' : 'ce'} (d${c.hitDice.die}). Each heals a roll plus your CON.</p>
    <div class="hd-count"><button class="btn" data-hd="-1" aria-label="One fewer" ${count <= 1 ? 'disabled' : ''}>−</button><b aria-live="polite">${count}</b><button class="btn" data-hd="1" aria-label="One more" ${count >= n ? 'disabled' : ''}>+</button></div>
    <div class="hd-acts"><button class="btn go" data-hd-roll ${n ? '' : 'disabled'}>Roll ${count} di${count === 1 ? 'e' : 'ce'}</button><button class="btn" data-hd-no>Not now</button></div>
    <p class="note hd-res" role="status"></p>`;
}

export function openHitDice(c, why = 'Spend hit dice') {
  if (!c?.hitDice?.die) return;
  if (!el) {
    pop = sheetPop({ cls: 'hd-pop', sheetCls: 'hd-sheet', label: 'Hit dice', onClick, dismiss: () => el?.querySelector('[data-hd-no]')?.click() });
    el = pop.el;
  }
  el.dataset.why = why;
  count = 1;
  draw(c, why);
}

const mine = () => state()?.players.find((p) => p.id === me.charId);
function onClick(e) {
  const b = e.target.closest('button');
  const c = mine();
  if (!b || !c || !el) return;
  if (b.dataset.hd) { count += Number(b.dataset.hd); draw(c, el.dataset.why); navigator.vibrate?.(10); return; }
  if (b.hasAttribute('data-hd-no')) { socket.emit('player:hitdice', { n: 0 }); close(); return; }
  if (b.hasAttribute('data-hd-roll')) {
    b.disabled = true;
    navigator.vibrate?.([30, 40, 60]);
    socket.emit('player:hitdice', { n: count }, (r) => {
      const res = el?.querySelector('.hd-res');
      if (res) { res.textContent = r?.healed ? `You heal ${Stage.numbersHidden(state()) ? 'some' : r.healed} HP.` : 'No healing this time.'; res.classList.add('pop-in'); }
      setTimeout(close, 1400);
    });
  }
}

// A new offer from the server (short rest or the DM) opens the pop-up once.
onState((S) => {
  const c = S?.players.find((p) => p.id === me.charId);
  const offer = c?.hdOffer;
  if (seen === null) { seen = offer?.n ?? 0; if (offer) openHitDice(c, offer.why); return; }
  if (offer && offer.n !== seen) { seen = offer.n; openHitDice(c, offer.why); }
});
