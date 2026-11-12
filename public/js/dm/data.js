// Campaign data exchange with Arthuria: bundle export/import and the session transcript.
import { $ } from '../client.js';
import { dmKey } from './auth.js';

const qs = dmKey() ? `?key=${encodeURIComponent(dmKey())}` : '';
$('#exportBtn').href = `/api/export${qs}`;
$('#transcriptBtn').href = `/api/transcript.md${qs}`;
$('#importIn').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const status = (t) => { $('#dataStatus').textContent = t; };
  try {
    status('Importing…');
    const res = await fetch('/api/import', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dm-key': dmKey() }, body: await file.text() });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error || res.status);
    status(`Imported ${out.characters} characters, ${out.entities} entries${out.skipped.length ? `, skipped ${out.skipped.length}` : ''}.`);
    if (out.skipped.length) console.warn('Skipped on import:', out.skipped);
  } catch (err) {
    status(`Import failed: ${err.message}`);
  }
};
