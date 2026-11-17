// Character sheet on the phone (item 2): HP, abilities and skills (tap to roll), spell slots, class features
// (tap to read, hold 3 s to activate), hit dice, spells, languages, notes. Inventory has its own tab. Every change goes to the server at once, so the DM sees it live.
import { socket, $, onState, state, library } from '../client.js';
import { me } from './identity.js';
import { addTab, tab, onTab } from './tabs.js';
import { fmt } from './views/common.js';
import { openMoveBuilder } from './strike.js';

const { esc } = Stage;
const spells = library('spells');
const send = (patch) => socket.emit('player:sheet', patch);
const MOVE_WORD = { hit: 'hit', slash: 'slash', pierce: 'pierce', spell: 'spell', twin: 'two-press', twinslash: 'two-slash' };
const root = () => $('#tabSheet');
addTab('sheet', '📜 Sheet');

// Phase 4: condition icons and what they mean (press and hold a condition to read it).
const COND = {
  Blinded: ['🙈', 'Cannot see. Attacks against you have advantage, and yours have disadvantage.'],
  Charmed: ['💖', 'Cannot attack the charmer. The charmer has advantage on social checks against you.'],
  Deafened: ['🔇', 'Cannot hear. Fails checks that need hearing.'],
  Frightened: ['😱', 'Disadvantage on checks and attacks while the source is in sight. Cannot move closer to it.'],
  Grappled: ['✋', 'Speed is 0. Ends if the grappler is incapacitated or moved away.'],
  Incapacitated: ['😵', 'Cannot take actions or reactions.'],
  Invisible: ['👻', 'Cannot be seen without special sense. Attacks against you have disadvantage.'],
  Paralyzed: ['⚡', 'Incapacitated, cannot move or speak. Attacks against you have advantage; hits are critical within 5 ft.'],
  Petrified: ['🗿', 'Turned to stone. Incapacitated, resistant to all damage, unaware.'],
  Poisoned: ['☠️', 'Disadvantage on attack rolls and ability checks.'],
  Prone: ['🤕', 'Crawl only. Disadvantage on attacks. Melee attacks against you have advantage.'],
  Restrained: ['⛓️', 'Speed is 0. Attacks against you have advantage, and yours have disadvantage.'],
  Stunned: ['💫', 'Incapacitated, cannot move, speaks falteringly. Attacks against you have advantage.'],
  Unconscious: ['💤', 'Incapacitated, drops what it holds, falls prone. Hits within 5 ft are critical.'],
  Exhaustion: ['🥱', 'Levels of exhaustion slow you and weaken your rolls. Long rest removes one level.'],
};
const condChip = (x) => `<button class="chip cond" data-cond="${esc(x)}" aria-label="${esc(x)}, press and hold for details"><span aria-hidden="true">${(COND[x] || ['•'])[0]}</span><b>${esc(x)}</b></button>`;
// Ability hold-rolls: 450 ms press, 3 s cooldown per ability.
const HOLD_MS = 450, COOL_MS = 3000;
const cooldown = new Map();
// Class features: tap opens the description; its Activate button needs a 3 s press and hold.
const FEAT_HOLD_MS = 3000;
let openFeat = null; // feature name whose description is open
let featNote = ''; // last activation result
let featHolding = false; // no redraw while a thumb is on Activate

const chip = (label, value) => `<span class="chip"><small>${label}</small><b>${value}</b></span>`;
const pips = (level, s) => `<div class="slot-row"><span>Level ${level}</span><span class="pips">${Array.from({ length: s.max }, (_, i) => `<button class="pip ${i < s.max - s.used ? 'full' : ''}" data-slot="${level}" data-i="${i}" aria-label="Level ${level} slot ${i + 1}, ${i < s.max - s.used ? 'available' : 'used'}"></button>`).join('')}</span></div>`;

