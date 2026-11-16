// Conditions on a portrait (Mike, Nov 16): the hero column shows each condition as a small round button on
// the bottom right of the portrait, for party members and for creatures picked on the 3D map. Clicking a badge,
// or right-clicking the portrait's badge row, opens the conditions menu: toggle any condition (for a set number
// of rounds or until cleared) and start or drop concentration. This replaces the Conditions card.
import { emit, state } from '../client.js';
import { openMenu } from '../ctxmenu.js';

export const CONDS = ['Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious', 'Exhaustion'];
export const ICONS = { Blinded: '🙈', Charmed: '💘', Deafened: '🔇', Frightened: '😱', Grappled: '🤼', Incapacitated: '💤', Invisible: '👻', Paralyzed: '⚡', Petrified: '🗿', Poisoned: '🤢', Prone: '🛌', Restrained: '⛓', Stunned: '🌀', Unconscious: '😵', Exhaustion: '🥱' };
const LASTS = [[0, 'Until cleared'], [1, '1 round'], [3, '3 rounds'], [10, '10 rounds']];
const MAX = 4; // badges before a "+N"
let lasts = 0; // rounds the next condition lasts (0 = until cleared); kept while the laptop page is open
const seen = new Map(); // unit id -> badge keys already drawn, so only a new badge pops in

const esc = (t) => Stage.esc(String(t ?? ''));
const unit = (S, id) => S?.players.find((p) => p.id === id) || S?.combat.enemies.find((e) => e.id === id) || null;
const timersOf = (S, id) => (S?.timers || []).filter((t) => t.charId === id);

// The badge row for one character or creature: one button per condition, the concentration spell, and a faint
// "+" when there is nothing yet so the DM can still open the menu.
export function badges(x, S) {
  if (!x) return '';
  const timers = timersOf(S, x.id);
  const conc = timers.find((t) => t.kind === 'concentration');
  const list = (x.conditions || []).map((n) => {
    const t = timers.find((tt) => tt.kind !== 'concentration' && tt.name === n);
    return { icon: ICONS[n] || '❔', title: `${n}${t ? ` · ${t.rounds} round${t.rounds === 1 ? '' : 's'} left` : ''}`, key: n };
  });
  if (conc) list.push({ icon: '🔮', title: `Concentrating on ${conc.name}`, key: 'conc' });
  const shown = list.slice(0, MAX);
  const before = seen.get(x.id) || new Set(list.map((b) => b.key)); // first draw: no pop
  seen.set(x.id, new Set(list.map((b) => b.key)));
  const more = list.length - shown.length;
  const btns = shown.map((b) => `<button type="button" class="cond-badge${before.has(b.key) ? '' : ' new'}" data-cond-open="${esc(x.id)}" data-cond-key="${esc(b.key)}" title="${esc(b.title)} (click or right-click to edit)" aria-label="${esc(b.title)}">${b.icon}</button>`).join('')
    + (more > 0 ? `<button type="button" class="cond-badge more" data-cond-open="${esc(x.id)}" title="${more} more" aria-label="${more} more conditions">+${more}</button>` : '')
    + (list.length ? '' : `<button type="button" class="cond-badge add" data-cond-open="${esc(x.id)}" title="Add a condition (click or right-click)" aria-label="Add a condition">+</button>`);
  return `<div class="cond-badges" data-cond-unit="${esc(x.id)}">${btns}</div>`;
}

// The menu for one character or creature. Rebuilds on every state change while open.
export function condMenu(id) {
  const S = state();
  const x = unit(S, id);
  if (!x) return null;
  const conds = x.conditions || [];
  const timers = timersOf(S, id);
  const conc = timers.find((t) => t.kind === 'concentration');
  const left = (n) => timers.find((t) => t.kind !== 'concentration' && t.name === n)?.rounds;
  return {
    title: `${x.name}: conditions`,
    sub: conds.length ? conds.map((n) => (left(n) ? `${n} (${left(n)})` : n)).join(', ') : 'No conditions',
    sections: [
      { h: 'Conditions', row: true, items: CONDS.map((n) => ({
        label: `${ICONS[n]} ${n}`, on: conds.includes(n), keep: true, title: left(n) ? `${left(n)} rounds left` : '',
        run: () => {
          if (conds.includes(n)) emit('dm:condition', { id, name: n, on: false });
          else if (lasts > 0) emit('dm:timer:condition', { id, name: n, rounds: lasts });
          else emit('dm:condition', { id, name: n, on: true });
        },
      })) },
      { h: 'A new condition lasts', row: true, items: LASTS.map(([r, label]) => ({ label, on: lasts === r, keep: true, run: () => { lasts = r; } })) },
      { h: 'Concentration', items: [
        conc
          ? { label: `🔮 Drop concentration (${conc.name})`, run: () => emit('dm:concentrate:drop', { id }) }
          : { label: '🔮 Concentrate on a spell…', run: () => {
            const spell = (prompt(`Spell ${x.name} concentrates on`, '') || '').trim().slice(0, 60);
            if (spell) emit('dm:concentrate', { id, spell });
          } },
      ] },
    ],
    rebuild: () => condMenu(id),
  };
}

// Click a badge: the menu opens under the badge row.
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-cond-open]');
  const spec = b && condMenu(b.dataset.condOpen);
  if (!spec) return;
  e.stopPropagation();
  const r = b.getBoundingClientRect();
  openMenu({ ...spec, x: r.left, y: r.bottom + 4 });
}, true);
