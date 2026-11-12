// DM Shops card (item 27): import a merchant's price list (CSV or Markdown), open or close shops,
// and set the party's gold. Parsing happens on the server, so every list reads the same way.
import { $, emit, call, onState, state } from '../client.js';

const { esc } = Stage;
let goldKey = '';

// Read a chosen file into the textarea so the DM can check it before importing.
$('#shFile').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  $('#shText').value = await f.text();
  if (!$('#shName').value) $('#shName').value = f.name.replace(/\.[^.]+$/, '');
});

$('#shImport').onclick = async () => {
  const text = $('#shText').value.trim();
  const status = $('#shStatus');
  if (!text) { status.textContent = 'Paste a list or choose a file first.'; return; }
  const r = await call('dm:shop:import', { name: $('#shName').value.trim(), npc: $('#shNpc').value.trim(), text });
  if (r?.error) { status.textContent = r.error; return; }
  status.textContent = `Imported ${r.items} items.${r.skipped?.length ? ` Skipped ${r.skipped.length}: ${r.skipped.join('; ')}` : ''}`;
  if (!r.skipped?.length) { $('#shText').value = ''; $('#shFile').value = ''; $('#shName').value = ''; $('#shNpc').value = ''; }
};

onState((s) => {
  const shops = s.shops || [];
  $('#shList').innerHTML = shops.map((x) => `<div class="item"><span><b>${esc(x.name)}</b> <small class="muted">${esc(x.npc || 'no merchant named')} · ${x.items.length} item${x.items.length === 1 ? '' : 's'}${x.items.filter((i) => i.stock === 0).length ? ` · ${x.items.filter((i) => i.stock === 0).length} sold out` : ''}</small></span>
    <span class="row"><button class="btn small ${x.open ? 'on' : ''}" data-shop-open="${esc(x.id)}" data-open="${x.open ? 0 : 1}">${x.open ? 'Open' : 'Closed'}</button><button class="btn small danger" data-shop-del="${esc(x.id)}" aria-label="Remove ${esc(x.name)}">✕</button></span></div>`).join('')
    || '<p class="note">No shops yet. Paste a price list above.</p>';

  // Gold inputs keep the DM's typing: only redraw when the party changes or nothing is being typed.
  const gk = s.players.map((p) => `${p.id}:${p.gold}`).join();
  const typing = document.activeElement?.tagName === 'INPUT' && document.activeElement.closest('#goldList');
  if (gk !== goldKey && !typing) {
    goldKey = gk;
    $('#goldList').innerHTML = s.players.map((p) => `<div class="item"><span><b>${esc(p.name)}</b> <small class="muted">${Number(p.gold || 0).toFixed(2).replace(/\.?0+$/, '')} gp</small></span>
      <span class="row"><input type="number" min="0" step="0.01" value="${Number(p.gold || 0)}" data-gold-in="${esc(p.id)}" aria-label="Gold for ${esc(p.name)}" style="width:90px"><button class="btn small" data-gold-set="${esc(p.id)}">Set</button></span></div>`).join('')
      || '<p class="note">Add characters first.</p>';
  }
});

$('#shList').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.shopOpen) emit('dm:shop:open', { id: b.dataset.shopOpen, open: b.dataset.open === '1' });
  else if (b.dataset.shopDel && confirm('Remove this shop?')) emit('dm:shop:remove', { id: b.dataset.shopDel });
});
$('#goldList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-gold-set]');
  if (!b) return;
  const id = b.dataset.goldSet;
  const v = Number($(`[data-gold-in="${id}"]`).value);
  if (Number.isFinite(v)) { goldKey = ''; emit('dm:sheet', { id, gold: v }); }
});
