// Cards that fold (Mike, Nov 15): a card with data-fold folds to its title. data-fold="closed" starts folded.
// Tap the title to open or fold it; the choice is saved on this laptop (data-fold-key names the card).
// Every sidebar tab card starts folded for now (Mike, Nov 16), so a card in a tab (data-tab) with a title and
// no data-fold of its own gets data-fold="closed". The Modes card and the Party sidebar cards fold too.
const KEY = 'dmFold';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { saved = {}; }
const head = (card) => card.querySelector(':scope > h3:first-of-type');
// The title's own words, without the notes and buttons inside it (those change while the card is open).
const ownText = (h) => [...(h?.childNodes || [])].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').trim().slice(0, 40);
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* private mode */ } };

function setUp(card) {
  if (card.dataset.foldReady) return;
  card.dataset.foldReady = '1';
  const h = head(card);
  if (!card.dataset.foldKey) card.dataset.foldKey = ownText(h) || card.id || '';
  const k = card.dataset.foldKey;
  const folded = k in saved ? saved[k] : card.dataset.fold === 'closed';
  card.classList.toggle('folded', folded);
  if (h) { h.setAttribute('role', 'button'); h.tabIndex = 0; h.setAttribute('aria-expanded', String(!folded)); }
}

// Fold or open a card from code (the battle map folds itself after generating terrain).
export function setFold(card, folded) {
  if (!card) return;
  setUp(card);
  card.classList.toggle('folded', folded);
  head(card)?.setAttribute('aria-expanded', String(!folded));
  saved[card.dataset.foldKey] = folded;
  save();
}
const toggle = (card) => setFold(card, !card.classList.contains('folded'));

function scan() {
  document.querySelectorAll('.card[data-tab]:not([data-fold])').forEach((c) => { if (head(c)) c.dataset.fold = 'closed'; });
  document.querySelectorAll('.card[data-fold]').forEach(setUp);
}
scan();
new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
document.addEventListener('click', (e) => {
  const h = e.target.closest('.card[data-fold] > h3:first-of-type');
  if (h && !e.target.closest('button, input, select, a, label')) toggle(h.parentElement);
});
document.addEventListener('keydown', (e) => {
  const h = e.target.closest?.('.card[data-fold] > h3:first-of-type');
  if (h && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(h.parentElement); }
});
