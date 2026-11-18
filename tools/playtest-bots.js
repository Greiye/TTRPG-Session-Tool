// Playtest bots: fake friends on phones, for testing the TV and DM screens alone.
// Each bot joins the running game like a phone, then answers what the table asks of it, the way a player would:
//   rolls      roll calls (big Roll button or tapping the skill), a free d20 when it sits down
//   explore    a line of action whenever the DM narrates, Group Map View votes, handouts, spoils claims
//   world map  world map votes, the dungeon gate, the town gate, a place to go once inside a town
//   shops      buys the cheapest thing it can afford from a shop pop-up (a weapon first if it needs one), then leaves
//   social     a line with an emotion in each live conversation, and a pick from the DM's choice wheel
//   combat     on its turn: steps toward an enemy if there is a battle map, then attacks with a strike gesture
//              (now and then it drinks a potion or dodges instead)
//   camp       votes short or long rest (a caster puts a spell on its sheet first, so camp lets it rest)
//   other      recap quiz answers, a downtime pick, a puzzle guess
// Bots are named "[Bot] ..." so they are easy to spot and remove. Nothing here is a real player, and nothing here
// changes what players can do: the bots only send what a phone sends.
//
// Usage: npm run bots                 (4 bots on http://localhost:3000, answering until Ctrl+C)
//        npm run bots -- 6            (6 bots)
//        npm run bots -- 4 --tour     (the bots plus a scripted DM walk through every pillar, then a pass/fail report)
//        BOTS_URL=http://127.0.0.1:3123 npm run bots -- 2
// The tour drives the DM side, so run it on the laptop (or set DM_KEY). It takes a save point called
// "Before bot tour" first and loads it again at the end, so the table is back how it was (add --keep to skip that).
// Stop with Ctrl+C. The bots leave their seats empty, like a phone going to sleep.
const { io } = require('socket.io-client');

