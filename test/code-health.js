// Code health (Nov 24): the duplication audit finds copies, the CSS uses the motion tokens, and pop-ups use one shell.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { harness, ROOT } = require('./helpers');
const dupes = require('../tools/dupes');

const h = harness('code-health');
const { ok } = h;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
(async () => {
  // Duplication audit
  const body = (word, n) => `{ const list = input.filter((x) => x.on).map((x) => x.name); if (!list.length) { say('${word}'); return null; } const out = list.join(', '); box.textContent = out; return { out, n: ${n} }; }`;
  const fns = [...dupes.functions('a.js', `function one(input) ${body('none', 1)}`), ...dupes.functions('b.js', `const two = (input) => ${body('empty', 22)};`),
    ...dupes.functions('c.js', 'function three(a, b) { for (let i = 0; i < a.length; i++) { if (a[i] === b[i]) continue; else throw new Error(String(a[i]) + b[i] + i); } return a.length - b.length; }')];
  ok(fns.length === 3, 'finds function declarations and arrow functions');
  const pairs = dupes.nearDuplicates(fns);
  ok(pairs.length === 1 && pairs[0].a.name === 'one' && pairs[0].b.name === 'two', 'pairs two functions that differ only in a string and a number');
  const css = dupes.cssBlocks('x.css', '/* x */\n.a { color: red; top: 0; left: 0 }\n.b { left:0; top:0;\n color:red; }\n@media print { .c { color: red; top: 0; left: 0; } }\n@keyframes k1 { to { opacity: 0; } }\n@keyframes k2 { to { opacity:0; } }');
  const rg = dupes.groups(css.rules);
  ok(rg.length === 1 && rg[0].map((x) => x.sel).join() === '.a,.b', 'groups the same declarations in any order, not across @media');
  ok(rg[0][0].line === 2 && rg[0][1].line === 3, 'gives the right lines');
  ok(dupes.groups(css.frames).length === 1, 'groups the same keyframes');
  const out = path.join(h.TMP, 'dupes.md');
  execFileSync(process.execPath, [path.join(ROOT, 'tools/dupes.js'), out]);
  ok(/## Functions[\s\S]*## CSS rules[\s\S]*## Keyframes/.test(fs.readFileSync(out, 'utf8')), 'writes a report where it is told');
  ok(read('docs/duplication-report.md').includes('npm run dupes'), 'the report is in docs/');

  // Motion tokens
  const sheets = fs.readdirSync(path.join(ROOT, 'public')).filter((f) => f.endsWith('.css'));
  const stray = sheets.flatMap((f) => [...read(`public/${f}`).matchAll(/^.*cubic-bezier.*$/gm)].map((m) => `${f}: ${m[0].trim()}`)).filter((l) => !/--ease(-bounce)?:/.test(l));
  ok(!stray.length, `no easing curves outside the tokens${stray.length ? `: ${stray.join(' | ')}` : ''}`);
  const used = new Set(sheets.flatMap((f) => [...read(`public/${f}`).matchAll(/var\((--(?:ease|t)-?[a-z]*)\)/g)].map((m) => m[1])));
  const theme = read('public/theme.css');
  ok([...used].filter((t) => /^--(ease|t-)/.test(t)).every((t) => theme.includes(`${t}:`)), 'every token used is defined in theme.css');
  for (const p of ['dm', 'screen', 'play', 'codm', 'story']) ok(read(`public/${p}.html`).includes('theme.css'), `${p}.html loads the tokens`);
  ok(!/cubic-bezier/.test(read('public/anim.js')), 'anim.js reads the tokens');

  // Dialog shell
  for (const f of ['hitdice', 'lobby', 'socialpop', 'popups', 'dungeon', 'town']) ok(/sheetPop\(/.test(read(`public/js/play/${f}.js`)) && !/pop-scrim/.test(read(`public/js/play/${f}.js`)), `${f}.js uses the shared pop-up`);
  for (const f of ['designer', 'itemdesigner', 'keywords']) ok(/closable\(/.test(read(`public/js/dm/${f}.js`)), `${f}.js closes through the shared shell`);
  await h.done();
})();
