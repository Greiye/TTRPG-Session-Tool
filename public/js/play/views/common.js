// Pieces shared by the exploration, social and combat phone views.
const { esc, checkBanner } = Stage;
export const fmt = (n) => { n = n ?? 0; return n >= 0 ? `+${n}` : `${n}`; };
export function checkPrompt(S, c) {
  const chk = S.check;
  if (!chk) return '';
  const done = chk.results[c.id];
  return `${checkBanner(S)}
    <button class="bigbtn" data-skill="${esc(chk.skill)}" ${done ? 'disabled' : ''}>${done ? `Rolled ${done.total}` : `🎲 Roll ${esc(chk.skill)} (${fmt(c.skills[chk.skill])})`}</button>`;
}
