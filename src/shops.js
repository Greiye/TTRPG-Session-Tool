// NPC shops (item 27): a merchant's stock and prices, imported from a CSV or Markdown table.
// Phones browse open shops and buy with gold kept on the character sheet (private, see sheet.js).
// Money is kept in copper internally so sums never drift; the UI shows gold.
const crypto = require('crypto');
const { str, int } = require('./util');

const MAX_ITEMS = 200;
const MAX_SHOPS = 50;
const COINS = { gp: 1, sp: 0.1, cp: 0.01 };

// "15", "15 gp", "2.5", "3 sp", "5 cp" -> gold (number, 2 decimals). null if unreadable.
function money(v) {
  const m = String(v ?? '').trim().toLowerCase().replace(/,/g, '').match(/^(\d+(?:\.\d{1,2})?)\s*(gp|sp|cp)?$/);
  if (!m) return null;
  return Math.round(Number(m[1]) * COINS[m[2] || 'gp'] * 100) / 100;
}
// Gold on a sheet: 0 to 1,000,000, two decimals.
const clampGold = (v, dflt = 0) => { const x = Number(v); return Number.isFinite(x) ? Math.round(Math.max(0, Math.min(1e6, x)) * 100) / 100 : dflt; };

// Split one CSV line; double quotes escape commas and "" is a literal quote.
function splitCsv(line, sep) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
// A Markdown table row: | a | b | (escaped \| is not supported; keep pipes out of names)
const splitMd = (line) => line.replace(/^\||\|$/g, '').split('|').map((s) => s.trim());
const isMdSeparator = (cells) => cells.every((c) => /^:?-{2,}:?$/.test(c));

// Read a list: a Markdown table if it has pipe rows, else CSV or semicolon-separated text.
// A header row is optional: name, price, stock, note are then the first four columns.
function parseList(text) {
  const lines = String(text ?? '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const isMd = lines.some((l) => l.startsWith('|'));
  const sep = lines[0] && !lines[0].includes(',') && lines[0].includes(';') ? ';' : ',';
  let rows = [];
  for (const l of lines) {
    if (isMd) {
      if (!l.startsWith('|')) continue; // headings and prose around the table
      const cells = splitMd(l);
      if (!isMdSeparator(cells)) rows.push(cells);
    } else if (!l.startsWith('#')) rows.push(splitCsv(l, sep)); // '#' lines are comments
  }
  const head = rows[0] || [];
  const find = (re) => head.findIndex((c) => re.test(c.toLowerCase()));
  const hasHeader = find(/^(name|item)$/) !== -1;
  const col = hasHeader
    ? { name: find(/^(name|item)$/), price: find(/^(price|cost|gp|value)/), stock: find(/^(stock|qty|quantity|available|count)/), note: find(/^(note|notes|description|desc|details)/) }
    : { name: 0, price: 1, stock: 2, note: 3 };
  if (hasHeader) rows = rows.slice(1);
  const items = [];
  const skipped = [];
  rows.forEach((cells, i) => {
    const name = str(cells[col.name], 60);
    if (!name) return;
    const row = i + 1 + (hasHeader ? 1 : 0);
    if (items.length >= MAX_ITEMS) return;
    const price = col.price >= 0 ? money(cells[col.price]) : null;
    if (price === null) { skipped.push(`row ${row} (${name}): no readable price`); return; }
    const rawStock = col.stock >= 0 ? cells[col.stock] : '';
    const stock = rawStock === undefined || rawStock === '' || /^(∞|inf|unlimited|-)$/i.test(rawStock) ? null : int(rawStock, 0, 9999, 0);
    items.push({ name, price, stock, note: str(col.note >= 0 ? cells[col.note] : '', 200) });
  });
  return { items, skipped };
}

// A new shop from a DM import: { npc, name, text }. Returns { shop } or { error }.
function create(f, id) {
  const { items, skipped } = parseList(f.text);
  if (!items.length) return { error: 'No items found. Use a CSV or Markdown table with a name and a price column.' };
  return {
    shop: {
      id, npc: str(f.npc, 60), name: str(f.name, 60) || 'Shop', open: true,
      items: items.map((x, i) => ({ ...x, id: `${id}-${i + 1}` })), skipped: skipped.slice(0, 20), at: Date.now(),
    },
  };
}

// A character buys qty of an item. Changes the shop stock, the character's gold and inventory.
// Returns { item, qty, cost } or { error }; nothing changes on error.
function buy(shop, c, itemId, qty) {
  if (!shop.open) return { error: `${shop.name} is closed right now.` };
  const item = shop.items.find((i) => i.id === itemId);
  if (!item) return { error: 'That item is not for sale here.' };
  const n = int(qty, 1, 999, 1);
  if (item.stock !== null && item.stock < n) return { error: item.stock ? `Only ${item.stock} left.` : 'Sold out.' };
  const costCp = Math.round(item.price * 100) * n;
  const haveCp = Math.round((c.gold || 0) * 100);
  if (haveCp < costCp) return { error: `Not enough gold: ${(costCp / 100).toFixed(2)} gp needed, you have ${(c.gold || 0).toFixed(2)} gp.` };
  const owned = c.inventory.find((x) => x.name.toLowerCase() === item.name.toLowerCase());
  if (!owned && c.inventory.length >= 200) return { error: 'Your pack is full.' };
  c.gold = (haveCp - costCp) / 100;
  if (item.stock !== null) item.stock -= n;
  if (owned) owned.qty = Math.min(9999, owned.qty + n);
  else c.inventory.push({ id: crypto.randomBytes(4).toString('hex'), name: item.name, qty: n, note: item.note });
  return { item, qty: n, cost: costCp / 100 };
}

module.exports = { money, clampGold, parseList, create, buy, MAX_SHOPS };
