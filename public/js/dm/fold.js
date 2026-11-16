// Cards that fold (Mike, Nov 15): a card with data-fold folds to its title. data-fold="closed" starts folded.
// Tap the title to open or fold it; the choice is saved on this laptop (data-fold-key names the card).
const KEY = 'dmFold';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { saved = {}; }
const keyOf = (card) => card.dataset.foldKey || card.querySelector(':scope > h3')?.textContent.trim().slice(0, 40) || '';
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* private mode */ } };

function setUp(card) {
  if (card.dataset.foldReady) return;
  card.dataset.foldReady = '1';
  const k = keyOf(card);
  const folded = k in saved ? saved[k] : card.dataset.fold === 'closed';
  card.classList.toggle('folded', folded);
  const h = card.querySelector(':scope > h3');
  if (h) { h.setAttribute('role', 'button'); h.tabIndex = 0; h.setAttribute('aria-expanded', String(!folded)); }
}
function toggle(card) {
  const folded = !card.classList.contains('folded');
  card.classList.toggle('folded', folded);
  card.querySelector(':scope > h3')?.setAttribute('aria-expanded', String(!folded));
  saved[keyOf(card)] = folded;
  save();
}
const scan = () => document.querySelectorAll('.card[data-fold]').forEach(setUp);
scan();
new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
document.addEventListener('click', (e) => {
  const h = e.target.closest('.card[data-fold] > h3');
  if (h && !e.target.closest('button, input, select, a, label')) toggle(h.parentElement);
});
document.addEventListener('keydown', (e) => {
  const h = e.target.closest?.('.card[data-fold] > h3');
  if (h && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(h.parentElement); }
});
