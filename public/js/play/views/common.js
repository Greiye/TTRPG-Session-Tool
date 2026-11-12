// Pieces shared by the exploration, social and combat phone views.
const { esc, checkBanner } = Stage;
export const fmt = (n) => { n = n ?? 0; return n >= 0 ? `+${n}` : `${n}`; };
export const skillButtons = (c, list) => `<div class="grid3">${list.map((k) => `<button class="btn" data-skill="${esc(k)}">${esc(k)}<br><small class="muted">${fmt(c.skills[k])}</small></button>`).join('')}</div>`;
export function checkPrompt(S, c) {
  const chk = S.check;
  if (!chk) return '';
  const done = chk.results[c.id];
  return `${checkBanner(S)}
    <button class="bigbtn" data-skill="${esc(chk.skill)}" ${done ? 'disabled' : ''}>${done ? `Rolled ${done.total}` : `🎲 Roll ${esc(chk.skill)} (${fmt(c.skills[chk.skill])})`}</button>`;
}
