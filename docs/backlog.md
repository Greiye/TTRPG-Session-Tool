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
- [x] When the DM loads a social encounter (enters Social mode), every seated phone gets a pop-up that just says "Join the Conversation?", with a green **Yes** button and a **No** button of the same size under it.
- [x] **No** closes the pop-up for that phone (the phone keeps its normal Social view).
- [x] **Yes** keeps the pop-up open and turns it into a speech box: a text box at the top for what the character says, then a directional pad under it for the character's emotion: the 8 `EMOTIONS` around a 3x3 pad, Send in the centre.
- [x] Sending: the character's emotion changes on the TV only when the line is sent, together with the speech.
- [x] Speech log line: `[Character name] looks to be [emotion]. He says / She says / They say "[text]"`. Needs a pronoun field on the character (none today): add it to the character profile, default "They".
- [x] The pop-up closes for everyone when the DM leaves Social mode.

### Phone hero card (character header)
`public/chronicle.js` (`Chronicle.hero`), `public/js/play/game.js`, `public/settings.js`, `public/style.css`, `public/theme.css`
Today: the header shows 🏅 + the character's level, an HP bar with numbers, one resource bar (spell slots, else a pool, else hit dice), then ✎ Profile, ⛶ (full screen) and ☀ (keep the screen on) under it.
- [x] The 🏅 box shows **Inspiration points**, not the level.
- [x] HP display is a phone setting: **Number** (28/28, today) or **Description** from the share of HP left, e.g. Fine, Injured, Badly hurt, Near death, Down. Thresholds to set when built.
- [x] Hit dice and spell slots show as gems, one per die or slot: coloured when available, black when used. No bars.
- [x] The ✎ Profile, ⛶ Full screen and ☀ Keep screen on buttons move to the bottom of the phone page.

## Mike's backlog, 2026-11-16 (second list, grouped into PRs by the code they touch)

Items are as Mike wrote them, regrouped by code area. Notes in brackets say which screen a tab or setting is on, or which item an entry relates to.

### PR F: Combat on phones and the 3D battle map
`public/js/play/views/combat.js`, `public/js/play/combatmap.js`, `lib/iso-battle/src/client/` (`battle.js`, `scene.js`, `sprites.js`), `public/iso/`, `src/sockets/player.js`, `src/game.js`
- [x] Player Phones get a Combat Pop Up. This appears at the top of their windows list. It's the same one as the 'Steel Yourselves" Pop up.
- [x] Player Phones don't show the 3D combat window, they have to look at the TV Screen to see it.
- [x] 3D Iso window does not display health or health bar. Only DM can see that.
- [ ] (Keep) Cool that the TV Screen automatically moves to the recent action.

### PR G: DM combat controls (movement, selection, tools)
`lib/iso-battle/src/client/battle.js`, `lib/iso-battle/src/client/scene.js`, `public/js/dm/combat.js`, `public/js/dm/map.js`, `src/iso.js`, `src/grid.js`, `src/sockets/dm.js`, `public/dm.html`
- [x] Fix how enemies can move anywhere without using movement. DM's can move the creatures beyond the limit, past -5 movement ft or more. If they do, the movement count turns red.
- [x] DM can move creatures with keyboard arrow keys.
- [x] DM can right click enemies in the combat window and that will open up an options menu. LLM chooses what those options are.
- [x] DM's Combat DM Tools has sections. one for Unit actions and one for landscaping (raise/lower/paint/obstacle, etc.)
- [x] When DM clicks on a unit on the map, the right side bar changes dynamically so the DM can see the selection stats. [DM Screen right-hand sidebar]
- [x] When DM ends combat, clear the combat window so that the DM can do another combat another time.

### PR H: DM Screen tabs and layout
`public/dm.html`, `public/style.css`, `public/theme.css`, `public/js/dm/fold.js`, `public/js/dm/dock.js`, `public/js/dm/modes.js`, `public/js/dm/header.js`, `public/js/dm/legends.js`, `public/js/dm/moments.js`
- [x] DM Screen Modes can be minimizable.
- [x] Minimize Creature randomizer and creatures tab by default. [DM Screen, Combat; overlaps 15 Nov PR D item 6]
- [x] Move creature randomizer tab to bottom. [DM Screen, Combat]
- [x] Minimize all tabs by default for now. [DM Screen]
- [x] Remove House Rules Section. [DM Screen, Misc > Legends card; the phone Misc > Legends also lists house rules]
- [x] Choice Echo tab is more for planning, that should be in the planning mode. [DM Screen, today under Scene > Moments]
- [x] Move Changing Rules option to miscellaneous tab. [DM Screen, today the rules system picker in the header]
- [x] Settings Option to show/hide logs is also in the logs tab. [Logs tab on the DM Screen and phone Misc > Logs; today only in Settings]

