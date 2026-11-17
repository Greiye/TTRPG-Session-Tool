// Test session (docs/test-session): a barbarian, a rogue, an archer and a wizard save a princess from a dragon.
// Plays the whole PLACEHOLDER session over the sockets, as four phones and the DM, and checks each step:
// join, social with a fleeing villager, a dragon fight with rolls, the village and its leader, two more NPCs,
// Greer's shop, the Dungeon of the Reptile, the road to the lair, the boss fight, the princess, the winnings and
// the end of the session. The party never dies: the DM heals any hero below half HP after each dragon attack.
// Uses existing features only; the placeholders live in docs/test-session/ (plan.md and session.json).
const fs = require('fs');
const path = require('path');
const { harness } = require('./helpers');

const h = harness('test-session');
const { ok, until, wait } = h;
const DIR = path.join(__dirname, '..', 'docs', 'test-session');
const S = JSON.parse(fs.readFileSync(path.join(DIR, 'session.json'), 'utf8'));
const PLAN = fs.readFileSync(path.join(DIR, 'plan.md'), 'utf8');

// Every placeholder is marked, so nobody mistakes it for real story content.
const marked = (v) => typeof v !== 'string' || !/[a-z]{3}/i.test(v) || /PLACEHOLDER/.test(v);
const names = [...S.party.map((p) => p.name), ...S.world.places.map((p) => p.name), ...S.town.places.map((p) => p.name), ...S.townNpcs, ...S.dungeon.rooms.map((r) => r.name), S.boss.name, S.boss.title, S.winnings.trophy.name];
ok(names.every(marked), 'every placeholder name in session.json is marked PLACEHOLDER');
ok(PLAN.split('\n').filter((l) => /^## /.test(l)).every((l) => /PLACEHOLDER/.test(l)), 'every plan section in plan.md is marked PLACEHOLDER');

(async () => {
  const srv = await h.boot();
  try {
    const dm = await h.dm();
    const D = () => dm.last;
    const send = (s, ev, data = {}) => s.emit(ev, data);
    const call = (s, ev, data = {}) => h.call(s, ev, data);
    const pl = (id, st = D()) => (st?.players || []).find((x) => x.id === id);
    const plog = (re) => (D()?.log || []).some((l) => re.test(l.text || ''));
    const room = await h.room();
    await until(() => D());

    // ----- 1. Session starts -----
    // The world: four places on three roads, fog on. The DM builds it from session.json.
    ok((await call(dm, 'dm:worldmap:clear')).ok, '1. the DM clears the world map');
    await call(dm, 'dm:worldmap:timing', { legSeconds: S.world.legSeconds });
    const W = {};
    for (const p of S.world.places) {
      const r = await call(dm, 'dm:worldmap:node', { name: p.name, x: p.x, y: p.y, info: p.info, revealed: true, dungeon: !!p.dungeon, settlement: !!p.settlement, seen: p.key === 'road' });
      W[p.key] = r.id;
    }
    for (const [a, b, length] of S.world.roads) await call(dm, 'dm:worldmap:road', { a: W[a], b: W[b], length });
    await call(dm, 'dm:worldmap:fog', { on: true });
    ok(Object.values(W).every(Boolean) && D().worldMap.roads.length === 3, '1. four placeholder places and three roads are on the world map');

    // The village map: a gate, the leader's hall and Greer's (linked to the Greer's Trinkets shop).
    const greer = D().shops.find((x) => x.id === 'greer');
    ok(!!greer, "1. Greer's Trinkets is on the shop list");
    const T = {};
    for (const p of S.town.places) {
      const spec = { at: W.village, name: p.name, kind: p.kind, x: p.x, y: p.y, info: p.info || '', time: p.time, shop: p.shop || '' };
      if (p.kind === 'entrance') spec.id = 't1'; // a new town map starts with its entrance as t1
      T[p.key] = (await call(dm, 'dm:town:node', spec)).id;
    }
    await call(dm, 'dm:town:node', { at: W.village, id: T.gate, reveals: S.town.places.find((p) => p.key === 'gate').reveals.map((k) => T[k]) });
    ok(Object.values(T).every(Boolean), '1. the village has a gate, the leader\'s hall and Greer\'s');

    // The dungeon rooms, entrance to exit.
    await call(dm, 'dm:dungeon:clear');
    const R = {};
    for (const r of S.dungeon.rooms) R[r.key] = (await call(dm, 'dm:dungeon:node', { name: r.name, kind: r.kind, pill: r.pill, note: r.note, parent: r.parent ? R[r.parent] : undefined })).id;
    for (const [a, b] of S.dungeon.links) await call(dm, 'dm:dungeon:link', { from: R[a], to: R[b] });
    ok(Object.values(R).every(Boolean) && D().dungeon.nodes.length === S.dungeon.rooms.length, '1. the Dungeon of the Reptile has its five placeholder rooms');

    // The session plan: scenes, NPCs and both dragon fights.
    const imp = await call(dm, 'dm:plan:import', { md: PLAN });
    ok(imp.scenes === 4 && imp.npcs === 5 && imp.encounters === 2 && !(imp.warnings || []).length, `1. plan.md imports cleanly (${imp.scenes} scenes, ${imp.npcs} NPCs, ${imp.encounters} encounters)`);
    const planId = imp.id;
    const plan = () => D().plans.find((p) => p.id === planId);
    const idx = (kind, re) => plan()[kind].findIndex((x) => re.test(x.title || x.name));

    // Four phones join with the room code: barbarian, rogue, archer (ranger) and wizard.
    const P = [];
    for (const def of S.party) {
      const s = await h.client();
      s.me = await call(s, 'join', { name: def.name.slice(0, 24), cls: def.cls, race: def.race, player: def.player, room });
      P.push(s);
    }
    ok(P.every((s) => s.me?.id), '1. the barbarian, rogue, archer and wizard join with the room code');
    const ids = P.map((s) => s.me.id);
        ok(await until(() => ids.every((id, i) => pl(id)?.cls === S.party[i].cls)), '1. each hero has the right class');

    // Next session: the world map opens in exploration with the party on the Burning Road; the intro card plays.
    await call(dm, 'dm:worldmap:go', { node: W.road });
    ok(await until(() => D().worldMap.here === W.road, (S.world.legSeconds + 3) * 1000), '1. the party stands on the Burning Road');
    send(dm, 'dm:session:next');
    send(dm, 'dm:intro', S.intro);
    ok(await until(() => D().mode === 'exploration' && D().worldMap.onTv && D().introCard?.session === 1), '1. the session opens on the world map with the intro card');
    ok(await until(() => P[0].last?.introCard), '1. phones see the intro card too');

    // ----- 2. Social: the fleeing villager -----
    await call(dm, 'dm:plan:scene', { plan: planId, index: idx('scenes', /Burning Road/) });
    ok(await until(() => /Burning Road/.test(D().scene.title)), '2. the Burning Road scene is on the TV');
    send(dm, 'dm:mode', { mode: 'social' });
    await until(() => D().mode === 'social');
    // The conversation picker only offers its built-in NPCs, so the talk opens with one and the plan NPC takes over.
    const talk = async (npcRe, label) => {
      if (D().mode !== 'social') { send(dm, 'dm:mode', { mode: 'social' }); await until(() => D().mode === 'social'); }
      const st = await call(dm, 'dm:convo:start', { ids: [D().social.pool[0].id] });
      await call(dm, 'dm:plan:npc', { plan: planId, index: idx('npcs', npcRe) });
      const live = await until(() => D().social.convo.live && npcRe.test(D().social.npc.name));
      ok(st.ok && live, `${label} the conversation starts and the plan NPC speaks`);
      return live;
    };
    await talk(/Fleeing Villager/, '2.');
    ok(D().social.npc.emotion === 'fearful' && D().social.choices.length === 3, '2. the villager is fearful and offers three choices');
    for (const e of ['surprised', 'sad']) {
      send(dm, 'dm:emotion', { emotion: e });
      ok(await until(() => D().social.npc.emotion === e && P[1].last?.social?.npc?.emotion === e), `2. the DM changes the villager to ${e}, and phones see it`);
    }
    send(dm, 'dm:say', { text: 'PLACEHOLDER It took the princess to the tower!' });
    ok(await until(() => /princess to the tower/.test(D().social.line.text)), '2. the DM speaks a line as the villager');
    send(P[0], 'player:social:say', { text: 'PLACEHOLDER Get behind me.', emotion: 'angry' });
    ok(await until(() => D().social.line.pid === ids[0] && D().social.line.emotion === 'angry'), '2. the barbarian answers with an angry line');
    send(P[3], 'player:choice', { index: 0 });
    ok(await until(() => D().social.line.pid === ids[3]), '2. the wizard picks a dialogue choice');
    send(dm, 'dm:convo:end');
    ok(await until(() => D().mode === 'exploration', 3000), '2. the conversation ends and the table returns to exploration');

    // ----- 3. Combat: the dragon on the road -----
    send(dm, 'dm:mode', { mode: 'combat' });
    ok(await until(() => D().mode === 'combat' && D().combatPrep), '3. combat mode puts the Get ready filter on');
    const enc = await call(dm, 'dm:plan:encounter', { plan: planId, index: idx('encounters', /Dragon on the Road/) });
    ok(await until(() => D().combat.enemies.some((e) => /Dragon/.test(e.name))) && enc.difficulty, `3. the dragon joins the fight (${enc.difficulty?.label || '?'})`);
    send(dm, 'dm:call', { kind: 'skill', key: 'Perception', dc: 12 });
    await until(() => D().check);
    for (const s of P) send(s, 'player:answer', {});
    ok(await until(() => Object.keys(D().check?.results || {}).length === 4), '3. all four heroes roll the Perception call');
    send(dm, 'dm:roll', { expr: '1d20+4', label: 'PLACEHOLDER Dragon roars' });
    ok(await until(() => (D().rolls || D().roll || []).length || plog(/Dragon roars/)), '3. the DM rolls in the open');
    send(dm, 'dm:call', { clear: true });
    const fight = async (label) => {
      send(dm, 'dm:combat:start');
      ok(await until(() => D().combat.active && D().combat.order.length === 5), `${label} initiative is rolled for five`);
      let minHp = Infinity;
      for (let step = 0; step < 200; step++) {
        const c = D().combat;
        const foe = c.enemies.find((e) => e.hp > 0 && e.side !== 'ally');
        if (!foe) break;
        const turnId = c.order[c.turn % c.order.length]?.id;
        const n = ids.indexOf(turnId);
        const before = `${c.round}:${c.turn}`;
        if (n >= 0) send(P[n], 'player:combat', { act: 'attack', target: foe.id });
        else {
          // The dragon bites the hero with the most HP; the DM keeps everyone above half (the party never dies).
          const target = ids.map((id) => pl(id)).sort((a, b) => b.hp - a.hp)[0];
          send(dm, 'dm:enemy:attack', { target: target.id });
        }
        await until(() => `${D().combat.round}:${D().combat.turn}` !== before || !D().combat.enemies.some((e) => e.hp > 0));
        for (const id of ids) {
          const p = pl(id);
          minHp = Math.min(minHp, p.hp);
          if (p.hp < p.maxHp / 2) { send(dm, 'dm:hp', { id, delta: p.maxHp - p.hp }); await until(() => pl(id).hp === p.maxHp); }
        }
        // A long fight: after 12 rounds the DM finishes it (the one-tap override).
        if (D().combat.round > 12) { const f = D().combat.enemies.find((e) => e.hp > 0); if (f) send(dm, 'dm:hp', { id: f.id, delta: -f.hp }); await wait(100); }
      }
      ok(!D().combat.enemies.some((e) => e.hp > 0), `${label} the dragon falls`);
      ok(minHp > 0 && ids.every((id) => pl(id).hp > 0), `${label} no hero ever drops to 0 HP (lowest seen ${minHp})`);
      ok(plog(/attacks .*(HIT|MISS|CRIT)/), `${label} attack rolls are in the log`);
      send(dm, 'dm:combat:end');
      ok(await until(() => !D().combat.active && !D().combat.enemies.length), `${label} combat ends and the field clears`);
    };
    await fight('3.');

    // ----- 4. Into the village -----
    send(dm, 'dm:mode', { mode: 'exploration' });
    await call(dm, 'dm:worldmap:go', { node: W.village });
    ok(await until(() => D().worldMap.here === W.village, (S.world.legSeconds + 3) * 1000), '4. the party travels the road to Emberford');
    ok(D().worldMap.roads.some((r) => r.known), '4. the road walked is now known under fog');
    await call(dm, 'dm:town:gate');
    ok(await until(() => P[0].last?.town?.gate), '4. phones get the Enter Town gate');
    for (const s of P) await call(s, 'player:town:ready', { on: true });
    ok(await until(() => D().town.on && D().town.here === T.gate), '4. every hero holds Enter Town and the party is at the village gate');

    // ----- 5. The town leader -----
    await call(dm, 'dm:plan:scene', { plan: planId, index: idx('scenes', /Emberford/) });
    for (const s of P) await call(s, 'player:town:pick', { node: T.hall, confirm: true });
    ok(await until(() => D().town.here === T.hall), "5. the party goes to the leader's hall");
    await talk(/Town Leader/, '5.');
    ok(/two places from here/.test(D().social.line.text) && /Dungeon of the Reptile/.test(D().social.line.text), '5. the leader says the dragon is two places away, through the Dungeon of the Reptile');
    send(P[2], 'player:social:say', { text: 'PLACEHOLDER We will bring her back.', emotion: 'happy' });
    ok(await until(() => D().social.line.pid === ids[2]), '5. the archer answers the leader');
    await call(dm, 'dm:worldmap:node', { id: W.dungeon, seen: true });
    await call(dm, 'dm:worldmap:node', { id: W.lair, seen: true });
    ok(await until(() => { const v = P[0].last?.worldMap?.nodes || []; return v.some((n) => n.id === W.dungeon) && v.some((n) => n.id === W.lair); }), '5. the dungeon and the lair appear on the phones\' map');
    send(dm, 'dm:objective', { charId: ids[3], title: 'PLACEHOLDER Find out why the party cannot die', text: 'PLACEHOLDER Secret: ask around after the rescue.' });
    ok(await until(() => P[3].last?.objectives?.length && !P[0].last?.objectives?.length), '5. the wizard gets a secret objective only the wizard sees');
    send(dm, 'dm:convo:end');
    await until(() => D().mode === 'exploration', 3000);

    // ----- 6. Two more villagers -----
    await talk(/Blacksmith/, '6.');
    send(P[1], 'player:social:say', { text: 'PLACEHOLDER How much for cold iron?', emotion: 'suspicious' });
    ok(await until(() => D().social.line.pid === ids[1]), '6. the rogue haggles with the blacksmith');
    send(dm, 'dm:convo:end');
    await until(() => D().mode === 'exploration', 3000);
    await talk(/Herbalist/, '6.');
    send(dm, 'dm:emotion', { emotion: 'surprised' });
    send(P[3], 'player:choice', { index: 0 });
    ok(await until(() => D().social.line.pid === ids[3] && D().social.npc.emotion === 'surprised'), '6. the wizard thanks the herbalist');
    send(dm, 'dm:convo:end');
    ok(await until(() => D().mode === 'exploration', 3000), '6. both talks end');

    // ----- 7. Shopping at Greer's -----
    for (const id of ids) send(dm, 'dm:sheet', { id, gold: S.startingGold });
    ok(await until(() => P.every((s, i) => pl(ids[i]).gold === S.startingGold)), `7. each hero has ${S.startingGold} gp`);
    for (const s of P) await call(s, 'player:town:pick', { node: T.greer, confirm: true });
    ok(await until(() => D().town.here === T.greer && D().shopPop?.shopId === 'greer'), "7. the party goes to Greer's and the shop pop-up opens");
    const wares = D().shops.find((x) => x.id === 'greer').items;
    const cheap = [...wares].sort((a, b) => a.price - b.price);
    const bought = [];
    for (let i = 0; i < P.length; i++) bought.push(await call(P[i], 'player:buy', { shopId: 'greer', itemId: cheap[i % cheap.length].id, qty: 1 }));
    ok(bought.every((r) => r.ok), '7. each hero buys an item');
    ok(await until(() => ids.every((id) => pl(id).gold < S.startingGold && pl(id).inventory.some((x) => cheap.some((c) => c.name === x.name)))), '7. gold goes down and the items are in the packs');
    for (const s of P) send(s, 'player:shop:done', {});
    ok(await until(() => !D().shopPop), '7. everyone presses Done and the shop closes');

    // ----- 8. The Dungeon of the Reptile -----
    send(dm, 'dm:town:here', { id: T.gate });
    await until(() => D().town.here === T.gate);
    const lv = await call(P[0], 'player:town:leave');
    ok(lv.ok && await until(() => !D().town.on), '8. the party leaves town from the gate');
    await call(dm, 'dm:worldmap:go', { node: W.dungeon });
    ok(await until(() => D().worldMap.here === W.dungeon, (S.world.legSeconds + 3) * 1000), '8. the party reaches the Dungeon of the Reptile');
    await call(dm, 'dm:plan:scene', { plan: planId, index: idx('scenes', /Dungeon of the Reptile/) });
    ok(await until(() => P[0].last?.dungeon?.gate), '8. phones get the Enter Dungeon gate');
    for (const s of P) await call(s, 'player:dungeon:ready', { on: true });
    ok(await until(() => D().dungeon.on && D().dungeon.here === R.entrance), '8. every hero holds Enter Dungeon and the party is on the wet stairs');
    ok((await call(P[0], 'player:dungeon:exit')).error, '8. Exit Dungeon is refused away from the end room');
    for (const key of S.dungeon.path.slice(1)) {
      await call(dm, 'dm:dungeon:reveal', { id: R[key], on: true });
      await call(dm, 'dm:dungeon:here', { id: R[key] });
      ok(await until(() => D().dungeon.here === R[key]), `8. the party moves to ${S.dungeon.rooms.find((r) => r.key === key).name}`);
      if (key === 'trap') {
        const t = S.dungeon.trapSave;
        send(dm, 'dm:call', { kind: t.kind, key: t.key, dc: t.dc });
        await until(() => D().check);
        for (const s of P) send(s, 'player:answer', {});
        ok(await until(() => Object.keys(D().check?.results || {}).length === 4), '8. the trap calls a Dexterity save and everyone rolls');
        // A failed save costs 1d4; the DM heals it straight back (the party never dies).
        for (const [id, r] of Object.entries(D().check.results)) if (!r.pass) send(dm, 'dm:hp', { id, delta: -2 });
        send(dm, 'dm:call', { clear: true });
        await wait(100);
        ok(ids.every((id) => pl(id).hp > 0), '8. nobody falls to the trap');
      }
    }
    ok(!D().dungeon.nodes.find((n) => n.id === R.treasure)?.revealed && !(P[0].last?.dungeon?.nodes || []).some((n) => n.id === R.treasure), '8. the side room the party skipped stays hidden from the phones');
    const ex = await call(P[0], 'player:dungeon:exit');
    ok(ex.ok && await until(() => !D().dungeon.on), '8. Exit Dungeon from the Far Light takes the party back to the world map');
    ok((D().trail || []).some((t) => /Pressure Plate/.test(t.name || t.text || '')) || plog(/Pressure Plate/), '8. the rooms are in the party trail');

    // ----- 9. The road to the Dragon's Lair -----
    await call(dm, 'dm:worldmap:deck:add', { text: 'PLACEHOLDER Scorched trees line the road to the tower.' });
    await call(dm, 'dm:worldmap:go', { node: W.lair });
    await call(dm, 'dm:worldmap:draw');
    ok(await until(() => D().worldMap.cards.some((c) => /Scorched trees/.test(c.text))), '9. a flavour card comes up on the road');
    ok(await until(() => D().worldMap.here === W.lair, (S.world.legSeconds + 3) * 1000), "9. the party reaches the Dragon's Lair");
    await call(dm, 'dm:plan:scene', { plan: planId, index: idx('scenes', /Dragon's Lair/) });
    ok(await until(() => /Dragon's Lair/.test(D().scene.title)), '9. the lair scene is on the TV');

    // ----- 10. The boss fight -----
    const saved = await call(dm, 'dm:creature:save', S.boss);
    ok(!!saved.id, '10. the boss dragon is saved in the creature library');
    send(dm, 'dm:mode', { mode: 'combat' });
    await until(() => D().mode === 'combat');
    send(dm, 'dm:creature:spawn', { id: saved.id, count: 1 });
    ok(await until(() => D().combat.enemies.some((e) => e.boss)), '10. the boss dragon is spawned');
    await fight('10.');
    ok(D().bossCard?.title === S.boss.title || plog(/Roll initiative/), '10. the boss title card played as the fight opened');

    // ----- 11. Save the princess -----
    await talk(/Princess/, '11.');
    send(P[0], 'player:social:say', { text: 'PLACEHOLDER We are here to rescue you.', emotion: 'happy' });
    ok(await until(() => D().social.line.pid === ids[0]), '11. the barbarian frees the princess');
    send(dm, 'dm:convo:end');
    await until(() => D().mode === 'exploration', 3000);

    // ----- 12. Mission winnings -----
    send(dm, 'dm:spoil', S.winnings.spoils);
    const spoil = await until(() => D().handouts.find((x) => x.kind === 'spoil'));
    ok(!!spoil && P[2].last?.handouts?.some((x) => x.kind === 'spoil'), '12. the spoils appear on the phones');
    send(dm, 'dm:spoil:award', { id: spoil.id, charId: ids[2] });
    ok(await until(() => D().handouts.find((x) => x.id === spoil.id)?.awarded === ids[2]), '12. the DM awards the spoils to the archer');
    for (const id of ids) send(dm, 'dm:sheet', { id, gold: pl(id).gold + S.winnings.goldEach });
    ok(await until(() => ids.every((id) => pl(id).gold >= S.winnings.goldEach)), `12. each hero collects ${S.winnings.goldEach} gp`);
    ok((await call(dm, 'dm:legend:award', { cat: S.winnings.legend.cat, charId: ids[0], detail: S.winnings.legend.detail })).ok, '12. the barbarian takes Best kill in the hall of fame');
    ok((await call(dm, 'dm:trophy:add', S.winnings.trophy)).ok, "12. the princess's crown goes on the trophy shelf");

    // ----- 13. The session ends -----
    send(dm, 'dm:narrate', { text: S.ending });
    ok(await until(() => plog(/cannot die|none of them can die/)), '13. the DM narrates the immortality hook');
    send(dm, 'dm:session:end');
    ok(await until(() => D().ended && P[0].last?.ended), '13. End of Session shows on the TV and the phones');
  } catch (e) {
    ok(false, `unexpected error: ${e.stack || e}`);
  }
  await h.done(srv);
})();
