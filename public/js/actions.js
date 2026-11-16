// Creature actions (Mike, Nov 16, PR O): an icon with the name under it; the to-hit and damage maths shows on hover.
// Shared by the DM combat cards (public/js/dm/combat.js) and the 3D battle map's action bar (public/js/iso3d.js).
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICONS = [[/bow|shoot|arrow|crossbow|sling|dart|javelin/i, '🏹'], [/fire|flame|burn|breath/i, '🔥'], [/frost|ice|cold/i, '❄️'], [/lightning|shock|thunder/i, '⚡'],
  [/bite|fang/i, '🦷'], [/claw|talon|rake/i, '🐾'], [/spit|acid|poison|venom|sting/i, '🧪'], [/heal|cure/i, '✚'], [/spell|bolt|ray|magic|missile|eldritch/i, '✨'],
  [/club|mace|hammer|slam|fist|punch|maul|morningstar/i, '🔨'], [/axe|cleave/i, '🪓'], [/spear|pike|trident|lance|gore|horn/i, '🔱'], [/dagger|knife|shiv/i, '🗡'], [/./, '⚔️']];
export const actionIcon = (a) => (ICONS.find(([re]) => re.test(`${a.name || ''} ${a.type || ''}`)) || ICONS.at(-1))[1];
// Average of a dice expression like "2d6+3" (each die averages (sides+1)/2).
export function diceAvg(expr) {
  let total = 0; let ok = false;
  for (const m of String(expr || '').replace(/\s+/g, '').matchAll(/([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/gi)) {
    if (m[3]) { total += (m[1] === '-' ? -1 : 1) * (Number(m[2]) || 1) * (Number(m[3]) + 1) / 2; ok = true; } else if (m[5]) { total += (m[4] === '-' ? -1 : 1) * Number(m[5]); ok = true; }
  }
  return ok ? Math.floor(total) : null;
}
export function actionDetail(a, def = 'AC ') {
  const sign = (n) => `${n >= 0 ? '+' : '−'} ${Math.abs(n)}`;
  const avg = diceAvg(a.dmg);
  return [
    `<b>${esc(a.name || 'Attack')}</b>${a.range ? ` <small>${esc(a.range)}</small>` : ''}`,
    a.atk != null && a.atk !== '' ? `To hit: 1d20 ${sign(Number(a.atk) || 0)} vs ${esc(def.trim())}` : '',
    a.dmg ? `Damage: ${esc(a.dmg)}${avg != null ? ` (avg ${avg})` : ''}${a.type ? ` ${esc(a.type)}` : ''}` : '',
    a.text ? `<i>${esc(a.text)}</i>` : '',
  ].filter(Boolean).join('<br>');
}
