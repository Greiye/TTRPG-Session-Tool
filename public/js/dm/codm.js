// Co-DM invites (each QR carries a helper key, so it's only shown here) and connection counts.
// Atmosphere co-DM: /codm. Battle and Social Masters: the DM page with only their cards (src/roles.js).
import { $, onState } from '../client.js';
import { dmKey } from './auth.js';

const keyQs = dmKey() ? `key=${encodeURIComponent(dmKey())}&` : '';

for (const role of ['codm', 'battle', 'social']) {
  let loaded = false;
  const btn = role === 'codm' ? $('#codmToggle') : $(`[data-invite="${role}"]`);
  // Fetched on first open: a Battle or Social Master's page gets a 403 here and never shows this card anyway.
  btn.onclick = () => {
    const box = $(`#${role}Invite`);
    box.hidden = !box.hidden;
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
});
