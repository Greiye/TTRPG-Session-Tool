// DM Living world card: clocks, towns, roads, rumours, weather, tension, oracles, player canon and the
// undo list. Every rule lives on the server (src/living.js); this card only sends and shows.
import { $, $$, call, emit, onState } from '../client.js';

const { esc } = Stage;
const status = (msg) => { $('#lvStatus').textContent = msg || ''; };
const parseTarget = (v) => { const [kind, id] = String(v || '').split(':'); return kind && id ? { kind, id } : null; };
const townOpts = (towns, none) => `${none ? `<option value="">${none}</option>` : ''}${towns.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}`;

// Parse "text | weight | lights | weather" lines into oracle entries.
function parseEntries(text) {
  return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const [t, w, light, weather] = line.split('|').map((x) => (x || '').trim());
    const list = (v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []);
    return { text: t, weight: Number(w) || 1, when: { light: list(light), weather: list(weather) } };
  });
}

async function act(event, data, okMsg) {
  const r = await call(event, data);
  status(r?.error || okMsg || '');
  return r;
}

$('#lvWeather').addEventListener('change', (e) => emit('dm:living:weather', { weather: e.target.value }));

$('#lvcSeg').closest('.card').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-lv]');
  if (!b) return;
  const kind = b.dataset.lv;
  if (kind === 'tension') return emit('dm:living:tension', { delta: Number(b.dataset.d) });
  if (kind === 'session') return act('dm:living:session', {}, 'Between sessions: clocks ticked and rumours spread.');
  if (kind === 'clock-add') {
    const r = await act('dm:living:clock:add', {
      name: $('#lvcName').value.trim(), segments: Number($('#lvcSeg').value), vis: $('#lvcShow').checked ? 'all' : 'dm',
      ticks: { session: Number($('#lvcSession').value), travel: Number($('#lvcTravel').value) },
      consequence: { text: $('#lvcText').value.trim(), target: parseTarget($('#lvcTarget').value), delta: Number($('#lvcDelta').value) },
    }, 'Clock added.');
    if (!r?.error) { $('#lvcName').value = ''; $('#lvcText').value = ''; }
  }
  if (kind === 'town-add') {
    const r = await act('dm:living:town:add', { name: $('#lvtName').value.trim(), rep: Number($('#lvtRep').value) }, 'Town added.');
    if (!r?.error) $('#lvtName').value = '';
  }
  if (kind === 'link') act('dm:living:link', { a: $('#lvlA').value, b: $('#lvlB').value, on: true }, 'Roads linked.');
  if (kind === 'shop') act('dm:living:shop', { id: $('#lvShop').value, town: $('#lvShopTown').value || null, night: $('#lvShopNight').checked }, 'Shop set.');
  if (kind === 'rumour-add') {
    const r = await act('dm:living:rumour:add', {
      text: $('#lvrText').value.trim(), town: $('#lvrTown').value || null,
      effect: $('#lvrEffTown').value ? { town: $('#lvrEffTown').value, delta: Number($('#lvrEffDelta').value) } : null,
    }, 'Rumour started.');
    if (!r?.error) $('#lvrText').value = '';
  }
  if (kind === 'oracle-add') {
    const r = await act('dm:living:oracle:add', { name: $('#lvoName').value.trim(), entries: parseEntries($('#lvoText').value) }, 'Oracle added.');
    if (!r?.error) { $('#lvoName').value = ''; $('#lvoText').value = ''; }
  }
});

