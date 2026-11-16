// Phone lore (a section of the Journal tab): the entries the DM has shared from the Lore tab, by category.
import { $, onState, state } from '../client.js';
import { addSection, onTab } from './tabs.js';

const { esc } = Stage;
const CATS = { location: ['🏰', 'Locations'], dungeon: ['🕳', 'Dungeons'], npc: ['🧑', 'NPCs'], creature: ['🐾', 'Creatures'], item: ['🗡', 'Items'], book: ['📖', 'Books'], note: ['📝', 'Notes'] };
addSection('journal', 'lore', '📚 Lore');
const root = () => $('#tabLore');
let key = null;

function render() {
  const list = state()?.lore;
  if (!list || !root()) return;
  const k = JSON.stringify(list);
  if (k === key) return;
  key = k;
  const groups = Object.entries(CATS).map(([c, [icon, name]]) => {
    const items = list.filter((e) => e.cat === c).sort((a, b) => a.name.localeCompare(b.name));
    return items.length ? `<h4>${icon} ${name}</h4>${items.map((e) => `<details class="lore-entry"><summary><b>${esc(e.name)}</b></summary>${e.text ? `<p>${esc(e.text)}</p>` : ''}</details>`).join('')}` : '';
  }).join('');
  root().innerHTML = `<div class="card lore-phone"><h3>📚 Lore</h3>${groups || '<p class="note">Nothing yet. The DM shares places, people and things here as you learn about them.</p>'}</div>`;
}
onState(render);
onTab((id) => { if (id === 'lore') { key = null; render(); } });
