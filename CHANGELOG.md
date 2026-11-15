# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **3D battle map** replaces the flat image grid in combat on the DM stage, the TV and phones (`lib/iso-battle`, `public/js/iso3d.js`). Tiles have heights, grounds (grass, dirt, stone, sand, water, snow, floor) and props (rock, tree, crate). Pixel-art sprites face where they move and attack; the camera orbits and snaps to 8 views or overhead.
  - Movement routes over heights (`src/iso.js`): climbing costs 5 ft a step, at most 2 up and 3 down per stride, water costs double, fliers ignore height and ground.
  - Attacks need 3D line of sight (no roll and no lost turn without it) and the target gets half or three-quarters cover from props, walls, trees or higher ground. Fog of war uses the same line of sight.
  - DM: Raise, Lower, Paint, Obstacle and Teleport tools on the stage; **Generate terrain** with an optional seed on the Battle map card. New sockets `dm:map:tile` and `dm:map:generate`.
  - Phones: tap a tile to preview the path and cost, tap again to move. The arrow movepad is gone.
  - `npm run build:iso` rebuilds the module bundles. Tests in `test/iso.js`.
- Sample backdrop "Tales of Artheria" (`public/samples/artheria-village.jpg`), bundled with the app and listed first in the backdrop library. A fresh table, or a save from before this change, starts on it. Choosing "Scene theme" is now saved as `'none'`, so it survives a restart. The sample has no ✕ and is never deleted from disk.

### Changed
- DM screen notes (Nov 14):
  - The top bar folds to its title line with ▴ (▾ brings it back); remembered on that laptop.
  - The sidebar's first card is now **Modes**: Explore, Combat and Social, then **Planning** and **World map** toggles, then every tab as a labelled list. Tabs are Rolls, Combat, Party, Messages, Logs, Legends, Scene, NPCs and a new **Miscellaneous**. Scene and Miscellaneous have small part chips at the top.
  - Scene holds the scene, hidden points of interest and dungeon, stage and music (backdrop and music fused), clocks (with the story clock), TV moments and puzzles. Miscellaneous holds smart lights, table tools (with bonds), recap quiz, relations web, notes and journal, camp and downtime, co-DM and campaign data.
  - Fog of war on the scene is now **Hidden points of interest**.
  - **Planning Mode** (DM only, nothing changes on the TV): shows the **Shops** tab and a **Road cards** tab (deck, auto table, and how often a card comes up while travelling, 20 s by default). Road cards draw on their own during travel; only their editing moved.
  - The world map is no longer a sidebar card. The **World map** toggle swaps the DM's main column (stage and story) for the map. Places can be dragged to move them.
  - Campaign data buttons are gem tiles with a line on what each one does.
  - The Narrate bar posts under the scene description on the TV as well as to the log. The newest 10 stay; older ones drop off the top, and a new place starts a clean list.
  - The constant Exploration/Combat/Social label is gone from the TV stage, the DM tools header and the phone header. The short mode card on a mode change stays.
- Story clock has five segments, Dawn, Day, Noon, Dusk and Night, and no clock hours. The DM taps a segment or Next (Night rolls to Dawn of the next day). Saves with an hour map to a segment.
- TV: the day and time show on the left only for a few seconds after the story clock moves, with a sound for the segment (birdsong at dawn, a chime by day, a bell at noon, a rooster at dusk, crickets at night; built-in synths).
- TV: the world map unrolls when the DM puts it on the TV, then roads and places drop in one by one.
- Only one TV pop-up at a time (`src/popups.js`): opening camp, the relations web, a shop, the hall of fame or trophy shelf, a trophy story, a montage, a relic card or the journal book closes whichever other one is up.
- Shops no longer have a phone tab. The DM pops a shop up (NPCs tab during play, or Pop up in the Shops list): it opens for trade, the TV shows the shop, its wares and how many players are still shopping, and each phone gets a pop-up with Buy and Sell lists and a Done shopping button. Merchants buy what they sell, at half price.