// Lists: one delegated handler for every row button.
$('#lvClocks').closest('.card').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-do]');
  if (!b) return;
  const { do: what, id } = b.dataset;
  if (what === 'clock') emit('dm:living:clock:advance', { id, delta: Number(b.dataset.d), why: 'DM' });
  if (what === 'clock-del') emit('dm:living:clock:remove', { id });
  if (what === 'town') emit('dm:living:town:shift', { id, delta: Number(b.dataset.d) });
  if (what === 'town-del') emit('dm:living:town:remove', { id });
  if (what === 'trade') emit('dm:living:town:trade', { id, mode: b.dataset.mode });
  if (what === 'rumour-spread') { const t = b.closest('.item').querySelector('select'); act('dm:living:rumour:spread', { id, town: t.value }, 'Rumour spreads.'); }
  if (what === 'rumour-del') emit('dm:living:rumour:remove', { id });
  if (what === 'oracle-roll') act('dm:living:oracle:roll', { id }, 'Rolled. Accept it or write another result below.');
  if (what === 'oracle-del') emit('dm:living:oracle:remove', { id });
  if (what === 'pending-accept') act('dm:living:oracle:decide', { id, action: 'accept' }, 'Accepted.');
  if (what === 'pending-override') {
    const text = b.closest('.item').querySelector('input').value.trim();
    act('dm:living:oracle:decide', { id, action: 'override', text }, 'Overridden.');
  }
  if (what === 'canon') act('dm:living:canon:decide', { id, approve: b.dataset.yes === '1' }, '');
  if (what === 'undo') act('dm:living:undo', { id }, 'Undone.');
});

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let last = {};
// Re-draw a list only when its data changed, so a half-typed input keeps its text.
function draw(key, el, html) {
  if (same(last[key], html)) return;
  last[key] = html;
  el.innerHTML = html;
}

