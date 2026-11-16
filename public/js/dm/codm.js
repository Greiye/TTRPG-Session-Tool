// Co-DM invites (each QR carries a helper key, so it's only shown here) and connection counts.
// Co-DM: a second DM. Battle and Social Masters: the DM page with only their cards (src/roles.js).
import { $, onState } from '../client.js';
import { dmKey } from './auth.js';

const keyQs = dmKey() ? `key=${encodeURIComponent(dmKey())}&` : '';
for (const role of ['codm', 'battle', 'social', 'music']) {
  let loaded = false;
  const btn = $(`[data-invite="${role}"]`);
  // Fetched on first open: a Battle or Social Master's page gets a 403 here and never shows this card anyway.
  btn.onclick = () => {
    const box = $(`#${role}Invite`);
    box.hidden = !box.hidden;
    btn.setAttribute('aria-expanded', String(!box.hidden));
    btn.textContent = box.hidden ? 'Invite' : 'Hide';
    if (loaded) return;
    loaded = true;
    $(`#${role}Qr`).src = `/codm-qr.svg?${keyQs}role=${role}`;
    fetch(`/api/codm-url?${keyQs}role=${role}`).then((r) => r.json()).then(({ url }) => { $(`#${role}Url`).textContent = url; }).catch(() => {});
  };
}
const count = (n) => (n ? `🟢 ${n} connected` : 'not connected');
onState((s) => {
  $('#codmCount').textContent = count(s.codms);
  $('#battleCount').textContent = count(s.masters?.battle);
  $('#socialCount').textContent = count(s.masters?.social);
  $('#musicCount').textContent = count(s.masters?.music);
});
