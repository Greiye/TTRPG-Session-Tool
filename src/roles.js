// Co-DM roles (Mike, Nov 16). Each helper takes one job off the DM and gets only the events that job needs.
//   dm       everything (localhost or DM_KEY)
//   codm     atmosphere: backdrops, overlays, music, SFX (src/sockets/atmo.js checks any role)
//   battle   Battle Master: runs combat, edits the battle map, controls the DM's creatures
//   social   Social Master: runs NPC dialogue (the visual novel box), emotions, cast and player choices
// Battle and Social Masters use the DM page (/dm?key=...) with every other card hidden; the server
// refuses any DM event not listed here, so hiding a card is never the only guard.

const BATTLE = [
  // Encounter flow
  'dm:combat:start', 'dm:combat:next', 'dm:combat:end',
  // The DM's forces: add, attack with, roll for, damage and remove creatures
  'dm:enemy:add', 'dm:enemy:attack', 'dm:enemy:remove', 'dm:hp', 'dm:condition', 'dm:timer:condition',
  'dm:concentrate', 'dm:concentrate:drop', 'dm:boss:card', 'dm:boss:clear',
  'dm:creature:spawn', 'dm:creature:save', 'dm:creature:delete', 'dm:creature:accent',
  'dm:roll:creature', 'dm:rnd:art',
  // Battle map
  'dm:map', 'dm:map:generate', 'dm:map:paint', 'dm:map:tile', 'dm:fog',
  'dm:token', 'dm:token:move', 'dm:token:light',
];

const SOCIAL = [
  'dm:npc', 'dm:emotion', 'dm:pc:emotion', 'dm:say', 'dm:caption', 'dm:choices', 'dm:gloss', 'dm:intro',
  'dm:cast:add', 'dm:cast:pick', 'dm:cast:remove', 'dm:sprite', 'dm:relation',
];

const ROLES = {
  battle: { name: 'Battle Master', icon: '⚔️', events: new Set(BATTLE), assets: ['map', 'creature'], rolls: true },
  social: { name: 'Social Master', icon: '💬', events: new Set(SOCIAL), assets: [], rolls: false },
};

const MASTER_ROLES = Object.keys(ROLES);
// May this role run this DM event?
const can = (role, event) => role === 'dm' || !!ROLES[role]?.events.has(event);
// May this role upload this asset kind?
const canUpload = (role, kind) => role === 'dm' || !!ROLES[role]?.assets.includes(kind);

module.exports = { ROLES, MASTER_ROLES, BATTLE, SOCIAL, can, canUpload };
