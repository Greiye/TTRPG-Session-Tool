// Combat flow and character moments (spotlight, turn themes).
const hub = require('./hub');
const { state, log, broadcast } = require('./state');
const { roster } = require('./roster');
const { d, rollDice, sign } = require('./dice');
const { BUILTIN_SFX } = require('./media');

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

function combatant(id) {
  return state.players[id] || state.combat.enemies.find((e) => e.id === id);
}
function currentTurnId() {
  const c = state.combat;
  return c.active && c.order.length ? c.order[c.turn % c.order.length].id : null;
}
function advanceTurn() {
  const c = state.combat;
  if (!c.order.length) return;
  for (let i = 0; i < c.order.length; i++) {
    c.turn++;
    if (c.turn >= c.order.length) { c.turn = 0; c.round++; log('combat', `Round ${c.round} begins.`); }
    const who = combatant(c.order[c.turn].id);
    if (who && who.hp > 0) break;
  }
  const who = combatant(currentTurnId());
  if (who) log('combat', `${who.name}'s turn.`);
  if (who && !who.enemy) playTheme(who);
}
function applyDamage(target, amount) {
  target.hp = Math.max(0, Math.min(target.maxHp, target.hp - amount));
  if (target.hp === 0) log('combat', `${target.name} is down!`, { tone: 'bad' });
  if (state.combat.active && state.combat.enemies.length && state.combat.enemies.every((e) => e.hp === 0)) {
    log('combat', 'All enemies defeated. Victory!', { tone: 'good' });
  }
}
function attack(attacker, target, atk, dmg) {
  const r = d(20);
  const total = r + atk;
  const crit = r === 20;
  const hit = crit || (r !== 1 && total >= target.ac);
  let text = `${attacker.name} attacks ${target.name}: d20(${r})${sign(atk)} = ${total} vs AC ${target.ac}`;
  if (hit) {
    const dm = rollDice(crit ? [dmg[0] * 2, dmg[1], dmg[2]] : dmg);
    text += ` ${crit ? 'CRIT' : 'HIT'} for ${dm.total} (${dm.expr})`;
    log('combat', text, { tone: 'good', roll: r });
    if (crit && !attacker.enemy) spotlight(attacker.id, 'nat20');
    applyDamage(target, dm.total);
  } else {
    log('combat', `${text} MISS`, { tone: 'bad', roll: r });
  }
}
function startCombat() {
  const c = state.combat;
  const all = [...Object.values(state.players), ...c.enemies];
  c.order = all.map((x) => ({ id: x.id, init: d(20) + (x.init || 0) })).sort((a, b) => b.init - a.init);
  Object.assign(c, { active: true, round: 1, turn: 0 });
  state.mode = 'combat';
  log('combat', `Roll initiative! ${c.order.map((o) => `${combatant(o.id).name} ${o.init}`).join(', ')}`, { tone: 'call' });
  const who = combatant(currentTurnId());
  if (who) log('combat', `${who.name}'s turn.`);
  if (who && !who.enemy) playTheme(who);
}

module.exports = { spotlight, playTheme, combatant, currentTurnId, advanceTurn, applyDamage, attack, startCombat };
