// Scenario seeder (tools/scenario.js): seeds a PLACEHOLDER table into its own profile folder, never data/.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { harness, ROOT } = require('./helpers');
const scenario = require('../tools/scenario');
const h = harness('scenario');
const { ok } = h;

// Profile names stay inside profiles/.
for (const bad of ['../data', '..', 'a/b', '']) {
  let threw = false;
  try { execFileSync(process.execPath, ['tools/scenario.js', '--seed-only', '--name', bad], { cwd: ROOT, stdio: 'pipe' }); } catch { threw = true; }
  ok(threw, `profile name "${bad}" is refused`);
}
ok(scenario.profileDir('x') === path.join(ROOT, 'profiles', 'x'), 'a profile lives in profiles/<name>');

const name = `test-${process.pid}`;
const dir = scenario.profileDir(name);
const realData = path.join(ROOT, 'data', 'campaign.json');
const before = fs.existsSync(realData) ? fs.statSync(realData).mtimeMs : null;
try {
  const out = execFileSync(process.execPath, ['tools/scenario.js', '--seed-only', '--name', name], { cwd: ROOT, encoding: 'utf8' });
  ok(/Seeded: 4 characters/.test(out), 'the seeder reports the party it seeded');
  const c = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'campaign.json'), 'utf8'));
  const r = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'characters.json'), 'utf8'));
  const party = c.party.map((id) => r[id]);
  ok(party.length === 4 && party.every((p) => p.name.startsWith('PLACEHOLDER ') && p.gold === 100), 'four PLACEHOLDER characters sit at the table with gold');
  ok(c.mode === 'combat' && !c.combat.active && c.combat.order.length === 0, 'the table is in combat mode, waiting for initiative');
  ok(c.combat.enemies.length === 3 && c.combat.enemies.every((e) => e.name.startsWith('PLACEHOLDER ')), 'three PLACEHOLDER creatures are on the field');
  const shop = c.shops.find((s) => s.name === 'PLACEHOLDER General Store');
  ok(shop && shop.items.length === 5 && shop.items.every((i) => i.name.startsWith('PLACEHOLDER ')), 'the PLACEHOLDER shop has five items');
  ok(c.worldMap.nodes.length > 0 && c.town.maps.w1?.nodes.length === 5, 'the world map and Millbrook\'s town map are there');
  ok(c.dungeon.nodes.length > 0, 'the example dungeon is there');
  const after = fs.existsSync(realData) ? fs.statSync(realData).mtimeMs : null;
  ok(before === after, 'data/campaign.json is not touched');

  const again = execFileSync(process.execPath, ['tools/scenario.js', '--seed-only', '--name', name], { cwd: ROOT, encoding: 'utf8' });
  ok(/already seeded/.test(again), 'a seeded profile is kept, not reseeded');
  const c2 = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'campaign.json'), 'utf8'));
  ok(c2.combat.enemies.length === 3, 'keeping it does not add creatures twice');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
  try { fs.rmdirSync(scenario.PROFILES); } catch { /* other profiles stay */ }
}
h.done();