// Class features as buttons. The open one shows its description, uses left and the hold-to-activate button.
function featuresHtml(c) {
  const list = c.features || [];
  if (!list.length) return '';
  return `<div class="card"><h3>Class features <span class="note">tap to read · hold Activate for 3 s</span></h3>
    <div class="feat-grid">${list.map((f) => { const left = Math.max(0, f.max - (c.uses?.[f.name] || 0)); return `<button class="btn feat ${openFeat === f.name ? 'on' : ''} ${left ? '' : 'spent'}" data-feat="${esc(f.name)}" aria-expanded="${openFeat === f.name}">${esc(f.name)}<small>${left} / ${f.max}${f.pool ? ' pts' : ''}</small></button>`; }).join('')}</div>
    ${list.filter((f) => f.name === openFeat).map((f) => { const left = Math.max(0, f.max - (c.uses?.[f.name] || 0)); return `<div class="feat-desc">
      <p>${esc(f.text || 'No description yet. Ask your DM.')}</p>
      <p class="note">${left} of ${f.max}${f.pool ? ' points' : ' uses'} left · refills on a ${esc(f.reset)} rest</p>
      <button class="bigbtn feat-go" data-feat-go="${esc(f.name)}" ${left ? '' : 'disabled'} aria-label="Activate ${esc(f.name)}, press and hold for 3 seconds"><span class="feat-fill"></span><span class="feat-label">${left ? 'Hold to activate' : 'No uses left'}</span></button>
      ${featNote ? `<p class="note" role="status">${esc(featNote)}</p>` : ''}
    </div>`; }).join('')}
  </div>`;
}

