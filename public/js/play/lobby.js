// "You have joined the game!" (Mike, Nov 18): while the TV shows the landing page (src/lobby.js), a phone that
// takes a seat gets this pop-up with a Continue button.
import { $, call, onState, state } from '../client.js';
import { me } from './identity.js';

let shownFor = null; // the character this phone already greeted

export function joinedPop() {
  if (document.querySelector('.lobby-pop')) return;
  const el = document.createElement('div');
  el.className = 'pop-scrim lobby-pop';
  el.innerHTML = `<div class="pop-sheet lobby-sheet" role="dialog" aria-modal="true" aria-label="Joined">
    <h3>You have joined the game!</h3>
    <p class="note">Your character is on the TV. The game starts when someone presses Start game.</p>
    <button class="bigbtn" data-lobby-ok>Continue</button></div>`;
  el.addEventListener('click', (e) => {
    if (!e.target.closest('[data-lobby-ok]')) return;
    el.classList.add('closing');
    setTimeout(() => el.remove(), 220);
  });
  document.body.appendChild(el);
  window.Anim?.play?.(el.firstElementChild, 'pop', null);
  navigator.vibrate?.([30, 40, 30]);
}

// Shown once per character while the landing page is up (a reload keeps quiet).
onState((S) => {
  const c = S.players?.find((p) => p.id === me.charId);
  if (!S.lobby || !c || shownFor === c.id) return;
  shownFor = c.id;
  let seen = '';
  try { seen = sessionStorage.getItem('lobbyJoined') || ''; } catch { /* private mode */ }
  if (seen === `${S.room}:${c.id}`) return;
  try { sessionStorage.setItem('lobbyJoined', `${S.room}:${c.id}`); } catch { /* private mode */ }
  joinedPop();
});
export const inLobby = () => !!state()?.lobby;

// Start game (Mike, Nov 18): the TV's Start game is display only; the first player to join gets the button.
const bar = document.createElement('div');
bar.className = 'lobby-bar';
bar.hidden = true;
$('#dicePool')?.before(bar);
let barKey = '';
onState((S) => {
  const c = S.players?.find((p) => p.id === me.charId);
  bar.hidden = !S.lobby || !c;
  if (bar.hidden) { barKey = ''; return; }
  const mine = S.lobbyStarter === c.id;
  const who = S.players.find((p) => p.id === S.lobbyStarter)?.name || 'the first player';
  const k = `${mine}:${who}`;
  if (k === barKey) return;
  barKey = k;
  bar.innerHTML = mine
    ? '<button class="bigbtn lobby-start" data-lobby-start>▶ Start game</button><p class="note">Press it when everyone has joined.</p>'
    : `<p class="note lobby-wait">Waiting for ${Stage.esc(who)} to start the game…</p>`;
  window.Anim?.play?.(bar.firstElementChild, 'pop', null);
});
bar.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-lobby-start]');
  if (!b) return;
  b.disabled = true;
  const r = await call('lobby:start', {});
  if (r?.error) { b.disabled = false; bar.querySelector('.note').textContent = r.error; }
});
