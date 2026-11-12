// Which screen the phone shows: join (picker), game, or profile editor.
import { $ } from '../client.js';

const listeners = [];
export const current = () => (!$('#gameView').hidden ? 'game' : !$('#profile').hidden ? 'profile' : 'join');
export function show(view) {
  $('#joinView').hidden = view !== 'join';
  $('#gameView').hidden = view !== 'game';
  $('#profile').hidden = view !== 'profile';
  for (const fn of listeners) fn(view);
}
export const onShow = (fn) => listeners.push(fn);
