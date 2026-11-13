// DM controls for TV moments (src/moments.js): transitions, dramatic pause, chapter and entrance cards,
// quote wall, choice echoes, relics, the journal book, the story clock and the epilogue. The TV shows them.
import { $, emit, onState } from '../client.js';

const { esc } = Stage;
const SFX = ['', 'thunder', 'hit', 'magic', 'roar', 'bell', 'door', 'clash'];
const card = $('#momentsCard');

card.innerHTML = `
  <div class="row"><b>Scene transition</b>
    <select id="moTrans"><option value="fade">Fade</option><option value="wipe">Wipe</option><option value="ink">Ink</option></select>
    <button class="btn small" data-act="trans">Play</button></div>
  <div class="row"><b>Dramatic pause</b>
    <input id="moPause" placeholder="The line to hold on the TV">
    <button class="btn small" data-act="pause">Dim the TV</button>
    <button class="btn small" data-act="unpause" id="moRelease" hidden>Release</button></div>
  <div class="row"><b>Chapter card</b>
    <input id="moChTitle" placeholder="Title (a new scene title also shows one)">
    <input id="moChSub" placeholder="Subtitle">
    <button class="btn small" data-act="chapter">Show</button></div>
  <div class="row"><b>Entrance</b>
    <input id="moEnName" placeholder="Name">
    <input id="moEnImg" placeholder="Portrait path, e.g. /uploads/… (optional)">
    <select id="moEnSfx">${SFX.map((s) => `<option value="${s}">${s ? `Sound: ${s}` : 'No sound'}</option>`).join('')}</select>
    <button class="btn small" data-act="enter">Bring in</button></div>
  <div class="row"><b>Quote wall</b>
    <input id="moQuote" placeholder="A memorable line">
    <input id="moWho" placeholder="Who said it">
    <button class="btn small" data-act="quote">Pin</button></div>
  <div id="moQuotes" class="list"></div>
  <div class="row"><b>Choice echo</b> <small class="muted">planned now, fires after N scenes</small>
    <input id="moDec" placeholder="What the party chose">
    <input id="moCons" placeholder="What comes back later">
    <input id="moAfter" type="number" min="1" max="20" value="3" title="Scenes until it fires" style="width:5em">
    <button class="btn small" data-act="echo">Plant</button></div>
  <div id="moEchoes" class="list"></div>
  <div class="row"><b>Relics</b>
    <input id="moRelName" placeholder="Name">
    <input id="moRelIcon" placeholder="Icon" value="✨" maxlength="4" style="width:4em">
    <input id="moRelLore" placeholder="Lore card text">
    <button class="btn small" data-act="relic">Add</button>
    <button class="btn small" data-act="relicclose">Close relic card</button></div>
  <div id="moRelics" class="list"></div>
  <div class="row"><b>Journal book</b>
    <button class="btn small" data-act="book" id="moBook">Open on the TV</button></div>
  <div class="row"><b>Story clock</b> <small id="moClock" class="muted"></small>
    <input id="moDay" type="number" min="1" value="1" title="Day" style="width:5em">
    <input id="moHour" type="number" min="0" max="23" value="9" title="Hour (0 to 23)" style="width:5em">
    <button class="btn small" data-act="time">Set</button>
    <button class="btn small" data-act="plus" data-h="1">+1h</button>
    <button class="btn small" data-act="plus" data-h="6">+6h</button>
    <button class="btn small" data-act="plus" data-h="12">+12h</button></div>
  <div class="row"><b>Epilogue</b>
    <button class="btn small" data-act="epi">Start slideshow</button>
    <button class="btn small" data-act="epiclose">End</button></div>`;

let tv = {};
let story = null;
const val = (id) => $(`#${id}`).value.trim();
const clear = (...ids) => ids.forEach((id) => { $(`#${id}`).value = ''; });