### PR I: TV moments and roll display
`public/stage.js`, `public/rollpop.js`, `public/moments.js`, `public/moments.css`, `public/anim.js`, `public/screen.html`, `src/moments.js`, `src/rolls.js`
- [ ] Hide TV screen, scene exploration points of interest by default.
- [ ] Player rolls are at the center of the screen, not at the bottom. If fades away as well, doesn't just disappear. If it's a Nat 20, a positive animation plays and the screen gets brighter during. If it's a Nat 1, a negative animation plays and the TVscreen animation gets a little darker during.
- [ ] Switching modes center message should not overlap with each other. It will skip the previous animation.
- [ ] TV moments, Chapter card should fade as well. It should also be saved in the logs somehow.
- [ ] Clock Segments should be segmented from the center, not vertical bars. [Scene > Clocks, TV and DM]

### PR J: Social mode flow
`public/js/dm/social.js`, `public/js/dm/hold.js`, `public/js/play/views/social.js`, `public/js/play/socialpop.js`, `src/cast.js`, `src/state.js`, `src/sockets/dm.js`, `public/stage.js`, `public/dm.html`
- [x] When DM enters social mode, it presents the DM with an NPC List. For now, use placeholders NPC Albert, Brent, and Christina. DM must select the NPC's to add to the social conversation, then Click/Hold the 'start conversation' button for 1 second to start the conversation.
- [x] DM gets a button option underneath the window to end the conversation. TV Screen gets a 'conversation has concluded message at the center. It holds for 1 second before moving everyone and the DM back to Exploration Mode.
- [x] When in Social Mode, the DM gets all of the social interaction options in a window above the narration window.
- [x] In Social Mode, the DM can still narrate. There is a narration window at the top left of the social window. This during-social narration window is only 3 event lines long.
- [x] Social Window does not show up on Player Screen during social event. They have to look at the TV Screen. [Check against the "Join the conversation?" phone pop-up in the section above]

### PR K: DM Messages, votes and Roll call pop-ups on phones
`public/js/dm/rolls.js`, `public/js/play/messages.js`, `public/js/play/rolls.js`, `src/messages.js`, `src/popups.js`, `src/rolls.js`, `src/sockets/player.js`, `public/dm.html`
- [ ] DM Messages Tab doesn't send messages to player inbox, It's a pop up window that stays up until the player presses the 'continue' button at the bottom of the pop up. [DM Screen, Messages tab]
- [ ] In DM Messages Tab, Party Voting is in it's own Window. When starting a vote, it sends a pop up window. [DM Screen, Messages tab]
- [ ] In DM Roll Call, Rolly Type Changes the bottom text window depending on the roll type selection. Roll Call is also a Phone pop up. [DM Screen, Rolls tab]

### PR L: World map
`public/js/dm/worldmap.js`, `public/worldmap.js`, `public/worldmap.css`, `src/worldmap.js`
- [x] In World Map, when Road creation is selected, click/hold on location 1, and drag/release to location 2 to create the road. [DM Screen, World map window]
- [x] World Map window looks more like a paper map with light watercolor art. There is a compass rose at the bottom right of the map.

### PR M: Camp, rests and inspiration
`public/js/dm/camp.js`, `public/js/play/camp.js`, `src/camp.js`, `src/rests.js`, `public/js/dm/hold.js`, `public/dm.html`
- [x] On Camp pop up, players must click/hold their short/long rest selection for 1 second to vote. [Phone camp pop-up]
- [x] Remove rests tab. This is automated in camp window. [DM Screen, Misc > Camp "Rests" card]
- [x] Camp window also has a class section. That section changes depending on their class.
- [x] Add an Inspiration Tab. [DM Screen; pairs with the phone hero card Inspiration points above]

### PR N: Shops and items
`src/shops.js`, `public/js/dm/shops.js`, `public/js/play/shops.js`, `public/js/play/inventory.js`, `public/stage.js`, `src/sockets/dm.js`, `src/sockets/player.js`, `public/dm.html`
- [x] In NPC's Tab, shop pop up shouldn't be there. Have a separate tab for shops. [DM Screen, Misc > NPCs]
- [x] On player phone, remove item description from item button. Players must press/hold the item button to get another pop up. This pop up will show the item description. Player can buy the item from the description window.
- [x] Merchant Image only shows underneath the shop title on the TV Screen. It does not show on the player phone screen.
- [x] On player phone screen, Gold is just a symbol and number. Players can't add items, the DM does that.
- [x] Add an Items Tab for the DM. [DM Screen]
- [x] DM can pop up shops right from planning mode. [DM Screen, Planning mode]

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
- [x] Blank Points of interest still appear in exploration. Have no points of interest initially by default. DM will add them in when they can. [DM Screen, Exploration; TV]
- [x] Default map travel leg duration is 5 seconds. [DM Screen, World map]
- [x] Show world map to TV Screen no matter the current mode. [TV; overlaps the 15 Nov PR A and 16 Nov PR L world map items]

