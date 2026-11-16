# Studio review, 16 Nov 2026

A review of TTRPG Session Tool as if a small game studio were shipping it: part virtual tabletop, part
party video game. **Scope (Mike):** this is for one group of friends at one table, not a public product.
So public-release work (accounts, scaling, store pages, anti-cheat, localisation) is left out on purpose,
and the bar is "nothing breaks on game night, and the table has fun".

Reviewed at `main` 31b4533 (after PR #119). `npm test` (61 scripts) and `npm run test:ui` (11 browser
scripts) both pass. A load check with the DM, the TV and 6 phones gave state updates of 24 KB (DM),
15 KB (TV) and 16 KB (phone); 50 narration lines sent 20 ms apart reached every phone in 1.7 s, with
quick changes merged. The game log is capped at 80 lines in the live state, so updates stay small.

## Summary

| Severity | Meaning | Count | Fixed in this review |
| --- | --- | --- | --- |
| High | Can stop or spoil a game night, or blocks Mike's own rules | 6 | 4 |
| Medium | Friction the table will notice, or a risk worth closing soon | 18 | 4 |
| Low | Polish or nice to have | 16 | 0 |
| **Total** | | **40** | **8** |

What is already strong, and should be kept as it is: one shared state with per-viewer filtering
(`src/visibility.js`), guarded socket handlers, debounced atomic saves that retry, startup backups, save
points, Undo/Redo for the DM, a placeholder test party, generated placeholder sounds, a reconnect pill,
co-DM roles, and a very large automated test suite. Most studio projects at this size have far less.

Legend: ✅ fixed in this review · 📋 already in `docs/backlog.md` · 🆕 new suggestion.

## 1. Saves, crashes and recovery

| # | Sev | Finding | Suggested fix |
| --- | --- | --- | --- |
| S1 | High | ✅ An error outside a socket handler (a timer, a rejected promise such as a wiki push, a file watcher) ended the Node process, which drops every phone and the TV mid-session. Socket handlers were guarded; the rest were not. | `src/safety.js`: process-level net that logs each new error once, saves the campaign right away and keeps the server running. |
| S2 | Medium | ✅ Starting the game twice (a second `start.cmd` window) printed a Node stack trace for `EADDRINUSE`. | Plain message: "Port 3000 is already in use. The game may already be running in another window." |
| S3 | Medium | 🆕 `campaign.json` has `version: 1` and a different version starts a fresh table (a copy is kept). The first time the format has to change, every campaign resets. | A small migration chain in `src/store.js` (`migrations[1] = (s) => …`) and a test that loads a version 1 file. |
| S4 | Medium | 📋 PR Y autosave snapshots: the live file is saved on every change, but there is no rolling "every 10 minutes" save point, so a bad Undo-able mistake older than 15 steps is lost. | Timed save points, keep the last 6, under Saves. |
| S5 | Medium | 🆕 Save points and the export bundle hold the campaign, characters and portraits, but not backdrops, music, maps, layered sprites or creature art in `uploads/`. A laptop swap loses the art. | A **Back up everything** button that zips `data/` and `uploads/` (or a `npm run backup` script). |

## 2. Game night setup and onboarding (friends)

| # | Sev | Finding | Suggested fix |
| --- | --- | --- | --- |
| O1 | High | ✅ No way to check the laptop before friends arrive. Ports in use, no Wi-Fi address, a folder that cannot be written, an expiring certificate or a full disk all show up only once people are waiting. | `npm run doctor`: a game-night check that prints ok / warn / FAIL per item and exits 1 when something must be fixed. |
| O2 | Medium | 🆕 The DM has many tools and holds (1 s holds, right-click menus, Ctrl+Z, arrow keys on the battle map) and they are spread across the Changelog. | `docs/dm-quick-reference.md`: one printable page of shortcuts, holds and menus. |
| O3 | Medium | 🆕 Friends scan the QR every session and see the certificate warning on each new phone. | A web app manifest and icon for `/play`, so a phone can **Add to Home Screen** and reopen the game in one tap (the room code is already remembered). |
| O4 | Low | 🆕 No printable "how to join" card for the table (Wi-Fi name, QR, what to tap through on the certificate warning). | A `/join-card` page the DM can print once. |

## 3. QA and testing

