// The in-game phone screen: header, the view for the current mode, recent log, actions.
import { socket, $, onState, state } from '../client.js';
import { me as id } from './identity.js';
import { onShow, current } from './nav.js';
import { openProfile } from './profile.js';
import exploreView from './views/explore.js';
import socialView from './views/social.js';
import combatView from './views/combat.js';

const { esc, hpBar, logFeed } = Stage;
const VIEWS = { exploration: exploreView, social: socialView, combat: combatView };
let lastMode = null;

function render() {
  const S = state();
  if (!S || current() !== 'game') return;
  const c = S.players.find((p) => p.id === id.charId);
  if (!c) return;
  if (lastMode && lastMode !== S.mode) navigator.vibrate?.(80);
  lastMode = S.mode;
  $('#me').innerHTML = `${Stage.avatar(c, 'av-me')}<div class="me-info"><b>${esc(c.name)}</b><small class="muted">${esc([c.race, c.cls].filter(Boolean).join(' '))} · ${esc(S.rules.defenseLabel)} ${c.ac} · ${S.mode}</small></div><button class="btn small" id="profBtn">✎ Profile</button>${hpBar(c)}`;
  Anim.hydrate($('#me'));
  $('#profBtn').onclick = openProfile;
  $('#say').placeholder = S.mode === 'social' ? 'Say something in character…' : 'What do you do?';
  $('#sayForm').hidden = S.mode === 'combat';
  $('#main').innerHTML = (VIEWS[S.mode] || exploreView)(S, c);
  Anim.hydrate($('#main'));
  $('#log').innerHTML = logFeed(S, 6);
}
onState(render);
onShow((v) => { if (v === 'game') render(); });

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
