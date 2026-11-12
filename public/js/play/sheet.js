// Character sheet on the phone (item 2): HP, spell slots, hit dice, inventory, spells, languages,
// notes. Every change goes to the server at once, so the DM sees it live.
import { socket, $, onState, state, library } from '../client.js';
import { me } from './identity.js';
import { addTab, tab, onTab } from './tabs.js';
import { fmt } from './views/common.js';

const { esc } = Stage;
const spells = library('spells');
const send = (patch) => socket.emit('player:sheet', patch);
const root = () => $('#tabSheet');
addTab('sheet', '📜 Sheet');

const chip = (label, value) => `<span class="chip"><small>${label}</small><b>${value}</b></span>`;
const pips = (level, s) => `<div class="slot-row"><span>Level ${level}</span><span class="pips">${Array.from({ length: s.max }, (_, i) => `<button class="pip ${i < s.max - s.used ? 'full' : ''}" data-slot="${level}" data-i="${i}" aria-label="Level ${level} slot ${i + 1}, ${i < s.max - s.used ? 'available' : 'used'}"></button>`).join('')}</span></div>`;

function render() {
  const S = state();
  const c = S?.players.find((p) => p.id === me.charId);
  if (!c || tab() !== 'sheet') return;
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
      <div class="hp-ctl"><button class="btn" data-hp="-5">−5</button><button class="btn" data-hp="-1">−1</button><b>${c.hp}<small> / ${c.maxHp}</small></b><button class="btn" data-hp="1">+1</button><button class="btn" data-hp="5">+5</button></div>
      <div class="row"><span class="muted">Temporary HP</span><button class="btn small" data-temp="-1">−</button><b>${c.tempHp || 0}</b><button class="btn small" data-temp="1">+</button><button class="btn small" data-temp="5">+5</button></div>
      <div class="chips">${chip(esc(R.defenseLabel), c.ac)}${chip('Speed', `${c.speed ?? 30} ft`)}${d.prof ? chip('Proficiency', fmt(d.prof)) : ''}${chip('Initiative', fmt(c.init))}${chip('Passive 👁', d.passive.Perception ?? d.passive.Instinct ?? 10)}</div>
    </div>
    ${R.abilities.length ? `<div class="card"><h3>Abilities <span class="note">score · modifier · save</span></h3><div class="ab-grid">${R.abilities.map(([k, label]) => `<div class="ab"><small>${esc(label.slice(0, 3).toUpperCase())}</small><b>${c.abilities?.[k] ?? 10}</b><span>${fmt(d.mods[k])}</span><small>save ${fmt(d.saves[k])}</small></div>`).join('')}</div></div>` : ''}
    <div class="card"><h3>Skills</h3><div class="sk-grid">${R.skills.map((k) => `<span>${esc(k)} <b>${fmt(c.skills[k])}</b></span>`).join('')}</div></div>
    ${slots.length ? `<div class="card"><h3>Spell slots <span class="note">tap to use or restore</span></h3>${slots.map(([l, s]) => pips(l, s)).join('')}</div>` : ''}
    ${c.hitDice?.die ? `<div class="card"><h3>Hit dice</h3><div class="row"><b>${c.level - (c.hitDice.used || 0)} / ${c.level}</b><span class="muted">d${c.hitDice.die}</span><span class="grow"></span><button class="btn small" data-hd="1">Use one</button><button class="btn small" data-hd="-1">Restore one</button></div></div>` : ''}
    <div class="card"><h3>Inventory</h3>
      <div class="list">${(c.inventory || []).map((i) => `<div class="inv"><span><b>${esc(i.name)}</b>${i.note ? `<small class="muted"> ${esc(i.note)}</small>` : ''}</span><span class="row"><button class="btn small" data-inv="${i.id}" data-q="${i.qty - 1}" ${i.qty ? '' : 'disabled'}>−</button><b>${i.qty}</b><button class="btn small" data-inv="${i.id}" data-q="${i.qty + 1}">+</button><button class="btn small danger" data-inv-del="${i.id}" aria-label="Remove ${esc(i.name)}">✕</button></span></div>`).join('') || '<p class="note">Nothing yet.</p>'}</div>
      <form class="row" id="invForm"><input id="invName" class="grow" maxlength="60" placeholder="Add an item"><input id="invQty" type="number" min="0" value="1" style="width:64px" aria-label="Quantity"><button class="btn">Add</button></form>
    </div>
    ${R.slotLevels ? `<div class="card"><h3>Spells</h3>
      ${known.map((s) => `<details data-k="${esc(s.id)}" ${open.has(s.id) ? 'open' : ''}><summary><b>${esc(s.name)}</b> <small class="muted">${s.level ? `level ${s.level}` : 'cantrip'}${s.concentration ? ' · conc.' : ''}</small></summary>
        <p class="note">${esc([s.school, s.time, s.range, s.components, s.duration].filter(Boolean).join(' · '))}</p><p>${esc(s.text)}</p>${s.higher ? `<p class="note">${esc(s.higher)}</p>` : ''}<button class="btn small danger" data-spell-del="${esc(s.id)}">Forget</button></details>`).join('') || '<p class="note">No spells on your sheet yet.</p>'}
      <form class="row" id="spellForm"><input id="spellAdd" class="grow" list="spellList" placeholder="Add a spell by name"><datalist id="spellList">${spells.items.filter((s) => !(c.spells || []).includes(s.id)).map((s) => `<option value="${esc(s.name)}">`).join('')}</datalist><button class="btn">Add</button></form>
    </div>` : ''}
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
  else if (d.inv) send({ inv: { op: 'set', id: d.inv, qty: Number(d.q) } });
  else if (d.invDel) send({ inv: { op: 'del', id: d.invDel } });
  else if (d.spellDel) send({ spells: c.spells.filter((x) => x !== d.spellDel) });
  else return;
  navigator.vibrate?.(20);
});
root().addEventListener('submit', (e) => {
  e.preventDefault();
  const c = mine();
  if (!c) return;
  if (e.target.id === 'invForm') {
    const name = $('#invName').value.trim();
    if (name) send({ inv: { op: 'add', name, qty: Number($('#invQty').value) || 1 } });
  } else if (e.target.id === 'spellForm') {
    const q = $('#spellAdd').value.trim().toLowerCase();
    const s = spells.items.find((x) => x.name.toLowerCase() === q) || spells.items.find((x) => x.name.toLowerCase().startsWith(q));
    if (q && s) send({ spells: [...(c.spells || []), s.id] });
  }
  document.activeElement?.blur();
});
root().addEventListener('change', (e) => { if (e.target.id === 'sheetNotes') send({ notes: e.target.value }); });
