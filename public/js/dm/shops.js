// DM Shops (item 27): import a merchant's price list (CSV or Markdown), open or close shops, and set the
// party's gold. Parsing happens on the server, so every list reads the same way. The Shops tab lives in
// Planning group but also shows during play (Mike, Nov 16): its Shop pop-up card pops a shop up on the TV
// and every phone (one pop-up at a time, see src/popups.js), live or from Planning Mode.
import { $, emit, call, onState, state } from '../client.js';
import { dmKey } from './auth.js';

const popCard = $('#shopPopCard');
let popKey = '';

const { esc } = Stage;

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
  const r = await call('dm:shop:import', { name: $('#shName').value.trim(), npc: $('#shNpc').value.trim(), faction: $('#shFaction').value || null, text });
  if (r?.error) { status.textContent = r.error; return; }
  status.textContent = `Imported ${r.items} items.${r.skipped?.length ? ` Skipped ${r.skipped.length}: ${r.skipped.join('; ')}` : ''}`;
  if (!r.skipped?.length) { $('#shText').value = ''; $('#shFile').value = ''; $('#shName').value = ''; $('#shNpc').value = ''; $('#shFaction').value = ''; }
};

onState((s) => {
  const shops = s.shops || [];
  const pk = shops.map((x) => x.id + x.name).join();
  if (pk !== popKey) {
    popKey = pk;
    const cur = $('#shPopPick').value;
    $('#shPopPick').innerHTML = shops.map((x) => `<option value="${esc(x.id)}" ${x.id === cur ? 'selected' : ''}>${esc(x.name)}</option>`).join('') || '<option value="">No shops yet</option>';
  }
  const pop = s.shopPop;
  const popShop = pop && shops.find((x) => x.id === pop.shopId);
  $('#shPopStatus').textContent = popShop ? `${popShop.name} is up · ${pop.shopping} still shopping` : '';
  // One toggle (Nov 18): Pop up while nothing is up, Close pop-up while a shop is up.
  const pb = $('#shPopOpen');
  pb.textContent = pop ? 'Close pop-up' : 'Pop up';
  pb.classList.toggle('on', !!pop);
  pb.setAttribute('aria-pressed', String(!!pop));
  $('#shList').innerHTML = shops.map((x) => `<div class="item"><span><b>${esc(x.name)}</b> <small class="muted">${esc(x.npc || 'no merchant named')} · ${x.items.length} item${x.items.length === 1 ? '' : 's'}${x.items.filter((i) => i.stock === 0).length ? ` · ${x.items.filter((i) => i.stock === 0).length} sold out` : ''}</small></span>
    <span class="row"><button class="btn small ${s.shopPop?.shopId === x.id ? 'on' : ''}" data-shop-pop="${esc(x.id)}" title="Pop up on the TV and phones" aria-pressed="${s.shopPop?.shopId === x.id}">${s.shopPop?.shopId === x.id ? 'Close pop-up' : 'Pop up'}</button><select class="small" data-shop-fac="${esc(x.id)}" aria-label="Faction for ${esc(x.name)}" title="Faction whose standing sets these prices">${(s.factions || []).map((f) => `<option value="${esc(f.id)}" ${x.faction === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}<option value="" ${x.faction ? '' : 'selected'}>No faction</option></select><label class="btn small" title="Banner picture shown on top of the pop-up">🖼 Banner<input type="file" accept="image/*" data-shop-banner="${esc(x.id)}" hidden></label><button class="btn small ${x.open ? 'on' : ''}" data-shop-open="${esc(x.id)}" data-open="${x.open ? 0 : 1}">${x.open ? 'Open' : 'Closed'}</button><button class="btn small danger" data-shop-del="${esc(x.id)}" aria-label="Remove ${esc(x.name)}">✕</button></span></div>`).join('')
    || '<p class="note">No shops yet. Paste a price list above.</p>';

});

$('#shList').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.shopPop) emit('dm:shop:pop', { id: b.classList.contains('on') ? null : b.dataset.shopPop });
  else if (b.dataset.shopOpen) emit('dm:shop:open', { id: b.dataset.shopOpen, open: b.dataset.open === '1' });
  else if (b.dataset.shopDel && confirm('Remove this shop?')) emit('dm:shop:remove', { id: b.dataset.shopDel });
});
$('#shList').addEventListener('change', async (e) => {
  const up = e.target.closest('[data-shop-banner]');
  if (up) {
    const file = up.files[0];
    up.value = '';
    if (!file) return;
    const res = await fetch('/api/assets/map', { method: 'POST', headers: { 'content-type': file.type, 'x-dm-key': dmKey() }, body: file });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) return alert(out.error || 'Upload failed');
    emit('dm:shop:banner', { id: up.dataset.shopBanner, url: out.url });
    return;
  }
  const sel = e.target.closest('[data-shop-fac]');
  if (sel) emit('dm:shop:faction', { id: sel.dataset.shopFac, faction: sel.value || null });
});
popCard.addEventListener('click', (e) => {
  if (e.target.id !== 'shPopOpen') return;
  if (state()?.shopPop) emit('dm:shop:pop', { id: null });
  else if ($('#shPopPick').value) emit('dm:shop:pop', { id: $('#shPopPick').value });
});
