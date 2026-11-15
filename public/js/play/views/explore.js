import { checkPrompt } from './common.js';

const { esc } = Stage;
const shownPoi = new Set(); // points of interest already on this phone; a newly revealed one pops in once

// The scene description, the world map's dungeon and its rooms are on the TV only (Mike, Nov 15). Points of interest appear once the DM reveals them, so the
// phone gives nothing away (no "???" placeholders to count). Skill rolls live on the Sheet tab.
export default function exploreView(S, c) {
  const sc = S.scene;
  const open = new Set(sc.revealed || []);
  const pois = (sc.poi || []).filter((p) => p !== null && open.has(p));
  const html = `${checkPrompt(S, c)}
    ${pois.length ? `<div class="card"><h3>Points of interest</h3><div class="grid2 poi-grid">${pois.map((p) => `<button class="btn ${shownPoi.has(p) ? '' : 'poi-in'}" data-do="I investigate the ${esc(p.toLowerCase())}.">🔍 ${esc(p)}</button>`).join('')}</div></div>` : ''}`;
  pois.forEach((p) => shownPoi.add(p));
  return html;
}
