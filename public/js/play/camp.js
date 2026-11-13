// Phone camp: while the DM has camp open, the Downtime tab appears and a pop-up asks for a short or
// long rest vote and what the character does while camping. The pop-up comes back for each new camp.
import { socket, $, onState, state } from '../client.js';
import { me } from './identity.js';
import { setTabOn } from './tabs.js';

const { esc } = Stage;
let dismissedFor = 0; // camp number the player closed the pop-up for
let draft = null;
let sent = null; // camp number whose vote was sent from this phone
let diceDraft = 0; // hit dice this phone wants to spend on a short rest
let diceFor = null; // camp number diceDraft belongs to

function sheet() {
  let el = document.getElementById('campSheet');
  if (!el) {
    el = document.createElement('div');
    el.id = 'campSheet';
    el.className = 'camp-sheet';
    el.hidden = true;
    document.body.appendChild(el);
    el.addEventListener('click', onClick);
    el.addEventListener('input', (e) => {
      if (e.target.id === 'campText') draft = e.target.value;
      if (e.target.id === 'campDice') diceDraft = Math.max(0, Math.min(20, Math.floor(Number(e.target.value)) || 0));
    });
  }
  return el;
}

function onClick(e) {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.close != null) { dismissedFor = state()?.camp?.n || 0; sheet().hidden = true; return; }
  if (b.dataset.vote) {
    const text = sheet().querySelector('#campText')?.value ?? '';
    const dice = b.dataset.vote === 'short' ? diceDraft : 0;
    socket.emit('player:camp', { vote: b.dataset.vote, text, dice }, (r) => {
      navigator.vibrate?.(20);
      if (r?.missing) {
        let n = sheet().querySelector('.camp-need');
        if (!n) { n = document.createElement('p'); n.className = 'note camp-need'; sheet().appendChild(n); }
        n.textContent = `Set up before you rest: you need ${r.missing.join(' and ')}.`;
        return;
      }
      if (r?.ok) { sent = state()?.camp?.n || 0; draft = text; }
      sheet().hidden = true;
    });
  }
}

onState((S) => {
  const c = S?.camp;
  const open = !!c?.open;
  setTabOn('downtime', open);
  const mine = me.charId && S.players?.some((p) => p.id === me.charId);
  if (!open || !mine) { sheet().hidden = true; return; }
  if (dismissedFor === c.n) return;
  const voted = c.mine?.vote;
  if (voted && sent === c.n) { sheet().hidden = true; return; }
  const el = sheet();
  const cur = voted || null;
  draft ??= c.mine?.text || '';
  if (diceFor !== c.n) { diceFor = c.n; diceDraft = c.mine?.dice || 0; } // set once per camp, so typing survives re-renders
  el.innerHTML = `<div class="camp-box card" role="dialog" aria-label="Camp">
    <div class="row"><h3 class="grow">⛺ Camp</h3><button class="btn small" data-close aria-label="Close">✕</button></div>
    ${c.image ? (c.image.video ? `<video src="${esc(c.image.url)}" autoplay muted loop playsinline class="camp-img"></video>` : `<img src="${esc(c.image.url)}" alt="" class="camp-img">`) : ''}
    <p class="note">What does your character do while the party rests?</p>
    <textarea id="campText" rows="3" maxlength="500" placeholder="Keep watch, sharpen blades, write to home…">${esc(draft)}</textarea>
    <label class="note">Hit dice to spend on a short rest (each heals a roll of your die plus CON) <input id="campDice" type="number" min="0" max="20" value="${diceDraft}"></label>
    <p class="note">Vote on the rest. You can change your vote until the DM ends camp.</p>
    <div class="row">
      <button class="bigbtn ${cur === 'short' ? 'primary' : ''}" data-vote="short">☕ Short rest</button>
      <button class="bigbtn ${cur === 'long' ? 'primary' : ''}" data-vote="long">🛏 Long rest</button>
    </div>
  </div>`;
  el.hidden = false;
});
