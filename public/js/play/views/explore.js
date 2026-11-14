import { checkPrompt, skillButtons } from './common.js';

const { esc } = Stage;

// Dungeon nodes on a phone: the board (scrolls sideways when wide) and a button for each way onward.
function dungeonCard(S) {
  const d = S.dungeon;
  if (!d?.on || !d.nodes?.length || !window.Dungeon) return '';
  const here = d.nodes.find((n) => n.id === d.here);
  const next = here ? d.nodes.filter((n) => n.parents.includes(here.id)) : [];
  const cols = Math.max(...Dungeon.rows(d.nodes).map((r) => r.length));
  const ways = next.map((n) => (n.fog
    ? `<button class="btn" data-do="I take the unexplored way from the ${esc(here.name.toLowerCase())}.">❔ Unexplored way</button>`
    : `<button class="btn" data-do="I head to the ${esc(n.name.toLowerCase())}.">${Dungeon.ICON[n.kind] || '◆'} ${esc(n.name)}</button>`)).join('');
  return `<div class="card dg-phone-card">
    <h3>${here ? `⚑ ${esc(here.name)}` : 'The dungeon'}</h3>
    <div class="dg-scroll" style="--cols:${cols}">${Dungeon.board(d, { phone: true })}</div>
    ${ways ? `<p class="muted" style="margin:.6em 0 .3em">Ways onward</p><div class="grid2">${ways}</div>` : ''}
  </div>`;
}

export default function exploreView(S, c) {
  const sc = S.scene;
  const open = new Set(sc.revealed || []);
  return `<div class="card"><h3>${esc(sc.title)}</h3><p style="margin:0">${esc(sc.text)}</p></div>
    ${checkPrompt(S, c)}
    ${dungeonCard(S)}
    ${sc.poi.length ? `<div class="grid2">${sc.poi.map((p) => (p !== null && open.has(p) ? `<button class="btn" data-do="I investigate the ${esc(p.toLowerCase())}.">🔍 ${esc(p)}</button>` : '<button class="btn" disabled>☁ ???</button>')).join('')}</div>` : ''}
    ${skillButtons(c, S.rules.skillGroups.exploration)}`;
}
