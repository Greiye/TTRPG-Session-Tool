// ARCHIVED (Nov 14): the epilogue slideshow controls, taken out of the TV moments card.
// The server side still works (src/moments.js epilogueStart/epilogueEnd, dm:tv:epilogue:* in
// src/sockets/moments.js) and the TV still plays it (public/moments.js), so restoring is only this card:
// copy this file to public/js/dm/ and add `import './epilogue.js';` to public/js/dm/main.js.
import { emit, mount } from '../client.js';

const card = mount(`<div class="card" data-tab="scene" data-sub="moments" data-panel="exploration social combat">
  <div class="row"><b>Epilogue</b>
    <button class="btn small" data-epi="start">Start slideshow</button>
    <button class="btn small" data-epi="close">End</button></div>
</div>`);

card.addEventListener('click', (e) => {
  const b = e.target.closest('[data-epi]');
  if (b) emit(b.dataset.epi === 'start' ? 'dm:tv:epilogue:start' : 'dm:tv:epilogue:close');
});
