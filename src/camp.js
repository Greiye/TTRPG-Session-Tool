// Camp: the DM opens camp. The TV shows a camp image, phones get a pop-up to describe downtime
// and vote short or long rest. The DM applies the rest with the Rests buttons.
const { str } = require('./util');

const fresh = () => ({ open: false, n: 0, image: null, votes: {}, notes: {} });

// Open or close camp. Opening starts a new camp: votes and notes from the last one are cleared.
function setOpen(camp, open) {
  if (open && !camp.open) {
    camp.n += 1;
    camp.votes = {};
    camp.notes = {};
  }
  camp.open = !!open;
}

// The camp image is one of the uploaded backdrops (state.backdrop.library), so no new upload path is needed.
function setImage(camp, item) {
  camp.image = item && item.url ? { url: String(item.url), video: !!item.video } : null;
}

// A phone's vote and downtime note. One vote each; changing it is allowed while camp is open.
function vote(camp, charId, kind, text) {
  if (!camp.open || !['short', 'long'].includes(kind)) return false;
  camp.votes[charId] = kind;
  const t = str(text, 500);
  if (t) camp.notes[charId] = t;
  return true;
}

function tally(camp) {
  const counts = { short: 0, long: 0 };
  for (const v of Object.values(camp.votes)) counts[v] = (counts[v] || 0) + 1;
  return counts;
}

// What a viewer may see: the DM sees every vote and note; a phone sees its own; the TV sees counts only.
function viewFor(camp, viewer) {
  if (!camp) return null;
  const base = { open: camp.open, n: camp.n, image: camp.image, counts: tally(camp) };
  if (viewer.role === 'dm') return { ...base, votes: camp.votes, notes: camp.notes };
  if (viewer.role === 'player') return { ...base, mine: { vote: camp.votes[viewer.charId] || null, text: camp.notes[viewer.charId] || '' } };
  return base;
}

module.exports = { fresh, setOpen, setImage, vote, tally, viewFor };
