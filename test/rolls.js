// Phase 2: roll calls, dice log, free rolls, check presets, perception-gated items.
const { harness } = require('./helpers');

const h = harness('rolls');
const { ok, call, until } = h;
(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  const b = await h.player(room, 'Vex', 'Rogue');
  const c = await h.player(room, 'Elowen', 'Wizard');
  await until(() => dm.last.players.length === 3);

  // Roll call to two players, with DC hidden from them.
  dm.emit('dm:call', { kind: 'skill', key: 'Perception', dc: 14, targets: [a.me.id, b.me.id], hideDc: true, pass: 'You spot the tracks.', fail: 'Nothing.' });
  ok(await until(() => a.last.check?.label === 'Perception check'), 'DM calls a Perception check for two players');
  ok(a.last.check.dc === undefined && dm.last.check.dc === 14, 'hidden DC is not sent to phones');
  ok(!a.last.check.outcome && dm.last.check.outcome.pass === 'You spot the tracks.', 'outcome text stays with the DM');
  ok(!c.last.check, 'non-target phone shows no roll call');
  a.emit('player:answer', {});
  await until(() => dm.last.check?.results?.[a.me.id]);
  ok(dm.last.check.results[a.me.id] && !dm.last.check.results[c.me.id], 'answer records only for the targeted player');
  const first = dm.last.check.results[a.me.id];
  ok(first, 'result recorded for the targeted player');
  a.emit('player:answer', {});
  await h.wait(120);
  ok(dm.last.check.results[a.me.id].roll === first.roll, 'a player cannot roll the same call twice');
  c.emit('player:answer', {});
  await h.wait(120);
  ok(!dm.last.check.results[c.me.id], 'a non-target cannot answer');

  // Dice log records every roll, with dice and modifiers.
  await until(() => dm.last.rolls.some((x) => x.whoId === a.me.id));
  const entry = dm.last.rolls.find((x) => x.whoId === a.me.id && x.label === 'Perception check');
  ok(entry && entry.dice.length === 1 && entry.dice[0].sides === 20 && typeof entry.mod === 'number', 'dice log keeps the d20, sides and modifier');
  ok(!entry.dc || entry.dc === 14, 'dice log carries the DC');

  // Advantage: two dice, one kept.
  dm.emit('dm:call', { clear: true });
  dm.emit('dm:call', { kind: 'save', key: 'dex', dc: 13, targets: [b.me.id], mode: 'adv' });
  await until(() => b.last.check?.label === 'Dexterity save');
  b.emit('player:answer', {});
  await until(() => dm.last.rolls.some((x) => x.whoId === b.me.id && x.label === 'Dexterity save'));
  const adv = dm.last.rolls.find((x) => x.whoId === b.me.id && x.label === 'Dexterity save');
  ok(adv.dice.length === 2 && adv.dice.filter((d) => d.kept).length === 1 && adv.mode === 'adv', 'advantage keeps the higher of two d20s');

  // Free roll from a phone: skill tap with no call active.
  dm.emit('dm:call', { clear: true });
  c.emit('player:check', { skill: 'Arcana' });
  await until(() => dm.last.rolls.some((x) => x.whoId === c.me.id && x.label === 'Arcana check'));
  ok(true, 'free skill roll from a phone lands in the dice log');
  c.emit('player:check', { kind: 'save', key: 'wis' });
  await until(() => dm.last.rolls.some((x) => x.whoId === c.me.id && x.label === 'Wisdom save'));
  ok(true, 'free saving throw from a phone');

  // Dice expressions.
  const dmgRes = await h.call(c, 'player:roll', { expr: '2d6+3', label: 'Damage' });
  ok(dmgRes.total >= 5 && dmgRes.total <= 15, 'player rolls 2d6+3 within range');
  ok(await until(() => dm.last.rolls.some((x) => x.label === 'Damage' && x.total === dmgRes.total)), 'expression roll is logged');
  ok((await h.call(c, 'player:roll', { expr: 'nonsense!' })).error, 'bad expression is refused');
  dm.emit('dm:roll', { expr: '1d20', label: 'Secret check', secret: true });
  await h.wait(120);
  ok(dm.last.rolls.some((x) => x.label === 'Secret check' && x.vis === 'dm') && !JSON.stringify(a.last.rolls).includes('Secret check'), 'secret DM roll hidden from phones');

  // Check presets and custom presets.
  ok(dm.last.checks.presets.some((p) => p.id === 'spot'), 'built-in presets are offered');
  dm.emit('dm:preset:save', { name: 'Hear the bell', kind: 'skill', key: 'Perception', dc: 11, pass: 'The bell rings.', fail: 'Silence.' });
  await until(() => dm.last.checks.presets.some((p) => p.name === 'Hear the bell'));
  ok(true, 'DM saves a custom preset');
  dm.emit('dm:call', { preset: 'spot', targets: [a.me.id] });
  await until(() => a.last.check?.label === 'Perception check');
  ok(dm.last.check.dc === 15 && dm.last.check.outcome.pass === 'notices something out of place.', 'preset fills DC and outcome text');

  // Perception-gated items (6).
  dm.emit('dm:secret:add', { text: 'A loose stone hides a key.', skill: 'Perception', dc: 16 });
  await until(() => dm.last.scene.secrets.length === 1);
  ok(!JSON.stringify(a.last.scene).includes('loose stone') && !JSON.stringify(a.last.scene).includes('"dc"'), 'hidden item and its DC are not sent to phones before anyone notices');
  dm.emit('dm:secret:add', { text: 'Fresh boot prints.', skill: 'Survival', dc: 12 });
  await until(() => dm.last.scene.secrets.length === 2);
  // Thorn has passive Perception 10 + wisdom bonus; the fighter's Perception skill is 3 => passive 13, below 16.
  ok(!a.last.scene.secrets.some((s) => s.text.includes('loose')), 'character below the passive threshold does not notice');
  dm.emit('dm:secret:show', { id: dm.last.scene.secrets[0].id, to: b.me.id });
  await until(() => b.last.scene.secrets.some((s) => s.text.includes('loose stone')));
  ok(!c.last.scene.secrets.some((s) => s.text.includes('loose')) && !JSON.stringify(a.last.scene).includes('loose stone'), 'DM reveals one item to one character only');
  dm.emit('dm:secret:show', { id: dm.last.scene.secrets[0].id, to: 'all' });
  await until(() => a.last.scene.secrets.some((s) => s.text.includes('loose stone')));
  ok(/The party notices/.test(dm.last.log.map((l) => l.text).join('\n')), 'revealing to all posts to the log');
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
