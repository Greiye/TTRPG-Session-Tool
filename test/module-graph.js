// Module graph (Nov 22): tools/module-graph.js reads real imports and writes valid-looking Mermaid.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { harness, ROOT } = require('./helpers');
const { collect, specifiers, resolve } = require('../tools/module-graph');

const h = harness('module-graph');
(async () => {
  // Parsing: each import form is found; commented-out ones are not.
  const js = [
    "const a = require('./a');",
    "import b from './b.js';",
    "import { c } from '../c.js';",
    "import './d.js';",
    "export { e } from './e.js';",
    "const f = await import('./f.js');",
    "// const g = require('./g');",
    "/* import h from './h.js'; */",
    "const url = 'http://example.com';",
  ].join('\n');
  const specs = specifiers('src/x.js', js);
  for (const s of ['./a', './b.js', '../c.js', './d.js', './e.js', './f.js']) h.ok(specs.includes(s), `finds ${s}`);
  h.ok(!specs.includes('./g') && !specs.includes('./h.js'), 'skips commented-out imports');
  h.ok(specifiers('public/x.html', '<script type="module" src="/js/dm/main.js"></script>').includes('/js/dm/main.js'), 'reads <script src> in pages');

  // Resolving: relative paths, page paths, built bundles, packages, built-ins.
  const known = new Set(['src/state.js', 'public/js/dm/main.js', 'src/rules/index.js']);
  h.ok(resolve('src/x.js', './state', known)?.to === 'src/state.js', 'adds .js');
  h.ok(resolve('src/x.js', './rules', known)?.to === 'src/rules/index.js', 'finds index.js');
  h.ok(resolve('public/dm.html', '/js/dm/main.js', known)?.to === 'public/js/dm/main.js', 'page path maps into public/');
  const built = resolve('src/iso.js', '../lib/iso-battle/dist/core.cjs', known);
  h.ok(built?.to === 'lib/iso-battle/src/core/index.js' && built.built, 'built core points at its source');
  h.ok(resolve('server.js', 'express', known)?.ext === 'express', 'npm package is external');
  h.ok(resolve('server.js', 'node:fs', known) === null && resolve('server.js', 'path', known) === null, 'node built-ins are left out');

  // On the real repo: known edges are there.
  const { edges, files } = collect();
  const has = (from, to) => edges.some((e) => e.from === from && e.to === to);
  h.ok(files.includes('server.js') && files.includes('public/dm.html'), 'scans server and pages');
  h.ok(edges.some((e) => e.from.startsWith('src/') && e.to === 'src/state.js'), 'server modules link to src/state.js');
  h.ok(has('public/dm.html', 'public/js/dm/main.js'), 'dm.html loads the DM entry module');
  h.ok(edges.some((e) => e.from.startsWith('public/js/dm/') && e.to === 'public/js/client.js'), 'DM modules import client.js');
  h.ok(edges.some((e) => e.to.startsWith('lib/iso-battle/src/') && e.built), 'iso battle map is linked through its build');
  h.ok(!files.some((f) => f.startsWith('data/') || f.startsWith('uploads/') || f.includes('node_modules')), 'skips data, uploads and node_modules');

  // The script writes Markdown with Mermaid blocks; it writes where it is told, not into docs/.
  const out = path.join(h.TMP, 'graph.md');
  execFileSync(process.execPath, [path.join(ROOT, 'tools/module-graph.js'), out], { cwd: ROOT });
  const md = fs.readFileSync(out, 'utf8');
  const blocks = [...md.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]);
  h.ok(blocks.length >= 5, `several charts (${blocks.length})`);
  h.ok(blocks.every((b) => /^flowchart (LR|TB)\n/.test(b)), 'every chart is a flowchart');
  h.ok(blocks.every((b) => !/\["[^"]*"[^\]]*"[^\]]*\]/.test(b)), 'no stray quotes in node labels');
  h.ok(/## Tests[\s\S]*\| `test\/module-graph\.js` \|/.test(md), 'tests table lists this test');
  h.ok(/npm run graph/.test(md), 'says how to regenerate');
  await h.done();
})();
