// Spell library (item 3b): data/spells.json. Characters keep a list of spell IDs on their sheet.
const { library } = require('./library');
const { str, int } = require('./util');

const lib = library('spells');
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

function normalize(f) {
  return {
    id: str(f.id, 80).replace(/[^\w-]/g, '') || `sp_${slug(f.name)}`,
    name: str(f.name, 60) || 'Spell',
    level: int(f.level, 0, 9, 0),
    school: str(f.school, 30),
    time: str(f.time, 60),
    range: str(f.range, 60),
    components: str(f.components, 120),
    duration: str(f.duration, 60),
    concentration: !!f.concentration,
    ritual: !!f.ritual,
    classes: (Array.isArray(f.classes) ? f.classes : String(f.classes || '').split(',')).map((x) => str(x, 20)).filter(Boolean).slice(0, 12),
    text: str(f.text, 4000),
    higher: str(f.higher, 1500),
    source: str(f.source, 60) || 'custom',
  };
}
const upsert = (f) => lib.set(normalize(f));

module.exports = { lib, normalize, upsert };
