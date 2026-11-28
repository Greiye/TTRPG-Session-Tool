// Social / visual novel: emotion buttons (keys 1-8), dialogue with a language drop-down, the NPC and the cast.
// Rows top to bottom (Mike, Nov 17): Emotions, Dialogue, NPC, Live voice. Player choices, faction and speech style left.
import { $, $$, emit, call, onState, onClick, state } from '../client.js';
import { holdButton } from './hold.js';
import { holdDrag } from './holddrag.js';
import { masterRole } from './auth.js';
import { wheelHtml, wireWheel, markWheel } from '../wheel.js';

const { EMO, esc } = Stage;
let filled = false;
let castKey = null;

// On-scene cast: chips to speak as, remove, and the picker shown when entering social mode.
const icon = (c) => (c.kind === 'item' ? (c.icon || '🗝️') : '🧑');
function drawCast(s) {
  const cast = s.social.cast || [];
  const key = JSON.stringify([cast, s.social.npc.id]);
  if (key === castKey) return;
  castKey = key;
  $('#castList').innerHTML = cast.length
    ? cast.map((c) => `<span class="cast-chip"><button class="btn ${c.id === s.social.npc.id ? 'on' : ''}" data-cast-pick="${esc(c.id)}">${icon(c)} ${esc(c.name)}</button><button class="btn small x" data-cast-del="${esc(c.id)}" title="Remove from scene" aria-label="Remove ${esc(c.name)}">×</button></span>`).join('')
    : '<span class="note">Nobody on the scene yet. Add an NPC or item below.</span>';
}

// Social window (Nov 16): shown in Social mode (always for a Social Master, so they can prep). Before the
// conversation: NPCs and players; press, hold and drag them into the circle (or tap), then hold Start for 1 s.
// Live (Nov 21): who is in the conversation, and the rest to drag in (or out again), then End and the controls.
const picked = new Set();
let poolKey = null;
let liveKey = null;
let wasLive = null;
const face = (p) => (p.kind === 'pc'
  ? `<span class="convo-face">${p.portrait ? `<img src="${esc(p.portrait)}" alt="">` : esc((p.name || '?')[0])}</span>`
  : `<span class="convo-face">${Stage.portrait('neutral', p.hue)}</span>`);