- Player screen tabs are now Play, Sheet, Inventory, Journal and Misc. Tabs and their sections fade in.
  - Play: a dice pool sits at the top. D4, D6, D8, D10, D12 and D20 each have an icon and ◀ ▶ arrows to remove or add a die, and Roll is at the bottom. Adv and Dis work when the pool is a single D20. The scene description is on the TV only. A point of interest appears on the phone only once the DM reveals it, so there are no ??? placeholders. Skill buttons and the hero Stats and Bio toggle are gone from the phone (stats are on the Sheet, the bio is in the profile).
  - Sheet: tap a skill to roll it. Class features are buttons. Tap one to read its description, then press and hold Activate for 3 seconds to spend a use (the bar fills while you hold, and letting go early cancels). The table log records the use. This adds the `player:feature` socket and `useFeature` in `src/rests.js`.
  - Inventory: a new tab with gold and items, moved from the Sheet.
  - Journal: the Inbox, Map and Notes sections in one tab. Players no longer see road cards, and the server stops sending them to phones.
  - Misc: a new tab with the Logs, World, Legends and Bond sections. Your bond moved here from the Play tab.
  - The phone Shops tab is removed. Shopping only happens when the DM opens a shop, and that pop-up is being built separately. Browsing shops between sessions is set aside for later.
- DM tools column can be minimized: « in its header slides it away (animated), and a grip on the left screen edge brings it back with a click, a drag to the right (the column follows the pointer; a short drag snaps shut), or the right arrow key. The choice is remembered on that laptop (`public/js/dm/dock.js`).
- Chronicle look for the DM page and phones (`public/chronicle.css`, `public/chronicle.js`): charcoal panels, muted gold accents, small-caps labels. The TV is unchanged, and the TV preview on the DM page keeps the TV's look.
  - DM page in three columns: tools on the left (sidebar tabs now show a short label under each icon), the story in the middle, the hero on the right. Every existing card, tab and control is where it was inside its tab.
  - Pill bar over the stage: day, time of day, location (scene title), quest (open objectives) and coins. Phones show their own quest and coins; the DM sees party coins. A pill flashes when its value changes.
  - Story feed under the TV preview: narration as prose, NPC and player lines in bordered dialogue boxes with a round portrait and the speaker in small caps. New lines slide in. The phone's Logs tab uses the same feed with its filters.
  - Hero column on the DM page: pick a party member, see a large portrait, name with an edit button (opens the character editor), level, HP and a resource bar (spell slots, mana or stamina, else hit dice), then Stats or Bio.
  - Phone header is a hero card with the same bars; tap Stats or Bio to open the ability list or backstory, tap again to close. The pencil opens the profile editor.

### Removed
- Moved to the code module archive (`archive/`, not loaded; see `archive/README.md`): the Session plans card, the Intro card and the Epilogue controls. Their server side still works and is still tested, so each comes back with one import line.

