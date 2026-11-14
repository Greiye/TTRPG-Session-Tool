// Chronicle layout on the DM page: the pill bar over the stage, the story feed, the hero column
// (the sidebar tab list has its own labels, see modes.js). Pieces are drawn by public/chronicle.js.
import { $, onState, state } from '../client.js';

let pick = null; // character id shown in the hero column
let view = 'stats';
try { view = localStorage.getItem('dmHeroView') || 'stats'; } catch { /* private mode */ }


function renderHero(S) {
  const party = S.players || [];
  if (!party.some((p) => p.id === pick)) pick = party[0]?.id || null;
  $('#heroPick').innerHTML = party.length > 1 ? party.map((p) => `<button role="tab" class="${p.id === pick ? 'on' : ''}" aria-selected="${p.id === pick}" data-hero-pick="${p.id}" title="${Stage.esc(p.name)}" style="--hue:${p.hue ?? 40}">${Stage.avatar(p, 'av-pick')}</button>`).join('') : '';
  $('#hero').innerHTML = Chronicle.hero(party.find((p) => p.id === pick), S, { view });
  Anim.hydrate($('#heroPick'));
  Anim.hydrate($('#hero'));
}

onState((S) => {
  $('#pills').innerHTML = Chronicle.pills(S);
  Chronicle.feed($('#feed'), S);
  renderHero(S);
});

document.querySelector('.dm-hero').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.heroPick) pick = b.dataset.heroPick;
  else if (b.dataset.heroView) { view = b.dataset.heroView; try { localStorage.setItem('dmHeroView', view); } catch { /* private mode */ } }
  else if (b.dataset.heroEdit) { document.querySelector(`[data-edit="${CSS.escape(b.dataset.heroEdit)}"]`)?.click(); return; }
  else return;
  renderHero(state());
});