| # | Sev | Finding | Suggested fix |
| --- | --- | --- | --- |
| Q1 | High | ✅ CI ran only `npm test`. The 11 browser tests (`npm run test:ui`: DM, TV and phone pages, pop-ups, menus, animations) never ran on pull requests, so a broken page could merge with green CI. | New `ui` job in `.github/workflows/ci.yml` that installs headless Chromium and runs `npm run test:ui`. |
| Q2 | Medium | ✅ Testing the TV and DM screens alone needs several real phones. | `npm run bots -- 4`: playtest bots that join like phones and answer roll calls, votes, world map votes, message pop-ups, the dungeon gate, social lines and their own combat turns. Named `[Bot] …`. |
| Q3 | Medium | 🆕 `npm test` is 62 scripts chained with `&&`: the first failure hides every later result, and a full run takes about 2 minutes. | A tiny runner (`test/run.js`) that runs every script, prints a summary and fails at the end; optionally in parallel. |
| Q4 | Low | 🆕 `test:ui` prints clipped-text warnings (the Creature Designer token field at 1280 and 1500 px) but does not fail. | Shorten the placeholder text or widen the field, then make clipping a failure for new pages. |
| Q5 | Low | 🆕 No way to report a bug from the table; it gets forgotten by the next day. | A DM **Bug note** (Misc) that saves the note with the last 20 log lines and the mode to `data/bugs/`. |

## 4. VTT tools (battle map and scene)

| # | Sev | Finding | Suggested fix |
| --- | --- | --- | --- |
| V1 | High | 📋 PR X: fog of war per token, spell area templates, token condition icons with countdown, per-scene audio. These are the standard VTT tools players expect from a battle map. | Build PR X; templates and condition icons first (most used at a table). |
| V2 | Medium | 🆕 No measuring tool on the 3D battle map (distance in feet between two tiles, with height). | Shift-drag ruler that shows feet using the same step costs as `src/iso.js`. |
| V3 | Medium | 📋 PR Y light sources and vision radius. | Build with PR X fog, they share `src/vision.js`. |
| V4 | Low | 🆕 No ping: a player cannot point at a tile or place for the TV ("here!"). | Long-press on the phone map sends a ping ring to the TV for 2 s. |

## 5. Game and session flow

| # | Sev | Finding | Suggested fix |
| --- | --- | --- | --- |
| G1 | High | 🆕 Mike is writing his own system (Daggerheart + 5e + homebrew), but rules live in JS modules (`src/rules/dnd5e.js`, `daggerheart.js`). Stats, dice, conditions and the DC label cannot be changed without code. | A third rules module, **Custom**, read from `data/rules.json` (stats, skills, dice formula, conditions, labels), with an editor in Settings. |
| G2 | Medium | 📋 PR Y: rest resets, loot generator with DM approval, random encounter tables per scene, a basic character creator (PR Y rewrite: ancestry, background, card questions). | Build in that order; the creator matters most once new friends join. |
| G3 | Medium | 📋 PR V: time clock by road leg, town maps and town visits. | Build; it gives exploration the same pacing the dungeon has. |
| G4 | Low | 🆕 No session-start ritual since the intro card was archived (Nov 14); the recap quiz is the only "previously on". | Keep as is unless Mike asks; noted only. |

## 6. DM tools

| # | Sev | Finding | Suggested fix |
| --- | --- | --- | --- |
| D1 | Medium | 🆕 Undo keeps 15 steps of the whole campaign. A busy combat round can use them up within a minute. | 30 steps, or keep one step per 10 s beyond the last 15. |
| D2 | Low | 🆕 No "screen blank" for the TV between sessions or during a break besides switching modes. | A **Break** card on the TV ("Back in 10") with a countdown. |

## 7. Player phones

| # | Sev | Finding | Suggested fix |
| --- | --- | --- | --- |
| P1 | Medium | 🆕 Phone wake lock is opt-in (⚙ setting); most players will not find it and their phone sleeps between turns, which disconnects and reconnects. | Turn it on by default during combat and conversations only. |
| P2 | Low | 🆕 Haptics are used for HP changes only. | A short buzz when it is your turn or a roll is called. |

## 8. TV (the shared screen)

| # | Sev | Finding | Suggested fix |
| --- | --- | --- | --- |
| T1 | Medium | ✅ Neither the TV page nor the DM page held a screen wake lock, so the laptop or TV could dim or blank during a long quiet scene. | `public/awake.js` on `/screen` and `/dm`, taken again when the tab comes back. |
| T2 | Low | 🆕 Every screen has ⚙ **Text size** (Normal, Large, Extra large), but the TV has not been checked from the sofa at 3 m on a 4K TV. | One test screenshot at 3840×2160 with Large text, and Large as the TV default if it reads better. |
| T3 | Low | 🆕 Status screenshots from Nov 10 showed player portrait chips in the TV initiative strip as dark squares. Not re-checked since the 3D map replaced the strip. | Re-check with the test party (it now has placeholder portraits). |

## 9. Art and audio

| # | Sev | Finding | Suggested fix |
| --- | --- | --- | --- |
| A1 | High | ✅ (placeholders) There is almost no final art: one backdrop, procedural portraits and generated sound. Features that show uploaded art (portraits on the TV party bar, creature art, the backdrop library) could not be tried without making art first. | Marked placeholders in `public/samples/placeholders/`: 12 class portraits (the test party gets them), 6 creature tokens and 3 backdrops (one per pillar, in the library as **[Placeholder] …**). Final art list below. |
| A2 | Medium | 🆕 No music. Ambience is generated noise loops; there are no tracks for exploration, combat or social. | Pick CC0 or licensed tracks per pillar and list them in `docs/sounds.md`; per-scene audio is PR X. |
| A3 | Low | 🆕 No art list: what sizes, which formats, which are animated (portraits 512 px, layered sprites, WebM loops). | The table below; keep it in this file. |

