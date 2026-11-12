// Live mode switch, panel visibility, session reset.
import { $$, emit, onState, onClick } from '../client.js';

onState((s) => {
  $$('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === s.mode));
  $$('[data-panel]').forEach((p) => { p.hidden = !p.dataset.panel.split(' ').includes(s.mode); });
});
onClick('mode', (mode) => emit('dm:mode', { mode }));
onClick('act', (act) => { if (act === 'reset' && confirm('Reset log, remove enemies and heal the party?')) emit('dm:reset'); });
