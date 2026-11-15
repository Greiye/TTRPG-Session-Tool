// Server-side entry: import into your Node game server. No hard dependency on `ws` — pass your own WebSocketServer.
export { Room, diffView, applyDiff, computePartyVision } from './core/room.js';
export { createGame, applyIntent, spawnUnit, rollInitiative, activeUnit, canControl, attackPreview, DM_INTENTS } from './core/engine.js';
export * as grid from './core/grid.js';
export { connectSocket, attachWebSocketServer } from './core/connection.js';
export { default as defaultRules } from './core/rules.js';
