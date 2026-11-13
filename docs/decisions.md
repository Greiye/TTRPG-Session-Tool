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

# Phase I decisions (table control tools)

Automation counts and shows; the DM decides. Every value below can be overridden by the DM.

| Item | Decision | Why | Where |
|---|---|---|---|
| Cue deck | A cue stores mode, light, backdrop, layers, one-shot sound and a handout. Firing applies only the parts it sets. Bulbs follow the light. | One tap for a prepared moment, nothing else changes. | `src/table.js` (`addCue`, `fireCue`), `src/sockets/table.js` |
| Secret nudge | Sent to one character. The phone buzzes and shows the line in a sheet. The player shares it aloud (their words or the prompt) or keeps it. Sharing logs a line; keeping logs nothing. | Quiet prompts at the table; the player always chooses. | `sendNudge`, `answerNudge` |
| Spotlight meter | Counts acts (checks, choices, combat turns, framing) and talk (say, montage answers, shared nudges). Flags a character at half the average or less. DM only. | Gives quiet players a moment without deciding for them. | `bump`, `balanceView`; hooks in `src/sockets/player.js` |
| Bonds | Stored on the character (`bond`, private to the owner and the DM). A bond is due after two sessions without a call-back. Sessions are counted by the DM ("Next session"). | Reminders, not rules. | `setBond`, `callBack`, `dueBonds` |
| Tension | 0 to 10 dread bar on the TV with a label. Not tied to the soundboard yet. | DM sets the pace. Automatic tie-in is Phase K. | `setTension` |
| Foreshadowing | Hints are DM only. Payoffs are shown to everyone in the recap. | Secret plans stay secret until paid off. | `addHint`, `payOff`, `recapFor` |
| Framing | DM grants one token at a time (max 3). A phone spends one to add a detail, which goes straight to canon on the TV. DM can remove it. | Player agency with a DM override. | `grantToken`, `spendToken`, `removeCanon` |
| Montage | Phones see the count until the reveal. After the reveal the TV and every phone see all answers. | Everyone answers in private, then together. | `askMontage`, `montageView` |
| Layouts | `auto`, `social`, `combat`, `exploration`, `rest`. The TV adds a `layout-*` class and CSS hides what that moment does not need. | One tap, no per-element setup. | `setLayout`, `public/style.css` |

State defaults live in `src/table-state.js` so `src/state.js` can load them first (no require cycle).
