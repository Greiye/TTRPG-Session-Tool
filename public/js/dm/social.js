// Social / visual novel: NPC name and color, emotion buttons (keys 1-8), dialogue, choices.
import { $, $$, emit, onState, onClick, state } from '../client.js';

const { EMO } = Stage;
let filled = false;

$('#emotions').innerHTML = Object.entries(EMO).map(([k, e], i) => `<button class="btn" data-emo="${k}" title="${i + 1}"><span>${e.icon}</span>${e.label}</button>`).join('');

onState((s) => {
  if (!filled) {
    filled = true;
    $('#npcName').value = s.social.npc.name;
    $('#npcHue').value = s.social.npc.hue;
    s.social.choices.forEach((c, i) => { $$('.choice')[i].value = c; });
  }
  $$('[data-emo]').forEach((b) => b.classList.toggle('on', b.dataset.emo === s.social.npc.emotion));
});

const say = () => { emit('dm:say', { text: $('#line').value }); $('#line').value = ''; };
const actions = {
  say,
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
