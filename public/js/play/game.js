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

function render() {
  const S = state();
  if (!S || current() !== 'game') return;
  const c = S.players.find((p) => p.id === id.charId);
  if (!c) return;
  if (lastMode && lastMode !== S.mode) navigator.vibrate?.(80);
  lastMode = S.mode;
  // Hero card (public/chronicle.js): portrait and bars only. Stats live on the Sheet tab, the bio in the profile.
  // Phone hero (Nov 16): 🏅 is Inspiration, HP reads as a number or a word (⚙ setting), dice and slots are gems.
  $('#me').innerHTML = Chronicle.hero(c, S, { view: 'none', editAttr: 'data-prof', compact: true, seg: false, insp: true, hp: Settings.get().hp, gems: true });
  Anim.hydrate($('#me'));
  // The day / time / place / quest / coins bar is gone from every screen (Mike, Nov 15).
  $('#me [data-prof]').onclick = openProfile;
  $('#awakeBtn').setAttribute('aria-pressed', String(Fx.awake()));
  Fx.watchHp(c.hp, c.maxHp);
  $('#say').placeholder = S.mode === 'social' ? 'Say something in character…' : 'What do you do?';
  $('#sayForm').hidden = S.mode === 'combat' || tab() !== 'play';
  $('#tabPlay').classList.toggle('combat-quiet', S.mode === 'combat'); // combat: no spectator notes, no free-text box
  $('#main').innerHTML = (VIEWS[S.mode] || exploreView)(S, c);
  Anim.hydrate($('#main'));
  const sug = (S.suggestions || []).slice(-5).reverse();
  $('#suggest').innerHTML = sug.length && S.mode !== 'combat' ? `<details class="card suggest" open><summary>👀 Spectator suggestions (${sug.length})</summary>${sug.map((x) => `<p><b>${esc(x.name)}:</b> ${esc(x.text)}</p>`).join('')}</details>` : '';
}
onState(render);
onShow((v) => { if (v === 'game') render(); });
onTab(render);
window.addEventListener('settings:change', render);
$('#profBtn').onclick = openProfile;
$('#fsBtn').onclick = () => Fx.fullscreen();
$('#awakeBtn').onclick = () => Fx.toggleAwake();

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
