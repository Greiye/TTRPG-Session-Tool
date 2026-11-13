// DM intro card (Phase D): "Previously on..." on the TV with the campaign, session number and three recap lines.
import { $, emit, onState } from '../client.js';

let filled = false;
onState((s) => {
  if (filled || !s.intro) return;
  filled = true;
  $('#introCampaign').value = s.intro.campaign;
  $('#introSession').value = s.intro.session;
  $('#introLines').value = s.intro.lines.join('\n');
});

$('#introShow').onclick = () => {
  const lines = $('#introLines').value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 3);
  emit('dm:intro', { campaign: $('#introCampaign').value, session: $('#introSession').value, lines });
  $('#introStatus').textContent = 'On the TV for 12 seconds.';
};
