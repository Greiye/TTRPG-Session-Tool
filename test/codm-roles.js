// Co-DM helper roles (Mike, Nov 16): the Battle Master runs combat, the map and the DM's creatures;
// the Social Master runs NPC dialogue. Each gets its own invite QR, and neither reaches DM-only controls.
const { harness, wait } = require('./helpers');
const roles = require('../src/roles');
const h = harness('codm-roles');
const { ok, until, call } = h;

// Pure rules
{
  ok(roles.can('dm', 'dm:reset') && roles.can('dm', 'dm:say'), 'the DM can do everything');
  ok(roles.can('battle', 'dm:enemy:attack') && roles.can('battle', 'dm:map:paint') && roles.can('battle', 'dm:token:move'), 'the Battle Master runs creatures and the map');
  ok(!roles.can('battle', 'dm:say') && !roles.can('battle', 'dm:mode') && !roles.can('battle', 'dm:kick'), 'the Battle Master cannot speak as NPCs, switch modes or kick players');
  ok(roles.can('social', 'dm:say') && roles.can('social', 'dm:emotion') && roles.can('social', 'dm:choices'), 'the Social Master runs NPC dialogue');
  ok(!roles.can('social', 'dm:enemy:add') && !roles.can('social', 'dm:scene') && !roles.can('social', 'dm:handout'), 'the Social Master cannot touch combat, the scene or handouts');
  ok(!roles.can(null, 'dm:say'), 'strangers get no DM events');
  ok(roles.canUpload('battle', 'map') && !roles.canUpload('battle', 'portrait') && !roles.canUpload('social', 'map'), 'uploads follow the role');
}

(async () => {
  const srv = await h.boot({ BATTLE_KEY: 'battlekey', SOCIAL_KEY: 'socialkey' });
  const dm = await h.dm();
  const battle = await h.client();
  const social = await h.client();
  // Test clients connect from localhost, which counts as the DM unless a helper key is given; the key wins.
  ok((await call(battle, 'dm:auth', { key: 'battlekey' })).role === 'battle', 'the Battle Master key is accepted');
  ok((await call(social, 'dm:auth', { key: 'socialkey' })).role === 'social', 'the Social Master key is accepted');
  ok((await call(dm, 'dm:auth', { key: 'dmkey' })).role === 'dm', 'the DM key still makes a DM');
  await until(() => dm.last?.masters?.battle === 1 && dm.last.masters.social === 1);
  ok(dm.last.masters.battle === 1 && dm.last.masters.social === 1, 'the DM sees both helpers connected');

  // Battle Master: creatures, combat and the map.
  battle.emit('dm:enemy:add', { name: 'Ogre', hp: 30, ac: 11 });
  await until(() => dm.last.combat.enemies.some((e) => e.name === 'Ogre'));
  const ogre = dm.last.combat.enemies.find((e) => e.name === 'Ogre');
  ok(!!ogre, 'the Battle Master adds a creature');
  battle.emit('dm:hp', { id: ogre.id, delta: -5 });
  await until(() => dm.last.combat.enemies.find((e) => e.id === ogre.id)?.hp === 25);
  ok(dm.last.combat.enemies.find((e) => e.id === ogre.id)?.hp === 25, "the Battle Master damages the DM's creature");
  ok(battle.last.combat.enemies.find((e) => e.id === ogre.id)?.attacks?.length > 0, 'the Battle Master sees creature stat blocks');
  battle.emit('dm:map', { cols: 12, rows: 9 });
  await until(() => dm.last.map?.cols === 12);
  ok(dm.last.map?.cols === 12 && dm.last.map.rows === 9, 'the Battle Master edits the battle map');
  battle.emit('dm:combat:start');
  await until(() => dm.last.combat.active);
  ok(dm.last.combat.active, 'the Battle Master starts combat');

  // ...but nothing outside combat.
  const scene = dm.last.scene.title;
  battle.emit('dm:scene', { title: 'Hijacked' });
  battle.emit('dm:say', { text: 'Not mine to say' });
  battle.emit('dm:mode', { mode: 'social' });
  await wait(150);
  ok(dm.last.scene.title === scene && dm.last.mode !== 'social' && dm.last.social.line.text !== 'Not mine to say', 'the Battle Master cannot change the scene, mode or NPC lines');

  // Social Master: the NPC dialogue box.
  social.emit('dm:npc', { name: 'Brother Aldo' });
  social.emit('dm:emotion', { emotion: 'angry' });
  social.emit('dm:say', { text: 'You were not invited.' });
  await until(() => dm.last.social.line.text === 'You were not invited.');
  ok(dm.last.social.line.text === 'You were not invited.' && dm.last.social.line.speaker === 'Brother Aldo', 'the Social Master speaks as the NPC');
  ok(dm.last.social.npc.emotion === 'angry', 'the Social Master sets the NPC emotion');
  social.emit('dm:choices', { choices: ['Apologise', 'Push past'] });
  await until(() => dm.last.social.choices?.length === 2);
  ok(dm.last.social.choices?.length === 2, 'the Social Master pushes player choices');

  // ...but nothing else.
  const n = dm.last.combat.enemies.length;
  social.emit('dm:enemy:add', { name: 'Sneaky' });
  social.emit('dm:combat:end');
  social.emit('dm:reset');
  social.emit('dm:handout', { title: 'x', text: 'y', to: 'all' });
  await wait(150);
  ok(dm.last.combat.enemies.length === n && dm.last.combat.active, 'the Social Master cannot touch combat');
  ok(!(dm.last.handouts || []).some((x) => x.title === 'x'), 'the Social Master cannot send handouts');

  // Helpers see the live table, not the DM's prep or admin.
  ok(dm.last.saves !== undefined && battle.last.saves === undefined && social.last.plans === undefined && social.last.lan === undefined, "helpers don't get plans, saves or the laptop's addresses");

  // Invites: one QR per role, DM only. A helper's key can't fetch any.
  for (const role of ['battle', 'social']) {
    const r = await fetch(`${h.URL}/api/codm-url?role=${role}`);
    const { url } = await r.json();
    ok(url.endsWith(`/dm?key=${role}key`), `the ${role} invite opens the DM page with the ${role} key`);
    const qr = await fetch(`${h.URL}/codm-qr.svg?role=${role}`);
    ok(qr.status === 200 && /<svg/.test(await qr.text()), `the ${role} QR is served to the DM`);
  }
  ok((await (await fetch(`${h.URL}/api/codm-url`)).json()).url.endsWith('/dm?key=codmkey'), 'the co-DM invite opens the DM page');
  // The co-DM has every DM permission (Mike, Nov 16).
  const co = await h.client();
  ok((await call(co, 'dm:auth', { key: 'codmkey' })).role === 'dm', 'the co-DM key makes a second DM');
  co.emit('dm:scene', { title: 'Co-DM scene' });
  await until(() => dm.last.scene.title === 'Co-DM scene');
  ok(dm.last.scene.title === 'Co-DM scene' && co.last.saves !== undefined, 'the co-DM changes the scene and sees what the DM sees');
  ok(dm.last.codms === 1, 'the DM page counts the co-DM');

  // Uploads follow roles.canUpload (checked above); HTTP from localhost always counts as the DM, so not here.
  await h.done(srv);
})();
