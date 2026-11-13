// Table tools on the phone (Phase I, src/table.js): a silent nudge (buzz + a private line you may share),
// your bond, a framing token, the montage prompt, payoffs and canon. Everything here is optional.
import { socket, $, onState, state } from '../client.js';
import { me as id } from './identity.js';

const { esc } = Stage;
const box = document.createElement('div');
box.id = 'tableCtl';
const anchor = document.querySelector('#suggest');
if (anchor) anchor.before(box);

// The nudge is a sheet over the screen until the player answers it.
const sheet = document.createElement('div');
sheet.id = 'nudgeSheet';
sheet.className = 'nudge-sheet';
sheet.hidden = true;
document.body.append(sheet);

let key = '';
let buzzed = null;
let nudgeId = null;
const sh = (v) => (v === undefined || v === null ? '' : String(v));

onState((s) => {
  const me = (s.players || []).find((p) => p.id === id.charId);
  if (!me) { box.innerHTML = ''; sheet.hidden = true; return; }

  const pending = (s.myNudges || [])[0] || null;
  if (pending && pending.id !== buzzed) { buzzed = pending.id; navigator.vibrate?.([120, 80, 120]); }
  if (pending) drawNudge(pending); else { sheet.hidden = true; nudgeId = null; }

  const bond = me.bond ? (s.roster || []).find((r) => r.id === me.bond.to) : null;
  const payoffs = (s.foreshadow || []).filter((h) => h.paid);
  const canon = (s.canon || []).slice(-3).reverse();
  const m = s.montage || {};
  const k = JSON.stringify([s.framingTokens, me.bond, bond?.name, payoffs.map((p) => p.id), canon.map((c) => c.id), m.prompt, m.open, m.reveal, m.answers?.[me.id] ?? m.mine, (s.roster || []).map((r) => r.id + r.name).join()]);
  if (k === key) return;
  key = k;

  const mineAnswer = m.mine ?? null;
  box.innerHTML = `
    ${m.prompt && m.open ? `<div class="card table-card"><h3>🎤 ${esc(m.prompt)}</h3>
      <form id="monForm"><textarea id="monText" rows="2" maxlength="200" placeholder="Your answer. Everyone's is revealed together on the TV.">${esc(mineAnswer || '')}</textarea>
      <button class="btn primary" type="submit">${mineAnswer ? 'Change answer' : 'Send answer'}</button></form></div>` : ''}
    ${m.prompt && m.reveal ? `<div class="card table-card"><h3>🎤 ${esc(m.prompt)}</h3><p class="note">Answers are on the TV.</p></div>` : ''}
    ${s.framingTokens > 0 ? `<div class="card table-card"><h3>✦ Frame the scene <span class="note">${s.framingTokens} token${s.framingTokens === 1 ? '' : 's'}</span></h3>
      <p class="note">Add one detail. It goes on the TV as canon.</p>
      <form id="frameForm"><input id="frameText" maxlength="200" placeholder="The door is already unlocked." class="grow"><button class="btn primary" type="submit">Spend token</button></form></div>` : ''}
    <div class="card table-card"><h3>🪢 Your bond</h3>
      ${me.bond && bond ? `<p>${esc(bond.name)}: ${esc(me.bond.text)}</p>` : '<p class="note">Name a tie to another character. The DM will call it back in a later session.</p>'}
      <form id="bondForm"><div class="row"><select id="bondTo" class="grow" aria-label="Bonded to">${(s.roster || []).filter((r) => r.id !== me.id).map((r) => `<option value="${esc(r.id)}" ${me.bond?.to === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
      <div class="row"><input id="bondText" maxlength="160" class="grow" placeholder="We owe each other a debt." value="${esc(me.bond?.text || '')}"><button class="btn" type="submit">Save</button></div></form>
    </div>
    ${payoffs.length ? `<div class="card table-card"><h3>✔ Paid off</h3>${payoffs.map((p) => `<p><b>${esc(p.text)}</b><br>${esc(p.payoff)}</p>`).join('')}</div>` : ''}
    ${canon.length ? `<div class="card table-card"><h3>📜 Canon</h3>${canon.map((c) => `<p><b>${esc(c.by)}:</b> ${esc(c.text)}</p>`).join('')}</div>` : ''}`;
});

function drawNudge(n) {
  if (nudgeId === n.id) return;
  nudgeId = n.id;
  sheet.hidden = false;
  sheet.innerHTML = `<div class="nudge-card">
    <div class="nudge-kicker">A quiet thought</div>
    <p class="nudge-text">${esc(sh(n.text))}</p>
    <form id="nudgeForm"><input id="nudgeWords" maxlength="160" placeholder="Say it in your own words (optional)" class="grow">
      <div class="row"><button class="btn" type="button" data-keep>Keep it to myself</button><button class="btn primary" type="submit">Share aloud</button></div></form>
  </div>`;
  sheet.querySelector('[data-keep]').onclick = () => { socket.emit('player:nudge', { id: n.id, share: false }); };
  sheet.querySelector('#nudgeForm').onsubmit = (e) => {
    e.preventDefault();
    socket.emit('player:nudge', { id: n.id, share: true, text: sheet.querySelector('#nudgeWords').value.trim() });
  };
}

box.addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.id === 'monForm') {
    const text = box.querySelector('#monText').value.trim();
    if (text) socket.emit('player:montage', { text });
  } else if (e.target.id === 'frameForm') {
    const text = box.querySelector('#frameText').value.trim();
    if (text) socket.emit('player:frame', { text });
  } else if (e.target.id === 'bondForm') {
    const to = box.querySelector('#bondTo')?.value;
    const text = box.querySelector('#bondText').value.trim();
    if (to && text) socket.emit('player:bond', { to, text });
  }
});
