// Test runner (Nov 18): runs every test script, prints a summary, fails at the end.
// Each run gets a throwaway DATA_DIR and UPLOAD_DIR, so tests never touch the real data/ and uploads/
// (on the game-night laptop those folders are the campaign).
//   node test/run.js            unit and socket tests (npm test)
//   node test/run.js --ui       browser tests (npm run test:ui)
//   node test/run.js rolls map  only these scripts
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const UNIT = ["rules", "visibility", "assets", "bundle", "smoke", "data", "rolls", "tv", "messages", "speech", "turns", "world", "map", "iso", "log-redaction", "hardening", "spectator", "shops", "quiz", "plans", "objectives", "difficulty", "downtime", "factions", "bulbs", "legacy", "journal", "camp", "placement", "layered", "cast", "convo", "controls", "roles", "sprites", "anim", "testparty", "takeover", "soundboard", "worldmap", "moments", "table", "table-sockets", "rests", "living", "vision", "phase-d", "puzzle", "web", "legends", "dungeon", "popups", "combatprep", "combat-ui", "codm-roles", "combat-controls", "endsession", "lore", "designer", "undo", "save-retry", "studio", "town", "soundscape", "combatfx", "nov17-fixes", "scenario", "replay", "bots", "test-session", "nov18", "items", "backup", "storybook"];
const UI = ["ui", "story-ui", "phone-popups", "worldmap-click", "dm-fields", "tv-moments-ui", "ctxmenu-ui", "conds-ui", "gamepad", "designer-ui", "conn-ui", "anim-audit-ui", "soundscape-ui", "combatfx-ui", "strike-ui", "nov18-ui", "items-ui"];

const args = process.argv.slice(2);
const names = args.includes('--ui') ? UI : (args.filter((a) => !a.startsWith('-')).length ? args.filter((a) => !a.startsWith('-')) : UNIT);
const failed = [];
const t0 = Date.now();
for (const name of names) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `tavern-run-${name}-`));
  const env = { ...process.env, DATA_DIR: path.join(tmp, 'data'), UPLOAD_DIR: path.join(tmp, 'uploads') };
  const t = Date.now();
  console.log(`\n=== ${name}`);
  const r = spawnSync(process.execPath, [path.join(__dirname, `${name}.js`)], { stdio: 'inherit', env });
  const ok = r.status === 0;
  if (!ok) failed.push(name);
  console.log(`=== ${name}: ${ok ? 'passed' : `FAILED (exit ${r.status ?? r.signal})`} in ${((Date.now() - t) / 1000).toFixed(1)} s`);
  fs.rmSync(tmp, { recursive: true, force: true });
}
const secs = ((Date.now() - t0) / 1000).toFixed(0);
console.log(`\n${names.length - failed.length} of ${names.length} test scripts passed in ${secs} s.`);
if (failed.length) { console.log(`Failed: ${failed.join(', ')}\nRe-run only those: node test/run.js ${failed.join(' ')}`); process.exit(1); }