const chipHtml = (p, { on = false, attr = 'data-pool', x = false } = {}) => `<span class="convo-chip-wrap"><button class="btn convo-npc ${p.kind === 'pc' ? 'pc' : ''} ${on ? 'on' : ''}" ${attr}="${esc(p.id)}" data-drag="${esc(p.id)}" aria-pressed="${on}" style="--hue:${p.hue ?? 40}">${face(p)}${esc(p.name)}</button>${x ? `<button class="btn small x convo-x" data-convo-x="${esc(p.id)}" aria-label="Take ${esc(p.name)} out">×</button>` : ''}</span>`;
const pcs = (s) => (s.players || []).map((p) => ({ id: p.id, name: p.name, hue: p.hue, portrait: p.portrait, kind: 'pc' }));
function drawWindow(s) {
  const convo = s.social.convo || {};
  const show = s.mode === 'social' || masterRole() === 'social';
  const win = $('#socialWin');
  if (win.hidden === show) { win.hidden = !show; if (show) Anim.play(win, 'reveal', null); }
  const live = s.mode === 'social' && !!convo.live;
  // The TV preview above is a drop zone too (Mike, Nov 28: drag a character "to the social window above").
  const tvDrop = document.querySelector('#tablePage .stage-wrap');
  if (tvDrop) { if (show && s.mode === 'social') { tvDrop.dataset.drop = 'in'; tvDrop.setAttribute('aria-label', 'TV preview: drop here to bring into the conversation'); } else if (tvDrop.dataset.drop) { delete tvDrop.dataset.drop; tvDrop.removeAttribute('aria-label'); } }
  $('#convoPick').hidden = live;
  $('#convoLive').hidden = !live;
  if (live !== wasLive && wasLive !== null && live) Anim.play($('#convoLive'), 'unfold', null);
  if (!live && wasLive) picked.clear();
  wasLive = live;
  const pool = s.social.pool || [];
  const players = pcs(s);
  for (const id of [...picked]) if (!pool.some((p) => p.id === id) && !players.some((p) => p.id === id)) picked.delete(id);
  const key = JSON.stringify([pool, players, [...picked]]);
  if (key !== poolKey) {
    poolKey = key;
    $('#convoPool').innerHTML = pool.map((p) => chipHtml(p, { on: picked.has(p.id) })).join('');
    $('#convoPlayers').innerHTML = players.map((p) => chipHtml(p, { on: picked.has(p.id) })).join('') || '<span class="note">No players at the table yet.</span>';
    const inside = [...pool, ...players].filter((p) => picked.has(p.id));
    $('#convoZone').innerHTML = inside.length ? inside.map((p) => chipHtml(p, { on: true, attr: 'data-zone', x: true })).join('') : '<span class="note convo-zone-hint">Drag NPCs and players here</span>';
  }
  $('#convoStart').disabled = ![...picked].some((id) => pool.some((p) => p.id === id)) || s.mode !== 'social';
  if (live) drawLive(s, pool, players);
  $('#convoWho').textContent = convo.ending ? 'Wrapping up…' : '';
  $('#convoEnd').disabled = !!convo.ending;
}
// Live: cast NPCs and joined characters in the circle; pool NPCs and the other characters below it.
function drawLive(s, pool, players) {
  const cast = s.social.cast || [];
  const party = s.social.party || [];
  const inNpc = cast.map((c) => ({ ...c, kind: c.kind === 'item' ? 'item' : 'npc' }));
  const inPc = party.map((id) => players.find((p) => p.id === id)).filter(Boolean);
  const out = [...pool.filter((p) => !cast.some((c) => c.id === p.id)), ...players.filter((p) => !party.includes(p.id))];
  const key = JSON.stringify([inNpc.map((c) => [c.id, c.name, c.hue]), inPc, out]);
  if (key === liveKey) return;
  liveKey = key;
  $('#convoIn').innerHTML = [...inNpc, ...inPc].map((p) => chipHtml(p, { on: true, attr: 'data-in', x: true })).join('') || '<span class="note convo-zone-hint">Drag someone in</span>';
  $('#convoOut').innerHTML = out.map((p) => chipHtml(p, { attr: 'data-out' })).join('') || '<span class="note">Everyone is in the conversation.</span>';
}
const addLive = async (id) => { const r = await call('dm:convo:add', { id }); $('#convoLiveErr').textContent = r?.error || ''; };
const toggle = (id, on) => { if (on) picked.add(id); else picked.delete(id); $('#convoErr').textContent = ''; if (state()) drawWindow(state()); };
$('#convoPick').addEventListener('click', (e) => {
  const x = e.target.closest('[data-convo-x]');
  if (x) return toggle(x.dataset.convoX, false);
  const b = e.target.closest('[data-pool],[data-zone]');
  if (!b) return;
  const id = b.dataset.pool || b.dataset.zone;
  toggle(id, !picked.has(id));
});
$('#convoLive').addEventListener('click', (e) => {
  const x = e.target.closest('[data-convo-x]');
  if (x) return emit('dm:convo:drop', { id: x.dataset.convoX });
  const b = e.target.closest('[data-out]');
  if (b) addLive(b.dataset.out);
});
holdDrag($('#convoPick'), { onDrop: (el, zone) => toggle(el.dataset.drag, zone.dataset.drop === 'in') });
holdDrag($('#convoLive'), {
  onDrop: (el, zone) => {
    const id = el.dataset.drag;
    if (zone.dataset.drop === 'in' && el.dataset.out) addLive(id);
    else if (zone.dataset.drop === 'out' && el.dataset.in) emit('dm:convo:drop', { id });
  },
});
holdButton($('#convoStart'), {
  ms: 1000,
  idle: '💬 Hold to start conversation',
  holding: 'Keep holding…',
  onFire: async () => {
    const pool = state()?.social.pool || [];
    const ids = [...picked].filter((id) => pool.some((p) => p.id === id));
    const pids = [...picked].filter((id) => !pool.some((p) => p.id === id));
    const r = await call('dm:convo:start', { ids, pids });
    $('#convoErr').textContent = r?.error || '';
  },
});
$('#convoEnd').addEventListener('click', () => emit('dm:convo:end'));

// NPC emotion wheel (Mike, Nov 18: NPCs get the same emotion circle as the players). Tap a segment (or keys 1-8)
// to pick the emotion; the NPC wears it only when the line goes out (Mike, Nov 21): press Speak in the middle,
// Enter, or drag a segment onto Speak. With a character chosen under "Sprites", a tap changes their sprite at once.
$('#emotions').innerHTML = wheelHtml('neutral', { label: 'Speak', attrs: 'data-act="say" title="Speak the typed line as the NPC"', keys: true });
$('#emotions').classList.add('dm-wheel');
let staged = null; // emotion picked on the wheel, sent with the next line
const pickEmo = (emotion) => {
  const target = $('#emoTarget')?.value;
  if (target) return emit('dm:pc:emotion', { id: target, emotion });
  staged = emotion;
  markWheel($('#emotions'), emotion);
};
wireWheel($('#emotions .convo-wheel'), {
  onPick: (k) => pickEmo(k),
  onSend: () => say(),
});

onState((s) => {
  if (!filled) {
    filled = true;
    $('#npcName').value = s.social.npc.name;
  }
  drawLangs(s);
  drawGloss(s);
  markWheel($('#emotions'), staged || s.social.npc.emotion);
  drawCast(s);
  sprites(s);
  drawWindow(s);
});
window.addEventListener('dm:role', () => { if (state()) drawWindow(state()); });

