import { checkPrompt } from './common.js';

const { esc } = Stage;
// The visual novel is on the TV only (Mike, Nov 16): the phone points there, and keeps roll prompts,
// pushed choices and a way back into the "Join the conversation" speech box.
export default function socialView(S, c) {
  const convo = S.social.convo || {};
  const live = convo.live && !convo.ending;
  return `<div class="card social-watch">
      <p class="social-watch-eye" aria-hidden="true">📺</p>
      <p>${convo.ending ? 'The conversation has concluded.' : live ? 'The conversation is on the TV. Look up!' : 'The DM is setting up a conversation…'}</p>
      ${live ? '<button class="btn primary" data-convo-join>💬 Join the conversation</button>' : ''}
    </div>
    ${checkPrompt(S, c)}
    ${live && S.social.choices.length ? `<div class="list">${S.social.choices.map((x, i) => `<button class="btn" style="text-align:left;padding:12px" data-choice="${i}">💬 ${esc(x)}</button>`).join('')}</div>` : ''}`;
}