onState((s) => {
  const L = s.living;
  if (!L || !L.towns) return;
  const towns = L.towns;
  const shops = s.shops || [];
  const weathers = ['none', 'rain', 'snow', 'fog', 'storm'];
  const wSel = $('#lvWeather');
  if (wSel.dataset.key !== 'w') { wSel.innerHTML = weathers.map((w) => `<option value="${w}">${w === 'none' ? 'clear' : w}</option>`).join(''); wSel.dataset.key = 'w'; }
  wSel.value = s.weather?.kind || 'none';
  const d = L.derived || {};
  $('#lvDerived').textContent = `Sight ${d.sight} · travel ×${d.travel?.factor ?? 1} · encounters ×${d.encounters ?? 1}`;
  $('#lvTension').textContent = `${L.tensionLabel ?? L.tension?.label ?? ''} ${L.tension?.value ?? L.tension ?? 0}/10`;

  // Selects that depend on the world: keep them in step with the towns and clocks.
  const townKey = towns.map((t) => t.id + t.name).join();
  if (($('#lvlA').dataset.key || '') !== townKey) {
    $('#lvlA').innerHTML = townOpts(towns, ''); $('#lvlB').innerHTML = townOpts(towns, '');
    $('#lvrTown').innerHTML = townOpts(towns, 'No town yet (seed later)'); $('#lvrEffTown').innerHTML = townOpts(towns, 'No standing change');
    $('#lvShopTown').innerHTML = townOpts(towns, 'No town');
    $('#lvcTarget').innerHTML = `<option value="">No standing change</option>${towns.map((t) => `<option value="town:${esc(t.id)}">${esc(t.name)}</option>`).join('')}${(s.factions || []).map((f) => `<option value="faction:${esc(f.id)}">${esc(f.name)} (faction)</option>`).join('')}`;
    $('#lvlA').dataset.key = townKey;
  }
  const shopKey = shops.map((x) => x.id + x.name).join();
  if (($('#lvShop').dataset.key || '') !== shopKey) { $('#lvShop').innerHTML = shops.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join(''); $('#lvShop').dataset.key = shopKey; }

  draw('clocks', $('#lvClocks'), (L.clocks || []).map((c) => `<div class="item"><span><b>${esc(c.name)}</b> <small class="muted">${c.filled}/${c.segments}${c.fired ? ' · filled' : ''}${c.vis === 'all' ? ' · TV' : ' · DM only'}${c.consequence?.text ? ` · ${esc(c.consequence.text)}` : ''}</small></span><span class="row"><button class="btn small" data-do="clock" data-id="${esc(c.id)}" data-d="-1" aria-label="Step ${esc(c.name)} back">−</button><button class="btn small" data-do="clock" data-id="${esc(c.id)}" data-d="1" aria-label="Advance ${esc(c.name)}">+1</button><button class="btn small danger" data-do="clock-del" data-id="${esc(c.id)}" aria-label="Remove ${esc(c.name)}">✕</button></span></div>`).join('') || '<p class="note">No clocks yet.</p>');

  draw('towns', $('#lvTowns'), towns.map((t) => `<div class="item"><span><b>${esc(t.name)}</b> <small class="muted">${esc(t.label)} · ${t.rep} · trade ${esc(t.trade)}</small></span><span class="row">${[-10, -1, 1, 10].map((d) => `<button class="btn small" data-do="town" data-id="${esc(t.id)}" data-d="${d}" aria-label="${d > 0 ? 'Raise' : 'Lower'} ${esc(t.name)} by ${Math.abs(d)}">${d > 0 ? '+' : ''}${d}</button>`).join('')}<select class="small" data-do="trade-sel" aria-label="Trade in ${esc(t.name)}" onchange="window.lvTrade('${esc(t.id)}', this.value)">${['auto', 'open', 'closed'].map((m) => `<option ${t.trade === m ? 'selected' : ''}>${m}</option>`).join('')}</select><button class="btn small danger" data-do="town-del" data-id="${esc(t.id)}" aria-label="Remove ${esc(t.name)}">✕</button></span></div>`).join('') || '<p class="note">No towns yet. Towns hold standing, roads and shops.</p>');

  draw('rumours', $('#lvRumours'), (L.rumours || []).map((r) => {
    const heard = Object.entries(r.heard || {}).map(([tid, h]) => `${esc((towns.find((t) => t.id === tid) || {}).name || '?')}${h.distorted ? ' (changed)' : ''}`).join(', ') || 'no one yet';
    const open = towns.filter((t) => !r.heard?.[t.id]);
    return `<div class="item"><span><b>“${esc(r.text)}”</b> <small class="muted">heard: ${heard}${r.effect ? ` · moves ${esc((towns.find((t) => t.id === r.effect.town) || {}).name || '?')} by ${r.effect.delta}` : ''}</small></span><span class="row">${open.length ? `<select class="small" aria-label="Spread to">${open.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select><button class="btn small" data-do="rumour-spread" data-id="${esc(r.id)}">Spread</button>` : ''}<button class="btn small danger" data-do="rumour-del" data-id="${esc(r.id)}" aria-label="Remove rumour">✕</button></span></div>`;
  }).join('') || '<p class="note">No rumours yet.</p>');

  draw('oracles', $('#lvOracles'), (L.oracles || []).map((o) => `<div class="item"><span><b>${esc(o.name)}</b> <small class="muted">${o.entries.length} results</small></span><span class="row"><button class="btn small" data-do="oracle-roll" data-id="${esc(o.id)}">Roll</button><button class="btn small danger" data-do="oracle-del" data-id="${esc(o.id)}" aria-label="Remove ${esc(o.name)}">✕</button></span></div>`).join('') || '<p class="note">No oracles yet.</p>');

  draw('pending', $('#lvPending'), (L.pending || []).map((p) => `<div class="item"><span><b>${esc(p.name)}</b>: ${esc(p.text)} <small class="muted">${p.fit ? 'fits the scene' : 'no result fit, any used'}</small></span><span class="row"><input placeholder="Write instead" aria-label="Override text" class="small"><button class="btn small" data-do="pending-override" data-id="${esc(p.id)}">Use this</button><button class="btn small primary" data-do="pending-accept" data-id="${esc(p.id)}">Accept</button></span></div>`).join('') || '');

  draw('canon', $('#lvCanon'), (L.canon || []).filter((c) => c.status === 'proposed').map((c) => `<div class="item"><span><b>${esc(c.by || 'Player')}</b> proposes (${esc(c.kind)}): ${esc(c.text)}</span><span class="row"><button class="btn small primary" data-do="canon" data-id="${esc(c.id)}" data-yes="1">Approve</button><button class="btn small" data-do="canon" data-id="${esc(c.id)}" data-yes="0">Refuse</button></span></div>`).join('') || '<p class="note">No proposals waiting.</p>');

  draw('history', $('#lvHistory'), (L.history || []).slice(0, 15).map((e) => `<div class="item"><span><small class="muted">${e.vis ? 'DM only · ' : ''}${e.undone ? 'undone · ' : ''}</small>${esc(e.text)}</span><span class="row">${e.undo && !e.undone ? `<button class="btn small" data-do="undo" data-id="${esc(e.id)}">Undo</button>` : ''}</span></div>`).join('') || '<p class="note">Nothing has changed yet.</p>');
});

// Trade mode changes come from a select; the handler is global so the inline attribute can reach it.
window.lvTrade = (id, mode) => emit('dm:living:town:trade', { id, mode });
