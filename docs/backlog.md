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
- [x] 2. The World map opens from any mode, not only exploration.
- [x] 3. Places are dragged onto the map from a palette. Dragging a place onto a trash-can icon deletes it.
- [x] 4. "Map picture" and "Load example world" sit at the bottom of the World map window.
- [x] (Nov 15) Bug: the TV world map was cut off at the bottom. Fixed in PR #73.
- [x] (Nov 15) The current-location title on the world map was too big. Fixed in PR #73.

### PR B: TV combat entrance and join QR animation
`public/stage.js`, `public/screen.html`, `public/anim.js`, `public/moments.css`, `public/js/dm/combat.js`, `src/sockets/dm.js`
- [x] 5. When the DM picks Combat mode, the TV shows a preparation filter reading "Combat" with "Get Ready" under it, and the battle map stays hidden. The DM sets up the fight, then presses and holds Roll initiative for 3 seconds. While it is held, the filter shakes hard (it is still under reduce motion). On release after 3 s, the filter lifts and the TV shows the combat map. Builds on the press-and-hold Roll initiative from the combat screen thread (that thread's item 2): use one hold control for both. Since PR #72, `#initHold` fires a bubbling `inithold` CustomEvent with `detail.phase` set to `start`, `cancel` or `complete` (on complete, `dm:combat:start` has already been sent); forward those phases to the server to drive the TV filter.
- [x] 1. The "Join the party" QR card slides in and out on the TV.
- [x] (Nov 15, second list) Backdrop and effects are in front of the combat window: effects and weather now draw over the 3D combat map; the backdrop shows behind it.

### PR C: DM Rolls card
`public/js/dm/rolls.js`, `public/dm.html`, `public/style.css` (reuse the phone dice pool from `public/js/play/`)
- [x] 7. The DM Roll dice window has the same die buttons (D4 to D20) as the phones.
- [x] 9. Each Roll call drop-down gets its own row, so its text is not cut off in the DM tools column.

### PR D: DM tools column layout
`public/dm.html`, `public/style.css`, `public/chronicle.css`, `public/js/dm/dock.js`, `public/js/dm/modes.js`
- [x] 6. Battle map, Creature randomizer and Creatures cards start minimized.
- [x] 8. Buttons are centred in their card where it fits.
- [x] (Nov 15, second list) The Road cards tab moves into Miscellaneous (as a Misc part). Planning keeps Shops.
- [x] (Nov 15, second list) The DM's Party tab moves to a right-hand sidebar.
- Pairs with the combat screen thread's item 7 (all modes and tabs in one column). Build after that lands so the two layout passes do not conflict. The one-column rules are at the end of `public/theme.css`, under "Combat screen feedback (Nov 16)" (PR #72).

### PR E: Shop pop-up, "Greer's Trinkets"
`src/shops.js`, `src/sockets/player.js`, `src/sockets/dm.js`, `src/popups.js`, `src/visibility.js`, `public/stage.js`, `public/js/play/shops.js`, `public/js/dm/shops.js`
Today: the DM opens a shop pop-up on the TV (`dm:shop:pop`), phones buy and sell, and `player:shop:done` toggles each player's done flag.
- [x] Seed one shop, "Greer's Trinkets".
- [x] TV pop-up: a centred banner image of the merchant's store at the top, then items in a 3-column grid of buttons (up to 60, rows wrap automatically). Each button shows "Item Name", then "Item description", then the price, as placeholders for now.
- [x] Items keep a category and other data, but only the name, description and price reach phones and the TV.
- [x] Phones get the same shop as a pop-up. A player can leave and come back in as they like. After leaving, the phone shows "Waiting for the others" with a "Shop again" button under it.
- [x] When every seated player has left the shop, the pop-up closes on the TV and on all phones.
- [x] The DM's Shops cards start minimized.


## Mike's notes, 2026-11-16

### Social: "Join the conversation?" pop-up on phones
`src/sockets/player.js`, `src/cast.js`, `src/state.js`, `public/js/play/views/social.js`, `public/stage.js`, `public/style.css`
Today: phones in social mode can pick an expression (`player:expression`, `cast.setExpression`), push a pushed choice (`player:choice`) or type a line, which becomes `state.social.line` with `player: true`.
- [ ] When the DM loads a social encounter (enters Social mode), every seated phone gets a pop-up that just says "Join the Conversation?", with a green **Yes** button and a **No** button of the same size under it.
- [ ] **No** closes the pop-up for that phone (the phone keeps its normal Social view).
- [ ] **Yes** keeps the pop-up open and turns it into a speech box: a text box at the top for what the character says, then a directional pad under it for the character's emotion: the 8 `EMOTIONS` around a 3x3 pad, Send in the centre.
- [ ] Sending: the character's emotion changes on the TV only when the line is sent, together with the speech.
- [ ] Speech log line: `[Character name] looks to be [emotion]. He says / She says / They say "[text]"`. Needs a pronoun field on the character (none today): add it to the character profile, default "They".
- [ ] The pop-up closes for everyone when the DM leaves Social mode.

### Phone hero card (character header)
`public/chronicle.js` (`Chronicle.hero`), `public/js/play/game.js`, `public/settings.js`, `public/style.css`, `public/theme.css`
Today: the header shows 🏅 + the character's level, an HP bar with numbers, one resource bar (spell slots, else a pool, else hit dice), then ✎ Profile, ⛶ (full screen) and ☀ (keep the screen on) under it.
- [ ] The 🏅 box shows **Inspiration points**, not the level.
- [ ] HP display is a phone setting: **Number** (28/28, today) or **Description** from the share of HP left, e.g. Fine, Injured, Badly hurt, Near death, Down. Thresholds to set when built.
- [ ] Hit dice and spell slots show as gems, one per die or slot: coloured when available, black when used. No bars.
- [ ] The ✎ Profile, ⛶ Full screen and ☀ Keep screen on buttons move to the bottom of the phone page.

## Mike's backlog, 2026-11-16 (second list, grouped into PRs by the code they touch)

Items are as Mike wrote them, regrouped by code area. Notes in brackets say which screen a tab or setting is on, or which item an entry relates to.

### PR F: Combat on phones and the 3D battle map
`public/js/play/views/combat.js`, `public/js/play/combatmap.js`, `lib/iso-battle/src/client/` (`battle.js`, `scene.js`, `sprites.js`), `public/iso/`, `src/sockets/player.js`, `src/game.js`
- [ ] Player Phones get a Combat Pop Up. This appears at the top of their windows list. It's the same one as the 'Steel Yourselves" Pop up.
- [ ] Player Phones don't show the 3D combat window, they have to look at the TV Screen to see it.
- [ ] 3D Iso window does not display health or health bar. Only DM can see that.
- [ ] (Keep) Cool that the TV Screen automatically moves to the recent action.

### PR G: DM combat controls (movement, selection, tools)
`lib/iso-battle/src/client/battle.js`, `lib/iso-battle/src/client/scene.js`, `public/js/dm/combat.js`, `public/js/dm/map.js`, `src/iso.js`, `src/grid.js`, `src/sockets/dm.js`, `public/dm.html`
- [ ] Fix how enemies can move anywhere without using movement. DM's can move the creatures beyond the limit, past -5 movement ft or more. If they do, the movement count turns red.
- [ ] DM can move creatures with keyboard arrow keys.
- [ ] DM can right click enemies in the combat window and that will open up an options menu. LLM chooses what those options are.
- [ ] DM's Combat DM Tools has sections. one for Unit actions and one for landscaping (raise/lower/paint/obstacle, etc.)
- [ ] When DM clicks on a unit on the map, the right side bar changes dynamically so the DM can see the selection stats. [DM Screen right-hand sidebar]
- [ ] When DM ends combat, clear the combat window so that the DM can do another combat another time.

### PR H: DM Screen tabs and layout
`public/dm.html`, `public/style.css`, `public/theme.css`, `public/js/dm/fold.js`, `public/js/dm/dock.js`, `public/js/dm/modes.js`, `public/js/dm/header.js`, `public/js/dm/legends.js`, `public/js/dm/moments.js`
- [ ] DM Screen Modes can be minimizable.
- [ ] Minimize Creature randomizer and creatures tab by default. [DM Screen, Combat; overlaps 15 Nov PR D item 6]
- [ ] Move creature randomizer tab to bottom. [DM Screen, Combat]
- [ ] Minimize all tabs by default for now. [DM Screen]
- [ ] Remove House Rules Section. [DM Screen, Misc > Legends card; the phone Misc > Legends also lists house rules]
- [ ] Choice Echo tab is more for planning, that should be in the planning mode. [DM Screen, today under Scene > Moments]
- [ ] Move Changing Rules option to miscellaneous tab. [DM Screen, today the rules system picker in the header]
- [ ] Settings Option to show/hide logs is also in the logs tab. [Logs tab on the DM Screen and phone Misc > Logs; today only in Settings]

### PR I: TV moments and roll display
`public/stage.js`, `public/rollpop.js`, `public/moments.js`, `public/moments.css`, `public/anim.js`, `public/screen.html`, `src/moments.js`, `src/rolls.js`
- [ ] Hide TV screen, scene exploration points of interest by default.
- [ ] Player rolls are at the center of the screen, not at the bottom. If fades away as well, doesn't just disappear. If it's a Nat 20, a positive animation plays and the screen gets brighter during. If it's a Nat 1, a negative animation plays and the TVscreen animation gets a little darker during.
- [ ] Switching modes center message should not overlap with each other. It will skip the previous animation.
- [ ] TV moments, Chapter card should fade as well. It should also be saved in the logs somehow.
- [ ] Clock Segments should be segmented from the center, not vertical bars. [Scene > Clocks, TV and DM]

### PR J: Social mode flow
`public/js/dm/social.js`, `public/js/dm/hold.js`, `public/js/play/views/social.js`, `public/js/play/socialpop.js`, `src/cast.js`, `src/state.js`, `src/sockets/dm.js`, `public/stage.js`, `public/dm.html`
- [ ] When DM enters social mode, it presents the DM with an NPC List. For now, use placeholders NPC Albert, Brent, and Christina. DM must select the NPC's to add to the social conversation, then Click/Hold the 'start conversation' button for 1 second to start the conversation.
- [ ] DM gets a button option underneath the window to end the conversation. TV Screen gets a 'conversation has concluded message at the center. It holds for 1 second before moving everyone and the DM back to Exploration Mode.
- [ ] When in Social Mode, the DM gets all of the social interaction options in a window above the narration window.
- [ ] In Social Mode, the DM can still narrate. There is a narration window at the top left of the social window. This during-social narration window is only 3 event lines long.
- [ ] Social Window does not show up on Player Screen during social event. They have to look at the TV Screen. [Check against the "Join the conversation?" phone pop-up in the section above]

### PR K: DM Messages, votes and Roll call pop-ups on phones
`public/js/dm/rolls.js`, `public/js/play/messages.js`, `public/js/play/rolls.js`, `src/messages.js`, `src/popups.js`, `src/rolls.js`, `src/sockets/player.js`, `public/dm.html`
- [ ] DM Messages Tab doesn't send messages to player inbox, It's a pop up window that stays up until the player presses the 'continue' button at the bottom of the pop up. [DM Screen, Messages tab]
- [ ] In DM Messages Tab, Party Voting is in it's own Window. When starting a vote, it sends a pop up window. [DM Screen, Messages tab]
- [ ] In DM Roll Call, Rolly Type Changes the bottom text window depending on the roll type selection. Roll Call is also a Phone pop up. [DM Screen, Rolls tab]

### PR L: World map
`public/js/dm/worldmap.js`, `public/worldmap.js`, `public/worldmap.css`, `src/worldmap.js`
- [ ] In World Map, when Road creation is selected, click/hold on location 1, and drag/release to location 2 to create the road. [DM Screen, World map window]
- [ ] World Map window looks more like a paper map with light watercolor art. There is a compass rose at the bottom right of the map.

### PR M: Camp, rests and inspiration
`public/js/dm/camp.js`, `public/js/play/camp.js`, `src/camp.js`, `src/rests.js`, `public/js/dm/hold.js`, `public/dm.html`
- [ ] On Camp pop up, players must click/hold their short/long rest selection for 1 second to vote. [Phone camp pop-up]
- [ ] Remove rests tab. This is automated in camp window. [DM Screen, Misc > Camp "Rests" card]
- [ ] Camp window also has a class section. That section changes depending on their class.
- [ ] Add an Inspiration Tab. [DM Screen; pairs with the phone hero card Inspiration points above]

### PR N: Shops and items
`src/shops.js`, `public/js/dm/shops.js`, `public/js/play/shops.js`, `public/js/play/inventory.js`, `public/stage.js`, `src/sockets/dm.js`, `src/sockets/player.js`, `public/dm.html`
- [ ] In NPC's Tab, shop pop up shouldn't be there. Have a separate tab for shops. [DM Screen, Misc > NPCs]
- [ ] On player phone, remove item description from item button. Players must press/hold the item button to get another pop up. This pop up will show the item description. Player can buy the item from the description window.
- [ ] Merchant Image only shows underneath the shop title on the TV Screen. It does not show on the player phone screen.
- [ ] On player phone screen, Gold is just a symbol and number. Players can't add items, the DM does that.
- [ ] Add an Items Tab for the DM. [DM Screen]
- [ ] DM can pop up shops right from planning mode. [DM Screen, Planning mode]

## Mike's notes, 2026-11-16 (third list, grouped into PRs by the code they touch)

Items are as Mike wrote them. Bracketed notes say which screen a tab or setting is on, or where an item overlaps an earlier list.

### PR O: Creature actions on the combat map
`lib/iso-battle/src/client/battle.js`, `lib/iso-battle/src/client/styles.js`, `public/js/dm/combat.js`, `public/theme.css`
- [x] Creature Actions are usually just an icon button with text underneath it. The action, math equations, details appear when I have mouse over it. [DM Screen, Combat]

### PR P: Dramatic pause and mode switching
`public/moments.js`, `public/moments.css`, `public/stage.js`, `public/js/dm/modes.js`, `src/moments.js`
- [x] Remove Dramatic pause effect 'hold' text. When the Dramatic pause fade to partial back happens, the text fades in half a second after. [TV]
- [x] Fix issue where entering modes spams the logs. [DM Screen, Logs; TV and phones]

### PR Q: Exploration points of interest and world map travel
`src/worldmap.js`, `src/sockets/worldmap.js`, `src/visibility.js`, `public/js/dm/worldmap.js`, `public/js/dm/exploration.js`, `public/worldmap.js`
- [ ] Blank Points of interest still appear in exploration. Have no points of interest initially by default. DM will add them in when they can. [DM Screen, Exploration; TV]
- [ ] Default map travel leg duration is 5 seconds. [DM Screen, World map]
- [ ] Show world map to TV Screen no matter the current mode. [TV; overlaps the 15 Nov PR A and 16 Nov PR L world map items]

### PR R: Dungeon entry, exit and editing
`src/dungeon.js`, `src/sockets/dungeon.js`, `public/dungeon.js`, `public/dungeon.css`, `public/js/dm/dungeon.js`, `public/js/play/`
- [ ] When the Party goes to a dungeon location, they get a phone tab. TV screen gets a pop up too, showing the dungeon image and a count of ready party members. The player phones get a window that shows the dungeon name, the description, and a button that says 'Enter Dungeon'. When all players have held-pressed enter dungeon for 1 second (counter on the TV), Then enter the dungeon.
- [ ] When all players are at the end of the dungeon, they get an 'exit dungeon' pop up. They just have to press the exit dungeon button which sends them back to the TV Screen world map.
- [ ] When Party is in a dungeon, A dungeon editing tab appears underneath world map. [DM Screen, World map window]
- [ ] DM can edit the nodes right from the dungeon window. Can click/drag/etc. nodes and right click nodes for menu. [DM Screen, dungeon window]
- [ ] Party Dungeon Location node is centered on TV Screen. [TV]

### PR S: DM Screen mode buttons and sidebar
`public/dm.html`, `public/style.css`, `public/js/dm/modes.js`, `public/js/dm/dock.js`
- [ ] DM Screen Mode Buttons get darker to show DM is currently on them, not just the text turning gold. [DM Screen, mode bar]
- [ ] Party Tab is on the Right sidebar. [DM Screen; overlaps the 15 Nov PR D item and the 16 Nov PR H layout items]

## Mike's notes, 2026-11-16 (fourth list)

Item is as Mike wrote it. Bracketed notes say which screen it is on.

### PR T: End session
`public/dm.html`, `public/style.css`, `public/stage.js`, `public/js/play/`, `src/sockets/dm.js`, `src/sockets/player.js`
- [ ] Red End Session button at the bottom of the left sidebar. I click-hold this for 1 second to end the session. It displays on the TV Screen a big message: End of Session. On the player phones it shows "Thanks for playing." For DM, it asks to save and explore the logs. [DM Screen, left sidebar]

## Mike's notes, 2026-11-16 (fifth list)

Item is as Mike wrote it. Bracketed notes say which screen it is on.

### PR U: Lore tab
`public/dm.html`, `public/style.css`, `public/js/dm/`, `public/js/play/`, `src/state.js`, `src/sockets/dm.js`
- [ ] Add a Lore Tab. Lore Tab tracks: Locations, Dungeons, NPCs, Items, Books and Notes. [DM Screen; phone tab placement not stated]
