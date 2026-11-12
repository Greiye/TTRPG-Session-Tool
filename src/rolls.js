// Roll and check engine (Phase 2).
//   - dice log: every roll is recorded in state.rolls with its dice, so the table can audit it (item 4)
//   - roll calls: the DM asks for a skill check, save or ability check; each phone rolls with its own
//     bonus; the TV shows one tile per player (item 4b)
//   - check library: preset DCs and common checks with pass/fail text the DM can auto-post (item 4)
//   - roll popup: a short centered animation on the TV for each roll (item 5)
const hub = require('./hub');
const { state, log, nextId, broadcast, sys } = require('./state');
const dice = require('./dice');
const { str, int } = require('./util');

const KINDS = ['skill', 'save', 'ability'];
const MODES = ['adv', 'dis'];
const POP_ANIMS = ['tumble', 'slam', 'flip'];

// Common checks. `skill` must exist in the active rules system to be offered.
const PRESETS = [
  { id: 'spot', name: 'Spot something hidden', kind: 'skill', key: 'Perception', dc: 15, pass: 'notices something out of place.', fail: 'sees nothing unusual.' },
  { id: 'search', name: 'Search a room', kind: 'skill', key: 'Investigation', dc: 12, pass: 'turns up something useful.', fail: 'finds only dust.' },
  { id: 'track', name: 'Follow tracks', kind: 'skill', key: 'Survival', dc: 13, pass: 'picks up the trail.', fail: 'loses the trail.' },
  { id: 'forage', name: 'Forage for food', kind: 'skill', key: 'Survival', dc: 10, pass: 'finds enough to eat.', fail: 'comes back empty-handed.' },
  { id: 'climb', name: 'Climb a slick wall', kind: 'skill', key: 'Athletics', dc: 15, pass: 'makes the climb.', fail: 'slips back down.' },
  { id: 'force', name: 'Force a stuck door', kind: 'skill', key: 'Athletics', dc: 15, pass: 'bursts the door open.', fail: 'bounces off the door.' },
  { id: 'sneak', name: 'Sneak past guards', kind: 'skill', key: 'Stealth', dc: 13, pass: 'slips by unseen.', fail: 'makes a noise.' },
  { id: 'lore', name: 'Recall arcane lore', kind: 'skill', key: 'Arcana', dc: 15, pass: 'remembers the lore.', fail: 'draws a blank.' },
  { id: 'persuade', name: 'Talk someone round', kind: 'skill', key: 'Persuasion', dc: 15, pass: 'wins them over.', fail: 'is politely refused.' },
  { id: 'bluff', name: 'Bluff a guard', kind: 'skill', key: 'Deception', dc: 13, pass: 'is believed.', fail: 'is not believed.' },
  { id: 'read', name: 'Sense a lie', kind: 'skill', key: 'Insight', dc: 13, pass: 'senses something is off.', fail: 'cannot get a read.' },
  { id: 'menace', name: 'Scare someone off', kind: 'skill', key: 'Intimidation', dc: 13, pass: 'makes them back down.', fail: 'is laughed at.' },
  { id: 'dexsave', name: 'Dodge a trap', kind: 'save', key: 'dex', dc: 13, pass: 'leaps clear.', fail: 'is caught by the trap.' },
  { id: 'consave', name: 'Resist poison', kind: 'save', key: 'con', dc: 12, pass: 'shrugs it off.', fail: 'feels the poison take hold.' },
  { id: 'wissave', name: 'Resist a charm or fear', kind: 'save', key: 'wis', dc: 14, pass: 'keeps a clear head.', fail: 'is overcome.' },
];

const keysFor = (kind) => (kind === 'skill' ? sys().skills : sys().abilities.map((a) => a[0]));
const validKey = (kind, key) => keysFor(kind).includes(key);
function labelFor(kind, key) {
  if (kind === 'skill') return `${key} check`;
  const name = sys().abilities.find((a) => a[0] === key)?.[1] || key;
  return `${name} ${kind === 'save' ? 'save' : 'check'}`;
}
// What clients need for the roll-call form.
const describe = () => ({ presets: [...PRESETS, ...(state.checkLib || [])].filter((p) => validKey(p.kind, p.key)), kinds: sys().abilities.length ? KINDS : ['skill'] });

// ----- dice log + popup -----
// entry: { who, whoId, hue, label, dice: [{sides, value, kept}], mod, total, natural?, dc?, outcome?, crit, fumble, mode, vis }
function record(entry, { pop = true } = {}) {
  const e = { id: nextId(), t: Date.now(), ...entry };
  state.rolls.push(e);
  if (state.rolls.length > 60) state.rolls.shift();
  if (pop && state.settings.rollPopup !== false) {
    const anim = e.crit ? 'slam' : POP_ANIMS[e.id % POP_ANIMS.length];
    const payload = { id: e.id, who: e.who, hue: e.hue, label: e.label, dice: e.dice, mod: e.mod, total: e.total, outcome: e.outcome, crit: !!e.crit, fumble: !!e.fumble, anim };
    // Secret rolls only pop on the DM's own screen.
    if (e.vis === 'dm') hub.io.to('dms').emit('rollpop', payload); else hub.io.emit('rollpop', payload);
  }
  return e;
}
const d20Dice = (r) => (r.dice || [r.natural]).map((v) => ({ sides: r.sides || 20, value: v, kept: r.sides === 12 || v === r.natural }));