function render() {
  const S = state();
  const c = S?.players.find((p) => p.id === me.charId);
  if (!c || tab() !== 'sheet' || featHolding) return;
  // Don't redraw under the player's thumb while they type.
  const a = document.activeElement;
  if (a && root().contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
  const d = c.derived || { mods: {}, saves: {}, passive: {}, prof: 0 };
  const R = S.rules;
  const slots = Object.entries(c.slots || {});
  const known = (c.spells || []).map((id) => spells.byId(id)).filter(Boolean).sort((x, y) => x.level - y.level || x.name.localeCompare(y.name));
  const open = new Set([...root().querySelectorAll('details[open]')].map((x) => x.dataset.k));
  root().innerHTML = `
    <div class="card"><h3>Hit points</h3>
      <div class="hp-ctl"><button class="btn" data-hp="-5">−5</button><button class="btn" data-hp="-1">−1</button>${Stage.numbersHidden(S) ? `<b class="hp-word">${esc(Stage.hpWord(c.hp, c.maxHp))}</b>` : `<b>${c.hp}<small> / ${c.maxHp}</small></b>`}<button class="btn" data-hp="1">+1</button><button class="btn" data-hp="5">+5</button></div>
      <div class="row"><span class="muted">Temporary HP</span><button class="btn small" data-temp="-1">−</button><b>${c.tempHp || 0}</b><button class="btn small" data-temp="1">+</button><button class="btn small" data-temp="5">+5</button></div>
      <div class="chips">${chip(esc(R.defenseLabel), c.ac)}${chip('Speed', `${c.speed ?? 30} ft`)}${d.prof ? chip('Proficiency', fmt(d.prof)) : ''}${chip('Initiative', fmt(c.init))}${chip('Passive 👁', d.passive.Perception ?? d.passive.Instinct ?? 10)}</div>
    </div>
    ${R.abilities.length ? `<div class="card"><h3>Abilities <span class="note">score · modifier · save · press and hold to roll</span></h3><div class="ab-grid">${R.abilities.map(([k, label]) => `<div class="ab ${cooldown.has(k) && cooldown.get(k) > Date.now() ? 'cool' : ''}" data-ab="${esc(k)}" data-ab-label="${esc(label)}" aria-label="${esc(label)} check, press and hold"><small>${esc(label.slice(0, 3).toUpperCase())}</small><b>${c.abilities?.[k] ?? 10}</b><span>${fmt(d.mods[k])}</span><small>save ${fmt(d.saves[k])}</small></div>`).join('')}</div></div>` : ''}
    <div class="card"><h3>Skills <span class="note">tap to roll</span></h3><div class="sk-grid">${R.skills.map((k) => `<button class="sk" data-skill="${esc(k)}">${esc(k)} <b>${fmt(c.skills[k])}</b></button>`).join('')}</div></div>
    ${slots.length ? `<div class="card"><h3>Spell slots <span class="note">tap to use or restore</span></h3>${slots.map(([l, s]) => pips(l, s)).join('')}</div>` : ''}
    ${featuresHtml(c)}
    ${c.hitDice?.die ? `<div class="card"><h3>Hit dice</h3><div class="row"><b>${c.level - (c.hitDice.used || 0)} / ${c.level}</b><span class="muted">d${c.hitDice.die}</span><span class="grow"></span><button class="btn small" data-hd="1">Use one</button><button class="btn small" data-hd="-1">Restore one</button></div></div>` : ''}
    ${R.slotLevels ? `<div class="card"><h3>Spells</h3>
      ${known.map((s) => `<details data-k="${esc(s.id)}" ${open.has(s.id) ? 'open' : ''}><summary><b>${esc(s.name)}</b> <small class="muted">${s.level ? `level ${s.level}` : 'cantrip'}${s.concentration ? ' · conc.' : ''}</small></summary>
        <p class="note">${esc([s.school, s.time, s.range, s.components, s.duration].filter(Boolean).join(' · '))}</p><p>${esc(s.text)}</p>${s.higher ? `<p class="note">${esc(s.higher)}</p>` : ''}<button class="btn small danger" data-spell-del="${esc(s.id)}">Forget</button></details>`).join('') || '<p class="note">No spells on your sheet yet.</p>'}
      <form class="row" id="spellForm"><input id="spellAdd" class="grow" list="spellList" placeholder="Add a spell by name"><datalist id="spellList">${spells.items.filter((s) => !(c.spells || []).includes(s.id)).map((s) => `<option value="${esc(s.name)}">`).join('')}</datalist><button class="btn">Add</button></form>
    </div>` : ''}
    ${(c.conditions || []).length ? `<div class="card"><h3>Conditions</h3><div class="chips">${c.conditions.map(condChip).join('')}</div><p class="note">The DM sets these. Press and hold one for what it does.</p><p class="cond-info" id="condInfo" aria-live="polite"></p></div>` : ''}
    ${['stamina', 'mana'].filter((k) => c[k]?.max > 0).map((k) => `<div class="card"><h3>${k === 'stamina' ? 'Stamina' : 'Mana'}</h3><div class="hp-ctl"><button class="btn" data-res="${k}" data-d="-1">−1</button><b>${c[k].cur}<small> / ${c[k].max}</small></b><button class="btn" data-res="${k}" data-d="1">+1</button></div></div>`).join('')}
    <div class="card moves"><h3>Special moves <span class="note">chains for the strike pop-up</span></h3>
      ${(c.moves || []).map((m, i) => `<div class="row move-row"><b>Move ${i + 1}</b><span class="muted grow">${m.steps.map((s) => MOVE_WORD[s.k] || s.k).join(', ')}</span><button class="btn small" data-move-edit="${i}">Edit</button><button class="btn small danger" data-move-del="${i}" aria-label="Delete move ${i + 1}">✕</button></div>`).join('') || '<p class="note">No moves yet. Lay out a chain of hits, slashes, pierces, spell runes and two-finger steps, then pick it when you strike. Name it out loud at the table.</p>'}
      ${(c.moves || []).length < 6 ? '<button class="btn small" data-move-new="1">＋ New move</button>' : ''}
    </div>
    <div class="card"><h3>Languages</h3><div class="chips">${(c.languages || []).map((l) => `<span class="chip"><b>${esc(l)}</b></span>`).join('') || '<span class="note">None</span>'}</div><p class="note">The DM sets the languages you know.</p></div>
    <div class="card"><h3>Notes</h3><textarea id="sheetNotes" rows="4" maxlength="4000" placeholder="Private notes. Only you and the DM can read these.">${esc(c.notes || '')}</textarea></div>`;
}
onState(render);
onTab(render);
spells.onChange(render);

const mine = () => state()?.players.find((p) => p.id === me.charId);
root().addEventListener('click', (e) => {
  const b = e.target.closest('button');
  const c = mine();
  if (!b || !c) return;
  const d = b.dataset;
  if (d.hp) send({ hp: Math.max(0, Math.min(c.maxHp, c.hp + Number(d.hp))) });
  else if (d.temp) send({ tempHp: Math.max(0, (c.tempHp || 0) + Number(d.temp)) });
  else if (d.slot) { const s = c.slots[d.slot]; send({ slot: { level: d.slot, used: b.classList.contains('full') ? s.used + 1 : s.used - 1 } }); }
  else if (d.hd) send({ hitDiceUsed: (c.hitDice.used || 0) + Number(d.hd) });
  else if (d.skill) socket.emit('player:check', { skill: d.skill }); // answers the DM's call if it matches, else a free roll
  else if (d.feat) { openFeat = openFeat === d.feat ? null : d.feat; featNote = ''; render(); }
  else if (d.spellDel) send({ spells: c.spells.filter((x) => x !== d.spellDel) });
  else if (d.moveNew) openMoveBuilder(c);
  else if (d.moveEdit) openMoveBuilder(c, Number(d.moveEdit));
  else if (d.moveDel) send({ moves: c.moves.filter((_, i) => i !== Number(d.moveDel)) });
  else if (d.res) send({ [d.res]: { cur: Math.max(0, Math.min(c[d.res].max, c[d.res].cur + Number(d.d))) } });
  else return;
  navigator.vibrate?.(20);
});

// Press and hold: an ability rolls a d20 check after a short hold (haptic on the roll, then a cooldown);
// a condition shows what it does with a light flash and a buzz.
let holdTimer = null, holdEl = null;
const cancelHold = () => { clearTimeout(holdTimer); holdEl?.classList.remove('holding'); holdEl = null; };
root().addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-ab],[data-cond]');
  if (!el || el.classList.contains('cool')) return;
  cancelHold();
  holdEl = el;
  el.classList.add('holding');
  holdTimer = setTimeout(() => {
    el.classList.remove('holding');
    holdEl = null;
    if (el.dataset.ab) return rollAbility(el);
    showCondition(el.dataset.cond);
  }, HOLD_MS);
});
['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => root().addEventListener(t, cancelHold));
document.addEventListener('pointerup', cancelHold);

// Activate a class feature: press and hold the button for 3 s. The fill bar shows progress; letting go early cancels.
let featTimer = null, featEl = null;
function startFeat(el) {
  if (featEl || el.disabled) return;
  featEl = el;
  featHolding = true;
  el.classList.add('holding');
  el.addEventListener('pointerleave', stopFeat, { once: true }); // sliding off the button cancels
  navigator.vibrate?.(15);
  featTimer = setTimeout(() => {
    const name = el.dataset.featGo;
    featEl = null;
    featHolding = false;
    el.classList.remove('holding');
    el.classList.add('fired');
    navigator.vibrate?.([40, 30, 80]);
    socket.emit('player:feature', { name }, (r) => {
      featNote = r?.error || `${name} activated. The table has been told.`;
      setTimeout(render, 350); // let the flash play first
    });
  }, FEAT_HOLD_MS);
}
function stopFeat() {
  if (!featEl) return;
  clearTimeout(featTimer);
  featEl.classList.remove('holding');
  featEl = null;
  featHolding = false;
  render();
}
root().addEventListener('pointerdown', (e) => { const el = e.target.closest('[data-feat-go]'); if (el) { e.preventDefault(); startFeat(el); } });
root().addEventListener('keydown', (e) => { const el = e.target.closest?.('[data-feat-go]'); if (el && (e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); startFeat(el); } });
root().addEventListener('keyup', (e) => { if (e.target.closest?.('[data-feat-go]')) stopFeat(); });
['pointerup', 'pointercancel'].forEach((t) => document.addEventListener(t, stopFeat));
root().addEventListener('contextmenu', (e) => { if (e.target.closest('[data-feat-go],[data-ab],[data-cond]')) e.preventDefault(); });

function rollAbility(el) {
  const c = mine();
  const k = el.dataset.ab;
  const mod = c?.derived?.mods?.[k] ?? 0;
  socket.emit('player:roll', { expr: `1d20${mod >= 0 ? '+' : ''}${mod}`, label: `${el.dataset.abLabel} check` });
  cooldown.set(k, Date.now() + COOL_MS);
  navigator.vibrate?.([30, 40, 30]);
  el.classList.add('cool');
  setTimeout(() => { cooldown.delete(k); el.classList.remove('cool'); }, COOL_MS);
}

function showCondition(name) {
  const [icon, text] = COND[name] || ['•', 'The DM set this condition.'];
  const info = $('#condInfo');
  if (info) info.innerHTML = `<b>${icon} ${esc(name)}.</b> ${esc(text)}`;
  const f = document.createElement('div');
  f.className = 'cond-flash';
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 400);
  navigator.vibrate?.(60);
}
root().addEventListener('submit', (e) => {
  e.preventDefault();
  const c = mine();
  if (!c) return;
  if (e.target.id === 'spellForm') {
    const q = $('#spellAdd').value.trim().toLowerCase();
    const s = spells.items.find((x) => x.name.toLowerCase() === q) || spells.items.find((x) => x.name.toLowerCase().startsWith(q));
    if (q && s) send({ spells: [...(c.spells || []), s.id] });
  }
  document.activeElement?.blur();
});
root().addEventListener('change', (e) => { if (e.target.id === 'sheetNotes') send({ notes: e.target.value }); });
