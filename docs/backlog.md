# Backlog

- **3D dice roll on the TV (optional):** show a 3D dice animation on the TV screen only, not on phones. Keep it off by default; the existing 2D roll stays as the fallback.
- **TV version label and project stats pop-up:** added in this change. Stats are in `public/devstats.json`.
- **Event log flashes on every update:** `stage.js` re-renders the whole log, so each `.log li` replays its `slidein` animation. Fix: animate only new entries (track the last rendered id), or keep existing DOM nodes.
- **Hide or minimize the action log (DM, phone, TV):** not built. Only text size, colors and motion exist in Display settings. Add a show/hide toggle per screen, saved on the device, and a TV setting from the DM.

## TV plan
- 3D dice roll on the TV screen (optional, above).
- Version label and stats pop-up: done in PR #35.
- Action log: animate new entries only (done in this PR); per-screen hide setting (done in this PR).

## Mike's notes, 2026-11-15 (grouped into PRs by the code they touch)

Numbers are Mike's. Item 9 was cut off in his message after "from the DM's"; read as the DM tools column.

### PR A: World map window
`public/js/dm/worldmap.js`, `public/worldmap.js`, `public/worldmap.css`, `public/js/dm/modes.js`, `src/sockets/worldmap.js`
- [ ] 2. The World map opens from any mode, not only exploration.
- [ ] 3. Places are dragged onto the map from a palette. Dragging a place onto a trash-can icon deletes it.
- [ ] 4. "Map picture" and "Load example world" sit at the bottom of the World map window.

### PR B: TV combat entrance and join QR animation
`public/stage.js`, `public/screen.html`, `public/anim.js`, `public/moments.css`, `public/js/dm/combat.js`, `src/sockets/dm.js`
- [ ] 5. When the DM picks Combat mode, the TV shows a preparation filter reading "Combat" with "Get Ready" under it, and the battle map stays hidden. The DM sets up the fight, then presses and holds Roll initiative for 3 seconds. While it is held, the filter shakes hard (it is still under reduce motion). On release after 3 s, the filter lifts and the TV shows the combat map. Builds on the press-and-hold Roll initiative from the combat screen thread (that thread's item 2): use one hold control for both. Since PR #72, `#initHold` fires a bubbling `inithold` CustomEvent with `detail.phase` set to `start`, `cancel` or `complete` (on complete, `dm:combat:start` has already been sent); forward those phases to the server to drive the TV filter.
- [ ] 1. The "Join the party" QR card slides in and out on the TV.
- [ ] (Nov 15, second list) Bug: the backdrop and its effects draw in front of the combat window. Put the battle map (`.iso-layer`) above the backdrop and effect layers on the TV and in the DM preview.

### PR C: DM Rolls card
`public/js/dm/rolls.js`, `public/dm.html`, `public/style.css` (reuse the phone dice pool from `public/js/play/`)
- [ ] 7. The DM Roll dice window has the same die buttons (D4 to D20) as the phones.
- [ ] 9. Each Roll call drop-down gets its own row, so its text is not cut off in the DM tools column.

### PR D: DM tools column layout
`public/dm.html`, `public/style.css`, `public/chronicle.css`, `public/js/dm/dock.js`, `public/js/dm/modes.js`
- [ ] 6. Battle map, Creature randomizer and Creatures cards start minimized.
- [ ] 8. Buttons are centred in their card where it fits.
- [ ] (Nov 15, second list) The Road cards tab moves into Miscellaneous (as a Misc part). Planning keeps Shops.
- [ ] (Nov 15, second list) The DM's Party tab moves to a right-hand sidebar.
- Pairs with the combat screen thread's item 7 (all modes and tabs in one column). Build after that lands so the two layout passes do not conflict. The one-column rules are at the end of `public/theme.css`, under "Combat screen feedback (Nov 16)" (PR #72).

### PR E: Shop pop-up, "Greer's Trinkets"
`src/shops.js`, `src/sockets/player.js`, `src/sockets/dm.js`, `src/popups.js`, `src/visibility.js`, `public/stage.js`, `public/js/play/shops.js`, `public/js/dm/shops.js`
Today: the DM opens a shop pop-up on the TV (`dm:shop:pop`), phones buy and sell, and `player:shop:done` toggles each player's done flag.
- [ ] Seed one shop, "Greer's Trinkets".
- [ ] TV pop-up: a centred banner image of the merchant's store at the top, then items in a 3-column grid of buttons (up to 60, rows wrap automatically). Each button shows "Item Name", then "Item description", then the price, as placeholders for now.
- [ ] Items keep a category and other data, but only the name, description and price reach phones and the TV.
- [ ] Phones get the same shop as a pop-up. A player can leave and come back in as they like. After leaving, the phone shows "Waiting for the others" with a "Shop again" button under it.
- [ ] When every seated player has left the shop, the pop-up closes on the TV and on all phones.
- [ ] The DM's Shops cards start minimized.

