// Exploration: scene text and points of interest, narration, skill checks.
import { $, emit, onState, onClick } from '../client.js';

const { esc } = Stage;
let filled = false;
let skillsKey = null;

onState((s) => {
  if (!filled) {
    filled = true;
    $('#sceneTitle').value = s.scene.title;
    $('#sceneText').value = s.scene.text;
    $('#sceneTheme').value = s.scene.theme;
    $('#scenePoi').value = s.scene.poi.join(', ');
  }
  const k = s.rules.skills.join();
  if (k !== skillsKey) {
    skillsKey = k;
    $('#checkSkill').innerHTML = s.rules.skills.map((x) => `<option>${esc(x)}</option>`).join('');
  }
});

// Fog of war (7c): one toggle per point of interest.
onState((s) => {
  const open = new Set(s.scene.revealed || []);
  $('#fogList').innerHTML = s.scene.poi.map((p) => `<button class="btn small ${open.has(p) ? 'on' : ''}" data-fog="${esc(p)}">${open.has(p) ? '👁' : '☁'} ${esc(p)}</button>`).join('') || '<span class="note">Add points of interest to the scene.</span>';
});
$('#fogList').addEventListener('click', (e) => { const b = e.target.closest('[data-fog]'); if (b) emit('dm:reveal', { poi: b.dataset.fog, hide: b.classList.contains('on') }); });

const narrate = () => { emit('dm:narrate', { text: $('#narrate').value }); $('#narrate').value = ''; };
const actions = {
  narrate,
  fogAll: () => emit('dm:reveal', { all: true }),
  fogHide: () => emit('dm:reveal', { all: true, hide: true }),
  scene: () => emit('dm:scene', { title: $('#sceneTitle').value, text: $('#sceneText').value, theme: $('#sceneTheme').value, poi: $('#scenePoi').value.split(',').map((x) => x.trim()) }),
  check: () => emit('dm:check', { skill: $('#checkSkill').value, dc: $('#checkDc').value }),
  checkClear: () => emit('dm:check', { skill: null }),
};
onClick('act', (act) => actions[act]?.());
$('#narrate').addEventListener('keydown', (e) => e.key === 'Enter' && narrate());
