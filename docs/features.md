# Features

Everything Tavern Screen does today (main, Nov 26), grouped by pillar. **Module** names the switch in
**Planning › 🧩 Modules** that turns the feature off. Off hides it on the DM page, the TV and phones, and the server
refuses its events; nothing is deleted, so switching it back on brings it all back. Everything is on by default.
Features marked *core* have no switch. The module list lives in `src/features.js`.

## Table and joining (core)

- Laptop runs the server; TV page (`/screen`), DM page (`/dm`), phones (`/play`) join by QR and room code.
- TV landing page until the first player presses Start game; join QR on the TV (Show/Hide).
- Persistent characters: claim on a phone, profile (selfie, race, pronoun, catchphrase, backstory, colour).
- Test mode with a test player; playtest bots; scenario seeder; session record and replay.
- Display settings per device (text size, colours, motion, dice tray, logs), and for the TV from the DM.
- Save points, startup backups, Back up everything, Undo and Redo, End Session card.
- Rules systems: D&D 5e and Daggerheart preview (`src/rules/`); house rules engine.
- Narrate bar, story log, roll calls with DC ladder, dice pool, secret DCs, 3D dice tray on the TV.
- Hero column and Party sidebar, right-click menus, movable and re-orderable windows, gamepad control.
- Phone sheet (read-only stats, notes, languages, named moves), Spells tab for casters, class features.

## 🧭 Exploration

| Feature | What it does | Module |
|---|---|---|
| Scene | Title, text, theme, backdrop, points of interest, hidden details, perception | core |
| World map and travel | World map page, places, roads with legs, fog, road cards, party votes, travel on the TV, phone Map, Group Map View, trail | `worldmap` |
| Town visits | Town gate, town map on the TV, places to visit, phone Town tab, starter town | `town` (needs world map) |
| Story clock | Segmented time of day, TV dial, map lighting | core |
| Dungeons | Rooms on levels, ropes, dungeon gate, DM dungeon tab, phone Dungeon tab | `dungeon` |
| Weather | Rain, snow, fog and more on the TV; travel and sight effects | `weather` |
| Puzzles | Teamwork puzzles, clues split over phones, DM-confirmed solve | `puzzle` |
| Camp and rests | Camp pop-up, short/long rest votes, class section, hit dice pop-up | `camp` |
| Downtime | Downtime picks and results, phone Downtime tab | `downtime` |

## ⚔️ Combat

| Feature | What it does | Module |
|---|---|---|
| Combat mode | Combat button, Prepare combat, Battle Window, initiative hold, turn tracker on the TV, phone turn actions, strikes and special moves, conditions, concentration, boss cards, Victory pop-up, combat effects | `combat` |
| 3D battle map | Terrain, generate (outdoors or dungeon), tokens, line of sight and cover, fog, compass, time-of-day light, phone D-pad | `battlemap` (needs combat) |
| Creature library and randomizer | Creature presets, art, randomizer tables | `creatures` (needs combat) |

## 💬 Social

| Feature | What it does | Module |
|---|---|---|
| Social mode | Visual novel conversation: who joins, emotion wheel, dialogue box, typewriter, languages and glosses, on-scene cast, sprites, phone speech box, "Join the conversation?" | `social` |
| Live voice | Record and transcribe the DM, live caption on the TV | `voice` (needs social) |
| Shops | Shop pop-ups on the TV and phones, merchant, buy and sell, Greer's Trinkets, price lists | `shops` |
| Faction reputation | Standing tiers, price changes | `factions` |
| Living world | Town standing, rumours, oracles, canon, phone World section | `living` |
| Relations web | NPC and faction web, revealed parts on the TV | `web` |
| NPC relations | How each NPC feels about each character (DM only) | `relations` |

## 🎲 Table and story

| Feature | What it does | Module |
|---|---|---|
| Items | Items tab, item cards, Item Designer, gold, phone Inventory, "Received" toast | `items` |
| Messages and votes | Handouts, spoils, party votes, phrases, phone Inbox | `messages` |
| Party journal | Shared notes on phones, DM journal window | `journal` |
| Lore | Lore tab, lore repo sync, phone Lore section | `lore` |
| Inspiration | Inspiration points and their phone pop-up | `inspiration` |
| Legends | Hall of fame, trophy shelf, empty chairs, memorial cards | `legends` |
| Clocks | Segment clocks on the TV | `clocks` |
| TV moments | Entrances, relic reveals, quotes, chapters, epilogue, choice echoes | `moments` |
| Soundscape | Mood wheel, environment, layers, favourites, Music Co-DM | `soundscape` |
| Stage and music | Backdrops, overlays, music and SFX, soundboard | core |
| Mood, lights and templates | Smart bulbs, mood presets, scene templates | `lights` |
| Table tools | Tension, canon, montage, cues, nudges, bonds, framing, foreshadowing | `table` |
| Recap quiz | Recap questions answered on phones | `quiz` |
| Spectators | Watch as a spectator, suggestions | `spectators` |
| Storybook | Keep star on the DM page (the session journal, /story viewer, story pack and Ren'Py export stay) | `storybook` |
| Co-DM and helpers | Invite QRs for Co-DM, Battle, Social and Music helpers | `codm` |

## 📝 Planning

| Feature | What it does | Module |
|---|---|---|
| Modules | This list of switches | core |
| Shops | Shop lists (see Social) | `shops` |
| Creature Designer | Peoples, beasts, monsters and persons; keyword bank; lore wiki link | `designer` |
| Story Nodes Graph | Plot hooks, NPCs, places and clues on a board | `graph` |
| Session plans | Import Markdown plans, scenes, NPCs, encounters | core |