### Added
- Each session opens on the world map: when the server starts, and on Next session, the table switches to exploration with the world map on the TV. The DM turns this off with "Open each session here" in the World map tab, and the map must have a picture or places. Combat and social now take the TV back from the world map. Untick "Show on TV" to move from the map to the exploration stage.
- World map roads, fog of war and town links. The DM draws roads between places (+ Road, then tap two places) and sets each road's length in legs. A party at a place travels by the shortest road route, one leg per road, passing through each place on the way (each stop ticks travel clocks and spreads rumours). With no road it heads straight there, as before. Fog of war hides places the party has not seen and roads it does not know; arriving somewhere uncovers the roads out of it and the places at their ends. A fogged destination or vote option shows as ???. The DM can turn fog on or off, reveal or fog everything, and tick any place or road in or out of the fog. A place can link to a living-world town by id, so prices, clocks and rumours no longer depend on matching names (an unlinked place still falls back to the name). Phones show how many legs a place is by known roads; the TV title names the stops on the way.
- Game menu look (`public/theme.css`, `public/theme/*.svg`): aged parchment panels in dark-iron corner frames, wooden plate buttons with an iron band, slate plates for primary actions, round gem sockets on mode buttons, big buttons, phone tabs and the TV mode pill, and parchment lists with coloured gem badges. Covers the DM page, co-DM, phones (one framed parchment page) and the TV (dialogue box, name plate, party plaques, log strips, join card, foes, clock, dungeon nodes). Textures are small SVG noise filters, no bitmaps. Gems glint every few seconds; reduce motion stops it. The Chronicle layout (three DM columns, hero sheet, story feed, top pills) keeps its structure and takes the same look.
- Dungeon nodes for exploration (`src/dungeon.js`, `public/dungeon.js`, `public/dungeon.css`): the tree starts on the left and branches to the right, one column per level, joined by rope lines, on a stone wall with flickering torches. Unvisited rooms are parchment cards, visited rooms are iron plates, and the party's room glows with a "Party" tag. Each card shows its kind and a badge (DC, CR or an icon). Unrevealed rooms one step past a revealed room show as fogged "???" cards on the TV and phones; DM notes never leave the DM. The DM builds the tree in Scene and fog (add rooms, ropes in and out, reveal, remove), clicks a room on the stage preview to edit it, and double-clicks to move the party. Phones see the board and a button for each way onward. A fresh table starts with an example dungeon. The board adapts as the party moves: on the TV and phones, levels two or more behind the party shrink to a trail of icons so the rooms ahead get more space, and cards glide to their new places.
- Teamwork puzzles (`src/puzzle.js`): the DM starts a riddle, a Caesar cipher or an order puzzle. Clues are split over the seated players (or sent to every phone, or held back), so the table has to talk it out. Phones send guesses; the DM marks wrong ones and confirms the solve. The TV shows the prompt, then the solution with a pop and a word-by-word reveal.
- NPC and faction relationship web (`src/web.js`): the DM draws NPCs, factions and places, and how each feels about the party or each other (-100 to +100). Faction nodes link to the reputation list. The DM reveals nodes and links as the story goes and turns the web on for the TV, which shows tiers only, never the number. Phones see nothing of the web.
- Initiative spotlight on phones: your turn buzzes and glows with a "Your turn" tag; the next in order gets a short "on deck" buzz. Reduce motion keeps the glow still.
- Handouts unfold like paper when they arrive on a phone or on the TV (new items only; the first load stays still).
- Rest rules per class (`src/rests.js`): Warlock pact slots refill on a short rest; Wizard Arcane Recovery returns up to half the level in slot levels; Fighter, Cleric, Druid and Paladin features refill on the rest they name; Lay on Hands waits for a long rest.
- Short rest hit dice: players set how many to spend in the camp pop-up. Each die heals a roll of its die plus CON, and the log shows the rolls.
- Class feature uses (Wild Shape, Channel Divinity, Lay on Hands points) show on the owner's phone sheet.
- World map (Phase G): the DM uploads a map picture and places towns and sites on it. Phones vote where to go, one vote each, and a strict majority of the seated party sends the party there (the DM closes a vote, or overrides it at any time). Travel takes a set number of real seconds, and the party token glides along the line on the TV and the phones. Flavour cards come up while travelling: the DM's own cards first, then a weighted auto table the DM can edit or switch off. The DM can veto any card after it shows, and reveal lore on it. Place info is shown to the table only once the DM reveals it. Phones can comment on cards. The DM can show the map on the TV. Code: `src/worldmap.js` (rules), `src/sockets/worldmap.js` (events and timer), `public/worldmap.js` (shared drawing).
- TV moments (phase H), driven from a new "TV moments" tab in the DM's Scene group:
  - Scene transitions: fade, wipe or ink across the TV. A new scene title also fades and shows a chapter card.
  - Dramatic pause: dims the TV and holds one line until the DM releases it.
  - Chapter cards and character entrances (portrait, name, optional built-in sound one-shot).
  - Quote wall: pinned memorable lines in a TV corner (newest 30).
  - Choice echoes: a planned decision brings back a consequence card after a number of scenes. Planned echoes stay with the DM.
  - Relic reveals: a magic item with a lore card, unlocked by the DM.
  - Journal book: a snapshot of the party's notes shown as a book on the TV.
  - Story clock: in-world day and time on the TV. The hour sets the TV light (dawn, day, dusk, night).
  - Session epilogue: a slideshow from the title, quotes, journal notes and key log moments.
  - Shared animations `curtain`, `wipe`, `ink` and `slideIn` in `public/anim.js`. All collapse to a short fade under reduce motion.
