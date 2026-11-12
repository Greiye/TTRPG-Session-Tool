// Co-DM invite (the QR carries the co-DM key, so it's only shown here) and connection count.
import { $, onState } from '../client.js';
import { dmKey } from './auth.js';

const keyQs = dmKey() ? `?key=${encodeURIComponent(dmKey())}` : '';
$('#codmQr').src = `/codm-qr.svg${keyQs}`;
fetch(`/api/codm-url${keyQs}`).then((r) => r.json()).then(({ url }) => { $('#codmUrl').textContent = url; }).catch(() => {});
$('#codmToggle').onclick = () => { $('#codmInvite').hidden = !$('#codmInvite').hidden; };
onState((s) => { $('#codmCount').textContent = s.codms ? `🟢 ${s.codms} connected` : 'not connected'; });
