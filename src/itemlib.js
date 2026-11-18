// Item library and Item Designer (Mike, Nov 18). The DM's own items, system-agnostic like the Creature Designer:
// a name, a kind, a rarity, a value, the description the phone shows, free name/value properties (Damage 1d8,
// Armor +2, Charges 3: any system fits) and art. The Items window shows them as cards (list or gallery, with
// search), and the DM clicks or drags a card onto a portrait to give it.
//
// Item: { id, name, kind, rarity, value, note, props[{name,value}], image, tags[], dm, sample?, updatedAt }
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { library } = require('./library');
const { str, int, slug } = require('./util');

const KINDS = {
  weapon: '⚔️', armor: '🛡️', potion: '🧪', scroll: '📜', wand: '🪄', ring: '💍', wondrous: '✨',
  gear: '🎒', tool: '🛠️', ammo: '🏹', food: '🍞', treasure: '💎', key: '🗝️', other: '📦',
};
const RARITIES = ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'];
const MAX = { props: 20, text: 4000 };

const lib = library('items');

const pairs = (list) => (Array.isArray(list) ? list : []).slice(0, MAX.props)
  .map((p) => ({ name: str(p?.name, 40), value: str(p?.value, 200) })).filter((p) => p.name || p.value);
const okImage = (v) => typeof v === 'string' && /^\/uploads\/|^\/samples\/|^https?:\/\//.test(v);

function normalize(input = {}, prev = {}) {
  const f = { ...prev, ...input };
  const tags = (Array.isArray(f.tags) ? f.tags : String(f.tags || '').split(','))
    .map((t) => slug(t, 30)).filter(Boolean).slice(0, 12);
  return {
    id: prev.id || str(f.id, 60).replace(/[^\w-]/g, '') || `it_${crypto.randomBytes(5).toString('hex')}`,
    name: str(f.name, 60) || 'Unnamed item',
    kind: KINDS[f.kind] ? f.kind : 'other',
    rarity: RARITIES.includes(f.rarity) ? f.rarity : 'common',
    value: str(f.value, 30),
    note: str(f.note, 200),
    props: pairs(f.props),
    image: okImage(f.image) ? str(f.image, 300) : null,
    tags: [...new Set(tags)],
    dm: str(f.dm, MAX.text),
    ...(f.sample ? { sample: true } : {}),
    updatedAt: Date.now(),
  };
}

function save(input) {
  const prev = input?.id ? lib.get(input.id) : undefined;
  return lib.set(normalize(input, prev));
}

// Sample items, so the window is not empty on a fresh laptop: the placeholder shop list (5e SRD prices, numbers
// in brackets become properties) plus a few magic items. Marked sample; edit or delete freely.
const KIND_OF = { weapon: 'weapon', ammunition: 'ammo', armor: 'armor', potion: 'potion', gear: 'gear', tool: 'tool' };
const MAGIC = [
  { name: 'Bag of holding', kind: 'wondrous', rarity: 'uncommon', value: '500 gp', note: 'A cloth bag far larger inside than out.', props: [{ name: 'Holds', value: '500 lb, 64 cubic ft' }] },
  { name: 'Ring of warmth', kind: 'ring', rarity: 'uncommon', value: '400 gp', note: 'A copper ring, always warm to the touch.', props: [{ name: 'Effect', value: 'Comfortable down to -50 °F' }] },
  { name: 'Wand of sparks', kind: 'wand', rarity: 'uncommon', value: '300 gp', note: 'Crackles when pointed at metal.', props: [{ name: 'Charges', value: '7' }, { name: 'Damage', value: '2d6 lightning' }] },
  { name: 'Scroll of light', kind: 'scroll', rarity: 'common', value: '25 gp', note: 'Read aloud: an object glows like a torch for an hour.' },
  { name: 'Old iron key', kind: 'key', rarity: 'common', value: '', note: 'Heavy, rust-flecked, warm from a pocket.' },
  { name: 'Silver locket', kind: 'treasure', rarity: 'common', value: '30 gp', note: 'Holds a tiny painted portrait.' },
];
function sampleItems() {
  const out = [];
  try {
    const csv = fs.readFileSync(path.join(__dirname, '..', 'public', 'samples', 'placeholders', 'placeholder-items.csv'), 'utf8');
    for (const line of csv.split(/\r?\n/)) {
      if (!line || line.startsWith('#') || line.startsWith('Name,')) continue;
      const [name, price, , note = '', cat = ''] = line.split(',');
      const m = note.match(/\[(.*)\]/);
      const props = m ? m[1].split(';').map((s) => s.trim()).filter(Boolean).map((v, i) => ({ name: i ? 'Property' : 'Rules', value: v })) : [];
      out.push({ name, value: price, note: note.replace(/\s*\[.*\]/, '').trim(), kind: KIND_OF[cat.trim().toLowerCase()] || 'gear', props });
    }
  } catch { /* the CSV is optional */ }
  return [...out, ...MAGIC];
}
function seed() {
  for (const it of sampleItems()) save({ ...it, id: `sample-${slug(it.name, 40)}`, sample: true });
}
if (lib.fresh) seed();

module.exports = { lib, save, normalize, KINDS, RARITIES, seed, sampleItems };
