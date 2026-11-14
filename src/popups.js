// One TV pop-up at a time (Mike, Nov 14). Opening a pop-up closes whichever other one is up, so the
// relations web, camp, a shop, the legends cards, a montage, a relic card and the journal book never stack.
const CLOSERS = {
  camp: (s) => { if (s.camp?.open) require('./camp').setOpen(s.camp, false); },
  web: (s) => { if (s.web) s.web.showTv = false; },
  legends: (s) => { s.legendsShow = null; },
  trophy: (s) => { s.trophy = null; },
  shop: (s) => { s.shopPop = null; },
  montage: (s) => { if (s.montage?.prompt) Object.assign(s.montage, { prompt: '', open: false, reveal: false, answers: {} }); },
  relic: (s) => { if (s.tv) s.tv.relic = null; },
  book: (s) => { if (s.tv?.book) s.tv.book.open = false; },
};

// Close every pop-up except `kind`. Call it right before opening `kind`.
function only(state, kind) {
  for (const [k, close] of Object.entries(CLOSERS)) if (k !== kind) close(state);
}

module.exports = { only, KINDS: Object.keys(CLOSERS) };
