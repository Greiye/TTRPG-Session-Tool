// Module graph (Nov 22): reads every require/import/<script src> in the repo and writes
// docs/module-graph.md as Mermaid charts, one per area. Edges come from the source, nothing is hand-drawn.
//   npm run graph                  rewrite docs/module-graph.md
//   node tools/module-graph.js out.md   write somewhere else (the test does this)
const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'data', 'uploads', '.git', 'dist', 'iso', 'samples', 'models', 'srd', 'schema']);
// A module imported by more than this many files in one chart is drawn once with its count
// instead of with every arrow, so the chart stays readable.
const HUB_LIMIT = 8;

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full, out); }
    else if (/\.(c|m)?js$|\.html$/.test(e.name)) out.push(rel(full));
  }
  return out;
}

function listFiles() {
  const files = ['server.js'];
  for (const d of ['src', 'public', 'lib/iso-battle/src', 'test', 'tools']) {
    if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d), files);
  }
  return files.filter((f) => f.endsWith('.html') ? f.startsWith('public/') : true).sort();
}

// Comments out, strings kept: good enough to stop commented-out requires from counting.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

function specifiers(file, src) {
  if (file.endsWith('.html')) {
    const out = [];
    for (const m of src.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) out.push(m[1]);
    return out;
  }
  const code = stripComments(src);
  const out = [];
  const res = [
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /^\s*import\s+(?:[\w*{}\s,$]+\s+from\s+)?['"]([^'"]+)['"]/gm,
    /^\s*export\s+[\w*{}\s,$]+\s+from\s+['"]([^'"]+)['"]/gm,
  ];
  for (const re of res) for (const m of code.matchAll(re)) out.push(m[1]);
  return out;
}

// The built bundles are committed; point their users at the source they are built from.
const BUILT = {
  'lib/iso-battle/dist/core.cjs': 'lib/iso-battle/src/core/index.js',
  'public/iso/iso-battle.js': 'lib/iso-battle/src/browser.js',
};

function resolve(file, spec, known) {
  let base;
  if (spec.startsWith('./') || spec.startsWith('../')) base = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
  else if (spec.startsWith('/')) {
    if (spec.startsWith('/socket.io/')) return { ext: 'socket.io (served)' };
    base = 'public' + spec;
  } else {
    const name = spec.replace(/^node:/, '');
    const pkg = name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0];
    if (builtinModules.includes(pkg)) return null;
    return { ext: pkg };
  }
  for (const c of [base, base + '.js', base + '/index.js']) {
    if (BUILT[c]) return { to: BUILT[c], built: true };
    if (known.has(c)) return { to: c };
  }
  return null; // JSON, CSS and other non-code files
}

function collect() {
  const files = listFiles();
  const known = new Set(files);
  const edges = [];
  const external = new Map();
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const seen = new Set();
    for (const spec of specifiers(f, src)) {
      const r = resolve(f, spec, known);
      if (!r) continue;
      if (r.ext) {
        if (!external.has(r.ext)) external.set(r.ext, new Set());
        external.get(r.ext).add(f);
        continue;
      }
      if (r.to === f || seen.has(r.to)) continue;
      seen.add(r.to);
      edges.push({ from: f, to: r.to, built: !!r.built });
    }
  }
  return { files, edges, external };
}

// ---- areas ----
function group(f) {
  if (f === 'server.js') return 'server.js';
  if (f.startsWith('src/sockets/')) return 'src/sockets';
  if (f.startsWith('src/rules/')) return 'src/rules';
  if (f.startsWith('src/')) return 'src';
  if (f.endsWith('.html')) return 'public pages';
  if (f.startsWith('public/js/dm/')) return 'public/js/dm';
  if (f.startsWith('public/js/play/')) return 'public/js/play';
  if (f.startsWith('public/js/')) return 'public/js';
  if (f.startsWith('public/')) return 'public scripts';
  if (f.startsWith('lib/iso-battle/src/core/')) return 'iso-battle core';
  if (f.startsWith('lib/iso-battle/src/client/')) return 'iso-battle client';
  if (f.startsWith('lib/iso-battle/')) return 'iso-battle entry';
  if (f.startsWith('test/')) return 'test';
  if (f.startsWith('tools/')) return 'tools';
  return 'other';
}

