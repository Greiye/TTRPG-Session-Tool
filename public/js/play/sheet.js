// Character sheet on the phone (item 2): HP, abilities and skills (press and hold to roll), class features
// (tap to read, hold 3 s to activate, effects automated), hit dice, special moves, languages, notes.
// Nov 21 (Mike): the DM is the only one who changes stats and health. Players keep notes, name their moves and
// set the languages they know. Spells have their own tab, shown to spellcasters only. Inventory has its own tab.
import { socket, $, onState, state, library } from '../client.js';
import { me } from './identity.js';
import { addTab, tab, onTab, setTabOn } from './tabs.js';
import { fmt } from './views/common.js';
import { openMoveBuilder } from './strike.js';
import { openHitDice } from './hitdice.js';

const { esc } = Stage;
const spells = library('spells');
const send = (patch) => socket.emit('player:sheet', patch);
const MOVE_WORD = { hit: 'hit', slash: 'slash', pierce: 'pierce', spell: 'spell', twin: 'two-press', twinslash: 'two-slash' };
const root = () => $('#tabSheet');
addTab('sheet', '📜 Sheet');
addTab('spells', '✨ Spells');
setTabOn('spells', false); // spellcasters only (Nov 21)
const spellRoot = () => $('#tabSpells');

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
const openSpells = new Set(); // spell cards showing their rules
let openFeat = null; // feature name whose description is open
let featNote = ''; // last activation result
let featHolding = false; // no redraw while a thumb is on Activate

const chip = (label, value) => `<span class="chip"><small>${label}</small><b>${value}</b></span>`;
const pips = (level, s) => `<div class="slot-row"><span>Level ${level}</span><span class="pips">${Array.from({ length: s.max }, (_, i) => `<i class="pip ${i < s.max - s.used ? 'full' : ''}" role="img" aria-label="Level ${level} slot ${i + 1}, ${i < s.max - s.used ? 'available' : 'used'}"></i>`).join('')}</span></div>`;

// Class features as buttons. The open one shows its description, uses left and the hold-to-activate button.
function featuresHtml(c) {
  const list = c.features || [];
  if (!list.length) return '';
  // Each feature is a card (Nov 24): tap to flip it to its rules, the uses left and the hold-to-activate button.
  const card = (f) => {
    const left = Math.max(0, f.max - (c.uses?.[f.name] || 0));
    const count = `${left} / ${f.max}`;
    if (f.name !== openFeat) return `<button class="flip feat ${left ? '' : 'spent'}" data-feat="${esc(f.name)}" aria-expanded="false"><b>${esc(f.name)}</b><small>${count}</small></button>`;
    return `<div class="flip back feat-desc" data-flip="${esc(f.name)}"><button class="flip-head" data-feat="${esc(f.name)}" aria-expanded="true"><span>${esc(f.name)}</span><small>${count}</small></button>
      <p>${esc(f.text || 'No description yet. Ask your DM.')}</p>
      <p class="note">${left} of ${f.max}${f.pool ? ' points' : ' uses'} left · refills on a ${esc(f.reset)} rest${f.auto ? ' · takes effect by itself' : ''}</p>
      <button class="bigbtn feat-go" data-feat-go="${esc(f.name)}" ${left ? '' : 'disabled'} aria-label="Activate ${esc(f.name)}, press and hold for 3 seconds"><span class="feat-fill"></span><span class="feat-label">${left ? 'Hold to activate' : 'No uses left'}</span></button>
      ${featNote ? `<p class="note" role="status">${esc(featNote)}</p>` : ''}</div>`;
  };
  return `<div class="card"><h3>Class features <span class="note">tap a card to flip it · hold Activate for 3 s</span></h3><div class="flip-grid">${list.map(card).join('')}</div></div>`;
}
// Turn a face in once, on the tap that flipped it (a redraw never replays it). Under Reduce it fades.
function turn(root_, attr, name) { const el = [...root_.querySelectorAll(`[${attr}]`)].find((x) => x.getAttribute(attr) === name); if (el) window.Anim?.play(el.closest('.flip') || el, 'flip', null); }