**Art list for final assets** (placeholders exist for the first three rows):

| Asset | Count to start | Format | Notes |
| --- | --- | --- | --- |
| Character portraits | one per friend | PNG/WebP 512 px, or WebM loop up to 10 s at 256 px | Upload in the character editor |
| Creature art | 6 to 10 common foes | PNG/WebP, up to 384 px for WebM | Creature Designer or stat block |
| Backdrops | 1 per common scene (road, village, tavern, dungeon, camp) | JPG/WebP 1920×1080, or MP4/WebM | Backdrop library |
| World map | 1 | PNG/JPG | World map page, painted look applies on top |
| Music | 3 (one per pillar) | MP3/OGG loop | Soundboard |
| Layered sprites | per friend, optional | 512 px layers | `uploads/layered/<id>/` |

## 10. Accessibility

| # | Sev | Finding | Suggested fix |
| --- | --- | --- | --- |
| X1 | Low | Checked, no gap: every screen has ⚙ **Motion** (Follow device, Reduce, Full) and ⚙ **Text size**, and Reduce stops animations on the whole page. | Mention both settings to friends on the first night (one line on the join card, O4). |
| X2 | Low | 🆕 Emotions and HP lean on colour. The phone HP **Description** mode helps; emotion badges are colour plus icon already. | Check the TV party bar has a number or word next to every coloured bar. |

## 11. Performance

| # | Sev | Finding | Suggested fix |
| --- | --- | --- | --- |
| F1 | Low | Measured: 15 to 24 KB per state update for 6 phones, merged per tick. Fine on home Wi-Fi. | Nothing now. If the party ever passes 8 phones, send only changed top-level keys. |
| F2 | Low | The 3D battle map bundle is about 560 KB, loaded on every phone. | Nothing now; it is cached after the first load. |

## 12. Docs and release

| # | Sev | Finding | Suggested fix |
| --- | --- | --- | --- |
| R1 | Medium | 🆕 `package.json` is still 1.1.0 while the Changelog's Unreleased section holds weeks of features. A zip made for game night has no version to talk about. | Cut **1.2.0** in the Changelog before the next game night and rebuild the zip from that tag. |
| R2 | Medium | ✅ The README covers running and features, but not the game-night routine. | Added a **Game night routine** section: `npm run doctor`, `npm start`, TV on `/screen`, sound, QR, save point at the end. |
| R3 | Low | 🆕 The package is named `tavern-screen` and the repo `TTRPG-Session-Tool`. | Rename in `package.json` when convenient. |
| R4 | Low | `docs/termux.md` stays although Termux is off the table for now (Mike, Nov 13). | Leave it; see "Removals to ask about". |

## Removals to ask about (nothing removed)

Nothing was removed or replaced in this review. These are candidates only, for Mike to decide:

1. **`archive/public/js/dm/` modules** (session plans, intro card): kept on purpose so they can come back. Keep unless Mike wants a leaner repo.
2. **`docs/termux.md`**: Termux is off for now. Keep or delete.
3. **Old copies in the project files** (`dnd-party/`, `dnd-party-history.bundle`, `Mikey-DM-tool-655476b.zip`): the pre-GitHub source from Nov 12. GitHub has the full history now, so they can go; keep `Mikey-DM-tool.zip` (the current build).
4. **`public/voice.js` and `public/stt.js`**: both load on the DM page. `voice.js` was the original speech placeholder and `stt.js` the real speech engine. If `voice.js` only wraps `stt.js` now, it could merge into it. Needs a closer look before any change.

## What was built in this review

- `src/safety.js` and `server.js`: process safety net (S1) and a plain port-in-use message (S2).
- `tools/doctor.js` (`npm run doctor`): game-night check (O1).
- `tools/playtest-bots.js` (`npm run bots -- N`): playtest bots (Q2).
- `.github/workflows/ci.yml`: browser tests in CI (Q1).
- `public/awake.js`: TV and DM screen wake lock (T1).
- `tools/make-placeholders.js` and `public/samples/placeholders/`: placeholder art, wired into the test party and the backdrop library (A1).
- `README.md`: Game night routine section (R2).
- `test/studio.js`: 22 checks for all of the above, in `npm test`.

## Suggested order for the rest

1. Before the next game night: R1 (cut 1.2.0), O2 (DM quick reference), P1 (phone wake lock by default).
2. Next build: G1 (custom rules file) because Mike's own system depends on it.
3. Then PR X templates and condition icons (V1), S5 (back up everything), S3 (save migrations).