### PR R: Dungeon entry, exit and editing
`src/dungeon.js`, `src/sockets/dungeon.js`, `public/dungeon.js`, `public/dungeon.css`, `public/js/dm/dungeon.js`, `public/js/play/`
- [x] When the Party goes to a dungeon location, they get a phone tab. TV screen gets a pop up too, showing the dungeon image and a count of ready party members. The player phones get a window that shows the dungeon name, the description, and a button that says 'Enter Dungeon'. When all players have held-pressed enter dungeon for 1 second (counter on the TV), Then enter the dungeon.
- [x] When all players are at the end of the dungeon, they get an 'exit dungeon' pop up. They just have to press the exit dungeon button which sends them back to the TV Screen world map.
- [x] When Party is in a dungeon, A dungeon editing tab appears underneath world map. [DM Screen, World map window]
- [x] DM can edit the nodes right from the dungeon window. Can click/drag/etc. nodes and right click nodes for menu. [DM Screen, dungeon window]
- [x] Party Dungeon Location node is centered on TV Screen. [TV]

### PR S: DM Screen mode buttons and sidebar
`public/dm.html`, `public/style.css`, `public/js/dm/modes.js`, `public/js/dm/dock.js`
- [x] DM Screen Mode Buttons get darker to show DM is currently on them, not just the text turning gold. [DM Screen, mode bar]
- [x] Party Tab is on the Right sidebar. [DM Screen; overlaps the 15 Nov PR D item and the 16 Nov PR H layout items]

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

## Mike's notes, 2026-11-16 (sixth list)

Items are as Mike wrote them. Bracketed notes say which screen it is on and what already exists.