// Spells tab (Nov 21): only for characters with spell slots or spells; the DM keeps both up to date.
function renderSpells(S, c) {
  setTabOn('spells', !!c.caster);
  if (!c.caster || tab() !== 'spells') return;
  const a = document.activeElement;
  if (a && spellRoot().contains(a) && a.tagName === 'INPUT') return;
  const slots = Object.entries(c.slots || {});
  const known = (c.spells || []).map((id) => spells.byId(id)).filter(Boolean).sort((x, y) => x.level - y.level || x.name.localeCompare(y.name));
  spellRoot().innerHTML = `
    ${slots.length ? `<div class="card"><h3>Spell slots <span class="note">your DM marks them</span></h3>${slots.map(([l, x]) => pips(l, x)).join('')}</div>` : ''}
    <div class="card"><h3>Spells</h3>
      ${known.length ? `<div class="flip-grid">${known.map((x) => {
        const sub = `${x.level ? `level ${x.level}` : 'cantrip'}${x.concentration ? ' · conc.' : ''}`;
        if (!openSpells.has(x.id)) return `<button class="flip" data-spell="${esc(x.id)}" aria-expanded="false"><b>${esc(x.name)}</b><small class="muted">${sub}</small></button>`;
        return `<div class="flip back"><button class="flip-head" data-spell="${esc(x.id)}" aria-expanded="true"><span>${esc(x.name)}</span><small class="muted">${sub}</small></button>
          <p class="note">${esc([x.school, x.time, x.range, x.components, x.duration].filter(Boolean).join(' · '))}</p><p>${esc(x.text)}</p>${x.higher ? `<p class="note">${esc(x.higher)}</p>` : ''}<button class="btn small danger" data-spell-del="${esc(x.id)}">Forget</button></div>`;
      }).join('')}</div>` : '<p class="note">No spells on your sheet yet.</p>'}
      <form class="row" id="spellForm"><input id="spellAdd" class="grow" list="spellList" placeholder="Add a spell by name"><datalist id="spellList">${spells.items.filter((x) => !(c.spells || []).includes(x.id)).map((x) => `<option value="${esc(x.name)}">`).join('')}</datalist><button class="btn">Add</button></form>
    </div>`;
}
// Spells tab: add a spell by name, or forget one (the slots stay with the DM).
spellRoot().addEventListener('click', (e) => {
  const flip = e.target.closest('[data-spell]');
  if (flip && state()) {
    const id = flip.dataset.spell;
    if (openSpells.has(id)) openSpells.delete(id); else openSpells.add(id);
    renderSpells(state(), mine());
    turn(spellRoot(), 'data-spell', id);
    navigator.vibrate?.(20);
    return;
  }
  const b = e.target.closest('[data-spell-del]');
  const c = mine();
  if (b && c) send({ spells: c.spells.filter((x) => x !== b.dataset.spellDel) });
});
spellRoot().addEventListener('submit', (e) => {
  e.preventDefault();
  const c = mine();
  const q = $('#spellAdd').value.trim().toLowerCase();
  const x = q && (spells.items.find((y) => y.name.toLowerCase() === q) || spells.items.find((y) => y.name.toLowerCase().startsWith(q)));
  if (c && x) send({ spells: [...(c.spells || []), x.id] });
  document.activeElement?.blur();
});

