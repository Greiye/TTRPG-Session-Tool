// Phone Legends tab (phase J): the hall of fame, the trophy shelf, the house rules in force, and this
// character's autopilot status. Also the "what you missed" card when a seat is claimed again.
import { socket, $, onState, state } from '../client.js';
import { me } from './identity.js';
import { addTab, onTab } from './tabs.js';

const { esc, hallHtml, shelfHtml } = Stage;
addTab('legends', '🏛 Legends');
const root = () => $('#tabLegends');

function render() {
  const S = state();
  if (!S || !S.legends || !root()) return;
  const mine = S.absent?.[me.charId];
  const rules = (S.houseRuleList || []).filter((r) => r.on);
  root().innerHTML = `<div class="card"><h3>🏛 Hall of fame</h3>${hallHtml(S.legends)}</div>
    <div class="card"><h3>🏆 Trophy shelf</h3>${shelfHtml(S.legends)}</div>
    <div class="card"><h3>📜 House rules</h3>${rules.length
      ? `<ul class="rules">${rules.map((r) => `<li><b>${esc(r.label)}</b> <small class="muted">${esc(r.text)}</small></li>`).join('')}</ul>`
      : '<p class="note">No house rules are in force.</p>'}</div>
    ${mine?.autopilot ? '<div class="card"><p class="note">Your character is on autopilot while you are away. It takes the Dodge action on its turns.</p></div>' : ''}`;
}
onState(render);
onTab((id) => { if (id === 'legends') render(); });

// The "what you missed" card. Shown once per return; the server has already cleared the lines.
socket.on('missed', ({ name, lines } = {}) => {
  if (!lines?.length) return;
  const card = document.createElement('div');
  card.className = 'missed-card';
  card.innerHTML = `<div class="missed-box" role="dialog" aria-label="What you missed">
      <h3>While you were away</h3>
      <p class="note">What the table saw while ${esc(name || 'your seat')} was empty.</p>
      <ul>${lines.slice(-30).map((l) => `<li>${esc(l.text)}</li>`).join('')}</ul>
      <button class="bigbtn" id="missedOk">Got it</button>
    </div>`;
  document.body.append(card);
  card.querySelector('#missedOk').onclick = () => card.remove();
});
