# Test session: The Princess and the Dragon (PLACEHOLDER)

A short session that walks through every pillar of the tool with placeholder content: a barbarian, a rogue, an
archer and a wizard must save a princess in a tower from a dragon. Use it to check a build before game night.

- `plan.md` is a session plan. Import it on the DM page (**Session plans**) to get the scenes, NPCs and both
  dragon encounters as launch buttons.
- `session.json` holds every other placeholder: the four heroes, the world map, the village map, the dungeon
  rooms, the dragon's boss stat block, the shopping list and the mission winnings.
- `test/test-session.js` plays the whole session automatically over the sockets (four fake phones and the DM)
  and checks each step. It runs in `npm test` and on its own with `node test/test-session.js`.

Everything named here is PLACEHOLDER. Rename it when real story content exists. Nothing in this folder adds a
feature; it only uses what the tool already has.

## The party never dies

There is no "immortal party" switch in the tool, so the test session keeps the party alive by the DM's hand:
both dragons hit for 1d4, and after every dragon attack the DM heals any hero below half HP (HP card, the +
button, `dm:hp`). The automated run fails if a hero ever reaches 0 HP.

## Steps

Each step lists what to do on the DM page, what the phones do, and the features it exercises.

| # | Step | DM page | Phones | Features exercised |
|---|------|---------|--------|--------------------|
| 1 | Session starts | Clear the world map, build the `session.json` world (4 places, 3 roads, fog on), import `plan.md`, Next session, chapter intro card | Four players scan the QR and join as Barbarian, Rogue, Ranger (the archer) and Wizard | room code join, roster, world map editor, fog, session plans import, intro card |
| 2 | The Burning Road | Launch scene 1. Social mode, hold Start conversation, launch the Fleeing Villager NPC, change emotions (fearful, surprised, sad) | Join the conversation, say a line with an emotion, pick a choice | VN dialogue, live emotions, choices, player lines with emotion wheel, conversation end card |
| 3 | Dragon on the road | Combat mode (Get ready filter), launch encounter 1, call a Perception roll, roll initiative, play the dragon, heal heroes below half | Answer the roll call, attack on their turns | roll calls, dice log, initiative, phone combat turns, DM creature attacks, HP override, combat end |
| 4 | Into the village | Send the party to Emberford on the world map. Open the town gate | Hold Enter Town | world map travel (legs, story clock), town gate |
| 5 | The town leader | Launch scene 2. Social, launch Town Leader. Reveal the Dungeon of the Reptile and the Dragon's Lair on the map. Add a quest objective | Talk to the leader | social, map reveal, objectives |
| 6 | Two villagers | Social again with the Blacksmith, end, then the Herbalist, end | Talk to each | two more conversations |
| 7 | Greer's | Give each hero 50 gp (Items/sheet). Players pick Greer's place in town | Hold the town action on Greer's, buy one item each, press Done | town places, shop pop-up, buying, gold, done count |
| 8 | Dungeon of the Reptile | Leave town, send the party to the dungeon place. Launch scene 3. Move through rooms, reveal them, call a Dexterity save at the trap | Hold Enter Dungeon, roll the trap save, press Exit Dungeon at the end | dungeon gate, rooms, reveal, trail, trap roll call, Exit Dungeon |
| 9 | Road to the Dragon's Lair | Send the party on to the lair. Launch scene 4 | Watch the TV | travel, flavour cards |
| 10 | The lair | Save the boss dragon in the creature library, spawn it (boss title card), roll initiative, fight, heal | Attack on their turns | creature library, boss card, second fight |
| 11 | Save the princess | Social, launch the Princess | Say a line | social |
| 12 | Mission winnings | Hand out spoils, award them, give each hero 200 gp, award Best kill, put the princess's crown on the trophy shelf | Read the spoils | spoils, gold, legends, trophies |
| 13 | Session ends | Narrate the immortality hook, hold End session | Thanks for playing | narration, end of session card |

## What the run does not cover

These need a person at the table, a browser or real media, so the automated run leaves them out. Try them by
hand during the session:

- Live voice to text and recording (needs a microphone and Chrome speech).
- The phones' strike gestures, the 3D battle map and drag-and-drop token placement (browser input).
- TV animations, sound, music and the Co-DM atmosphere page (visual and audio checks).
- Camp and rests, downtime, puzzles, recap quiz, montage, factions and the living world (not in this story).
- NPC portraits and sprites (no placeholder art for these NPCs; the VN uses the coloured silhouette).
- The conversation picker only offers its three built-in NPCs (Albert, Brent, Christina). The test starts each
  talk with Albert, then launches the plan NPC, which takes over the speaker's name, emotion and lines.
