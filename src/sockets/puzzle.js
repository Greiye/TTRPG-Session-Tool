// Teamwork puzzle events (see src/puzzle.js). The DM starts, assigns clues, marks guesses and confirms
// the solve. Phones send guesses. Acks carry { ok } or { error } where the DM needs to see why.
const { state, log, broadcast } = require('../state');
const { roster } = require('../roster');
const puzzle = require('../puzzle');

module.exports = function puzzleSockets(socket) {
  const isDm = () => socket.data.role === 'dm';
  const me = () => {
    const c = state.players[socket.data.charId];
    return c && c.socketId === socket.id ? c : null;
  };
  const seated = () => Object.keys(state.players);

  // DM: start a puzzle. Replaces any puzzle on the table. Clues spread over the seated players in turn.
  socket.on('dm:puzzle:start', (spec = {}, ack) => {
    if (!isDm()) return ack?.({ error: 'Only the DM can start a puzzle.' });
    const r = puzzle.create(spec, seated(), `puzzle${Date.now()}`);
    if (r.error) return ack?.({ error: r.error });
    state.puzzle = r.puzzle;
    log('system', `Puzzle: ${r.puzzle.title}. ${r.puzzle.clues.length} clue(s) are with the players.`, { tone: 'call' });
    broadcast();
    ack?.({ ok: true });
  });

  // DM: give a clue to one seated character, to every phone ('*'), or hold it back (null).
  socket.on('dm:puzzle:assign', ({ clueId, pid } = {}, ack) => {
    if (!isDm() || !state.puzzle) return ack?.({ error: 'No puzzle.' });
    if (pid != null && pid !== '*' && !state.players[pid]) return ack?.({ error: 'Not seated.' });
    if (!puzzle.assign(state.puzzle, clueId, pid)) return ack?.({ error: 'No such clue.' });
    broadcast();
    ack?.({ ok: true });
  });

  // DM: mark a guess wrong (greyed on phones), or clear the mark.
  socket.on('dm:puzzle:guessmark', ({ guessId, wrong } = {}) => {
    if (!isDm() || !puzzle.markGuess(state.puzzle, guessId, wrong)) return;
    broadcast();
  });

  // DM: confirm the solve. The TV shows the solution with an animation, and the table log notes it.
  socket.on('dm:puzzle:solve', () => {
    if (!isDm() || !puzzle.solve(state.puzzle)) return;
    log('system', `Solved: ${state.puzzle.title}. ${puzzle.solution(state.puzzle)}`, { tone: 'good' });
    broadcast();
  });

  socket.on('dm:puzzle:reopen', () => {
    if (!isDm() || !puzzle.reopen(state.puzzle)) return;
    broadcast();
  });

  socket.on('dm:puzzle:clear', () => {
    if (!isDm()) return;
    state.puzzle = null;
    broadcast();
  });

  // Phone: a guess at the answer. Only while the puzzle is open and the phone has a seated character.
  socket.on('player:puzzle:guess', ({ text } = {}, ack) => {
    const c = me();
    if (!c) return ack?.({ error: 'Join the party first.' });
    const g = puzzle.guess(state.puzzle, c.id, roster[c.id]?.name || c.name, text, `g${Date.now()}${Math.floor(Math.random() * 1000)}`);
    if (!g) return ack?.({ error: 'Nothing to guess, or the puzzle is closed.' });
    broadcast();
    ack?.({ ok: true });
  });
};