onState((s) => {
  tv = s.tv || {};
  story = s.story;
  $('#moRelease').hidden = !tv.pause;
  $('#moBook').textContent = tv.book?.open ? 'Close the book' : 'Open on the TV';
  $('#moBook').dataset.act = tv.book?.open ? 'bookclose' : 'book';
  $('#moClock').textContent = story ? `${story.label} · ${story.light}` : '';
  if (story) { $('#moDay').value = story.day; $('#moHour').value = story.hour; }
  $('#moQuotes').innerHTML = (tv.quotes || []).map((q) => `<div class="item"><span>“${esc(q.text)}”${q.who ? ` <small class="muted">${esc(q.who)}</small>` : ''}</span>
    <button class="btn small danger" data-act="quoteremove" data-id="${esc(q.id)}">✕</button></div>`).join('') || '';
  $('#moEchoes').innerHTML = (tv.echoes || []).map((e) => `<div class="item"><span><b>${esc(e.decision)}</b> → ${esc(e.consequence)} <small class="muted">in ${e.left} scene${e.left === 1 ? '' : 's'}</small></span>
    <span class="row"><button class="btn small" data-act="echofire" data-id="${esc(e.id)}">Fire now</button>
    <button class="btn small danger" data-act="echocancel" data-id="${esc(e.id)}">✕</button></span></div>`).join('') || '';
  $('#moRelics').innerHTML = (tv.relics || []).map((r) => `<div class="item"><span>${esc(r.icon)} <b>${esc(r.name)}</b> ${r.revealed ? '<small class="muted">revealed</small>' : ''}</span>
    <span class="row"><button class="btn small" data-act="relicreveal" data-id="${esc(r.id)}">Reveal</button>
    <button class="btn small danger" data-act="relicremove" data-id="${esc(r.id)}">✕</button></span></div>`).join('') || '';
});

const actions = {
  trans: () => emit('dm:tv:transition', { kind: val('moTrans') }),
  pause: () => { emit('dm:tv:pause', { on: true, text: val('moPause') }); },
  unpause: () => emit('dm:tv:pause', { on: false }),
  chapter: () => { if (val('moChTitle')) emit('dm:tv:chapter', { title: val('moChTitle'), sub: val('moChSub') }); clear('moChTitle', 'moChSub'); },
  enter: () => {
    if (!val('moEnName')) return;
    emit('dm:tv:entrance', { name: val('moEnName'), image: val('moEnImg') || null, sfx: val('moEnSfx') || null });
    clear('moEnName');
  },
  quote: () => { if (val('moQuote')) emit('dm:tv:quote:add', { text: val('moQuote'), who: val('moWho') }); clear('moQuote', 'moWho'); },
  quoteremove: (b) => emit('dm:tv:quote:remove', { id: b.dataset.id }),
  echo: () => {
    emit('dm:tv:echo:plant', { decision: val('moDec'), consequence: val('moCons'), after: Number(val('moAfter')) });
    clear('moDec', 'moCons');
  },
  echofire: (b) => emit('dm:tv:echo:fire', { id: b.dataset.id }),
  echocancel: (b) => emit('dm:tv:echo:cancel', { id: b.dataset.id }),
  relic: () => {
    if (!val('moRelName')) return;
    emit('dm:tv:relic:add', { name: val('moRelName'), icon: val('moRelIcon'), lore: val('moRelLore') });
    clear('moRelName', 'moRelLore');
  },
  relicreveal: (b) => emit('dm:tv:relic:reveal', { id: b.dataset.id }),
  relicremove: (b) => emit('dm:tv:relic:remove', { id: b.dataset.id }),
  relicclose: () => emit('dm:tv:relic:close'),
  book: () => emit('dm:tv:book', { open: true }),
  bookclose: () => emit('dm:tv:book', { open: false }),
  time: () => emit('dm:story:set', { day: Number(val('moDay')), hour: Number(val('moHour')) }),
  plus: (b) => emit('dm:story:advance', { hours: Number(b.dataset.h) }),
  epi: () => emit('dm:tv:epilogue:start'),
  epiclose: () => emit('dm:tv:epilogue:close'),
};
card.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (b && actions[b.dataset.act]) actions[b.dataset.act](b);
});