- Table tools (Phase I, `src/table.js`): the DM can save and fire a cue deck (mode, light, backdrop, layers, one-shot sound, handout) in one tap; send a silent nudge to one phone, which buzzes and lets the player share it aloud or keep it; watch a DM-only spotlight meter that shows who has acted or spoken and flags quiet players; set bonds between characters, with DM reminders to call them back after two sessions; run a dread tension bar on the TV; plant foreshadowing hints and show paid-off payoffs in the recap; spend a framing token on the phone to add a detail to the canon on the TV; run a montage where every phone answers one prompt and the answers are revealed together on the TV; and pick one-tap TV layouts (auto, social, combat, exploration, rest). Nothing here decides an outcome; every value is the DM's to override.
- Living world (phase K). The DM sets clocks that tick on events, between sessions and during travel, and each clock can move a town's or faction's standing when it fills. Towns hold standing that changes prices and whether traders serve the party (DM can force trade open or closed, and shops can be shut at night). Rumours spread along the roads between towns, can come out changed, and can move a town's standing when they arrive. Weather, light and tension interlock (weather is one shared value, `state.weather`, that the TV weather from phase B reads too): weather and night slow travel and dim sight, storms and night change encounter rates, and loud soundboard one-shots push a tension track. Players propose canon (a detail, NPC or rumour) on a new World tab, and the DM approves it. Oracles are weighted tables that favour the results that fit the scene, and every roll waits for the DM to accept or override it. Every automated or DM change is listed with an Undo, and DM-only changes stay off phones and the TV.
- Hall of fame, kept across campaigns in `data/legends.json`: "most natural 1s" is counted from the dice log per real player name, and the DM awards "best kill" and "worst plan". The TV and phones show it (DM: Legends card, "Show hall on TV").
- Trophy shelf, also kept across campaigns: the DM adds trophies with the story of how the group won each one. "Story" puts the tale on the TV until the DM closes it, and the shelf shows on the TV and phones.
- House rules panel: toggles the tool enforces. "One potion per turn" refuses a second potion from a phone in the same combat turn; "No camp during combat" refuses opening camp while a fight is on. Switching a rule off overrides it at once.
- Empty chair autopilot: when a character's phone is gone, the DM can put that chair on autopilot. On its turn it takes the Dodge action and the turn moves on. The DM can still take the character over.
- "What you missed": everything the table could see while a seat was empty is shown as a card when the player claims the seat again. Autopilot ends then.
- Soundboard: up to six ambience layers loop and blend on the TV, each with its own volume. The DM and the co-DM start and stop layers from the same board, and one-shots fire from it too. Four built-in placeholder loops (rain, tavern, dungeon drone, forest wind) are generated by the server, so nothing binary lives in git. Licence notes are in `docs/sounds.md`. DM uploads can be added as layers.
- DM takeover: the DM can play any party character from a second DM tab ("Play" on the party list). The character's phone shows a large "DM is controlling your character" message, can still read its sheet and write notes, but cannot act or roll. "Release" hands it back, and closing the DM tab does too.
- Placeholder test party: "Add test party" seats one test character per D&D 5e class (all twelve). Seeding twice does not duplicate them.
- Barbarian, Druid, Monk, Paladin, Sorcerer and Warlock classes in the D&D 5e rules.
- Fog of war and light on the battle map. The DM turns fog on from the battle map card. Party tokens reveal the tiles in their light radius: torch 20 ft, lantern 30 ft, darkvision 60 ft. Walls block sight. Enemies in the dark are not sent to phones or the TV; the DM sees everything, with the fog dimmed. Set a token's light from the map card with that token selected.
- Weather on the TV: rain, snow, fog and storm, set by the DM in the Scene tab at light, medium or heavy strength. Drawn on a canvas (`public/weather.js`). Under reduce motion the scene is still and storms do not flash. Separate from the backdrop effects, which stay as they were. It uses the one shared weather field (`state.weather`) with the living world, so changing weather in either place changes both.
- 3D dice tray on the TV: when a roll lands, its dice tumble across a felt tray and settle on the result. Plain CSS 3D, so it needs no network. Turn it off with the TV's "3D dice tray" setting (Settings, TV section). Under reduce motion the dice appear already showing their faces.
- Shared entrance animations in `public/anim.js`: `unfold` (paper turn), `reveal`, `fade`, and `Anim.stagger` for ordered entrances. All collapse to a short fade under reduce motion.
- Languages: a line spoken in a tongue (DM sets it beside the line) shows as glyphs on phones and the TV unless the character knows the tongue. The DM glosses it per character or for everyone (`src/speech.js`).
- NPC speech styles: the DM picks a font and colour for an NPC's lines on the TV from fixed lists.
- Intro card: "Previously on…" on the TV with the campaign name, session number and up to three recap lines, shown for 12 seconds (DM panel: Intro card).
- Timers (`src/timers.js`): a condition can run for a set number of rounds and ends by itself. Concentration starts from the DM's Conditions panel; damage to the caster asks their phone for a DC 10 (or half the damage) Constitution save. The DM drops concentration.

### Changed
- TV party bar no longer takes a fixed row. Player cards stay hidden below the screen; when a player's HP changes their card slides up for about 4 seconds, then slides back down. The scene and log get the freed space.
- With the 3D dice tray on, roll results on the TV use the tray instead of the centre roll popup. Turn the tray off to get the popup back.
- DM sidebar tabs are grouped (Play, Scene, Prep and record) and follow the live mode: a tab shows only when it has content in the current mode.

### Removed
- Table message log on the DM screen, the phones and the TV (the game is played in person).

### Fixed
- Battle map tokens vanished on phones and the TV: the framing-token count (Phase I) was sent under the same `tokens` field and overwrote the map positions. The count is now `framingTokens`.
