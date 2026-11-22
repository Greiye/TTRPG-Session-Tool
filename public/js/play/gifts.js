// Phone: "Received 'Rope'" when the DM gives this character an item (src/gifts.js, Mike, Nov 21).
import { socket } from '../client.js';

socket.on('item:received', ({ items = [] } = {}) => {
  const text = items.map((i) => `'${i.name}'${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ');
  if (!text) return;
  const el = document.createElement('div');
  el.className = 'insp-toast gift-toast';
  el.setAttribute('role', 'status');
  el.textContent = `🎁 Received ${text}`;
  document.body.appendChild(el);
  navigator.vibrate?.([30, 40, 30]);
  setTimeout(() => el.remove(), 3200);
});
