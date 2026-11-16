// The in-game phone screen: header, the view for the current mode, recent log, actions.
import { socket, $, onState, state } from '../client.js';
import { me as id } from './identity.js';
import { onShow, current } from './nav.js';
import { openProfile } from './profile.js';
import { tab, onTab } from './tabs.js';
import exploreView from './views/explore.js';
import socialView from './views/social.js';
import combatView from './views/combat.js';
import * as Fx from './fx.js';

const { esc } = Stage;
const VIEWS = { exploration: exploreView, social: socialView, combat: combatView };
let lastMode = null;
let lastPop = null; // what the combat pop-up last showed, so it pops in again only when that changes

// Waiting, my turn, someone else's turn, or down: each change pops the card in again.
function popKey(S, c) {
  const cb = S.combat;
  if (!cb.active) return 'wait';
  if (c.hp === 0) return 'down';
  const t = cb.order[cb.turn]?.id;
  return t === c.id ? `mine:${cb.round}` : `turn:${t}`;
}

function render() {
  const S = state();
  if (!S || current() !== 'game') return;
  const c = S.players.find((p) => p.id === id.charId);
  if (!c) return;
  if (lastMode && lastMode !== S.mode) navigator.vibrate?.(80);
  lastMode = S.mode;
  // Hero card (public/chronicle.js): portrait and bars only. Stats live on the Sheet tab, the bio in the profile.
  $('#me').innerHTML = `${Chronicle.hero(c, S, { view: 'none', editAttr: 'data-prof', compact: true, seg: false })}<div class="me-tools"><button class="btn small" id="profBtn">✎ Profile</button><button class="btn small" id="fsBtn" title="Full screen" aria-label="Full screen">⛶</button><button class="btn small" id="awakeBtn" title="Keep the screen on" aria-pressed="${Fx.awake()}">☀</button></div>`;
  Anim.hydrate($('#me'));
  // The day / time / place / quest / coins bar is gone from every screen (Mike, Nov 15).
  $('#profBtn').onclick = openProfile;
  $('#me [data-prof]').onclick = openProfile;
  $('#fsBtn').onclick = () => Fx.fullscreen();
  $('#awakeBtn').onclick = () => Fx.toggleAwake();
  Fx.watchHp(c.hp, c.maxHp);
  $('#say').placeholder = S.mode === 'social' ? 'Say something in character…' : 'What do you do?';
  $('#sayForm').hidden = S.mode === 'combat' || tab() !== 'play';
  $('#tabPlay').classList.toggle('combat-quiet', S.mode === 'combat'); // combat: no spectator notes, no free-text box
  // Combat: no 3D map on phones (the TV shows it). The combat card pops up at the top of the Play tab instead.
  const pop = $('#combatPop');
  if (S.mode === 'combat') {
    pop.innerHTML = combatView(S, c);
    pop.hidden = false;
    const k = popKey(S, c);
    if (k !== lastPop) { lastPop = k; pop.classList.remove('pop-in'); void pop.offsetWidth; pop.classList.add('pop-in'); }
    Anim.hydrate(pop);
    $('#main').innerHTML = '';
  } else {
    pop.hidden = true; pop.innerHTML = ''; lastPop = null;
    $('#main').innerHTML = (VIEWS[S.mode] || exploreView)(S, c);
    Anim.hydrate($('#main'));
  }
  const sug = (S.suggestions || []).slice(-5).reverse();
  $('#suggest').innerHTML = sug.length && S.mode !== 'combat' ? `<details class="card suggest" open><summary>👀 Spectator suggestions (${sug.length})</summary>${sug.map((x) => `<p><b>${esc(x.name)}:</b> ${esc(x.text)}</p>`).join('')}</details>` : '';
}
onState(render);
onShow((v) => { if (v === 'game') render(); });
onTab(render);

$('#gameView').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.skill) socket.emit('player:check', { skill: d.skill });
  else if (d.do) socket.emit('player:action', { text: d.do });
  else if (d.choice) socket.emit('player:choice', { index: Number(d.choice) });
  else if (d.attack) socket.emit('player:combat', { act: 'attack', target: d.attack });
  else if (d.act) socket.emit('player:combat', { act: d.act });
  else return;
  navigator.vibrate?.(30);
});
$('#sayForm').onsubmit = (e) => {
  e.preventDefault();
  const text = $('#say').value.trim();
  if (text) socket.emit('player:action', { text });
  $('#say').value = '';
};
