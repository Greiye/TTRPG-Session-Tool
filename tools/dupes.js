// Duplication audit (Nov 24): lists near-duplicate functions, repeated CSS rules and repeated @keyframes.
//   npm run dupes                 rewrite docs/duplication-report.md
//   node tools/dupes.js out.md    write somewhere else (the test does this)
// Functions are compared by runs of tokens. Strings and numbers count as the same token, names do not,
// so two functions match when they do the same thing to the same things.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['src', 'public'];
const SKIP = new Set(['iso', 'node_modules']); // public/iso is a build
const MIN_TOKENS = 40; // shorter functions are too small to be worth merging
const SIMILAR = 0.7; // share of token runs two functions must have in common
const RUN = 4;
const MIN_DECLS = 3; // CSS rules with fewer declarations are left alone

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
function walk(dir, ext, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, ext, out);
    else if (e.name.endsWith(ext)) out.push(full);
  }
  return out;
}
const lineAt = (src, i) => src.slice(0, i).split('\n').length;

// Tokens with their place in the source. Template literals count as one string.
const TOKEN = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|`(?:\\[\s\S]|[^\\`])*`|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|\d[\w.]*|[A-Za-z_$][\w$]*|=>|[=!]==?|&&|\|\||\?\?|\?\.|\.\.\.|\S/g;
function tokens(src) {
  const out = [];
  for (const m of src.matchAll(TOKEN)) {
    const s = m[0];
    if (s.startsWith('//') || s.startsWith('/*')) continue;
    out.push({ t: /^['"`]/.test(s) ? '"' : /^\d/.test(s) ? '0' : s, i: m.index });
  }
  return out;
}

// Index just past the bracket that closes the one at j.
function pastClose(toks, j, open, shut) {
  let d = 0;
  for (; j < toks.length; j++) {
    if (toks[j].t === open) d++;
    else if (toks[j].t === shut && --d === 0) return j + 1;
  }
  return j;
}

// Named functions: function f() {…} and f = (…) => {…}. Bodies are found by matching braces.
function functions(file, src) {
  const toks = tokens(src);
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const decl = toks[i].t === 'function';
    let name; let j;
    if (decl && /^[A-Za-z_$]/.test(toks[i + 1]?.t || '')) { name = toks[i + 1].t; j = i + 2; }
    else if (/^(const|let)$/.test(toks[i].t) && toks[i + 2]?.t === '=') { name = toks[i + 1].t; j = toks[i + 3]?.t === 'async' ? i + 4 : i + 3; }
    else continue;
    if (toks[j]?.t === '(') j = pastClose(toks, j, '(', ')');
    else if (!decl && toks[j + 1]?.t === '=>') j++;
    else continue;
    if (!decl) { if (toks[j]?.t !== '=>') continue; j++; }
    if (toks[j]?.t !== '{') continue;
    const end = pastClose(toks, j, '{', '}');
    const body = toks.slice(j, end).map((x) => x.t);
    if (body.length >= MIN_TOKENS) out.push({ file, name, line: lineAt(src, toks[i].i), end: lineAt(src, toks[end - 1].i), body });
  }
  return out;
}
function runs(body) {
  const s = new Set();
  for (let i = 0; i + RUN <= body.length; i++) s.add(body.slice(i, i + RUN).join(' '));
  return s;
}
function similarity(a, b) {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / (a.size + b.size - n || 1);
}
// Pairs close enough to merge. A function nested inside the other does not count.
function nearDuplicates(fns) {
  const list = fns.map((f) => ({ ...f, runs: runs(f.body) }));
  const out = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]; const b = list[j];
      if (Math.min(a.runs.size, b.runs.size) / Math.max(a.runs.size, b.runs.size) < SIMILAR) continue;
      if (a.file === b.file && a.line <= b.end && b.line <= a.end) continue;
      const score = similarity(a.runs, b.runs);
      if (score >= SIMILAR) out.push({ a, b, score, tokens: Math.min(a.body.length, b.body.length) });
    }
  }
  return out.sort((x, y) => y.score - x.score || y.tokens - x.tokens);
}

