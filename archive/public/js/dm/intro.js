// ARCHIVED (Nov 14): DM intro card (Phase D), "Previously on..." on the TV with the campaign, session number
// and three recap lines. Mike: too close to other features (the epilogue, chapter cards). The server side
// (dm:intro, src/speech.js introFrom) and the TV card (stage.js introCard) still work. To restore, copy this
// file to public/js/dm/ and add `import './intro.js';` to public/js/dm/main.js.
import { $, emit, onState, mount } from '../client.js';

mount(`<div class="card" data-tab="scene" data-sub="moments" data-panel="exploration social">
  <h3>Intro card <span class="note">Previously on… on the TV</span></h3>
  <div class="row"><input id="introCampaign" class="grow" maxlength="60" placeholder="Campaign name" aria-label="Campaign name"><input id="introSession" type="number" min="1" max="999" value="1" style="width:80px" title="Session number" aria-label="Session number"></div>
  <textarea id="introLines" rows="3" placeholder="Up to three recap lines, one per line" aria-label="Recap lines"></textarea>
  <div class="row"><button class="btn primary" id="introShow">Show on TV</button><span class="note" id="introStatus"></span></div>
</div>`);

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