const id = (s) => 'n_' + s.replace(/[^A-Za-z0-9]/g, '_');
const label = (f) => f.replace(/^(src\/sockets|src\/rules|src|public\/js\/dm|public\/js\/play|public\/js|public|lib\/iso-battle\/src\/core|lib\/iso-battle\/src\/client|lib\/iso-battle\/src|test|tools)\//, '');

// One Mermaid chart: nodes grouped into subgraphs by group(), hubs drawn without their arrows.
function chart(nodesIn, edgesIn, { dir = 'LR', hubs = true } = {}) {
  const nodes = new Set(nodesIn);
  const edges = edgesIn.filter((e) => nodes.has(e.from) && nodes.has(e.to));
  const indeg = new Map();
  for (const e of edges) indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
  const hubSet = new Set(hubs ? [...indeg].filter(([, n]) => n > HUB_LIMIT).map(([k]) => k) : []);
  const shown = edges.filter((e) => !hubSet.has(e.to));
  const used = new Set();
  for (const e of shown) { used.add(e.from); used.add(e.to); }
  for (const h of hubSet) used.add(h);
  const byGroup = new Map();
  for (const n of [...used].sort()) {
    const g = group(n);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(n);
  }
  const lines = ['```mermaid', `flowchart ${dir}`];
  for (const [g, ns] of byGroup) {
    lines.push(`  subgraph ${id('g_' + g)}["${g}"]`);
    for (const n of ns) {
      const text = hubSet.has(n) ? `${label(n)}<br/>(used by ${indeg.get(n)})` : label(n);
      lines.push(`    ${id(n)}${hubSet.has(n) ? `[["${text}"]]` : `["${text}"]`}`);
    }
    lines.push('  end');
  }
  for (const e of shown) lines.push(`  ${id(e.from)} ${e.built ? '-.->' : '-->'} ${id(e.to)}`);
  lines.push('```');
  return { text: lines.join('\n'), hubs: [...hubSet].sort(), edges: shown.length, nodes: used.size };
}

function overview(edges) {
  const counts = new Map();
  for (const e of edges) {
    const a = group(e.from), b = group(e.to);
    if (a === b) continue;
    const k = a + '\u0000' + b;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const groups = new Set();
  for (const k of counts.keys()) k.split('\u0000').forEach((g) => groups.add(g));
  const lines = ['```mermaid', 'flowchart LR'];
  for (const g of [...groups].sort()) lines.push(`  ${id('a_' + g)}["${g}"]`);
  for (const [k, n] of [...counts].sort()) {
    const [a, b] = k.split('\u0000');
    lines.push(`  ${id('a_' + a)} -->|${n}| ${id('a_' + b)}`);
  }
  lines.push('```');
  return lines.join('\n');
}

function build() {
  const { files, edges, external } = collect();
  const of = (...gs) => files.filter((f) => gs.includes(group(f)));
  const out = [];
  const table = (title, blurb, list, head) => {
    const rows = list.map((t) => {
      const deps = edges.filter((e) => e.from === t).map((e) => '`' + e.to + '`');
      return deps.length ? `| \`${t}\` | ${deps.join(', ')} |` : null;
    }).filter(Boolean);
    return `## ${title}\n\n${blurb}\n\n| ${head} | Loads |\n| --- | --- |\n${rows.join('\n')}\n`;
  };
  const note = (c) => c.hubs.length ? `\nDrawn without arrows (imported by more than ${HUB_LIMIT} modules here): ${c.hubs.map((h) => '`' + h + '`').join(', ')}.\n` : '';
  const section = (title, blurb, c) => { out.push(`## ${title}\n\n${blurb}\n\n${c.text}\n${note(c)}`); };

  out.push(`# Module graph

Generated by \`tools/module-graph.js\` from the real \`require\`, \`import\` and \`<script src>\` lines.
Do not edit by hand. Regenerate with \`npm run graph\` after adding or moving modules.

${files.length} files scanned, ${edges.length} internal edges. Arrows point from the file that imports to the file it imports.
Dotted arrows go through a committed build (\`lib/iso-battle/dist/core.cjs\` or \`public/iso/iso-battle.js\`)
and point at the source it is built from. Node built-ins are left out; npm packages are listed at the end.
`);

  out.push(`## Overview\n\nOne box per area. The number on an arrow is how many file-to-file imports cross it.\n\n${overview(edges)}\n`);

  const server = of('server.js', 'src', 'src/rules');
  section('Server core', '`server.js`, `src/` and `src/rules/`, without the socket handlers.', chart(server, edges));
  out.push(table('Socket handlers', 'What each file in `src/sockets/` loads. A table, because 20-odd handlers that each load many modules make an unreadable chart.', of('src/sockets'), 'Handler'));
  section('Pages and classic scripts', 'Which `<script src>` each page in `public/` loads, and the module entry points.',
    chart([...of('public pages', 'public scripts'), 'public/js/dm/main.js', 'public/js/play/main.js', 'public/js/story.js', 'lib/iso-battle/src/browser.js'], edges.filter((e) => group(e.from) === 'public pages' || group(e.from) === 'public scripts')));
  section('DM screen modules', '`public/js/dm/` and the shared modules in `public/js/` it uses.', chart([...of('public/js/dm', 'public/js'), 'lib/iso-battle/src/browser.js'], edges.filter((e) => group(e.from) === 'public/js/dm' || group(e.from) === 'public/js')));
  section('Phone modules', '`public/js/play/` and the shared modules it uses.', chart([...of('public/js/play', 'public/js', 'public/js/dm'), 'lib/iso-battle/src/browser.js'], edges.filter((e) => group(e.from) === 'public/js/play')));
  section('Iso battle map', '`lib/iso-battle/src/` and who loads it (through its builds).', chart(files, edges.filter((e) => e.from.startsWith('lib/iso-battle/') || e.to.startsWith('lib/iso-battle/')), { dir: 'TB' }));
  section('Tools', '`tools/` scripts and what they load.', chart(files, edges.filter((e) => group(e.from) === 'tools')));

  // Tests are too many for one readable chart, so they get a table.
  out.push(table('Tests', 'What each test script loads. Many tests also start `server.js` as a child process, which is not an import and is not listed.', of('test'), 'Test'));

  const ext = [...external].sort(([a], [b]) => a.localeCompare(b))
    .map(([pkg, users]) => `| \`${pkg}\` | ${users.size} | ${[...users].sort().slice(0, 6).map((u) => '`' + u + '`').join(', ')}${users.size > 6 ? ', ...' : ''} |`);
  out.push(`## npm packages\n\n| Package | Files | Used in |\n| --- | --- | --- |\n${ext.join('\n')}\n`);
  return { markdown: out.join('\n'), files, edges };
}

if (require.main === module) {
  const target = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'docs', 'module-graph.md');
  const { markdown, files, edges } = build();
  fs.writeFileSync(target, markdown);
  console.log(`Module graph: ${files.length} files, ${edges.length} edges -> ${rel(target)}`);
}

module.exports = { build, collect, specifiers, resolve };