// CSS: rules with the same declarations (in any order) in the same @media, and @keyframes with the same frames.
function cssBlocks(file, src) {
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const rules = []; const frames = [];
  const norm = (s) => s.split(';').map((d) => d.trim().replace(/\s+/g, ' ').replace(/\s*([:,])\s*/g, '$1')).filter(Boolean).sort();
  const scan = (from, to, at) => {
    let i = from;
    while (i < to) {
      const open = clean.indexOf('{', i);
      if (open < 0 || open >= to) return;
      const raw = clean.slice(i, open);
      const head = raw.slice(raw.lastIndexOf(';') + 1);
      const sel = head.trim().replace(/\s+/g, ' ');
      const line = lineAt(clean, open - head.trimStart().length);
      let d = 1; let j = open + 1;
      while (j < to && d) { if (clean[j] === '{') d++; if (clean[j] === '}') d--; j++; }
      const inner = clean.slice(open + 1, j - 1);
      if (/^@(-webkit-)?keyframes/.test(sel)) frames.push({ file, line, name: sel.split(' ')[1], key: inner.replace(/\s+/g, '') });
      else if (/^@(media|supports|layer)/.test(sel)) scan(open + 1, j - 1, sel);
      else if (!sel.startsWith('@')) {
        const decls = norm(inner);
        if (decls.length >= MIN_DECLS) rules.push({ file, line, sel, key: `${at}|${decls.join(';')}`, n: decls.length });
      }
      i = j;
    }
  };
  scan(0, clean.length, '');
  return { rules, frames };
}
function groups(list) {
  const m = new Map();
  for (const x of list) m.set(x.key, [...(m.get(x.key) || []), x]);
  return [...m.values()].filter((g) => g.length > 1);
}

function collect() {
  const read = (p) => ({ file: rel(p), src: fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n') });
  const all = (ext) => DIRS.flatMap((d) => walk(path.join(ROOT, d), ext)).map(read).sort((a, b) => (a.file < b.file ? -1 : 1));
  const css = all('.css').map(({ file, src }) => cssBlocks(file, src));
  return {
    pairs: nearDuplicates(all('.js').flatMap(({ file, src }) => functions(file, src))),
    rules: groups(css.flatMap((c) => c.rules)),
    frames: groups(css.flatMap((c) => c.frames)),
  };
}

// Where a pair should end up: the same file keeps it; two server files share src/, two pages share public/.
function mergeInto(a, b) {
  const both = (dir) => a.file.startsWith(dir) && b.file.startsWith(dir);
  if (a.file === b.file) return `one function in \`${a.file}\``;
  if (both('src/')) return 'a shared helper in `src/`';
  if (both('public/js/')) return 'a shared module in `public/js/`';
  if (both('public/')) return 'a shared script in `public/`';
  return 'keep both (one runs on the server, one in the browser)';
}
const cell = (s) => String(s).replace(/\|/g, '\\|');
function report({ pairs, rules, frames }) {
  const at = (x) => `\`${x.file}:${x.line}\``;
  const list = (g, name) => g.map((x) => `${at(x)} \`${cell(name(x))}\``).join('<br>');
  return `# Duplication report

Written by \`npm run dupes\` (\`tools/dupes.js\`); do not edit by hand. It lists code that looks copied, as a
to-do list for small merges. A match is a suggestion: two functions can look alike and still need to stay apart.

- Near-duplicate functions: **${pairs.length}** pairs (at least ${MIN_TOKENS} tokens, ${SIMILAR * 100}% alike)
- Repeated CSS rules: **${rules.length}** groups (at least ${MIN_DECLS} declarations, all the same)
- Repeated \`@keyframes\`: **${frames.length}** groups

## Functions

| Alike | First | Second | Merge into |
| --- | --- | --- | --- |
${pairs.map(({ a, b, score }) => `| ${Math.floor(score * 100)}% | ${list([a], (x) => x.name)} | ${list([b], (x) => x.name)} | ${mergeInto(a, b)} |`).join('\n')}

## CSS rules

| Declarations | Where | Merge into |
| --- | --- | --- |
${rules.map((g) => `| ${g[0].n} | ${list(g, (x) => x.sel)} | one rule with every selector |`).join('\n')}

## Keyframes

| Where | Merge into |
| --- | --- |
${frames.map((g) => `| ${list(g, (x) => x.name)} | \`${g[0].name}\` |`).join('\n')}
`;
}

module.exports = { functions, nearDuplicates, cssBlocks, groups, collect, report };
if (require.main === module) {
  const out = path.resolve(process.argv[2] || path.join(ROOT, 'docs/duplication-report.md'));
  const found = collect();
  fs.writeFileSync(out, report(found));
  console.log(`${found.pairs.length} function pairs, ${found.rules.length} CSS rule groups, ${found.frames.length} keyframe groups. Wrote ${out}`);
}