function render() {
  const S = state();
  const c = S?.players.find((p) => p.id === me.charId);
  if (!c) return;
  renderSpells(S, c);
  if (tab() !== 'sheet' || featHolding) return;
  // Don't redraw under the player's thumb while they type.
  const a = document.activeElement;
  if (a && root().contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
  const d = c.derived || { mods: {}, saves: {}, passive: {}, prof: 0 };
  const R = S.rules;
  const moves = c.moves || [];
  const langs = (c.languages || []);
  const suggest = (R.languages || []).filter((l) => !langs.includes(l));
  root().innerHTML = `
    <div class="card"><h3>Hit points <span class="note">your DM keeps these</span></h3>
      <div class="hp-ctl hp-read">${Stage.numbersHidden(S) ? `<b class="hp-word">${esc(Stage.hpWord(c.hp, c.maxHp))}</b>` : `<b>${c.hp}<small> / ${c.maxHp}</small></b>`}${c.tempHp ? `<span class="chip"><small>Temp</small><b>${c.tempHp}</b></span>` : ''}</div>
      <div class="chips">${chip(esc(R.defenseLabel), c.ac)}${chip('Speed', `${c.speed ?? 30} ft`)}${d.prof ? chip('Proficiency', fmt(d.prof)) : ''}${chip('Initiative', fmt(c.init))}${chip('Passive 👁', d.passive.Perception ?? d.passive.Instinct ?? 10)}</div>
    </div>
    ${R.abilities.length ? `<div class="card"><h3>Abilities <span class="note">score · modifier · save · press and hold to roll</span></h3><div class="ab-grid">${R.abilities.map(([k, label]) => `<div class="ab ${cooldown.has(k) && cooldown.get(k) > Date.now() ? 'cool' : ''}" data-ab="${esc(k)}" data-ab-label="${esc(label)}" aria-label="${esc(label)} check, press and hold"><small>${esc(label.slice(0, 3).toUpperCase())}</small><b>${c.abilities?.[k] ?? 10}</b><span>${fmt(d.mods[k])}</span><small>save ${fmt(d.saves[k])}</small></div>`).join('')}</div></div>` : ''}
    <div class="card"><h3>Skills <span class="note">press and hold to roll</span></h3><div class="ab-grid sk-big">${R.skills.map((k) => `<div class="ab sk-tile ${cooldown.has(`sk:${k}`) && cooldown.get(`sk:${k}`) > Date.now() ? 'cool' : ''}" data-sk="${esc(k)}" role="button" tabindex="0" aria-label="${esc(k)} check, press and hold"><small>${esc(k)}</small><b>${fmt(c.skills[k])}</b></div>`).join('')}</div></div>
    ${featuresHtml(c)}
    ${c.hitDice?.die ? `<div class="card"><h3>Hit dice</h3><div class="row"><b>${c.level - (c.hitDice.used || 0)} / ${c.level}</b><span class="muted">d${c.hitDice.die}</span><span class="grow"></span><button class="btn small" data-hd-spend="1" ${c.level - (c.hitDice.used || 0) > 0 ? '' : 'disabled'}>🎲 Spend hit dice</button></div><p class="note">Each die heals a roll plus your CON. You are asked after a short rest too.</p></div>` : ''}
    ${(c.conditions || []).length ? `<div class="card"><h3>Conditions</h3><div class="chips">${c.conditions.map(condChip).join('')}</div><p class="note">The DM sets these. Press and hold one for what it does.</p><p class="cond-info" id="condInfo" aria-live="polite"></p></div>` : ''}
    ${['stamina', 'mana'].filter((k) => c[k]?.max > 0).map((k) => `<div class="card"><h3>${k === 'stamina' ? 'Stamina' : 'Mana'}</h3><div class="hp-ctl hp-read"><b>${c[k].cur}<small> / ${c[k].max}</small></b></div></div>`).join('')}
    <div class="card moves"><h3>Special moves <span class="note">name them · pick them on your turn</span></h3>
      ${moves.map((m, i) => `<div class="row move-row"><input class="grow move-name" data-move-name="${i}" maxlength="30" value="${esc(m.name || `Move ${i + 1}`)}" aria-label="Name of move ${i + 1}"><span class="muted move-steps">${m.steps.map((x) => MOVE_WORD[x.k] || x.k).join(', ')}</span><button class="btn small" data-move-edit="${i}">Edit</button>${moves.length > 1 ? `<button class="btn small danger" data-move-del="${i}" aria-label="Delete ${esc(m.name || `move ${i + 1}`)}">✕</button>` : ''}</div>`).join('')}
      ${moves.length < 6 ? '<button class="btn small" data-move-new="1">＋ New move</button>' : ''}
      <p class="note">Keep at least one move. Lay out a chain of hits, slashes, pierces, spell runes and two-finger steps.</p>
    </div>
    <div class="card"><h3>Languages <span class="note">only you set these</span></h3>
      <div class="chips">${langs.map((l) => `<span class="chip lang-chip"><b>${esc(l)}</b><button class="lang-x" data-lang-del="${esc(l)}" aria-label="Forget ${esc(l)}">×</button></span>`).join('') || '<span class="note">None yet</span>'}</div>
      <form class="row" id="langForm"><input id="langAdd" class="grow" maxlength="30" list="langList" placeholder="Add a language you know"><datalist id="langList">${suggest.map((l) => `<option value="${esc(l)}">`).join('')}</datalist><button class="btn">Add</button></form>
      <p class="note">Speak in one of these in a conversation. Only those who know it can read it.</p>
    </div>
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
  if (d.hdSpend) openHitDice(c, 'Spend hit dice');
  else if (d.feat) { openFeat = openFeat === d.feat ? null : d.feat; featNote = ''; render(); turn(root(), 'data-feat', d.feat); }
  else if (d.moveNew) openMoveBuilder(c);
  else if (d.moveEdit) openMoveBuilder(c, Number(d.moveEdit));
  else if (d.moveDel) { if (c.moves.length > 1) send({ moves: c.moves.filter((_, i) => i !== Number(d.moveDel)) }); }
  else if (d.langDel) send({ languages: (c.languages || []).filter((l) => l !== d.langDel) });
  else return;
  navigator.vibrate?.(20);
});

// Press and hold: an ability rolls a d20 check after a short hold (haptic on the roll, then a cooldown);
// a condition shows what it does with a light flash and a buzz.
let holdTimer = null, holdEl = null;
const cancelHold = () => { clearTimeout(holdTimer); holdEl?.classList.remove('holding'); holdEl = null; };
root().addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-ab],[data-sk],[data-cond]');
  if (!el || el.classList.contains('cool')) return;
  cancelHold();
  holdEl = el;
  el.classList.add('holding');
  holdTimer = setTimeout(() => {
    el.classList.remove('holding');
    holdEl = null;
    if (el.dataset.ab) return rollAbility(el);
    if (el.dataset.sk) return rollSkill(el);
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
root().addEventListener('contextmenu', (e) => { if (e.target.closest('[data-feat-go],[data-ab],[data-sk],[data-cond]')) e.preventDefault(); });
// Keyboard: Enter or Space on a skill tile rolls it.
root().addEventListener('keydown', (e) => { const el = e.target.closest?.('[data-sk]'); if (el && (e.key === 'Enter' || e.key === ' ') && !e.repeat && !el.classList.contains('cool')) { e.preventDefault(); rollSkill(el); } });

// Skills roll like abilities (Nov 21): press and hold, then a short cooldown. A matching DM roll call is answered.
function rollSkill(el) {
  const k = el.dataset.sk;
  socket.emit('player:check', { skill: k });
  cooldown.set(`sk:${k}`, Date.now() + COOL_MS);
  navigator.vibrate?.([30, 40, 30]);
  el.classList.add('cool');
  setTimeout(() => { cooldown.delete(`sk:${k}`); el.classList.remove('cool'); }, COOL_MS);
}

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
  if (e.target.id === 'langForm') {
    const l = $('#langAdd').value.trim().slice(0, 30);
    if (l && !(c.languages || []).some((x) => x.toLowerCase() === l.toLowerCase())) send({ languages: [...(c.languages || []), l] });
    $('#langAdd').value = '';
  }
  document.activeElement?.blur();
});
root().addEventListener('change', (e) => {
  const c = mine();
  if (e.target.id === 'sheetNotes') send({ notes: e.target.value });
  else if (e.target.dataset.moveName && c) {
    const i = Number(e.target.dataset.moveName);
    const name = e.target.value.trim().slice(0, 30) || `Move ${i + 1}`;
    send({ moves: c.moves.map((m, j) => (j === i ? { ...m, name } : m)) });
  }
});
root().addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset?.moveName) e.target.blur(); });
