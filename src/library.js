// Small JSON-backed libraries (creature stat blocks, spells): keyed by stable ID, debounced saves,
// and a version counter so clients know when to refetch (the lists are too big to broadcast).
const path = require('path');
const { DATA_DIR } = require('./config');
const { writeJson, readJson } = require('./store');

const all = [];
function library(name) {
  const file = path.join(DATA_DIR, `${name}.json`);
  const existed = readJson(file);
  const items = existed || {};
  let timer = null;
  const lib = {
    name, file, items, version: 1, fresh: !existed,
    list: () => Object.values(items),
    get: (id) => items[id],
    set(item) { items[item.id] = item; lib.touch(); return item; },
    remove(id) { if (!items[id]) return false; delete items[id]; lib.touch(); return true; },
    replace(next) { for (const k of Object.keys(items)) delete items[k]; Object.assign(items, next); lib.touch(); },
    touch() { lib.version++; clearTimeout(timer); timer = setTimeout(() => writeJson(file, items), 300); },
    flush() { clearTimeout(timer); writeJson(file, items); },
  };
  all.push(lib);
  return lib;
}
const flushAll = () => all.forEach((l) => l.flush());
const versions = () => Object.fromEntries(all.map((l) => [l.name, l.version]));

module.exports = { library, flushAll, versions };
