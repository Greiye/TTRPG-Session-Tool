# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed
- Chronicle look for the DM page and phones (`public/chronicle.css`, `public/chronicle.js`): charcoal panels, muted gold accents, small-caps labels. The TV is unchanged, and the TV preview on the DM page keeps the TV's look.
  - DM page in three columns: tools on the left (sidebar tabs now show a short label under each icon), the story in the middle, the hero on the right. Every existing card, tab and control is where it was inside its tab.
  - Pill bar over the stage: day, time of day, location (scene title), quest (open objectives) and coins. Phones show their own quest and coins; the DM sees party coins. A pill flashes when its value changes.
  - Story feed under the TV preview: narration as prose, NPC and player lines in bordered dialogue boxes with a round portrait and the speaker in small caps. New lines slide in. The phone's Logs tab uses the same feed with its filters.
  - Hero column on the DM page: pick a party member, see a large portrait, name with an edit button (opens the character editor), level, HP and a resource bar (spell slots, mana or stamina, else hit dice), then Stats or Bio.
  - Phone header is a hero card with the same bars; tap Stats or Bio to open the ability list or backstory, tap again to close. The pencil opens the profile editor.

### Added
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
- With the 3D dice tray on, roll results on the TV use the tray instead of the centre roll popup. Turn the tray off to get the popup back.
- DM sidebar tabs are grouped (Play, Scene, Prep and record) and follow the live mode: a tab shows only when it has content in the current mode.

### Removed
- Table message log on the DM screen, the phones and the TV (the game is played in person).

### Fixed
- Battle map tokens vanished on phones and the TV: the framing-token count (Phase I) was sent under the same `tokens` field and overwrote the map positions. The count is now `framingTokens`.
