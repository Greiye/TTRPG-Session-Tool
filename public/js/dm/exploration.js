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

const narrate = () => { emit('dm:narrate', { text: $('#narrate').value }); $('#narrate').value = ''; };
const actions = {
  narrate,
  scene: () => emit('dm:scene', { title: $('#sceneTitle').value, text: $('#sceneText').value, theme: $('#sceneTheme').value, poi: $('#scenePoi').value.split(',').map((x) => x.trim()) }),
  check: () => emit('dm:check', { skill: $('#checkSkill').value, dc: $('#checkDc').value }),
  checkClear: () => emit('dm:check', { skill: null }),
};
onClick('act', (act) => actions[act]?.());
$('#narrate').addEventListener('keydown', (e) => e.key === 'Enter' && narrate());
