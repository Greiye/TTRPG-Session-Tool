# Placeholder art

Test art only. Every file here starts with `placeholder-` and every image says PLACEHOLDER, so it is easy
to spot and replace. All of it is plain SVG drawn by `tools/make-placeholders.js` (no outside sources), so
it is free to use. Run `node tools/make-placeholders.js` to draw it again.

| Files | What for | Where it shows up |
| --- | --- | --- |
| `placeholder-portrait-<class>.svg` (12) | Character portraits, one per test party class | **Add test party** gives each test character the one for its class, only when it has no portrait yet |
| `placeholder-token-<creature>.svg` (6) | Creature art: goblin, wolf, skeleton, bandit, ogre, dragon | Upload one as creature art to try the stat block and boss card |
| `placeholder-backdrop-<pillar>.svg` (3) | One backdrop per pillar: exploration road, combat arena, social tavern | Listed in the backdrop library as **[Placeholder] ...** after Tales of Artheria |
| `placeholder-items.csv` | 24 placeholder wares: weapons, armour, potions, gear and a tool, with 5e SRD prices | Every table starts with the **[Placeholder] Outfitters** shop read from it; import it again from the Shops tab to restock |

To replace one, upload your own art in the DM page as usual; nothing here needs to be deleted first.
Placeholder sounds are generated in memory (`src/placeholder-sounds.js`, `docs/sounds.md`).
