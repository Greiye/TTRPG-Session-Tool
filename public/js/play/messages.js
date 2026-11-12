// Phone Messages tab (Phase 4 and 7): handouts, phrases in unknown tongues, spoils with claims,
// and the dialogue vote.
import { socket, $, onState, state } from '../client.js';
import { me } from './identity.js';
import { addTab, tab, onTab, setBadge } from './tabs.js';

const { esc } = Stage;
addTab('inbox', '✉ Inbox');
const root = () => $('#tabInbox');
let seen = new Set();

function render() {
  const S = state();
  const c = S?.players.find((p) => p.id === me.charId);
  if (!c) return;
  const items = (S.handouts || []).slice().reverse();
  const vote = S.vote;
  const voteHtml = vote ? `<div class="card vote"><h3>${vote.open ? 'The party votes' : 'Vote closed'}</h3>
      <div class="list">${vote.options.map((o, i) => `<button class="btn ${vote.mine === i ? 'primary' : ''}" data-vote="${i}" ${vote.open ? '' : 'disabled'}>${esc(o)}</button>`).join('')}</div>
      <p class="note">${vote.mine != null ? 'Tap another option to change your vote.' : 'Tap an option to vote.'}</p></div>` : '';
  const body = items.map((h) => {
    if (h.kind === 'spoil') {
      const mine = h.mine;
      return `<div class="card"><h3>🎁 ${esc(h.title)}</h3>
        <p>${h.items.map((i) => `${i.qty}× ${esc(i.name)}`).join(' · ')}</p>
        ${h.awarded ? `<p class="note">${h.awarded === c.id ? 'These are yours.' : 'Given to someone else.'}</p>`
          : `<div class="row"><input class="claim-note grow" data-claim-note="${esc(h.id)}" maxlength="120" placeholder="Why you? (optional)" value="${esc(mine?.note || '')}"><button class="btn ${mine ? 'primary' : ''}" data-claim="${esc(h.id)}">${mine ? 'Claimed ✓' : 'Claim'}</button></div>
             <p class="note">${h.claimCount} claim(s) so far.</p>`}</div>`;
    }
    if (h.kind === 'phrase') {
      const t = h.text !== undefined ? h.text : h.glyphs;
      return `<div class="card"><h3>🔤 ${esc(h.lang)}</h3><p class="${h.text === undefined ? 'glyphs' : ''}">${esc(t)}</p>${h.knows || h.text !== undefined ? '' : '<p class="note">You don\'t know this tongue.</p>'}</div>`;
    }
    return `<div class="card"><h3>📜 ${esc(h.title)}</h3>${h.text ? `<p>${esc(h.text)}</p>` : ''}${h.image ? `<img src="${esc(h.image)}" alt="" style="max-width:100%;border-radius:8px">` : ''}</div>`;
  }).join('');
  root().innerHTML = voteHtml + body + (items.length || vote ? '' : '<p class="note" style="text-align:center">Nothing here yet. Handouts, phrases and spoils from the DM show up here.</p>');
  // Badge: count new items since the tab was last opened.
  const fresh = items.filter((h) => !seen.has(h.id)).length + (vote?.open && vote.mine == null ? 1 : 0);
  setBadge('inbox', tab() === 'inbox' ? 0 : fresh);
  if (tab() === 'inbox') items.forEach((h) => seen.add(h.id));
}
onState(render);
onTab((id) => { if (id === 'inbox') render(); });

root().addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.vote != null) socket.emit('player:vote', { index: Number(b.dataset.vote) });
  else if (b.dataset.claim) {
    const note = root().querySelector(`[data-claim-note="${b.dataset.claim}"]`)?.value || '';
    socket.emit('player:claim', { id: b.dataset.claim, note });
  }
  navigator.vibrate?.(20);
});