### PR V: Time clock, town map and town visits
`src/worldmap.js`, `src/sockets/worldmap.js`, `src/tracker.js`, `src/dungeon.js`, `src/visibility.js`, `public/worldmap.js`, `public/js/dm/worldmap.js`, `public/js/play/`, `public/stage.js`
- [x] Segmented time clock: make going to places take up time segments. [World map, town map; the DM's segment clocks in `src/tracker.js` are a separate countdown]
- [x] Traveling roads takes up 1 clock segment per leg. [World map; roads already have a length in legs]
- [x] Time of day clock animation slides from the upper left side of TV screen. then advances forward when triggered, plays sound, lingers for 3 seconds, then animation slides back to upper left side of TV screen. [TV; triggered when the clock advances, e.g. a road leg or a confirmed town action]
- [x] Mousing over world map town nodes will generate a list of what the town has. [DM Screen and TV world map]
- [x] Visiting Towns: I want a similar dungeon entrance system to happen with the players visiting towns. It also has world map elements. [Reuse the PR R dungeon gate and the world map nodes, fog and drag]
  - [x] Like in the world map, players start at the settlement entrance node. They have to discover nodes that are hidden. Nodes will give player phone screen a window to interact with whatever is on the node. [Phones, TV]
  - [x] When in a town, players get to decide which discovered node they can go to. Once every player has made a decision and press-held the town action button on their phone town window, they interact with the node. [Phones; TV ready count as with the dungeon gate]
  - [x] Going to nodes use up time clock segments, which will advance once all players confirm their town action. [Phones, TV clock]
  - [x] For now, I want the starting town to have these hidden nodes: Settlement entrance, Farm, Marketplace, Smithy, Wizards Tower. [Starting town, Millbrook in the example map]
  - [x] Like with world map, DM can add village nodes by clicking and dragging them on the map. [DM Screen, town map]

## Mike's notes, 2026-11-16 (seventh list)

Item is as Mike wrote it. Bracketed notes say which screen it is on and what already exists.

### PR W: Creature Designer and wiki
`public/dm.html`, `public/style.css`, `public/js/dm/`, `src/entities.js`, `src/routes.js`, `src/sockets/dm.js`
- [x] (built Nov 16: Planning › 🐉 Creatures, `src/designer.js`, `src/wiki.js`, pages in the lore repo's `content/creatures/`, format in `docs/creature-wiki-format.md`) In Planning, Add Creature Designer button. This is a DM only pop up that lets me create sentient races, animals, etc. it lets me decide a sentient person's stats, skills, lore, race, abilities, inventory, etc. whatever the LLM deems necessary. this is all connected to a wiki system that edits .md files from a github repo. [DM Screen, Planning Mode tab group next to Shops; the creature library in `public/js/dm/creatures.js` and the Lore tab in `public/js/dm/lore.js` already exist; which GitHub repo holds the wiki is not stated, possibly the Arthuria lore repo]

## Mike's notes, 2026-11-16 (eighth list)

Mike is building his own game system, a fusion of Daggerheart, 5e and homebrew, so these items stay system-agnostic: no 5e-only rules baked in. Bracketed notes say which screen it is on and what already exists.

### PR X: Battle map vision, spell areas, conditions and scene audio
`src/vision.js`, `src/iso.js`, `src/tracker.js`, `src/timers.js`, `src/sockets/dm.js`, `public/js/iso3d.js`, `lib/iso-battle/`, `public/js/dm/combat.js`, `public/stage.js`, `public/audio.js`, `public/soundboard.js`, `public/atmo.js`
- [ ] Fog of war with line of sight: each token reveals only what it can see, and the TV shows the party's combined view. [Battle map, TV; `src/vision.js` already does light radius and wall/height ray checks, this extends it to per-token sight and makes the TV follow the party's view]
- [ ] Spell area templates: cones, lines, circles and cubes that snap to the grid and highlight every token inside. [Battle map, DM Screen, phones, TV; sizes are free numbers so any system's spells fit]
- [ ] Token status icons: conditions show as icons on tokens, tracked automatically, with a duration countdown. [Battle map, TV, phones; conditions in `src/tracker.js` and round countdowns in `src/timers.js` already exist, condition names should be editable per system]
- [x] Ambient audio and music per scene (built Nov 17: 🎬 on a Soundscape favourite links it to a scene; moving to that scene starts it, with a one-tap undo): each scene has looping tracks and sound cues that start with it. [TV audio; `public/audio.js` and the soundboard already crossfade music and blend ambience loops, this ties them to a scene. Nov 16: the Soundscape (`src/soundscape.js`, Scene › Soundscape) now builds a scene's sound as mood + environment + layers and saves it as a favourite; tying a favourite to a scene so it starts with it is what is left]

## Mike's notes, 2026-11-16 (ninth list)

System-agnostic like the eighth list: Mike's own system fuses Daggerheart, 5e and homebrew. Bracketed notes say which screen it is on and what already exists.

### PR Y: Light sources, rest resets, DM undo, autosave, loot, encounters and character creator
`src/vision.js`, `src/iso.js`, `src/rests.js`, `src/camp.js`, `src/rules/`, `src/living.js`, `src/store.js`, `src/saves.js`, `src/state.js`, `src/dungeon.js`, `src/worldmap.js`, `src/roster.js`, `src/session.js`, `src/sockets/dm.js`, `src/sockets/player.js`, `public/js/dm/`, `public/js/play/join.js`, `public/js/iso3d.js`
- [ ] Light sources and vision radius: torches and spells light areas, and each token sees only in its own range. [Battle map, TV; `src/vision.js` already has per-token light (`LIGHTS`: none, torch, lantern, darkvision) set from the DM with `dm:token:light`, with wall and height ray checks. This adds lights placed on the map or carried by items and spells, editable radius values instead of the fixed list, and dim versus bright light. Pairs with PR X's per-token line of sight]
- [ ] Rest resets: short and long rests restore the right resources automatically, with a DM override. [Camp, DM Screen, phones; `src/rests.js` already resets class feature uses and hit dice, and `src/camp.js` applies the voted rest with the DM's short/long/none override. Today the rules are 5e class tables; this moves them to per-system rest rules (`src/rules/`) so any resource, such as Daggerheart Hope or stress or homebrew pools, can say which rest refills it]
- [x] Undo for DM actions (built Nov 16: ↶ Undo / ↷ Redo in the DM top bar and Ctrl+Z, last 15 steps, `src/undo.js`): one-tap undo for the last few automated changes, so the DM can override any result. [DM Screen; `src/living.js` already records each living-world change with an undo (`dm:living:undo`). This extends that history to HP, conditions, rolls, rests, travel and clocks, with an undo button for the last few changes]
- [ ] Autosave snapshots: save the session every few minutes, so a crashed laptop loses little. [DM Screen, Saves; `src/store.js` already writes `data/campaign.json` after every change, and `src/saves.js` keeps named save points plus a rolling backup at each start. This adds timed rolling snapshots (for example every 5 minutes, last few kept) listed in Saves so the DM can roll back to one after a crash or a bad write]
- [ ] Loot generator with DM approval: roll loot from a table, and the DM approves or edits it before players see it. [DM Screen, then phones and TV; the weighted oracle tables in `src/living.js` (roll, then accept or override) and the item library and shops in `public/js/dm/items.js` and `public/js/dm/shops.js` already exist. Dungeon treasure nodes in `src/dungeon.js` are the first place to hook it. Loot tables are plain lists, so any system's items fit]
- [ ] Random encounter table per scene: roll an encounter when the party travels or rests, and the DM accepts or rerolls it. [DM Screen; travel legs in `src/worldmap.js`, camp in `src/camp.js`, the creature library and seeded randomizer (`src/creatures.js`, `src/randomizer.js`) and `encounterFactor` in `src/living.js` (more often at dusk and night, less in storms) already exist. This adds a table per scene or map node and a pending roll the DM accepts, rerolls or dismisses before anyone sees it]
- [ ] Character creator: a very basic one with heavy DM override. Players pick a name, portrait, ancestry, class or role and a few stats on the phone, and the DM can edit, approve or replace any field before the character joins the table. [Phones at join, DM Screen; the phone join flow already has a new character form (`public/js/play/join.js`, `src/session.js`), and the DM edit dialog in `public/js/dm/characters.js` already edits every field. This adds a short guided creator with system-agnostic fields (stats, ancestries and classes come from the active rules or a homebrew list), a pending state the DM approves, and DM lock on any field so players cannot change it later]

## Mike's notes, 2026-11-16 (Party sidebar follow-up)

Built in the DM tabs thread right after PR H and S.

### PR S2: Party sidebar conditions and hero
`public/dm.html`, `public/js/dm/conds.js`, `public/js/dm/chronicle.js`, `public/js/dm/menus.js`, `public/js/dm/tracker.js`, `public/theme.css`
- [x] Remove reset session button. [DM Screen, Party card in the right sidebar]
- [x] Conditions appear as a clickable small button on the bottom right of an NPC's portrait. I can edit this with a right click menu. [DM Screen, hero portrait in the right sidebar, for party members and creatures picked on the 3D map]
- [x] No need to have a conditions window. [DM Screen, right sidebar]
- [x] Character sidebar shows bio first by default, not stats. [DM Screen, hero in the right sidebar]
- [ ] Character creator: a very basic one with heavy DM override, and no classes (Mike's game has none). Steps, in Mike's order:
  1. Basics on the phone: name, ancestry and background only. No class or role field.
  2. Card questions: a series of questions where the player picks an animated card as the answer. For now, one question with five cards:
     "A dragon appears to slay you and your beloved. What card do you take?"
     1. The Knight Card (Melee Profession)
     2. The Arrow Card (Range Profession)
     3. The Shadow Card (Rogue Type)
     4. The Lightning Card (Wizard)
     5. The Automaton Card (Engineer)
  3. Stats: from a DM preset array or a point budget.
  4. Starting kit: a pick of DM-defined kits, based on the profession chosen from the cards.
  5. DM approval: the finished draft goes to the DM, who approves it before the character joins the table.
  6. Heavy DM override and field locks: the DM can edit anything at any time, and players can't change fields after approval.
  7. DM-made characters: the DM can create a whole character and hand it to a phone.
  [Phones at join, DM Screen; the phone join flow already has a new character form (`public/js/play/join.js`, `src/session.js`), and the DM edit dialog in `public/js/dm/characters.js` already edits every field. Questions, cards, professions, ancestries, backgrounds, stat arrays and kits are DM-editable lists, not hard-coded, so the creator stays system-agnostic. Each card answer sets the character's profession, which the kit step reads]

## Mike's notes, 2026-11-16 (drawing pad)

### PR Z: Pressure-sensitive drawing pad
`public/js/drawpad.js` (new), `public/js/dm/`, `public/js/play/`, `public/js/play/journal.js`, `src/assets.js`, `src/routes.js`, `src/journal.js`, `src/sockets/journal.js`
- [ ] Drawing pad on the DM page. Line width follows pen pressure (Pointer Events `pressure`, `pointerType` "pen"); mouse and finger draw at a fixed width. Palm rejection: once a pen is seen, finger touches don't draw. [DM Screen; one shared module, opened as a pop-up]
- [ ] Tools: pen, eraser, a few colours, size, undo, clear, paper (parchment, white or night). The pad slides in and out like the other dialogs.
- [ ] DM saves a drawing as the scene backdrop, a character portrait, a handout or a journal entry. [Uses what exists: the backdrop upload with `?live=1`, `/api/portrait/:id`, `dm:handout` (already takes an `image`) and the party journal. Adds a `drawing` asset kind in `uploads/drawings/` and an optional image on journal entries]
- [ ] Players get their own sketch pad on phones and tablets (Mike, Nov 16), the same pad with pen pressure. They save a sketch to the party journal or as their own portrait. [Phones; a Sketch button opens it]

## Mike's notes, 2026-11-23 (Bard song mode)

Mike's sticky note: "Bard song mode. Bards set their spells. Duration: effect. Amount of notes: strength. They must perform the song in battle." Design approved by Mike on Nov 23; music plays on both the phone and the TV.

### PR AA: Bard song mode
`public/js/play/song.js` (new), `public/js/play/`, `public/js/stage.js`, `public/audio.js`, `src/songs.js` (new), `src/sockets/`, `src/spells.js`, `src/rules/`, `src/visibility.js`
- [ ] Note economy: a fixed palette of 4 to 6 notes; songs are 3 to 7 notes long. Strength = notes played correctly, with a cap and diminishing returns past it. [Palette and cap live in the rules file so Mike's system can change them]
- [ ] Duration and strength are separate. Duration comes from the song's rhythm and length; strength from the note count. Players trade long-and-weak against short-and-strong.
- [ ] Performance on the phone: tap pads in time with the beat, with hold and release notes. Each note is graded miss, good or perfect. The music plays on the phone and on the TV at the same time; the TV also shows the staff and the beat so the whole table can follow. [Audio through `public/audio.js`, synced from the server's song start time; respects the Motion setting for the staff animation]
- [ ] Battle: starting a song costs the bard's action (or bonus action, per the song). The bard keeps playing each turn to keep it going, like concentration. Damage or a failed check interrupts it. [Reuse the concentration save and auto-drop from PR #119]
- [ ] Songbook: the bard prepares songs before combat. Each song is a note pattern plus an effect (heal, haste, fear...). Learning new patterns is progression. [Phone Spells tab gets a Songbook section; DM can add and edit songs]
- [ ] Group harmony: an ally's action that lands on the beat adds a small bonus to the song.
- [ ] DM one-tap override: grant, cut or extend any song effect. [Every automated result gets an override]
- [ ] System-agnostic effects: songs carry effect tags (heal, buff, debuff, area) that `src/rules/` maps to 5e now and Daggerheart later. No 5e-only rules in shared code.
- Open question: should misplayed notes have a downside (a backfire or a lost turn), or only lower the strength?

## AI Text RPG spec v2, merged (Mike, 2026-11-24)

Mike asked to merge his "AI Text RPG Project Spec v2" into this plan, not build it. The full comparison (Built,
Partly, New, Not adopted, with reasons) is in `docs/spec-merge.md`. The AI game master, stealth DM takeover,
accounts and paid tiers are not adopted. These are the new items worth having at this table.

### PR AC: Code health from the spec (no behaviour change)
`tools/dupes.js` (new), `docs/duplication-report.md` (new), `public/theme.css`, `public/style.css`, `public/anim.js`, `public/js/dm/dgwindow.js`, `test/run.js`
- [ ] Duplication audit: `npm run dupes` lists near-duplicate functions and CSS blocks across `src/` and `public/`, and writes `docs/duplication-report.md` (files, lines, what they should merge into). Sits beside `docs/module-graph.md`.
- [ ] Merge steps from the report, smallest and safest first, one PR each, each with its own test and no visible change.
- [ ] Motion tokens: the CSS uses 22 different easings. Fold them into a few named tokens in `public/theme.css` (one standard ease, one bounce; fast, medium and slow durations). `public/anim.js` reads the same tokens. The Motion setting keeps working as it does.
- [ ] One dialog shell: list the pop-ups that still build their own frame, close button and Escape handling, and move them onto the shared dialog.
- [ ] Measure before optimising: a check for dice tray and TV frame rate during a busy combat, next to the payload sizes PR #157 measures.

### PR AD: Table play ideas from the spec
`src/rules/`, `src/sheet.js`, `public/js/play/rolls.js`, `public/js/play/sheet.js`, `public/js/dm/social.js`, `src/storybook.js`, `public/js/play/mapview.js`, `public/js/dm/lore.js`, `src/soundscape.js`, `public/stage.js`, `public/audio.js`, `src/visibility.js`
- [ ] Key bank per profession: the rules file lists which skills each profession leans on (Rogue: Stealth, Sleight of Hand; Bard: Performance, Persuasion). The phone shows them as quick-roll buttons with the bonus ("Stealth +7"); tapping one asks the DM, who accepts or sets a DC. The DM's party card gets the same buttons. [Builds on PR Y profession kits; system-agnostic, names editable]
- [ ] Ability cards: features, spells and special moves show as cards that flip to the full rules on tap. Reuse the item card from PR #143. Respects the Motion setting (Reduce swaps faces with a fade).
- [ ] Drag-to-roll die on phones: flick the die to roll a roll call; the result still comes from the server, the drag only sets the tumble. A tap still rolls. Display setting "Drag dice to roll", default on.
- [ ] NPC memory: when the DM opens a conversation, a DM-only strip shows the last few kept moments with that NPC and those players, from the Storybook journal. Bookkeeping only; nothing is written for the DM. [Stripped in `src/visibility.js`, with a test]
- [ ] Battle cry: an optional short line with a strike, shown on the TV under the roll pop-up. DM can hide it with one tap.
- [ ] Nearby places: the phone map lists known places by road legs from the party, nearest first.
- [ ] Lore sorted by scale: Lore tab sort option from smallest (a person) to largest (a region or the world).
- [ ] First-time tips: the first time a player opens each phone tab, one short tip explains it. Tap anywhere to close; the DM can reset tips for the table.
- [ ] Night ambience: the soundscape adds night layers (crickets) when the story clock reaches dusk and removes them at dawn. One-tap undo like the other automatic changes.
- [ ] Backdrop drift: a slow zoom on the TV backdrop (Ken Burns style). Off under Reduce motion; per-backdrop on or off.
- [ ] NPC voices read aloud (optional): the TV can speak an NPC's line with the browser's built-in voices; each NPC gets a voice, pitch and speed on its card, with preview, mute per NPC and a global off switch. Off by default. [Pairs with the existing speech-to-text]

## DM Prep Screen (Mike, 2026-11-26)

- A step-by-step prep screen before the TV goes live: walk through every Planning step (Modules, session plan, party, world map, shops, creatures, story nodes, soundscape), then Start game.
- Planning › Modules (built Nov 26, `src/features.js`) is its first step: switch off what this session does not use.
- Not built.
## Mike's notes, 2026-11-26 (road events)

Mike: "I am considering a kind of Oregon Trail format for travelling. There's a list of road events in an .md file, and the players can decide how to handle them as they travel on the map." Plan only, not built. The look is from a screenshot he shared of a trail game's event card (dated title, speaker portrait and quote, wide scene with the wagon, big Continue button).

### PR AE: Road events while travelling
`data/road-events.md` (new, DM's own list), `src/roadevents.js` (new), `src/sockets/roadevents.js` (new), `src/worldmap.js`, `src/clock.js`, `src/living.js`, `src/rules/`, `src/visibility.js`, `src/storybook.js`, `public/js/dm/roadevents.js` (new), `public/js/play/`, `public/stage.js`
- [ ] Toggleable module (Mike, Nov 26): road events are one self-contained module the DM switches on or off (Planning › Modules, built Nov 26: add `roadEvents` to `src/features.js` with a `default: off` flag, since every module there is on by default). Off means no draws, no DM card, no phone or TV UI, and travel works exactly as today; the code lives only in the files marked (new) plus one hook call in `src/worldmap.js` that checks the switch. Turning it off mid-event closes the card with no outcome. The module list already exists (`src/features.js`, PR #166).
- [ ] Event list in Markdown: one file, `data/road-events.md`, editable by hand or from the DM Screen (Planning › Road events). A starter list ships in `docs/road-events.example.md`. Each event is a heading, a few `key: value` lines, the text, then one `-` line per choice:

  ```md
  ## Broken wheel
  when: road, day | weight: 3 | terrain: hills, forest | weather: rain, storm
  who: Jack Keetley (portrait: keetley.png)
  > "That wheel won't last another mile, friend."

  The cart lurches and a wheel cracks on a rock.

  - Fix it here | check: craft 12 | pass: lose 1 segment | fail: lose 2 segments, -5 coins
  - Leave the cart | lose: cart | gain: 1 segment
  - Ask the stranger for help | cost: 10 coins | lose 1 segment
  ```

  Everything but the heading and the choices is optional. Unknown keys are kept and shown to the DM, never an error.
- [ ] Triggers on road legs: each leg of travel already spends one segment of the story clock (PR V). After each leg an event roll decides whether one fires (Mike, Nov 26: decided on a roll). The DM sets the die and the target (default d6, event on a 1); dusk, night and storms shift it through `encounterFactor` in `src/living.js`. The roll shows in the dice log with the DM's usual one-tap reroll or override. It then draws one event whose `when`, `terrain`, `weather` and time of day fit, by `weight`. An event fired this session is not drawn again unless it says `repeat: yes`.
- [ ] Conditions read shared state: time of day from the story clock, `state.weather` (one weather source), terrain from the road or the node it leads to (a road gets an optional terrain tag in the DM's road card). Places can add their own events with `place: Millbrook`.
- [ ] DM first, always: a drawn event is a pending card on the DM Screen only (stripped in `src/visibility.js`, with a test). The DM taps **Run it**, **Draw another** or **Skip** before anyone sees it. Travel pauses on the leg until the event is run or skipped. A DM button **Road event now** fires one by hand.
- [ ] TV event card (layout from Mike's screenshot): title and the in-world date and time across the top; the speaker's portrait with name plate on the left and the quote beside it; the scene below as a wide strip (the current backdrop or the event's own `image`, with the party's portraits walking in a line, placeholder art for now); the choices as large buttons along the bottom with live vote counts. After the outcome, one **Continue** (DM or every player) closes it. Slides in and out; Reduce motion swaps it with a fade.
- [ ] Choices by phone vote: players see nothing until the DM runs the event and the vote opens (Mike, Nov 26). Then each phone shows the event text and the choices; players vote, spectators can suggest but their taps do not count. The DM sees the tally and picks (any choice, not only the winner), or lets the vote close itself after a time he sets. Reuses the world map vote and roll call pop-ups, no new vote system.
- [ ] Checks stay system-agnostic: a choice's `check: <skill> <DC>` turns into a roll call for the chosen player or the whole party through `src/rules/` (5e skills now, Mike's own system later; skill names are just text). `check: group` means most of the party must pass. The DC can be secret like other checks (no pass/fail leak to the TV).
- [ ] Outcomes spend resources: plain words the server knows: `lose`/`gain` segments (story clock), coins, an item by name, HP (`-1d6 hp` to each or to one), a condition, a town's standing. Anything it does not know is shown to the DM as a note to apply by hand. No inventory weight (Mike rejected it).
- [ ] Party supplies (Mike, Nov 26): one shared counter of supply boxes, shown small on the DM party bar and the phone Inventory. A box costs 5 copper in any shop and feeds the whole party for about a season. Use is randomized: each road leg has a small chance to use part of a box, tuned so one box lasts roughly a season of story clock on average. Present but ignorable: running out only shows "Out of supplies" to the DM and the table, with no damage, conditions or forced events. Events may say `cost: 1 supplies` or `gain: 1 supplies`. The DM sets or resets the count with one tap. Part of the road events module, so it hides when the module is off.
- [ ] DM one-tap override on every automated result: change the roll, swap the outcome, or **Undo** the whole event (uses the existing undo history). The vote result is a suggestion the DM can overrule.
- [ ] Storybook: each event and the choice made goes into the session journal, so it shows in the /story replay and the story pack.
- Mike's answers (Nov 26): an event fires on a roll; players do not see choices before the vote opens; yes to a randomized supplies counter (5 copper a box, about a season per box, never affects the story).

## Mike's notes, 2026-11-26 (simple NPC stats)

Generated NPCs get very simple stats, no more than 5. The DM can promote one to a named NPC later and
elaborate it then. Look reference (Mike's screenshot): an Oregon Trail style sheet with grouped panels, an icon
per stat, segmented 6-pip bars, and "UNDISCOVERED" in place of a bar until the players learn it.

### PR AF: Simple NPC stats, reveal and promotion
`src/npcstats.js` (new), `src/cast.js`, `src/creatures.js`, `src/rules/`, `src/visibility.js`, `src/sockets/dm.js`, `public/js/dm/social.js`, `public/js/dm/creatures.js`, `public/js/play/`, `public/stage.js`, `public/theme.css`
- [ ] Five stats on every generated NPC, each 0 to 6 pips. Candidate set (names, icons and count editable in the rules file, so Mike's system can rename them):
  - **Health**: how much it takes to drop them.
  - **Nerve**: how long they hold before they flee, fold or panic.
  - **Attitude**: how they feel about the party, hostile to friendly.
  - **Wit**: how sharp they are; spots lies, tells good lies.
  - **Knack**: one thing they are good at, with a free-text name (Carpentry, Wayfinding, Haggling).
- [ ] Generate: the DM's new-NPC button rolls the five pips with a light bias from the NPC's role (a guard leans Health, a merchant leans Wit). One tap rerolls; every pip is editable. [Bookkeeping only; the DM can override any value]
- [ ] Stat card: grouped panel, icon per stat, segmented 6-pip bar that fills in left to right. Shown on the DM's cast card and, for the stats the party knows, on phones and the TV. Respects the Motion setting.
- [ ] Discovered or undiscovered per stat, per NPC. Undiscovered stats show "UNDISCOVERED" to players and the TV. The DM reveals one with a tap (after a good read, a roll or a conversation); the bar fills in with a short reveal animation on the TV. Hide again with one tap. [Hidden values stripped for player, screen and guest in `src/visibility.js`, with a test; co-DM sees all]
- [ ] Promote to named NPC: one button on the cast card opens the Creature Designer (PR W) prefilled with the name, the five stats and anything revealed. The DM elaborates there (full stats, skills, lore, abilities). The five-pip card stays as the quick view; NPC memory (PR AD) and Storybook moments follow the promoted NPC.
- [ ] Pool NPCs (Albert, Brent, Christina) and NPCs from plans get the same five stats, defaulting to undiscovered.
- Open question: should Health pips drive the NPC's HP in combat (rules file maps pips to HP), or stay a story hint only?

## Mike's notes, 2026-11-23 (wrap to content)

### PR AB: Nodes and windows wrap their content
`public/theme.css`, `public/js/dm/`, `public/js/play/`, `public/screen.html`, world map and town node modules
Mike: "Nodes and windows should wrap the content." Read as world-map and town **nodes** (labels and hover lists) and pop-up **windows**; Mike can redirect if he meant something else. In priority order:
- [ ] Map node labels and hover lists (world map, town nodes): size to the text with a max width, wrap beyond it; no clipping or overlap. [DM Screen, TV, phones]
- [ ] Phone node and town windows: shrink-wrap to content; max height is the viewport, with internal scroll. [Phones]
- [ ] DM pop-ups (Creature Designer, Item Designer, dungeon pop-up): content-sized with min and max bounds, and the drag position is remembered. [DM Screen]
- [ ] TV pop-ups (roll, moment and banner cards): wrap to content and never truncate, so they read from across the room. [TV]
- [ ] Tools dock: fixed width, height follows content. [DM Screen]
- Already done on Nov 28 (not part of this list): the TV scene panel, the Social window and its chips, the open tool windows, mode buttons and character rows now grow to fit (`public/theme.css`, `test/wrap-cascade-ui.js`).
- Out of scope: full-screen panels and the 3D battle map keep their fixed layouts.