const NAMES = ['Ash', 'Bryn', 'Cato', 'Dell', 'Eris', 'Fenn', 'Gale', 'Hollis'];
const CLASSES = ['Fighter', 'Rogue', 'Wizard', 'Cleric', 'Ranger', 'Bard', 'Druid', 'Paladin'];
const CASTERS = ['Wizard', 'Cleric', 'Bard', 'Druid', 'Warlock', 'Sorcerer'];
const LINES = ['We mean no harm.', 'What do you know about the old road?', 'Name your price.', 'I do not trust this one.', 'Tell us more.'];
const ACTIONS = ['[Bot] I check the ground for tracks.', '[Bot] I keep watch at the back.', '[Bot] I look for a way around.', '[Bot] I listen at the door.'];
const EMOTIONS = ['neutral', 'happy', 'angry', 'sad', 'fearful', 'surprised', 'suspicious', 'smug']; // src/cast.js
const STRIKES = ['slash', 'pierce', 'tap'];
const WEAPON = /sword|axe|bow|dagger|mace|spear|staff|crossbow|rapier|hammer|flail|club|javelin|sling|pike|lance|glaive|halberd|scimitar|whip/i;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function bot(url, room, i, log = console.log, { fast = false } = {}) {
  const name = `[Bot] ${NAMES[i % NAMES.length]}`;
  const cls = CLASSES[i % CLASSES.length];
  const s = io(url, { transports: ['websocket'], forceNew: true, rejectUnauthorized: false });
  // feel like people, not a script (the tour runs faster so the walk-through does not drag)
  const later = (fn) => setTimeout(fn, fast ? 50 + Math.random() * 250 : 400 + Math.random() * 1200);
  const done = new Set(); // keys of things this bot already answered, so it acts once per prompt
  const once = (key, fn) => { if (done.has(key)) return; done.add(key); later(fn); };
  // What the bot sent and what the server said back, for the tour's report: stats.sent.buy = 1, stats.errors = [...]
  s.stats = { sent: {}, ok: {}, errors: [] };
  const send = (event, data, tag = event.replace(/^player:/, '')) => {
    s.stats.sent[tag] = (s.stats.sent[tag] || 0) + 1;
    s.emit(event, data, (r) => {
      if (r?.error) { s.stats.errors.push(`${tag}: ${r.error}`); return; }
      s.stats.ok[tag] = (s.stats.ok[tag] || 0) + 1;
    });
  };
  s.botName = name;
  s.cls = cls;
  let me = null;
  s.on('connect', () => {
    s.emit('join', { name, cls, player: 'Bot', room }, (r) => {
      if (r?.error) return log(`  ${name}: could not join (${r.error})`);
      me = s.me = r.id;
      log(`  ${name} joined`);
      // Fill the sheet the way a player would before camp asks for it, and roll a die to say hello.
      if (CASTERS.includes(cls)) send('player:sheet', { spells: ['Light'] }, 'sheet');
      later(() => send('player:roll', { expr: '1d20+2', label: 'Warm-up' }));
    });
  });
  s.on('state', (st) => { s.last = st; if (me) react(st); });
  const mine = (st) => (st.players || []).find((p) => p.id === me);

  function react(st) {
    // ----- rolls -----
    const chk = st.check;
    if (chk && (!chk.targets || chk.targets.includes(me)) && !chk.results?.[me]) {
      // Half the bots press the big Roll button, half tap the matching skill on the sheet.
      once(`check:${chk.id}`, () => (i % 2 ? send('player:check', { skill: chk.key, kind: chk.kind, key: chk.key }, 'check') : send('player:answer', {}, 'check')));
    }
    // ----- exploration -----
    const story = (st.narration || []).at(-1);
    if (story && st.mode === 'exploration') once(`act:${story.id}`, () => send('player:action', { text: pick(ACTIONS) }, 'action'));
    // Group Map View (Nov 18): a bot joins once someone else has asked for the map (or to close it).
    const mv = st.mapVote;
    if (mv?.want > 0 && !mv.mine && !mv.blocked) once(`mapview:${mv.n}`, () => send('player:mapview', { on: true }, 'mapview'));
    for (const h of st.handouts || []) {
      if (h.kind === 'handout' && !h.read?.[me]) once(`read:${h.id}`, () => send('player:handout:read', { id: h.id }, 'handout'));
      if (h.kind === 'spoil' && !h.awarded && !h.claims?.[me]) once(`claim:${h.id}`, () => send('player:claim', { id: h.id, note: 'Bot wants it' }, 'claim'));
    }
    // ----- world map, dungeon and town -----
    const wv = st.worldMap?.vote;
    if (wv?.open && wv.mine == null && wv.candidates?.length) once(`wvote:${wv.id}`, () => send('player:worldmap:vote', { node: pick(wv.candidates) }, 'worldmap'));
    const gate = st.dungeon?.gate;
    if (gate && !(gate.ready || []).includes(me)) once(`gate:${gate.id}`, () => send('player:dungeon:ready', { on: true }, 'dungeon'));
    const town = st.town;
    if (town?.gate && !town.gate.ready.includes(me)) once(`tgate:${town.gate.id}:${town.n}`, () => send('player:town:ready', { on: true }, 'town'));
    if (town?.on && !town.mine?.at) {
      const places = (town.nodes || []).filter((n) => n.id !== town.here && n.seen !== false);
      // Everyone heads for the same first place, so the party actually moves once all bots have held the action.
      if (places.length) once(`tpick:${town.n}:${town.here}`, () => s.last?.town?.on && send('player:town:pick', { node: places[0].id, confirm: true }, 'townpick'));
    }
    // ----- shops -----
    const pop = st.shopPop;
    if (pop && !pop.done?.includes(me)) {
      once(`shop:${pop.shopId}:${pop.n}`, () => {
        const shop = (st.shops || []).find((x) => x.id === pop.shopId);
        const p = mine(s.last) || {};
        const gold = p.gold || 0;
        const items = (shop?.items || []).filter((it) => it.stock !== 0 && (it.price || 0) <= gold).sort((a, b) => a.price - b.price);
        const needsWeapon = !CASTERS.includes(cls) && !(p.inventory || []).some((x) => WEAPON.test(x.name));
        const item = (needsWeapon && items.find((it) => WEAPON.test(it.name))) || items[0];
        if (item) send('player:buy', { shopId: pop.shopId, itemId: item.id, qty: 1 }, 'buy');
        setTimeout(() => send('player:shop:done', { done: true }, 'shopdone'), 300);
      });
    }
    // ----- social -----
    const convo = st.social?.convo;
    if (st.mode === 'social' && convo?.live && !convo.ending) {
      once(`say:${convo.n}`, () => send('player:social:say', { text: pick(LINES), emotion: pick(EMOTIONS) }, 'say'));
      const ch = st.social.choices || [];
      if (ch.length) once(`choice:${convo.n}:${ch.join('|')}`, () => send('player:choice', { index: Math.floor(Math.random() * ch.length) }, 'choice'));
    }
    // ----- combat -----
    const c = st.combat;
    if (c?.active && c.order?.length && c.order[c.turn % c.order.length]?.id === me) {
      once(`turn:${c.round}:${c.turn}`, () => takeTurn(s.last || st));
    }
    // ----- camp, quiz, downtime, puzzle -----
    if (st.camp?.open && !st.camp.mine?.vote) once(`camp:${st.camp.n}`, () => send('player:camp', { vote: pick(['short', 'long']), text: '[Bot] I sharpen my gear by the fire.' }, 'camp'));
    const q = st.quiz;
    if (q?.open) for (const qq of q.questions || []) if (!q.mine?.[qq.id]) once(`quiz:${q.id}:${qq.id}`, () => send('player:quiz:answer', { qid: qq.id, text: '[Bot] No idea, sorry' }, 'quiz'));
    const dt = st.downtime;
    if (dt?.open && dt.n && !dt.mine) once(`dt:${dt.n}`, () => send('player:downtime:choose', { kind: pick(Object.keys(dt.kinds || { training: 1 })), target: '[Bot] practise with a stick' }, 'downtime'));
    const pz = st.puzzle;
    if (pz?.status === 'open') once(`pz:${pz.id}`, () => send('player:puzzle:guess', { text: '[Bot] the innkeeper?' }, 'puzzle'));
  }

  function takeTurn(st) {
    const c = st.combat;
    const foes = (c.enemies || []).filter((e) => e.side !== 'ally' && (e.hp ?? 1) > 0);
    const p = mine(st);
    const roll = Math.random();
    if (!foes.length || roll < 0.1) return send('player:combat', { act: 'dodge' }, 'combat');
    if (p && p.hp < p.maxHp / 2 && roll < 0.3) return send('player:combat', { act: 'potion' }, 'combat');
    const foe = pick(foes);
    // With a battle map up: one step toward the enemy first (a move the server refuses is fine, the bot just attacks).
    const at = st.tokens?.[me];
    const to = st.tokens?.[foe.id];
    if (st.map && at && to) {
      const step = (a, b) => a + Math.sign(b - a);
      send('player:move', { x: step(at.x, to.x), y: step(at.y, to.y) }, 'move');
    }
    setTimeout(() => send('player:combat', { act: 'attack', target: foe.id, style: pick(STRIKES) }, 'combat'), st.map ? 200 : 0);
  }
  return s;
}

