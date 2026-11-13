// Social / visual novel: NPC name and color, emotion buttons (keys 1-8), dialogue, choices.
import { $, $$, emit, call, onState, onClick, state } from '../client.js';

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
  $('#castPickList').innerHTML = cast.map((c) => `<button class="btn" data-enter="${esc(c.id)}">${icon(c)} ${esc(c.name)}</button>`).join('');
}

$('#emotions').innerHTML = Object.entries(EMO).map(([k, e], i) => `<button class="btn" data-emo="${k}" title="${i + 1}"><span>${e.icon}</span>${e.label}</button>`).join('');

onState((s) => {
  if (!filled) {
    filled = true;
    $('#npcName').value = s.social.npc.name;
    $('#npcHue').value = s.social.npc.hue;
    s.social.choices.forEach((c, i) => { $$('.choice')[i].value = c; });
  }
  $$('[data-emo]').forEach((b) => b.classList.toggle('on', b.dataset.emo === s.social.npc.emotion));
  drawCast(s);
});

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

const say = () => { emit('dm:say', { text: $('#line').value }); $('#line').value = ''; };
const actions = {
  say,
  castAdd,
  choices: () => emit('dm:choices', { choices: $$('.choice').map((i) => i.value) }),
  choicesClear: () => { $$('.choice').forEach((i) => (i.value = '')); emit('dm:choices', { choices: [] }); },
};
onClick('act', (act) => actions[act]?.());
onClick('emo', (emotion) => emit('dm:emotion', { emotion }));
$('#line').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); say(); } });
$('#npcName').addEventListener('change', (e) => emit('dm:npc', { name: e.target.value }));
$('#npcHue').addEventListener('input', (e) => emit('dm:npc', { hue: Number(e.target.value) }));

// Number keys 1-8 switch emotions while not typing.
document.addEventListener('keydown', (e) => {
  if (state()?.mode !== 'social' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  const k = Object.keys(EMO)[Number(e.key) - 1];
  if (k) emit('dm:emotion', { emotion: k });
});
