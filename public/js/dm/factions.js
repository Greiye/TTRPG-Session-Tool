// DM Faction reputation card: add factions, move their standing toward the party, and link each
// faction to an NPC (mood) and to shops (prices). The server does the rules (src/factions.js).
import { $, emit, call, onState, state } from '../client.js';

const { esc } = Stage;
let linkKey = null;

$('#facAdd').onclick = async () => {
  const name = $('#facName').value.trim();
  const status = $('#facStatus');
  if (!name) { status.textContent = 'Give the faction a name.'; return; }
  const r = await call('dm:faction:add', { name, rep: Number($('#facRep').value) || 0 });
  if (r?.error) { status.textContent = r.error; return; }
  status.textContent = `${name} added.`;
  $('#facName').value = '';
  $('#facRep').value = '0';
};

$('#facList').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.facShift) emit('dm:faction:shift', { id: b.dataset.facId, delta: Number(b.dataset.facShift) });
  else if (b.dataset.facDel && confirm('Remove this faction? Its shops and NPC lose the link.')) emit('dm:faction:remove', { id: b.dataset.facDel });
});

$('#npcFaction').addEventListener('change', (e) => emit('dm:npc', { faction: e.target.value || null }));

onState((s) => {
  const facs = s.factions || [];
  const opts = `<option value="">No faction</option>${facs.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}`;
  const npcSel = $('#npcFaction');
  const shSel = $('#shFaction');
  const want = s.social.npc.faction || '';
  if (npcSel.dataset.key !== String(facs.length)) { npcSel.innerHTML = opts; shSel.innerHTML = opts; npcSel.dataset.key = facs.length; }
  npcSel.value = want;

  const key = facs.map((f) => `${f.id}:${f.rep}:${f.tier}`).join() + '|' + (s.shops || []).map((x) => `${x.id}:${x.faction}`).join();
  if (key === linkKey) return;
  linkKey = key;
  $('#facList').innerHTML = facs.map((f) => {
    const shopsHere = (s.shops || []).filter((x) => x.faction === f.id).length;
    return `<div class="item"><span><b>${esc(f.name)}</b> <small class="muted">${esc(f.label)} · ${f.rep} · ${shopsHere} shop${shopsHere === 1 ? '' : 's'}${s.social.npc.faction === f.id ? ` · ${esc(s.social.npc.name)}` : ''}</small></span>
      <span class="row">${[-10, -1, 1, 10].map((d) => `<button class="btn small" data-fac-id="${esc(f.id)}" data-fac-shift="${d}" aria-label="${d > 0 ? 'Raise' : 'Lower'} ${esc(f.name)} by ${Math.abs(d)}">${d > 0 ? '+' : ''}${d}</button>`).join('')}<button class="btn small danger" data-fac-del="${esc(f.id)}" aria-label="Remove ${esc(f.name)}">✕</button></span></div>`;
  }).join('') || '<p class="note">No factions yet. Add one to track how it sees the party.</p>';
});
