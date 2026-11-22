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
import { openStrike, wantGesture } from './strike.js';
import { isoStage } from '../iso3d.js';

const { esc } = Stage;
const VIEWS = { exploration: exploreView, social: socialView, combat: combatView };
let lastMode = null;
let lastPop = null; // what the combat pop-up last showed, so it pops in again only when that changes
// Phone combat map (Mike, Nov 21): the battle map from above, with a D-pad (and gamepad) to move your character.
const mapHost = document.createElement('div');
mapHost.className = 'phone-map';
mapHost.hidden = true;
$('#combatPop')?.before(mapHost);
const mapOn = (S) => S?.mode === 'combat' && !!S.map && !!S.combat?.active && S.viewer?.role === 'player';
const phoneIso = isoStage(mapHost, { role: 'player', socket, charId: () => id.charId, slotSel: null, pad: true, when: mapOn });

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
  // Phone hero (Nov 16): 🏅 is Inspiration, HP reads as a number or a word (⚙ setting), dice and slots are gems.
  $('#me').innerHTML = Chronicle.hero(c, S, { view: 'none', editAttr: 'data-prof', compact: true, seg: false, insp: true, hp: Stage.numbersHidden(S) ? 'desc' : Settings.get().hp, gems: true }); // numbers are the DM's unless the table shares them (Mike, Nov 17)
  Anim.hydrate($('#me'));
  // The day / time / place / quest / coins bar is gone from every screen (Mike, Nov 15).
  $('#me [data-prof]').onclick = openProfile;
  $('#awakeBtn').setAttribute('aria-pressed', String(Fx.awake()));
  Fx.watchHp(c.hp, c.maxHp);
  $('#say').placeholder = S.mode === 'social' ? 'Say something in character…' : 'What do you do?';
  $('#sayForm').hidden = S.mode === 'combat' || tab() !== 'play';
  $('#tabPlay').classList.toggle('combat-quiet', S.mode === 'combat'); // combat: no spectator notes, no free-text box
  // Combat: the overhead battle map with a D-pad on top, the combat card under it.
  mapHost.hidden = !(mapOn(S) && tab() === 'play');
  phoneIso.update(mapHost.hidden ? { ...S, mode: 'off' } : S);
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
  else if (d.attack) {
    // Strike gestures (Mike, Nov 17): the enemy's silhouette pops up to slash or pierce, unless switched off.
    const foe = state()?.combat.enemies.find((e) => e.id === d.attack);
    if (foe && wantGesture(state())) openStrike(foe, state().players.find((p) => p.id === id.charId));
    else socket.emit('player:combat', { act: 'attack', target: d.attack, style: 'tap' });
  }
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