// ----- the tour: a scripted DM walks the bots through every pillar and reports what worked -----
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 8000) {
  const end = Date.now() + ms;
  for (;;) { let v; try { v = fn(); } catch { v = false; } if (v) return v; if (Date.now() > end) return false; await wait(50); }
}

async function tour(url, bots, { dm, log = console.log } = {}) {
  const call = (ev, data) => new Promise((res) => { dm.emit(ev, data, res); setTimeout(() => res(undefined), 3000); });
  const S = () => dm.last;
  const ids = () => bots.map((b) => b.me).filter(Boolean);
  const all = (fn) => ids().length === bots.length && ids().every(fn);
  const byBot = (kind) => (S().log || []).filter((e) => e.kind === kind && bots.some((b) => (e.who || '') === b.botName || e.pid === b.me));
  const results = [];
  async function step(name, fn) {
    let r;
    try { r = await fn(); } catch (e) { r = { fail: e.message }; }
    if (r === true) r = { pass: true };
    if (r === false || r == null) r = { fail: 'timed out' };
    results.push({ name, ...r });
    log(`  ${r.skip ? 'skip' : r.pass ? ' ok ' : 'FAIL'}  ${name}${r.skip ? ` (${r.skip})` : r.fail ? ` (${r.fail})` : r.note ? ` (${r.note})` : ''}`);
  }

  await step('bots join the party', () => until(() => all((id) => (S().players || []).some((p) => p.id === id))));
  // A clean slate for the walk-through: no fight, no pop-ups, exploration mode.
  dm.emit('dm:combat:end');
  dm.emit('dm:mode', { mode: 'exploration' });
  await wait(300);

  await step('rolls: free dice', () => until(() => bots.every((b) => b.stats.ok.roll)));
  await step('rolls: roll call', async () => {
    dm.emit('dm:check', { skill: 'Perception', dc: 10 });
    const ok = await until(() => all((id) => S().check?.results?.[id]));
    dm.emit('dm:check', {});
    return ok;
  });
  await step('exploration: actions after narration', async () => {
    dm.emit('dm:narrate', { text: '[Bot tour] The road forks under the old oak.' });
    return until(() => bots.every((b) => byBot('action').some((e) => e.who === b.botName)));
  });
  await step('exploration: Group Map View vote', async () => {
    const was = !!S().worldMap?.onTv;
    bots[0].emit('player:mapview', { on: true });
    if (!(await until(() => !!S().worldMap?.onTv !== was))) return false;
    bots[0].emit('player:mapview', { on: true }); // and the same vote puts the TV back
    return until(() => !!S().worldMap?.onTv === was);
  });
  await step('exploration: handout read', async () => {
    dm.emit('dm:handout', { title: '[Bot tour] Note', text: 'A placeholder note.', to: 'all' });
    return until(() => { const h = (S().handouts || []).filter((x) => x.kind === 'handout').at(-1); return h && all((id) => h.read?.[id]); });
  });
  await step('exploration: spoils claimed', async () => {
    dm.emit('dm:spoil', { title: '[Bot tour] Spoils', items: [{ name: 'Test Dagger', qty: 1 }] });
    const ok = await until(() => { const h = (S().handouts || []).filter((x) => x.kind === 'spoil').at(-1); return h && all((id) => h.claims?.[id]); });
    for (const h of (S().handouts || []).filter((x) => /^\[Bot tour\]/.test(x.title || ''))) dm.emit('dm:handout:remove', { id: h.id });
    return ok;
  });

  await step('town: gate, enter, pick a place', async () => {
    const g = await call('dm:town:gate');
    if (g?.error) return { skip: g.error };
    if (!(await until(() => S().town?.on))) return { fail: 'the party did not enter town' };
    const start = S().town.here;
    const moved = await until(() => S().town.here !== start);
    await call('dm:town:show', { on: false });
    return moved || { fail: 'the party did not move to the picked place' };
  });
  await step('shops: buy and leave', async () => {
    const shop = (S().shops || [])[0];
    if (!shop) return { skip: 'no shop on this table' };
    // Pocket money from the DM so every bot can afford the cheapest item (bots start with no gold).
    const cheapest = Math.min(1000, ...shop.items.map((it) => it.price || 0));
    for (const id of ids()) dm.emit('dm:sheet', { id, gold: Math.max(10, cheapest * 2) });
    await wait(200);
    const before = Object.fromEntries(bots.map((b) => [b.botName, b.stats.ok.buy || 0]));
    dm.emit('dm:shop:pop', { id: shop.id });
    if (!(await until(() => S().shopPop?.shopId === shop.id, 3000))) return { fail: 'the shop pop-up did not open' };
    const closed = await until(() => !S().shopPop);
    const bought = bots.filter((b) => (b.stats.ok.buy || 0) > before[b.botName]).length;
    if (!closed) { dm.emit('dm:shop:pop', { id: null }); return { fail: 'not every bot pressed Done' }; }
    if (shop.items.length && !bought) return { fail: 'nobody bought anything' };
    return { pass: true, note: `${bought}/${bots.length} bought something` };
  });
  await step('world map: vote where to go', async () => {
    const others = () => (S().worldMap?.nodes || []).filter((n) => n.id !== S().worldMap.here);
    // A small map gets placeholder places, so there is something to vote between (the save point removes them).
    for (let k = others().length; k < 2; k++) await call('dm:worldmap:node', { name: `[Bot tour] Place ${k + 1}`, x: 0.2 + 0.3 * k, y: 0.7, seen: true });
    const cands = others().map((n) => n.id).slice(0, 3);
    const r = await call('dm:worldmap:vote:start', { candidates: cands });
    if (r === false || r?.error) return { fail: r?.error || 'the vote did not open' };
    const v0 = (await until(() => S().worldMap.vote?.open && S().worldMap.vote.id, 3000));
    // The vote passes on a strict majority, or the DM closes it.
    const ok = await until(() => { const v = S().worldMap.vote; return v?.id === v0 && (!v.open || all((id) => v.votes?.[id])); });
    if (S().worldMap.vote?.open) dm.emit('dm:worldmap:vote:close');
    await until(() => !S().worldMap.vote?.open, 2000);
    return ok;
  });

  await step('social: lines and choices in a conversation', async () => {
    dm.emit('dm:mode', { mode: 'social' });
    await until(() => S().mode === 'social', 2000);
    const npc = (S().social?.pool || [])[0];
    if (!npc) return { skip: 'no NPC to talk to' };
    const r = await call('dm:convo:start', { ids: [npc.id] });
    if (!r?.ok) return { fail: r?.error || 'the conversation did not start' };
    const said = await until(() => bots.every((b) => byBot('say').some((e) => e.pid === b.me)));
    dm.emit('dm:choices', { choices: ['[Bot tour] Agree', '[Bot tour] Refuse'] });
    const chose = await until(() => bots.every((b) => b.stats.sent.choice));
    dm.emit('dm:choices', { choices: [] });
    dm.emit('dm:convo:end');
    await until(() => S().mode === 'exploration', 4000);
    return said && chose ? true : { fail: said ? 'not every bot picked a choice' : 'not every bot spoke' };
  });

  await step('combat: every bot takes a turn and attacks', async () => {
    dm.emit('dm:mode', { mode: 'combat' });
    for (let k = 1; k <= 2; k++) dm.emit('dm:enemy:add', { name: `[Bot tour] Dummy ${k}`, hp: 80, ac: 5, atk: 0, dmg: '1d1' });
    await until(() => (S().combat?.enemies || []).length >= 2, 2000);
    dm.emit('dm:combat:start');
    const sent0 = Object.fromEntries(bots.map((b) => [b.botName, b.stats.sent.combat || 0]));
    const took = () => bots.every((b) => (b.stats.sent.combat || 0) > sent0[b.botName]);
    // The DM plays the dummies: half the time a 1-damage swing at a bot, otherwise pass.
    let lastTurn = '';
    const ok = await until(() => {
      const c = S().combat;
      if (!c?.active) return false;
      const cur = c.order[c.turn % c.order.length]?.id;
      const key = `${c.round}:${c.turn}`;
      if (cur && !ids().includes(cur) && key !== lastTurn && !Object.values(S().players || []).some((p) => p.id === cur)) {
        lastTurn = key;
        const target = pick(ids());
        if (Math.random() < 0.5 && target) dm.emit('dm:enemy:attack', { target }); else dm.emit('dm:combat:next');
      }
      return took();
    }, 30000);
    const hurt = (S().combat?.enemies || []).filter((e) => e.hp < e.maxHp).length;
    dm.emit('dm:combat:end');
    dm.emit('dm:mode', { mode: 'exploration' });
    return ok ? { pass: true, note: `${hurt}/2 dummies took damage` } : { fail: 'not every bot got a turn in' };
  });

  await step('camp: rest votes', async () => {
    // Camp asks martial characters for a weapon: the DM hands each bot without one a placeholder from the Items tab.
    for (const p of (S().players || []).filter((x) => ids().includes(x.id) && !CASTERS.includes(x.cls) && !(x.inventory || []).some((i) => WEAPON.test(i.name)))) {
      dm.emit('dm:sheet', { id: p.id, inv: { op: 'add', name: '[Bot] Practice Sword', qty: 1 } });
    }
    await wait(200);
    dm.emit('dm:camp:open', { open: true });
    if (!(await until(() => S().camp?.open, 2000))) return { skip: 'a house rule kept camp shut' };
    const ok = await until(() => all((id) => S().camp.votes?.[id]));
    dm.emit('dm:camp:open', { open: false });
    return ok || { fail: bots.flatMap((b) => b.stats.errors.filter((e) => e.startsWith('camp:'))).join('; ') || 'not every bot voted' };
  });
  await step('recap quiz answers', async () => {
    dm.emit('dm:quiz:start', { text: '[Bot tour] Who runs the inn? | Placeholder\n[Bot tour] Where did the cart go? | Placeholder' });
    const ok = await until(() => { const q = S().quiz; return q && all((id) => Object.keys(q.answers?.[id] || {}).length === q.questions.length); });
    dm.emit('dm:quiz:clear');
    return ok;
  });
  await step('downtime picks', async () => {
    dm.emit('dm:downtime:start');
    const ok = await until(() => all((id) => S().downtime?.picks?.[id]));
    dm.emit('dm:downtime:open', { open: false });
    return ok;
  });
  await step('puzzle guesses', async () => {
    const r = await call('dm:puzzle:start', { type: 'riddle', title: '[Bot tour] Riddle', prompt: 'A placeholder riddle.', answer: 'placeholder', clues: 'Clue one\nClue two' });
    if (r?.error) return { fail: r.error };
    const ok = await until(() => all((id) => (S().puzzle?.guesses || []).some((g) => g.pid === id)));
    dm.emit('dm:puzzle:clear');
    return ok;
  });

  const errors = [...new Set(bots.flatMap((b) => b.stats.errors.map((e) => `${b.botName} ${e}`)))];
  return { results, errors, failed: results.filter((r) => r.fail).length };
}

