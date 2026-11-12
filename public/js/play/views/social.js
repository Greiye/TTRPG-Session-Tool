import { checkPrompt, skillButtons } from './common.js';

const { esc, vn } = Stage;
export default function socialView(S, c) {
  return `<div class="vn-mini">${vn(S, { compact: true })}</div>
    ${checkPrompt(S, c)}
    ${S.social.choices.length ? `<div class="list">${S.social.choices.map((x, i) => `<button class="btn" style="text-align:left;padding:12px" data-choice="${i}">💬 ${esc(x)}</button>`).join('')}</div>` : ''}
    ${skillButtons(c, S.rules.skillGroups.social)}`;
}
