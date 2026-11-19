// Storybook viewer (Mike, Nov 19): scrub through a past session, jump between kept moments, read the transcript,
// keep or un-keep any moment, and download the story pack. Reads /api/story (src/storybook.js); no socket.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const params = new URLSearchParams(location.search);
const key = params.get('key') || '';
const qs = (extra = '') => { const q = [key && `key=${encodeURIComponent(key)}`, extra].filter(Boolean).join('&'); return q ? `?${q}` : ''; };
const api = (p, opts) => fetch(`/api/story${p}${qs()}`, opts).then((r) => (r.ok ? r.json() : null));

const KIND = { action: 'Action', check: 'Check', combat: 'Combat', downtime: 'Downtime', narrate: 'Narration', npc: 'NPC', say: 'Player', shop: 'Shop', system: 'System', notice: 'Notice', roll: 'Dice', quote: 'Quote', entrance: 'Entrance', relic: 'Relic', echo: 'Echo' };
const MODE = { exploration: '🧭 Exploration', combat: '⚔️ Combat', social: '💬 Social' };
const time = (t) => (t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
const VIDEO = /\.(webm|mp4)(\?|$)/i;

let sessions = [];
let sess = null; // the open session: { id, items, current, ... }
let at = 0; // index into sess.items
let playing = null;
let reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let shownBd = null;
let bdFlip = false;

// Items the controls step through: DM-only lines can be hidden, e.g. when showing the replay on the TV.
const visible = () => (sess ? sess.items.filter((x) => $('#sbDmOnly').checked || x.public) : []);

async function loadList() {
  sessions = (await api('/sessions')) || [];
  $('#sbEmpty').hidden = sessions.length > 0;
  $('#sbMain').hidden = !sessions.length;
  const want = params.get('session');
  $('#sbSession').innerHTML = sessions.map((s) => {
    const d = s.startedAt ? new Date(s.startedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : s.id;
    return `<option value="${esc(s.id)}">${esc(d)} · ${esc(s.title)}${s.current ? ' (now)' : ''}</option>`;
  }).join('');
  if (sessions.length) await open(sessions.some((s) => s.id === want) ? want : sessions[0].id);
}

async function open(id, { keepPlace = false } = {}) {
  const s = await api(`/sessions/${encodeURIComponent(id)}`);
  if (!s) return;
  // A refresh of the live session with nothing new changes nothing (keeps the list's scroll and the animation).
  const sig = (x) => `${x.id}|${x.items.length}|${x.items.filter((i) => i.kept).map((i) => i.id).join()}`;
  if (keepPlace && sess && sig(s) === sig(sess)) return;
  const wasEnd = sess && at >= visible().length - 1;
  const curId = sess && visible()[at]?.id;
  sess = s;
  reduced = s.motion === 'reduce' || (s.motion === 'auto' && matchMedia('(prefers-reduced-motion: reduce)').matches); // the table's Motion setting
  document.documentElement.classList.toggle('sb-reduce', reduced);
  $('#sbSession').value = id;
  $('#sbPack').href = `/api/story/sessions/${encodeURIComponent(id)}/pack.zip${qs()}`;
  $('#sbPackKept').href = `/api/story/sessions/${encodeURIComponent(id)}/pack.zip${qs('kept=1')}`;
  const list = visible();
  if (!keepPlace) at = 0;
  else if (wasEnd) at = Math.max(0, list.length - 1); // following the live end of the session
  else { const i = list.findIndex((x) => x.id === curId); if (i >= 0) at = i; }
  drawTicks();
  drawList();
  show(at, { jump: true });
}

function drawTicks() {
  const list = visible();
  const n = Math.max(1, list.length - 1);
  $('#sbRange').max = String(Math.max(0, list.length - 1));
  $('#sbTicks').innerHTML = list.map((x, i) => (x.kept ? `<button class="sb-tick${x.auto ? ' auto' : ''}" data-i="${i}" style="left:${(i / n) * 100}%" title="${esc(time(x.t))} ${esc(x.text.slice(0, 80))}" aria-label="Kept: ${esc(x.text.slice(0, 60))}"></button>` : '')).join('');
  const k = list.filter((x) => x.kept).length;
  $('#sbCount').textContent = `${list.length} moments · ${k} kept`;
}

function drawList() {
  const q = $('#sbFind').value.trim().toLowerCase();
  const keptOnly = $('#sbKeptOnly').checked;
  const list = visible();
  $('#sbList').innerHTML = list.map((x, i) => {
    if (keptOnly && !x.kept) return '';
    if (q && !`${x.who || ''} ${x.text}`.toLowerCase().includes(q)) return '';
    return `<div class="sb-row k-${esc(x.kind)}${x.public ? '' : ' private'}${i === at ? ' on' : ''}" role="listitem" data-i="${i}">
      <button class="sb-row-star${x.kept ? ' kept' : ''}" data-keep="${i}" aria-pressed="${x.kept}" title="${x.kept ? 'Un-keep' : 'Keep'}">${x.kept ? '★' : '☆'}</button>
      <small>${esc(time(x.t))}</small><b>${esc(KIND[x.kind] || x.kind)}</b>
      <span>${x.who && x.kind !== 'roll' ? `<i>${esc(x.who)}${x.emotion && x.emotion !== 'neutral' ? ` (${esc(x.emotion)})` : ''}:</i> ` : ''}${esc(x.text)}${x.public ? '' : ' <em class="sb-dm">DM only</em>'}</span>
    </div>`;
  }).join('') || '<p class="note">Nothing matches.</p>';
}

function backdrop(url) {
  if (url === shownBd) return;
  shownBd = url;
  bdFlip = !bdFlip;
  const [inEl, outEl] = bdFlip ? [$('#sbBdA'), $('#sbBdB')] : [$('#sbBdB'), $('#sbBdA')];
  inEl.innerHTML = !url ? '' : VIDEO.test(url) ? `<video src="${esc(url)}" muted loop playsinline ${reduced ? '' : 'autoplay'}></video>` : `<img src="${esc(url)}" alt="">`;
  inEl.classList.add('in');
  outEl.classList.remove('in');
}

function show(i, { jump = false } = {}) {
  const list = visible();
  if (!list.length) return;
  at = Math.max(0, Math.min(list.length - 1, i));
  const x = list[at];
  const m = x.mood || {};
  $('#sbRange').value = String(at);
  $('#sbAt').textContent = `${time(x.t)} · ${at + 1} of ${list.length}`;
  $('#sbScene').textContent = m.scene || '';
  $('#sbMode').textContent = MODE[m.mode] || m.mode || '';
  $('#sbMode').className = `sb-chip mode-${m.mode || ''}`;
  $('#sbChips').innerHTML = [m.time && `🕰 ${m.time}`, m.weather && `🌧 ${m.weather}`, m.music && `🎵 ${m.music}`, m.npc && `🗣 ${m.npc}${m.emotion ? ` · ${m.emotion}` : ''}`]
    .filter(Boolean).map((c) => `<span class="sb-chip">${esc(c)}</span>`).join('');
  backdrop(m.backdrop || null);
  const line = $('#sbLine');
  line.className = `sb-line k-${x.kind}${x.kept ? ' kept' : ''}${x.roll === 20 ? ' crit' : ''}${x.public ? '' : ' private'}`;
  $('#sbWho').textContent = x.who && x.kind !== 'roll' ? `${x.who}${x.emotion && x.emotion !== 'neutral' ? ` · ${x.emotion}` : ''}` : KIND[x.kind] || x.kind;
  $('#sbText').textContent = x.text;
  if (!reduced && !jump) { line.classList.remove('enter'); void line.offsetWidth; line.classList.add('enter'); }
  const star = $('#sbStar');
  star.textContent = x.kept ? '★ Kept' : '☆ Keep';
  star.setAttribute('aria-pressed', String(!!x.kept));
  star.classList.toggle('kept', !!x.kept);
  star.classList.toggle('on', !!x.kept);
  document.querySelectorAll('.sb-row.on').forEach((r) => r.classList.remove('on'));
  const row = document.querySelector(`.sb-row[data-i="${at}"]`);
  if (row) { row.classList.add('on'); row.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); }
}

async function toggleKeep(i) {
  const x = visible()[i];
  if (!x) return;
  const on = !x.kept;
  const r = await fetch(`/api/story/sessions/${encodeURIComponent(sess.id)}/keep${qs()}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item: x.id, on }) });
  if (!r.ok) return;
  x.kept = on;
  x.auto = false;
  drawTicks();
  drawList();
  show(i, { jump: true });
  if (on && !reduced) { const s = $('#sbStar'); s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop'); }
}

function step(d) { stop(); show(at + d); }
function keptStep(d) {
  stop();
  const list = visible();
  for (let i = at + d; i >= 0 && i < list.length; i += d) if (list[i].kept) return show(i);
}
function stop() { clearTimeout(playing); playing = null; $('#sbPlay').textContent = '▶ Play'; }
function play() {
  if (playing) return stop();
  if (at >= visible().length - 1) show(0, { jump: true });
  $('#sbPlay').textContent = '⏸ Pause';
  const tick = () => {
    const list = visible();
    if (at >= list.length - 1) return stop();
    const keptOnly = $('#sbKeptOnly').checked;
    let i = at + 1;
    if (keptOnly) { while (i < list.length && !list[i].kept) i++; if (i >= list.length) return stop(); }
    show(i);
    playing = setTimeout(tick, Number($('#sbSpeed').value));
  };
  playing = setTimeout(tick, reduced ? 0 : 300);
}

$('#sbSession').onchange = (e) => { stop(); open(e.target.value); };
$('#sbRange').oninput = (e) => { stop(); show(Number(e.target.value), { jump: true }); };
$('#sbPrev').onclick = () => step(-1);
$('#sbNext').onclick = () => step(1);
$('#sbPrevKept').onclick = () => keptStep(-1);
$('#sbNextKept').onclick = () => keptStep(1);
$('#sbPlay').onclick = play;
$('#sbStar').onclick = () => toggleKeep(at);
$('#sbFind').oninput = drawList;
$('#sbKeptOnly').onchange = () => { drawList(); show(at, { jump: true }); };
$('#sbDmOnly').onchange = () => { stop(); at = 0; drawTicks(); drawList(); show(0, { jump: true }); };
$('#sbTicks').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) { stop(); show(Number(b.dataset.i)); } });
$('#sbList').addEventListener('click', (e) => {
  const k = e.target.closest('[data-keep]');
  if (k) return toggleKeep(Number(k.dataset.keep));
  const r = e.target.closest('[data-i]');
  if (r) { stop(); show(Number(r.dataset.i)); }
});
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input:not([type=range]), textarea, select')) return;
  const act = { ArrowLeft: () => step(-1), ArrowRight: () => step(1), ' ': play, k: () => toggleKeep(at), K: () => toggleKeep(at), '[': () => keptStep(-1), ']': () => keptStep(1) }[e.key];
  if (act) { e.preventDefault(); act(); }
});
// The session being played right now grows: refresh it while the page is open (and follow the end if you are there).
setInterval(() => { if (sess?.current && !playing && document.visibilityState === 'visible') open(sess.id, { keepPlace: true }); }, 5000);

loadList();
