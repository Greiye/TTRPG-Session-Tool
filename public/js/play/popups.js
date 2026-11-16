// Phone pop-ups from the DM (Mike, Nov 16): roll calls, party votes and messages. One pop-up shows at a time,
// in that order of priority, and each stays up until the player answers or presses Continue.
//   - roll call: roll button (and inspiration); after the roll, the result and Continue
//   - vote: one big button per option; after voting, the pick (tap another to change) and Continue
//   - message: a handout or a phrase, with Continue at the bottom; Continue marks it read for the DM
import { socket, onState, state } from '../client.js';
import { me } from './identity.js';
import { current, onShow } from './nav.js';

const { esc } = Stage;
let el = null;
let shownKey = null;
const closedCalls = new Set(); // roll call ids this phone pressed Continue on
const closedVotes = new Set(); // vote ids this phone pressed Continue on
const readLocal = new Set(); // handout ids marked read here, before the server echoes it back

function close() {
  if (!el) return;
  const old = el;
  el = null; shownKey = null;
  old.classList.add('leaving');
  setTimeout(() => old.remove(), 220);
}

// Pick what to show now. Returns { key, kind, html } or null.
function pick(S) {
  const c = S.players?.find((p) => p.id === me.charId);
  if (!c) return null;
  const chk = S.check;
  if (chk && (!chk.targets || chk.targets.includes(c.id)) && !closedCalls.has(chk.id)) return callPop(S, c, chk);
  const v = S.vote;
  if (v?.open && !closedVotes.has(v.id)) return votePop(v);
  const h = (S.handouts || []).find((x) => (x.kind === 'handout' || x.kind === 'phrase' || !x.kind) && x.seen === false && !readLocal.has(x.id));
  if (h) return msgPop(h);
  return null;
}

function callPop(S, c, chk) {
  const done = chk.results?.[c.id];
  const bonus = chk.kind === 'skill' ? c.skills?.[chk.key] : chk.kind === 'save' ? c.derived?.saves?.[chk.key] : c.derived?.mods?.[chk.key];
  const sign = (n) => `${n >= 0 ? '+' : ''}${n ?? 0}`;
  const kindName = chk.kind === 'save' ? 'Saving throw' : chk.kind === 'ability' ? 'Ability check' : 'Skill check';
  const dc = chk.hideDc ? 'The DC is secret.' : `${esc(S.rules?.dcLabel || 'DC')} ${chk.dc}`;
  const mode = chk.mode ? ` · ${chk.mode === 'adv' ? 'advantage' : 'disadvantage'}` : '';
  const body = done
    ? `<div class="pp-result ${done.pass == null || chk.hideDc ? '' : done.pass ? 'pass' : 'fail'}"><b>${done.total ?? done.roll}</b><small>d20 ${done.roll}</small></div>
       <p class="note">${chk.hideDc || done.pass == null ? 'The DM will tell you what happens.' : done.pass ? 'Success.' : 'Not this time.'}</p>
       <button class="bigbtn pp-continue" data-pp="call-close">Continue</button>`
    : `<button class="bigbtn" data-pp="roll">🎲 Roll ${esc(chk.label)} (${sign(bonus)})</button>
       ${c.inspiration > 0 && chk.mode !== 'dis' ? `<button class="btn" data-pp="roll" data-inspire="1">✨ Roll with inspiration (${c.inspiration} left, advantage)</button>` : ''}`;
  return {
    key: `call:${chk.id}:${done ? 'd' : 'w'}:${c.inspiration || 0}`, kind: 'call', id: chk.id,
    html: `<p class="pp-kicker">🎲 Roll call · ${kindName}</p><h3>${esc(chk.label)}</h3><p class="note">${dc}${mode}</p>${body}`,
  };
}

function votePop(v) {
  const voted = v.mine != null;
  return {
    key: `vote:${v.id}:${v.mine}:${v.options.join('|')}`, kind: 'vote', id: v.id,
    html: `<p class="pp-kicker">🗳 Party vote</p><h3>${voted ? 'Vote cast' : 'The party votes'}</h3>
      <div class="list pp-opts">${v.options.map((o, i) => `<button class="btn ${v.mine === i ? 'primary' : ''}" data-pp="vote" data-i="${i}">${esc(o)}${v.mine === i ? ' ✓' : ''}</button>`).join('')}</div>
      <p class="note">${voted ? 'Tap another option to change your vote.' : 'Tap an option to vote.'}</p>
      ${voted ? '<button class="bigbtn pp-continue" data-pp="vote-close">Continue</button>' : ''}`,
  };
}

function msgPop(h) {
  let inner;
  if (h.kind === 'phrase') {
    const known = h.text !== undefined;
    inner = `<p class="pp-kicker">🔤 ${esc(h.lang)}</p><p class="pp-text ${known ? '' : 'glyphs'}">${esc(known ? h.text : h.glyphs)}</p>${known ? '' : '<p class="note">You don\'t know this tongue.</p>'}`;
  } else {
    inner = `<p class="pp-kicker">📜 Message from the DM</p><h3>${esc(h.title || 'Message')}</h3>${h.text ? `<p class="pp-text">${esc(h.text)}</p>` : ''}${h.image ? `<img class="pp-img" src="${esc(h.image)}" alt="">` : ''}`;
  }
  return { key: `msg:${h.id}`, kind: 'msg', id: h.id, html: `${inner}<button class="bigbtn pp-continue" data-pp="msg-read">Continue</button>` };
}

function render() {
  const S = state();
  const next = S && current() === 'game' ? pick(S) : null;
  if (!next) return close();
  if (next.key === shownKey) return;
  const fresh = !el || el.dataset.kind !== next.kind || el.dataset.id !== String(next.id);
  if (fresh) {
    el?.remove();
    el = document.createElement('div');
    el.className = 'pop-scrim phone-pop';
    el.innerHTML = '<div class="pop-sheet" role="dialog" aria-modal="true"></div>';
    el.addEventListener('click', onClick);
    document.body.appendChild(el);
    navigator.vibrate?.([60, 40, 60]);
  }
  el.dataset.kind = next.kind; el.dataset.id = String(next.id);
  shownKey = next.key;
  const sheet = el.querySelector('.pop-sheet');
  sheet.setAttribute('aria-label', next.kind === 'call' ? 'Roll call' : next.kind === 'vote' ? 'Party vote' : 'Message');
  sheet.innerHTML = next.html;
  sheet.classList.toggle('pp-msg', next.kind === 'msg');
  if (fresh) window.Anim?.play(sheet, next.kind === 'msg' ? 'unfold' : 'pop', null);
  else sheet.querySelector('.pp-result, .pp-opts .primary')?.classList.add('pp-bump');
}

function onClick(e) {
  const b = e.target.closest('[data-pp]');
  if (!b || !el) return;
  const id = el.dataset.id;
  const act = b.dataset.pp;
  navigator.vibrate?.(30);
  if (act === 'roll') { b.disabled = true; b.classList.add('rolling'); socket.emit('player:answer', { inspire: !!b.dataset.inspire }); return; }
  if (act === 'call-close') closedCalls.add(Number(id));
  if (act === 'vote') return socket.emit('player:vote', { index: Number(b.dataset.i) });
  if (act === 'vote-close') closedVotes.add(id);
  if (act === 'msg-read') { readLocal.add(id); socket.emit('player:handout:read', { id }); }
  close();
  setTimeout(render, 240); // the next item in line, if any
}

onState(render);
onShow(render);
