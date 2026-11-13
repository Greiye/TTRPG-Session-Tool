// Combat flow and character moments (spotlight, turn themes).
const hub = require('./hub');
const { state, log, broadcast, sys } = require('./state');
const { roster } = require('./roster');
const { BUILTIN_SFX } = require('./media');
const absent = require('./absent');

let spotlightTimer = null;
function spotlight(id, kind) {
  clearTimeout(spotlightTimer);
  state.spotlight = { id, kind };
  spotlightTimer = setTimeout(() => { state.spotlight = null; broadcast(); }, kind === 'intro' ? 8000 : 5000);
  playTheme(roster[id]);
}
function playTheme(c) {
  if (!c?.theme) return;
  if (BUILTIN_SFX.includes(c.theme)) hub.io.emit('sfx', { builtin: c.theme });
  else {
    const t = state.audio.library.find((x) => x.id === c.theme);
    if (t) hub.io.emit('sfx', { url: t.url });
  }
}

const foes = () => state.combat.enemies.filter((e) => e.enemy);
function combatant(id) {
  return state.players[id] || state.combat.enemies.find((e) => e.id === id);
}
function currentTurnId() {
  const c = state.combat;
  return c.active && c.order.length ? c.order[c.turn % c.order.length].id : null;
}
function advanceTurn() {
  if (!state.combat.order.length) return;
  stepTurn();
  settleAutopilot();
}
// Moves the turn on to the next living combatant and announces it.
function stepTurn() {
  const c = state.combat;
  for (let i = 0; i < c.order.length; i++) {
    c.turn++;
    if (c.turn >= c.order.length) { c.turn = 0; c.round++; log('combat', `Round ${c.round} begins.`); }
    const who = combatant(c.order[c.turn].id);
    if (who && who.hp > 0) break;
  }
  const who = combatant(currentTurnId());
  if (who) log('combat', `${who.name}'s turn.`);
  if (who && !who.enemy) playTheme(who);
  require('./grid').resetMoves();
}
// An empty chair on autopilot takes its turn for it (Dodge). Bounded by the order, so an all-autopilot table cannot loop.
function settleAutopilot() {
  const c = state.combat;
  for (let i = 0; i < c.order.length; i++) {
    const who = combatant(currentTurnId());
    if (!c.active || !who || who.enemy || !absent.isAutopilot(state, who.id)) return;
    log('combat', `${who.name} is on autopilot and takes the Dodge action.`);
    stepTurn();
  }
}
function applyDamage(target, amount) {
  // Temporary hit points soak damage first; healing never touches them.
  if (amount > 0 && target.tempHp) { const soak = Math.min(target.tempHp, amount); target.tempHp -= soak; amount -= soak; }
  const was = target.hp;
  target.hp = Math.max(0, Math.min(target.maxHp, target.hp - amount));
  if (was === 0 || amount <= 0) return;
  if (target.hp === 0) log('combat', `${target.name} is down!`, { tone: 'bad' });
  if (state.combat.active && foes().length && foes().every((e) => e.hp === 0)) {
    log('combat', 'All enemies defeated. Victory!', { tone: 'good' });
  }
}
function attack(attacker, target, opts) {
  const r = sys().attack(attacker, target, opts);
  if (attacker.attackName) r.text = r.text.replace(' attacks ', ` attacks (${attacker.attackName}) `);
  if (state.combat.enemies.includes(attacker)) {
    // Creature bonuses and damage dice are DM-only (see FIELD_RULES in visibility.js). Phones and the TV
    // get the outcome; the DM keeps the full breakdown.
    const outcome = r.hit ? `${r.crit ? 'CRIT' : 'HIT'} for ${r.damage}` : 'MISS';
    log('combat', `${attacker.name} attacks ${target.name}: ${outcome}.`, { tone: r.hit ? 'bad' : 'good', roll: r.natural });
    log('combat', r.text, { tone: r.hit ? 'bad' : 'good', roll: r.natural, vis: 'dm' });
  } else log('combat', r.text, { tone: r.hit ? 'good' : 'bad', roll: r.natural });
  if (r.crit && !attacker.enemy) spotlight(attacker.id, 'nat20');
  if (r.hit) applyDamage(target, r.damage);
}
function startCombat() {
  const c = state.combat;
  const all = [...Object.values(state.players), ...c.enemies];
  c.order = all.map((x) => ({ id: x.id, init: sys().initiative(x) })).sort((a, b) => b.init - a.init);
  Object.assign(c, { active: true, round: 1, turn: 0 });
  require('./grid').resetMoves();
  // Bosses get their title card as the fight opens.
  const boss = c.enemies.find((e) => e.boss && e.title);
  if (boss) state.bossCard = { id: boss.id, name: boss.name, title: boss.title, n: (state.bossCard?.n || 0) + 1 };
  state.mode = 'combat';
  log('combat', `Roll initiative! ${c.order.map((o) => `${combatant(o.id).name} ${o.init}`).join(', ')}`, { tone: 'call' });
  const who = combatant(currentTurnId());
  if (who) log('combat', `${who.name}'s turn.`);
  if (who && !who.enemy) playTheme(who);
  settleAutopilot();
}

module.exports = { spotlight, playTheme, combatant, currentTurnId, advanceTurn, settleAutopilot, applyDamage, attack, startCombat };
