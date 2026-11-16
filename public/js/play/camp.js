// Phone camp: while the DM has camp open, the Downtime tab appears and a pop-up asks for a short or
// long rest vote and what the character does while camping. The pop-up comes back for each new camp.
// Votes are press-and-hold (1 s) so a stray tap does not vote. The class section shows what this
// character's class gets back on each rest, with camp ideas for the class (src/rests.js campInfo).
import { socket, onState, state } from '../client.js';
import { me } from './identity.js';
import { setTabOn } from './tabs.js';
import { holdButton } from '../dm/hold.js';

const { esc } = Stage;
const HOLD_MS = 1000;
let dismissedFor = 0; // camp number the player closed the pop-up for
let draft = null;
let sent = null; // camp number whose vote was sent from this phone
let diceDraft = 0; // hit dice this phone wants to spend on a short rest
let diceFor = null; // camp number diceDraft belongs to
let drawn = null; // what the sheet shows now, so state updates do not redraw it mid-hold or mid-typing

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

function close() { sheet().hidden = true; drawn = null; }

function sendVote(kind) {
  const text = sheet().querySelector('#campText')?.value ?? '';
  const dice = kind === 'short' ? diceDraft : 0;
  socket.emit('player:camp', { vote: kind, text, dice }, (r) => {
    navigator.vibrate?.(40);
    if (r?.missing) {
      let n = sheet().querySelector('.camp-need');
      if (!n) { n = document.createElement('p'); n.className = 'note camp-need'; sheet().querySelector('.camp-box')?.appendChild(n); }
      n.textContent = `Set up before you rest: you need ${r.missing.join(' and ')}.`;
      return;
    }
    if (r?.ok) { sent = state()?.camp?.n || 0; draft = text; }
    close();
  });
}

function onClick(e) {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.close != null) { dismissedFor = state()?.camp?.n || 0; close(); return; }
  if (b.dataset.idea) { // a class camp idea fills the downtime box
    const t = sheet().querySelector('#campText');
    if (t) { t.value = t.value.trim() ? `${t.value.trim()} ${b.dataset.idea}.` : `${b.dataset.idea}.`; draft = t.value; t.focus(); }
  }
}

const classSection = (info) => {
  if (!info) return '';
  const li = (xs) => xs.map((x) => `<li>${esc(x)}</li>`).join('');
  const feats = info.features.length ? `<div class="camp-feats">${info.features.map((f) => `<span class="chip" title="Refills on a ${f.reset} rest">${esc(f.name)} ${f.left}/${f.max}</span>`).join('')}</div>` : '';
  return `<section class="camp-class" aria-label="Your class at camp">
    <h4>${esc(info.cls || 'Adventurer')} <span class="note">level ${info.level}</span></h4>
    ${feats}
    <div class="camp-gain"><div><b>☕ Short</b><ul>${li(info.short)}</ul></div><div><b>🛏 Long</b><ul>${li(info.long)}</ul></div></div>
    <div class="camp-ideas">${info.ideas.map((x) => `<button class="chip" data-idea="${esc(x)}">${esc(x)}</button>`).join('')}</div>
  </section>`;
};

onState((S) => {
  const c = S?.camp;
  const open = !!c?.open;
  setTabOn('downtime', open);
  const mine = me.charId && S.players?.some((p) => p.id === me.charId);
  if (!open || !mine) { close(); return; }
  if (dismissedFor === c.n) return;
  const voted = c.mine?.vote;
  if (voted && sent === c.n) { close(); return; }
  const cur = voted || null;
  draft ??= c.mine?.text || '';
  if (diceFor !== c.n) { diceFor = c.n; diceDraft = c.mine?.dice || 0; } // set once per camp, so typing survives re-renders
  const key = JSON.stringify([c.n, cur, c.image, c.mine?.info, c.mine?.missing]);
  if (key === drawn && !sheet().hidden) return; // nothing new: keep the hold and the text box as they are
  drawn = key;
  const el = sheet();
  const need = c.mine?.missing?.length ? `<p class="note camp-need">Set up before you rest: you need ${esc(c.mine.missing.join(' and '))}.</p>` : '';
  el.innerHTML = `<div class="camp-box card" role="dialog" aria-label="Camp">
    <div class="row"><h3 class="grow">⛺ Camp</h3><button class="btn small" data-close aria-label="Close">✕</button></div>
    ${c.image ? (c.image.video ? `<video src="${esc(c.image.url)}" autoplay muted loop playsinline class="camp-img"></video>` : `<img src="${esc(c.image.url)}" alt="" class="camp-img">`) : ''}
    ${classSection(c.mine?.info)}
    <p class="note">What does your character do while the party rests?</p>
    <textarea id="campText" rows="3" maxlength="500" placeholder="Keep watch, sharpen blades, write to home…">${esc(draft)}</textarea>
    <label class="note">Hit dice to spend on a short rest (each heals a roll of your die plus CON) <input id="campDice" type="number" min="0" max="20" value="${diceDraft}"></label>
    <p class="note">Hold a rest for 1 second to vote. You can change your vote until the DM ends camp.</p>
    <div class="row">
      <button class="bigbtn hold-btn ${cur === 'short' ? 'primary' : ''}" data-hold="short"><i class="hold-fill"></i><span>☕ Short rest</span></button>
      <button class="bigbtn hold-btn ${cur === 'long' ? 'primary' : ''}" data-hold="long"><i class="hold-fill"></i><span>🛏 Long rest</span></button>
    </div>
    ${need}
  </div>`;
  el.querySelectorAll('[data-hold]').forEach((b) => {
    const idle = b.querySelector('span').textContent;
    holdButton(b, { ms: HOLD_MS, idle, holding: 'Hold…', onFire: () => sendVote(b.dataset.hold), onPhase: (p) => { if (p === 'start') navigator.vibrate?.(10); } });
  });
  el.hidden = false;
});
