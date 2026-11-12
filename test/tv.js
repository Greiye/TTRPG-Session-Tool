// Phase 3: fog of war, boss title cards, four-player table.
const { harness } = require('./helpers');

const h = harness('tv');
const { ok, until } = h;
(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const players = [];
  for (const [n, cls] of [['Thorn', 'Fighter'], ['Vex', 'Rogue'], ['Elowen', 'Wizard'], ['Brannoc', 'Cleric']]) players.push(await h.player(room, n, cls));
  ok(await until(() => dm.last.players.length === 4), 'four players seated');
  ok(await until(() => players.every((p) => p.last.players.length === 4)), 'every phone sees all four');

  // Fog of war (7c)
  ok(dm.last.scene.revealed.length === 0, 'points of interest start covered');
  dm.emit('dm:reveal', { poi: 'Toppled shrine' });
  ok(await until(() => dm.last.scene.revealed.includes('Toppled shrine')), 'DM uncovers one point of interest');
  dm.emit('dm:reveal', { all: true });
  ok(await until(() => dm.last.scene.revealed.length === 3), 'uncover all reveals every point');
  dm.emit('dm:reveal', { all: true, hide: true });
  ok(await until(() => dm.last.scene.revealed.length === 0), 'cover all hides every point again');
  dm.emit('dm:reveal', { poi: 'Old mill in the fog' });
  ok(await until(() => players[0].last.scene.revealed.includes('Old mill in the fog')), 'reveal reaches the phones');

  // Boss title cards (7b)
  dm.emit('dm:creature:save', { name: 'Terror of the Mill', side: 'enemy', hp: 60, ac: 15, boss: true, title: 'Terror of the Mill', attacks: [{ name: 'Claw', atk: 6, dmg: '2d8+4' }] });
  await h.wait(200);
  const lib = await (await fetch(`${h.URL}/api/creatures`)).json();
  const b = lib.find((c) => c.name === 'Terror of the Mill');
  dm.emit('dm:creature:spawn', { id: b.id });
  await until(() => dm.last.combat.enemies.length === 1);
  dm.emit('dm:boss:card', { id: dm.last.combat.enemies[0].id });
  ok(await until(() => players[2].last.bossCard?.name === 'Terror of the Mill'), 'boss title card reaches the TV and phones');
  ok(players[2].last.bossCard.title === 'Terror of the Mill', 'title card carries the boss title');
  dm.emit('dm:combat:start', {});
  ok(await until(() => dm.last.combat.active && dm.last.bossCard?.n >= 2), 'starting combat re-shows the boss card');
  dm.emit('dm:boss:clear', {});
  ok(await until(() => dm.last.bossCard === null), 'DM clears the title card');
  dm.emit('dm:combat:end', {});
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
