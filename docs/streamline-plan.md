# Streamline plan: modules, sockets, efficiency

Plan only, nothing built yet. Scope: one table, one laptop, 4 to 6 phones, one TV, LAN.
Measured on main at ec7edab (Nov 23), fresh temp `DATA_DIR`, DM + TV + 4 phones.

## What the numbers say

| Measure | Value |
| --- | --- |
| Files / internal imports (module graph) | 372 / 996 |
| Socket handler files / event handlers | 23 / about 360 |
| `broadcast()` call sites | 113 |
| State emits per change | 1 per connected socket (6 here), coalesced per tick |
| `state` payload per change: DM / phone / TV | 31 to 36 KB / 22 to 27 KB / 21 to 26 KB |
| Same payload with WebSocket compression | DM 8.4 KB, phone 6.6 KB (about 4x smaller) |
| 20 dice rolls from one phone | 3.1 MB sent in total to 6 sockets |
| Parts of a phone payload that never change in play | rules, checks, classes, systems, emotions, effects, lib, house rules: 4.3 KB; audio loops + moods: 3.3 KB; shop catalogue: 4.6 KB. About 55% of the payload. |
| Server: `fullState()` + 4 viewer filters + JSON | under 1 ms per broadcast |
| Browser work per state update (Chromium, phone at 4x CPU slowdown) | DM 13 ms, TV 8 ms, phone 12 ms (script + style + layout) |
| DOM size | DM 45,849 nodes, phone 7,156, TV 5,131 |
| Timers | one 500 ms world map tick, broadcasts only when travel or a vote changes something |
| Dead code | none found. No `src/` module or `public/*.js` file is unreferenced. `archive/`, `voice.js` and `docs/termux.md` are already gone. |

**Bottom line.** The server is fast. Nothing is chatty per tick. The cost is that every change sends the whole
world (about 25 KB) to every screen, uncompressed, and the DM page keeps 46k DOM nodes alive. At one table on
home Wi-Fi that works today. It is the first thing to fix if phones feel laggy or drain battery, and the steps
below are cheap.

## Steps, in order

Each step is small, has its own test, and can ship on its own.

### 1. Turn on WebSocket compression (one line, biggest win)

`server.js`: `new Server({ perMessageDeflate: { threshold: 1024 } })`. Measured: 26.7 KB to 6.6 KB per phone
update. The laptop does the compressing; at 6 sockets that costs well under 1 ms per change.
Test: a socket test checks the `sec-websocket-extensions` handshake header says `permessage-deflate`.
Risk: very low. Socket.IO keeps a plain fallback.

### 2. Send fixed data once, not with every state

Move the fields that only change when the DM edits settings out of `fullState()` and into a `meta` event:
`rules`, `checks`, `classes`, `systems`, `emotions`, `effects`, `lib`, `houseRuleList`, `audio.loops`,
`audio.moods`, `audio.builtins`. Send `meta` on connect and when one of them changes (store a version number).
`public/js/client.js` merges `meta` into the state it hands to `onState`, so the 78 subscribers need no change.
Saves about 7.5 KB per update per screen (35%).
Test: phone and TV get `meta` once on connect, not on a dice roll; changing house rules sends a fresh `meta`.

### 3. Send the shop catalogue only when a shop changes

`shops` is 4.6 KB on every phone update and changes only when the DM edits a shop or someone buys.
Same pattern as step 2 (version number, own event). Saves another 20%.

After steps 1 to 3 a phone update is about 10 KB raw, 3 KB on the wire: about 8x less than today.

### 4. One DM-only wrapper for socket handlers

12 handler files each define their own `const dm = (event, fn) => socket.on(...)`. They differ in small ways:
some ack `{ error: 'DM only' }`, some `'DM only.'`, some `'Only the DM can do that.'`, some never ack, some
are async, some broadcast and some do not. Another 10 handlers in `dm.js`, `takeover.js` and `spectator.js`
check `socket.data.role !== 'dm'` by hand.

Add `src/sockets/on.js` with `dmOn(socket, event, fn)` and `playerOn(socket, event, fn)`: one role check, one
error text, ack always answered, `broadcast()` after unless the handler returns `{ quiet: true }`, async
supported. Move files over one at a time. No behaviour change except the error text is the same everywhere.
Test: one test calls a DM event from a phone in every handler file and expects the same error ack.

### 5. Split `src/sockets/dm.js` by pillar

728 lines, 46 imports, 125 handlers; it is the most coupled file in the graph. Split into
`sockets/combat.js`, `sockets/social.js`, `sockets/explore.js`, `sockets/characters.js` and keep
`sockets/dm.js` for modes, settings and session. Pure moves, using step 4's wrapper. The module graph test
(`test/module-graph.js`) will flag the regenerated graph; run `npm run graph` in the same PR.
Risk: low if done as moves only, one pillar per commit, full `npm test` after each.

### 6. Let phones and the TV skip work they do not show

Today every `onState` subscriber re-renders on every update, even for a hidden tab.
- `onState(fn, keys)` in `public/js/client.js`: run `fn` only when the JSON of those state keys changed.
  Subscribers that pass no keys keep today's behaviour, so modules move over one at a time.
- DM page: render folded cards and hidden tabs on open, not in the background. That is where most of the 46k
  nodes are; the phone and TV are already small.
Measured gain today is small (about 10 ms per update on the DM). Do this after 1 to 3, and only if the DM
page feels slow on Mike's laptop.

### 7. Keep `broadcast()` lean

`broadcast()` also runs `perception.scan`, `soundscape.sync`, `storybook.watch`, `storygraph.sync`,
`saveRoster()` and `undo.touch()` on every change. All are cheap now (whole broadcast under 1 ms). Rule for new
features: hang new work on the specific event that needs it, not on `broadcast()`.
Add a dev-only timer (`DEBUG_BROADCAST=1`) that logs broadcast time and bytes per viewer, so a regression shows up
in `npm run doctor` or `npm run bots` instead of at the table.

## Not worth doing for one table

- Delta or patch protocols (JSON patch, immer). Steps 1 to 3 get most of the gain with far less risk.
- Moving off `fullState()` per viewer. 4 viewer filters cost under 1 ms.
- Rooms per role with shared emits. Saves a JSON encode per socket; not measurable at 6 sockets.
- A front-end build step or framework. Plain ES modules stay.
- Deleting modules. Nothing is dead; every module has a caller and most have a test.

## How the numbers were taken

Temporary scripts (not committed) using `test/helpers.js`: boot on a temp `DATA_DIR`, connect DM, TV and 4
phones, then count `state` events and `JSON.stringify` bytes per socket for one `dm:emotion`, 20 `player:roll`
and 5 s idle; `zlib.deflateRawSync` for the compressed size. Browser cost from Chromium DevTools
`Performance.getMetrics` (ScriptDuration, LayoutDuration, RecalcStyleDuration, Nodes) over 20 rolls, phone at
4x CPU throttling. A fresh table has little data; a real campaign with more NPCs, places and log lines makes the
payload larger, so the gains above are a floor.
