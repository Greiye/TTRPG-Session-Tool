import { checkPrompt, skillButtons } from './common.js';

const { esc } = Stage;
export default function exploreView(S, c) {
  const sc = S.scene;
  const open = new Set(sc.revealed || []);
  return `<div class="card"><h3>${esc(sc.title)}</h3><p style="margin:0">${esc(sc.text)}</p></div>
    ${checkPrompt(S, c)}
    ${sc.poi.length ? `<div class="grid2">${sc.poi.map((p) => (open.has(p) ? `<button class="btn" data-do="I investigate the ${esc(p.toLowerCase())}.">🔍 ${esc(p)}</button>` : '<button class="btn" disabled>☁ ???</button>')).join('')}</div>` : ''}
    ${skillButtons(c, S.rules.skillGroups.exploration)}`;
}
