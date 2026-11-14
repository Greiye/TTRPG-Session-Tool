import { checkPrompt } from './common.js';

const { esc } = Stage;
const shownPoi = new Set(); // points of interest already on this phone; a newly revealed one pops in once

// Dungeon nodes on a phone: the board (scrolls sideways when wide) and a button for each way onward.
function dungeonCard(S) {
  const d = S.dungeon;
  if (!d?.on || !d.nodes?.length || !window.Dungeon) return '';
  const here = d.nodes.find((n) => n.id === d.here);
  const next = here ? d.nodes.filter((n) => n.parents.includes(here.id)) : [];
  const ways = next.map((n) => (n.fog
    ? `<button class="btn" data-do="I take the unexplored way from the ${esc(here.name.toLowerCase())}.">❔ Unexplored way</button>`
    : `<button class="btn" data-do="I head to the ${esc(n.name.toLowerCase())}.">${Dungeon.ICON[n.kind] || '◆'} ${esc(n.name)}</button>`)).join('');
  return `<div class="card dg-phone-card">
    <h3>${here ? `⚑ ${esc(here.name)}` : 'The dungeon'}</h3>
    <div class="dg-scroll">${Dungeon.board(d, { phone: true })}</div>
    ${ways ? `<p class="muted" style="margin:.6em 0 .3em">Ways onward</p><div class="grid2">${ways}</div>` : ''}
  </div>`;
}

// The scene description is on the TV only. Points of interest appear once the DM reveals them, so the
// phone gives nothing away (no "???" placeholders to count). Skill rolls live on the Sheet tab.
export default function exploreView(S, c) {
  const sc = S.scene;
  const open = new Set(sc.revealed || []);
  const pois = (sc.poi || []).filter((p) => p !== null && open.has(p));
  const html = `${checkPrompt(S, c)}
    ${dungeonCard(S)}
    ${pois.length ? `<div class="card"><h3>Points of interest</h3><div class="grid2 poi-grid">${pois.map((p) => `<button class="btn ${shownPoi.has(p) ? '' : 'poi-in'}" data-do="I investigate the ${esc(p.toLowerCase())}.">🔍 ${esc(p)}</button>`).join('')}</div></div>` : ''}`;
  pois.forEach((p) => shownPoi.add(p));
  return html;
}
