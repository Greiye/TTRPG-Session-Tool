# Phase 0 decisions

Mike can overrule any of these; each is isolated in one module.

| Item | Decision | Why | Where |
|---|---|---|---|
| 0g | **HTTPS for phones** (Mike's call). Self-signed certificate for localhost + every LAN IP, made on first start, renewed when IPs change. HTTP stays on for the laptop itself; phones are redirected to HTTPS. | Browsers only allow the mic and Chrome speech on secure origins. | `src/tls.js`, `server.js` |
| 13 | **Vosk** is the local speech model (Mike's call); Chrome Web Speech stays as the other option. | Runs offline on the laptop. | (Phase 5) |
| 29 | Packaging is low priority: Mike hosts. | | |
| 0i | **JSON files**, not SQLite: `data/campaign.json` (table state), `data/characters.json`, `data/entities.json`. Debounced atomic writes; flushed on Ctrl+C. | Small data, no native build step. Easy to back up and read. | `src/store.js` |
| 0a | Rules adapters behind one interface. **D&D 5e** full; **Daggerheart** preview (duality dice, Hope/Fear, traits as skills; no initiative). DM switches in the top bar. | System-agnostic core. | `src/rules/` |
| 0b | Visibility: per-viewer state (dm, codm, player, screen, guest). Items carry `vis` (`all`, `dm`, or `{ to: [ids], screen }`); fields like `secret`, `hooks`, enemy `atk/dmg` are DM-only. | One rule for whispers, perception, spoils. | `src/visibility.js` |
| 0d | 4-letter room code (in the QR, `/j/CODE` short link, typed on the phone). Device tokens let a phone reclaim its seat silently; taking over a seat in use needs a confirm. Room code is only sent to the DM and the TV. | Stops stale tabs and neighbours; survives dropped phones and restarts. | `src/session.js` |
| 0c | Display settings per device (text size, color-blind safe or high contrast palette, reduced motion). The TV follows the DM's table setting. | | `public/settings.js` |
| 0e | `Anim` pipeline: WebM/MP4 portraits keep one live `<video>` across re-renders; named animations scaled by each character's `anim` profile (speed, intensity); reduced motion respected. | | `public/anim.js` |
| 0f/0j | One upload endpoint `/api/assets/:kind` (backdrop, audio, portrait, creature, map) with per-kind formats and size limits, byte sniffing, WebM re-encode via ffmpeg (portrait 256 px, creature 384 px, VP9 with alpha) when ffmpeg is installed, `immutable` cache headers. | | `src/assets.js` |
| 0h/0k | Server split into `src/` modules; front-end split into ES modules under `public/js/` sharing one socket (`public/js/client.js`). No build step. | | |
| 0l | Bundle format v1, see `arthuria-format.md`. Arthuria's own stack is still unknown, so the format is plain JSON + JSON Schema. | | `schema/`, `src/bundle.js` |

# Phase 1 decisions (data layer)

| Item | Decision | Why | Where |
|---|---|---|---|
| 1 | Autosave stays as in 0i. Added **save points** (named snapshots of table state + characters, `data/saves/`) and a **startup backup** of all data files (`data/backups/`, last 8 kept). Loading a save point keeps the current room code so phones stay seated. | A bad session can be rolled back. | `src/saves.js` |
| 2 | Sheet fields live on the character: abilities, save proficiencies, speed, spell slots, hit dice, inventory, languages, spell list, notes, temp HP. Players edit what they track at the table (HP, slots, hit dice, inventory, spells, notes); only the DM edits abilities, slot maximums, speed, languages. Other phones and the TV see only the public card. | Live to the DM without leaking notes. | `src/sheet.js` |
| 2 | Derived numbers (modifiers, saves, passive scores) are computed by the rules adapter on the server and sent as `derived`. | Keeps 5e math out of the clients (Daggerheart later). | `src/rules/` |
| 3 | Stat blocks are a library (`data/creatures.json`). A creature has a **side**: enemy, ally or neutral. The DM plays all of them and picks which attack to use. Combatants are copies, so editing a stat block does not change a running fight. | | `src/creatures.js` |
| 3b | Import understands **Open5e v1** JSON, **5e-SRD (5e-bits)** JSON and our own export. File import works offline; Open5e search needs internet on the laptop and only asks for SRD-licensed entries. A small condensed **SRD 5.1 starter set** (12 creatures, 14 spells, CC-BY-4.0) ships in `srd/starter.json` so the app works out of the box. | No full SRD dump in the repo. | `src/srd.js` |
| 3b | Libraries are fetched over HTTP (`/api/creatures`, `/api/spells`) and refetched when a version number in the state changes. | A full SRD is too big to broadcast on every update. | `src/library.js` |