$('#castList').addEventListener('click', (e) => {
  const pick = e.target.closest('[data-cast-pick]');
  const del = e.target.closest('[data-cast-del]');
  if (pick) emit('dm:cast:pick', { id: pick.dataset.castPick });
  if (del) emit('dm:cast:remove', { id: del.dataset.castDel });
});
async function castAdd() {
  const name = $('#castName').value.trim();
  const kind = $('#castKind').value;
  const r = await call('dm:cast:add', { name, kind, hue: Math.floor(Math.random() * 360), icon: kind === 'item' ? '🗝️' : '' });
  $('#castErr').textContent = r?.error || '';
  if (r?.ok) $('#castName').value = '';
}

// Phase D: a line in a tongue is scrambled on the phones and TV until the DM glosses it for someone.
let glossKey = null;
function drawGloss(s) {
  const line = s.social.line || {};
  const g = line.gloss || [];
  const key = JSON.stringify([line.lang || '', g, s.players.map((p) => p.id + p.name)]);
  if (key === glossKey) return;
  glossKey = key;
  $('#glossBtns').innerHTML = line.lang
    ? `<button class="btn small ${g.includes('*') ? 'on' : ''}" data-gloss="*">Gloss for everyone</button>` + s.players.map((p) => `<button class="btn small ${g.includes(p.id) ? 'on' : ''}" data-gloss="${esc(p.id)}">Gloss for ${esc(p.name)}</button>`).join('')
    : '<span class="note">Give a line a tongue to scramble it for everyone but those who know it.</span>';
}
// Dialogue languages are a drop-down (Mike, Nov 17): Common, the usual tongues, and any the party knows.
const TONGUES = ['Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc', 'Abyssal', 'Celestial', 'Draconic', 'Deep Speech', 'Infernal', 'Primordial', 'Sylvan', 'Undercommon'];
function drawLangs(s) {
  const sel = $('#lineLang');
  const known = (s.players || []).flatMap((p) => p.languages || []);
  const list = [...new Set([...TONGUES, ...known])].filter((l) => l && l.toLowerCase() !== 'common');
  const key = list.join('|');
  if (sel.dataset.key === key) return;
  const cur = sel.value;
  sel.dataset.key = key;
  sel.innerHTML = '<option value="">Common</option>' + list.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
  sel.value = list.includes(cur) ? cur : '';
}

const say = () => {
  // Speak with no line: the picked emotion still goes on (a face without words).
  if (!$('#line').value.trim()) { if (staged) emit('dm:emotion', { emotion: staged }); staged = null; return; }
  emit('dm:say', { text: $('#line').value, lang: $('#lineLang').value, emotion: staged || state()?.social.npc.emotion });
  staged = null;
  $('#line').value = '';
};
// Sprites: the emotion buttons drive the speaker, or a chosen character's sprite state.
function sprites(s) {
  const sel = $('#emoTarget');
  const cur = sel.value;
  const want = [['', 'Speaker'], ...(s.players || []).map((p) => [p.id, p.name])];
  const key = want.map((x) => x[0]).join();
  if (sel.dataset.key !== key) {
    sel.dataset.key = key;
    sel.innerHTML = want.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
    sel.value = want.some((x) => x[0] === cur) ? cur : '';
  }
}
async function spriteSet() {
  const target = $('#emoTarget').value || 'npc';
  const id = $('#spriteId').value.trim();
  const state = target === 'npc' ? (state_().social.npc.emotion || 'neutral') : 'neutral';
  const r = await call('dm:sprite', { target, sprite: { id, state } });
  $('#spriteErr').textContent = r?.error || '';
}
async function spriteClear() {
  const target = $('#emoTarget').value || 'npc';
  const r = await call('dm:sprite', { target, sprite: null });
  $('#spriteErr').textContent = r?.error || '';
}
const state_ = () => state();

const actions = {
  say,
  castAdd,
  spriteSet,
  spriteClear,
};
onClick('act', (act) => actions[act]?.());
onClick('emo', (emotion) => pickEmo(emotion)); // keyboard on a wheel segment
$('#line').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); say(); } });
$('#npcName').addEventListener('change', (e) => emit('dm:npc', { name: e.target.value }));
$('#glossBtns').addEventListener('click', (e) => {
  const b = e.target.closest('[data-gloss]');
  if (!b) return;
  const to = b.dataset.gloss;
  const g = state()?.social.line.gloss || [];
  emit('dm:gloss', { to, on: !g.includes(to) });
});

// Number keys 1-8 pick an emotion while not typing (sent with the next line).
document.addEventListener('keydown', (e) => {
  if (state()?.mode !== 'social' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  const k = Object.keys(EMO)[Number(e.key) - 1];
  if (k) pickEmo(k);
});