// ----- roll calls -----
function call({ kind = 'skill', key, dc, targets, mode, hideDc, pass, fail, preset } = {}) {
  const p = preset && describe().presets.find((x) => x.id === preset);
  if (p) ({ kind, key } = p);
  if (!KINDS.includes(kind) || !validKey(kind, key)) return null;
  const ids = Array.isArray(targets) ? targets.filter((id) => state.players[id]) : [];
  state.check = {
    id: nextId(), kind, key, skill: key, label: labelFor(kind, key), dc: int(dc ?? p?.dc, 1, 40, 10), hideDc: !!hideDc,
    targets: ids.length ? ids : null, mode: MODES.includes(mode) ? mode : null, results: {},
    outcome: { pass: str(pass ?? p?.pass, 200), fail: str(fail ?? p?.fail, 200) },
  };
  const who = ids.length ? ids.map((id) => state.players[id].name).join(', ') : 'Everyone';
  log('check', `${who}: roll a ${state.check.label}${state.check.hideDc ? '' : ` (${sys().dcLabel} ${state.check.dc})`}${state.check.mode ? ` with ${state.check.mode === 'adv' ? 'advantage' : 'disadvantage'}` : ''}.`, { tone: 'call' });
  return state.check;
}
const clear = () => { state.check = null; };
const isTarget = (chk, id) => !chk.targets || chk.targets.includes(id);

function rollFor(p, kind, key, opts) {
  const s = sys();
  return kind === 'save' ? s.save(p, key, opts) : kind === 'ability' ? s.ability(p, key, opts) : s.check(p, key, opts);
}
// A player answers the active roll call. Returns the result or null if they have nothing to roll.
function answer(p, mode) {
  const chk = state.check;
  if (!chk || !isTarget(chk, p.id) || chk.results[p.id]) return null;
  const r = rollFor(p, chk.kind, chk.key, { dc: chk.dc, mode: chk.mode || (MODES.includes(mode) ? mode : undefined) });
  chk.results[p.id] = { name: p.name, roll: r.natural, total: r.total, pass: r.pass, crit: r.crit };
  log('check', `${p.name} ${r.text}${chk.hideDc ? '' : ` ${r.outcome}`}`, { tone: r.pass ? 'good' : 'bad', roll: r.sides === 12 ? undefined : r.natural });
  record({ who: p.name, whoId: p.id, hue: p.hue, label: chk.label, dice: d20Dice(r), mod: r.mod, total: r.total, natural: r.natural, dc: chk.dc, outcome: r.pass ? 'pass' : 'fail', crit: r.crit, fumble: r.fumble, mode: r.mode, call: chk.id });
  // DM auto-outcome: the preset text is posted for each player as their roll lands.
  const text = r.pass ? chk.outcome.pass : chk.outcome.fail;
  if (text) log('narrate', `${p.name} ${text}`);
  return r;
}
// A roll nobody asked for: a player tapping a skill, a save or an ability on their phone.
function free(p, kind, key, mode) {
  if (!KINDS.includes(kind) || !validKey(kind, key)) return null;
  const r = rollFor(p, kind, key, { mode: MODES.includes(mode) ? mode : undefined });
  log('check', `${p.name} ${r.text}${r.outcome ? ' ' + r.outcome : ''}`, { roll: r.sides === 12 ? undefined : r.natural });
  record({ who: p.name, whoId: p.id, hue: p.hue, label: labelFor(kind, key), dice: d20Dice(r), mod: r.mod, total: r.total, natural: r.natural, crit: r.crit, fumble: r.fumble, mode: r.mode });
  return r;
}
// Any dice expression ("2d6+3", "4d6kh3"). `secret` rolls are DM-only.
function expr(who, text, { label, secret, mode } = {}) {
  let src = str(text, 40);
  if (/^d20([+-]\d+)?$/i.test(src.replace(/\s/g, '')) && MODES.includes(mode)) src = src.replace(/d20/i, mode === 'adv' ? '2d20kh1' : '2d20kl1');
  const r = dice.roll(src);
  if (!r) return null;
  const vis = secret ? 'dm' : undefined;
  const one = r.dice.filter((x) => x.kept && x.sides === 20);
  const crit = one.length === 1 && one[0].value === 20; const fumble = one.length === 1 && one[0].value === 1;
  const kept = r.dice.map((x) => (x.kept ? x.value : `~${x.value}`)).join(', ');
  log('check', `${who.name} rolls ${str(label, 40) ? `${str(label, 40)}: ` : ''}${r.expr} (${kept}) = ${r.total}`, { roll: crit ? 20 : fumble ? 1 : undefined, ...(vis ? { vis } : {}) });
  record({ who: who.name, whoId: who.id, hue: who.hue, label: str(label, 40) || r.expr, dice: r.dice, mod: 0, total: r.total, crit, fumble, vis });
  return r;
}

// DM-made presets, kept with the campaign.
function savePreset(f) {
  if (!KINDS.includes(f.kind) || !validKey(f.kind, f.key) || !str(f.name, 60)) return null;
  const p = { id: `c${nextId()}`, name: str(f.name, 60), kind: f.kind, key: f.key, dc: int(f.dc, 1, 40, 10), pass: str(f.pass, 200), fail: str(f.fail, 200), custom: true };
  state.checkLib.push(p);
  if (state.checkLib.length > 100) state.checkLib.shift();
  return p;
}
const removePreset = (id) => { state.checkLib = state.checkLib.filter((p) => p.id !== id); };

module.exports = { KINDS, PRESETS, describe, record, call, clear, isTarget, answer, free, expr, savePreset, removePreset, labelFor, broadcast };
