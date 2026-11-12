const { esc } = Stage;
export default function combatView(S, me) {
  const c = S.combat;
  const def = S.rules.defenseLabel;
  if (!c.active) return '<div class="card"><p class="turn-banner">⚔️ Steel yourself…</p><p class="muted" style="text-align:center">Waiting for the DM to roll initiative.</p></div>';
  const turnId = c.order[c.turn]?.id;
  const everyone = [...S.players, ...c.enemies];
  const who = everyone.find((x) => x.id === turnId);
  const order = `<div class="card"><h3>Round ${c.round}</h3>${c.order.map((o) => {
    const x = everyone.find((y) => y.id === o.id);
    return x ? `<div class="${o.id === turnId ? '' : 'muted'}">${o.id === turnId ? '▸ ' : ''}${o.init} · ${esc(x.name)} ${x.enemy ? `(${x.hp}/${x.maxHp})` : ''}${x.hp === 0 ? ' 💀' : ''}</div>` : '';
  }).join('')}</div>`;
  if (me.hp === 0) return `<div class="card"><p class="turn-banner" style="color:var(--bad)">You are down</p><p class="muted" style="text-align:center">Hope a cleric is nearby.</p></div>${order}`;
  if (turnId !== me.id) return `<div class="card"><p style="text-align:center;font-size:calc(18px * var(--ts))">${esc(who?.name || '…')}'s turn</p></div>${order}`;
  const foes = c.enemies.filter((e) => e.hp > 0);
  return `<p class="turn-banner">YOUR TURN</p>
    <div class="card"><h3>Attack (+${me.atk}, ${me.dmg[0]}d${me.dmg[1]}+${me.dmg[2]})</h3>
      <div class="grid2">${foes.map((e) => `<button class="btn primary" data-attack="${e.id}">🗡 ${esc(e.name)}<br><small>${esc(def)} ${e.ac} · ${e.hp}hp</small></button>`).join('') || '<span class="muted">No targets</span>'}</div></div>
    <div class="grid3">
      <button class="btn" data-act="dodge">🛡 Dodge</button><button class="btn" data-act="dash">💨 Dash</button><button class="btn" data-act="hide">👤 Hide</button>
      <button class="btn" data-act="help">🤝 Help</button><button class="btn" data-act="potion">🧪 Potion</button>
    </div>${order}`;
}
