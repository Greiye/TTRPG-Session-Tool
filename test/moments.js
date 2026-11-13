// Phase H: TV moments (src/moments.js). The DM triggers them; the TV shows them; phones never get them.
const { harness } = require('./helpers');
const h = harness('moments');
const { ok, until } = h;

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const tv = await h.client();
  tv.emit('screen:hello');
  const phone = await h.player(room, 'Thorn', 'Fighter');
  await until(() => tv.last?.tv && phone.last);

  // Transitions: each one takes a new number; unknown kinds are ignored.
  const n0 = tv.last.tv.trans.n;
  dm.emit('dm:tv:transition', { kind: 'wipe' });
  ok(await until(() => tv.last.tv.trans.kind === 'wipe' && tv.last.tv.trans.n > n0), 'a wipe reaches the TV with a new number');
  const n1 = tv.last.tv.trans.n;
  dm.emit('dm:tv:transition', { kind: 'confetti' });
  await h.wait(120);
  ok(tv.last.tv.trans.n === n1, 'an unknown transition is ignored');

  // Dramatic pause: dims until released.
  dm.emit('dm:tv:pause', { on: true, text: 'The door is not locked.' });
  ok(await until(() => tv.last.tv.pause?.text === 'The door is not locked.'), 'dramatic pause holds one line on the TV');
  dm.emit('dm:tv:pause', { on: false });
  ok(await until(() => tv.last.tv.pause === null), 'release clears the pause');

  // Chapter cards: a new scene title shows one; the same title does not.
  dm.emit('dm:story:set', { day: 2, hour: 23 });
  ok(await until(() => tv.last.story?.label === 'Day 2 · 23:00' && tv.last.story.light === 'night'), 'story clock reaches the TV with its label and night light');
  dm.emit('dm:scene', { title: 'Old mill', text: '', theme: 'default', poi: [] });
  ok(await until(() => tv.last.tv.chapter?.title === 'Old mill'), 'a new place shows a chapter card');
  ok(tv.last.tv.trans.kind === 'fade', 'a new place also fades the TV');
  const ch = tv.last.tv.chapter.n;
  dm.emit('dm:scene', { title: 'Old mill', text: 'more words', theme: 'default', poi: [] });
  await h.wait(120);
  ok(tv.last.tv.chapter.n === ch, 'saving the same place again shows no new chapter card');

  // Choice echoes: planned for the DM only, counted down by scenes, then fired.
  dm.emit('dm:tv:echo:plant', { decision: 'Spared the goblin', consequence: 'Its kin arrive at the gate', after: 2 });
  ok(await until(() => dm.last.tv.echoes.length === 1), 'the DM sees a planned echo');
  ok(tv.last.tv.echoes.length === 0 && phone.last.tv === undefined, 'the TV and phones never see planned echoes');
  dm.emit('dm:scene', { title: 'Gate', text: '', theme: 'default', poi: [] });
  await h.wait(120);
  ok(tv.last.tv.echo === null && dm.last.tv.echoes[0].left === 1, 'one scene later the echo has one scene left');
  dm.emit('dm:scene', { title: 'Hall', text: '', theme: 'default', poi: [] });
  ok(await until(() => tv.last.tv.echo?.consequence === 'Its kin arrive at the gate'), 'the echo fires on the TV after its scenes');
  ok(dm.last.tv.echoes.length === 0, 'a fired echo leaves the plan');

  // Quote wall: pinned lines, capped, removable.
  dm.emit('dm:tv:quote:add', { text: 'Never trust a smiling innkeeper.', who: 'Thorn' });
  ok(await until(() => tv.last.tv.quotes.length === 1 && tv.last.tv.quotes[0].who === 'Thorn'), 'a quote is pinned to the TV wall');
  for (let i = 0; i < 35; i++) dm.emit('dm:tv:quote:add', { text: `line ${i}`, who: '' });
  ok(await until(() => tv.last.tv.quotes.length === 30), 'the quote wall keeps the newest 30');
  dm.emit('dm:tv:quote:remove', { id: tv.last.tv.quotes[0].id });
  ok(await until(() => tv.last.tv.quotes.length === 29), 'a quote can be removed');

  // Relics: add, reveal (puts the card on the TV), close.
  dm.emit('dm:tv:relic:add', { name: 'Ember Ring', icon: '💍', lore: 'Warm to the touch.' });
  ok(await until(() => dm.last.tv.relics.length === 1), 'a relic is added');
  const rid = dm.last.tv.relics[0].id;
  dm.emit('dm:tv:relic:reveal', { id: rid });
  ok(await until(() => tv.last.tv.relic?.id === rid), 'revealing a relic puts its card on the TV');
  dm.emit('dm:tv:relic:close');
  ok(await until(() => tv.last.tv.relic === null), 'closing the relic card clears it');

  // Entrance: the built-in sound plays on the TV; a non-built-in sound is dropped.
  const sounds = [];
  tv.on('sfx', (s) => sounds.push(s));
  dm.emit('dm:tv:entrance', { name: 'Mirela', image: '/uploads/x.png', sfx: 'bell' });
  ok(await until(() => tv.last.tv.entrance?.name === 'Mirela' && sounds.some((s) => s.builtin === 'bell')), 'an entrance plays its built-in sound');
  dm.emit('dm:tv:entrance', { name: 'Ghost', image: 'https://evil.example/x.png', sfx: 'bang' });
  ok(await until(() => tv.last.tv.entrance?.name === 'Ghost'), 'an entrance without a sound still shows');
  ok(tv.last.tv.entrance.sfx === null && tv.last.tv.entrance.image === null, 'an unknown sound and an outside image are dropped');

  // Journal book: a snapshot of the newest notes, open and closed by the DM.
  dm.emit('dm:tv:book', { open: true });
  ok(await until(() => tv.last.tv.book?.open === true), 'the journal book opens on the TV');
  dm.emit('dm:tv:book', { open: false });
  ok(await until(() => tv.last.tv.book?.open === false), 'the journal book closes');

  // Epilogue: built once from the quotes, journal and key moments, ending on the last slide.
  dm.emit('dm:tv:epilogue:start');
  ok(await until(() => tv.last.tv.epilogue?.slides?.length >= 2), 'the epilogue builds slides');
  const slides = tv.last.tv.epilogue.slides;
  ok(slides[0].kicker === 'The end of the session' && slides[slides.length - 1].title === 'Until next time', 'the epilogue opens on the session and ends on "Until next time"');
  dm.emit('dm:tv:epilogue:close');
  ok(await until(() => tv.last.tv.epilogue === null), 'the epilogue ends');

  // Story clock: wraps past midnight, rejects bad hours, and lights the TV by hour.
  dm.emit('dm:story:advance', { hours: 3 });
  ok(await until(() => tv.last.story?.label === 'Day 3 · 02:00' && tv.last.story.light === 'night'), 'advancing past midnight rolls the day');
  dm.emit('dm:story:set', { day: 1, hour: 25 });
  await h.wait(120);
  ok(tv.last.story.label === 'Day 3 · 02:00', 'an hour outside 0 to 23 is ignored');
  dm.emit('dm:story:set', { day: 1, hour: 18 });
  ok(await until(() => tv.last.story.light === 'dusk'), 'evening reads as dusk');

  // Phones and the co-DM: phones get nothing from the TV; a phone cannot trigger moments.
  ok(phone.last.tv === undefined, 'phones receive no TV state');
  phone.emit('dm:tv:transition', { kind: 'ink' });
  await h.wait(120);
  ok(tv.last.tv.trans.kind !== 'ink', 'a phone cannot trigger a transition');

  await h.done(srv);
})();
