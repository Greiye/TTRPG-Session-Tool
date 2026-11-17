// Social / visual novel: emotion buttons (keys 1-8), dialogue with a language drop-down, the NPC and the cast.
// Rows top to bottom (Mike, Nov 17): Emotions, Dialogue, NPC, Live voice. Player choices, faction and speech style left.
import { $, $$, emit, call, onState, onClick, state } from '../client.js';
import { holdButton } from './hold.js';
import { masterRole } from './auth.js';

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
// conversation: the NPC list, pick one or more, hold Start for 1 s. Live: End conversation and the controls.
const picked = new Set();
let poolKey = null;
let wasLive = null;
function drawWindow(s) {
  const convo = s.social.convo || {};
  const show = s.mode === 'social' || masterRole() === 'social';
  const win = $('#socialWin');
  if (win.hidden === show) { win.hidden = !show; if (show) Anim.play(win, 'reveal', null); }
  const live = s.mode === 'social' && !!convo.live;
  $('#convoPick').hidden = live;
  $('#convoLive').hidden = !live;
  if (live !== wasLive && wasLive !== null && live) Anim.play($('#convoLive'), 'unfold', null);
  if (!live && wasLive) picked.clear();
  wasLive = live;
  const pool = s.social.pool || [];
  for (const id of [...picked]) if (!pool.some((p) => p.id === id)) picked.delete(id);
  const key = JSON.stringify([pool, [...picked]]);
  if (key !== poolKey) {
    poolKey = key;
    $('#convoPool').innerHTML = pool.map((p) => `<button class="btn convo-npc ${picked.has(p.id) ? 'on' : ''}" data-pool="${esc(p.id)}" aria-pressed="${picked.has(p.id)}" style="--hue:${p.hue}"><span class="convo-face">${Stage.portrait('neutral', p.hue)}</span>${esc(p.name)}</button>`).join('');
  }
  $('#convoStart').disabled = !picked.size || s.mode !== 'social';
  $('#convoWho').textContent = convo.ending ? 'Wrapping up…' : (s.social.cast || []).map((c) => c.name).join(' · ');
  $('#convoEnd').disabled = !!convo.ending;
}
$('#convoPool').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pool]');
  if (!b) return;
  const id = b.dataset.pool;
  if (picked.has(id)) picked.delete(id); else picked.add(id);
  $('#convoErr').textContent = '';
  if (state()) drawWindow(state());
});
holdButton($('#convoStart'), {
  ms: 1000,
  idle: '💬 Hold to start conversation',
  holding: 'Keep holding…',
  onFire: async () => {
    const r = await call('dm:convo:start', { ids: [...picked] });
    $('#convoErr').textContent = r?.error || '';
  },
});
$('#convoEnd').addEventListener('click', () => emit('dm:convo:end'));

$('#emotions').innerHTML = Object.entries(EMO).map(([k, e], i) => `<button class="btn" data-emo="${k}" title="${i + 1}"><span>${e.icon}</span>${e.label}</button>`).join('');

onState((s) => {
  if (!filled) {
    filled = true;
    $('#npcName').value = s.social.npc.name;
    $('#npcHue').value = s.social.npc.hue;
  }
  drawLangs(s);
  drawGloss(s);
  $$('[data-emo]').forEach((b) => b.classList.toggle('on', b.dataset.emo === s.social.npc.emotion));
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

const say = () => { emit('dm:say', { text: $('#line').value, lang: $('#lineLang').value }); $('#line').value = ''; };
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
onClick('emo', (emotion) => {
  const target = $('#emoTarget')?.value;
  if (target) emit('dm:pc:emotion', { id: target, emotion });
  else emit('dm:emotion', { emotion });
});
$('#line').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); say(); } });
$('#npcName').addEventListener('change', (e) => emit('dm:npc', { name: e.target.value }));
$('#npcHue').addEventListener('input', (e) => emit('dm:npc', { hue: Number(e.target.value) }));
$('#glossBtns').addEventListener('click', (e) => {
  const b = e.target.closest('[data-gloss]');
  if (!b) return;
  const to = b.dataset.gloss;
  const g = state()?.social.line.gloss || [];
  emit('dm:gloss', { to, on: !g.includes(to) });
});

// Number keys 1-8 switch emotions while not typing.
document.addEventListener('keydown', (e) => {
  if (state()?.mode !== 'social' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  const k = Object.keys(EMO)[Number(e.key) - 1];
  if (k) emit('dm:emotion', { emotion: k });
});
