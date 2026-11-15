// Rules core: pure functions, no DOM. Built to dist/core.cjs for the Node server (tools/build-iso.mjs).
export * from './grid.js';
export { Room, diffView, applyDiff, computePartyVision } from './room.js';
export { createGame, applyIntent, attackPreview, canControl } from './engine.js';
