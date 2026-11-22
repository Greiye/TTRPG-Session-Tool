// Co-DM roles (Mike, Nov 16). Each helper takes one job off the DM and gets only the events that job needs.
//   dm       everything (localhost or DM_KEY)
//   codm     atmosphere: backdrops, overlays, music, SFX (src/sockets/atmo.js checks any role)
//   battle   Battle Master: runs combat, edits the battle map, controls the DM's creatures
//   social   Social Master: runs NPC dialogue (the visual novel box), emotions, cast and player choices
//   music    Music Co-DM: runs the soundscape (mood wheel, environment, layers, weather, favourites); not the
//            master volume, the output or the DM lock (src/sockets/sound.js)
// Battle and Social Masters use the DM page (/dm?key=...) with every other card hidden; the server
// refuses any DM event not listed here, so hiding a card is never the only guard.

const BATTLE = [
  // Encounter flow
  'dm:combat:start', 'dm:combat:next', 'dm:combat:end', 'dm:combat:stage', 'dm:tv:cam',
  // The DM's forces: add, attack with, roll for, damage and remove creatures
  'dm:enemy:add', 'dm:enemy:attack', 'dm:enemy:remove', 'dm:hp', 'dm:condition', 'dm:timer:condition',
  'dm:concentrate', 'dm:concentrate:drop', 'dm:boss:card', 'dm:boss:clear',
  'dm:creature:spawn', 'dm:creature:save', 'dm:creature:delete', 'dm:creature:accent',
  'dm:roll:creature', 'dm:rnd:art',
  // Battle map
  'dm:map', 'dm:map:generate', 'dm:map:paint', 'dm:map:tile', 'dm:map:daylight', 'dm:fog',
  'dm:token', 'dm:token:move', 'dm:token:light', 'dm:token:remove', 'dm:move:reset',
];

const SOCIAL = [
  'dm:npc', 'dm:emotion', 'dm:pc:emotion', 'dm:say', 'dm:caption', 'dm:choices', 'dm:gloss', 'dm:intro',
  'dm:cast:add', 'dm:cast:pick', 'dm:cast:remove', 'dm:sprite', 'dm:relation',
  'dm:convo:start', 'dm:convo:end', 'dm:convo:add', 'dm:convo:drop',
];

// Soundscape events (src/sockets/sound.js). Left out on purpose: sound:master, sound:output, sound:lock and
// sound:autocombat. The weather slider is theirs too (Mike, Nov 17), though travel and sight read the weather.
const MUSIC = [
  'sound:mood', 'sound:env', 'sound:layer:add', 'sound:layer:remove', 'sound:layer:volume', 'sound:density',
  'sound:stop', 'sound:fav:save', 'sound:fav:load', 'sound:fav:delete', 'sound:fav:scene', 'sound:auto:undo', 'sound:weather',
];

const ROLES = {
  battle: { name: 'Battle Master', icon: '⚔️', events: new Set(BATTLE), assets: ['map', 'creature'], rolls: true },
  social: { name: 'Social Master', icon: '💬', events: new Set(SOCIAL), assets: [], rolls: false },
  music: { name: 'Music Co-DM', icon: '🎻', events: new Set(MUSIC), assets: ['audio'], rolls: false },
};

// May this role run this DM event?
const can = (role, event) => role === 'dm' || !!ROLES[role]?.events.has(event);
// May this role upload this asset kind?
const canUpload = (role, kind) => role === 'dm' || !!ROLES[role]?.assets.includes(kind);

module.exports = { ROLES, BATTLE, SOCIAL, MUSIC, can, canUpload };