async function connectDm(url, key) {
  const dm = io(url, { transports: ['websocket'], forceNew: true, rejectUnauthorized: false });
  dm.on('state', (st) => { dm.last = st; });
  await new Promise((res, rej) => { dm.on('connect', res); dm.on('connect_error', rej); });
  const r = await new Promise((res) => dm.emit('dm:auth', { key }, res));
  if (r?.role !== 'dm') { dm.close(); throw new Error('The tour needs the DM seat: run it on the laptop, or set DM_KEY.'); }
  await until(() => dm.last, 3000);
  return dm;
}

// Runs the tour from start to finish: save point, bots, walk-through, report, restore. Returns the tour result.
async function runTour(url, n, { key, keep = false, log = console.log } = {}) {
  const room = (await fetch(`${url}/api/join-info`).then((r) => r.json())).room;
  const dm = await connectDm(url, key);
  const save = keep ? null : await new Promise((res) => dm.emit('dm:save:create', { name: 'Before bot tour' }, res));
  if (save?.id) log('  Save point "Before bot tour" taken; it is loaded again at the end.');
  const bots = Array.from({ length: n }, (_, i) => bot(url, room, i, () => {}, { fast: true }));
  log(`  Touring with ${n} bot${n > 1 ? 's' : ''} in room ${room}:`);
  let out;
  try { out = await tour(url, bots, { dm, log }); } finally {
    for (const b of bots) b.close();
    if (save?.id) { await wait(300); dm.emit('dm:save:load', { id: save.id }); dm.emit('dm:save:delete', { id: save.id }); await wait(300); }
    dm.close();
  }
  if (out.errors.length) { log('\n  What the server turned down (worth a look if a step failed):'); for (const e of out.errors) log(`    ${e}`); }
  log(`\n  ${out.results.length - out.failed} of ${out.results.length} steps passed${out.failed ? `, ${out.failed} failed` : ''}.`);
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const n = Math.max(1, Math.min(8, Number(args.find((a) => /^\d+$/.test(a))) || 4));
  const url = process.env.BOTS_URL || `http://localhost:${process.env.PORT || 3000}`;
  const info = await fetch(`${url}/api/join-info`).then((r) => r.json()).catch(() => null);
  if (!info?.room) { console.error(`  No game found at ${url}. Start it first (npm start).`); process.exit(1); }
  if (args.includes('--tour')) {
    try {
      const out = await runTour(url, n, { key: process.env.DM_KEY, keep: args.includes('--keep') });
      process.exit(out.failed ? 1 : 0);
    } catch (e) { console.error(`  ${e.message}`); process.exit(1); }
  }
  console.log(`  Sending ${n} playtest bot${n > 1 ? 's' : ''} to room ${info.room} at ${url}`);
  const bots = Array.from({ length: n }, (_, i) => bot(url, info.room, i));
  process.on('SIGINT', () => { for (const b of bots) b.close(); process.exit(0); });
}

if (require.main === module) main();
module.exports = { bot, tour, runTour };
