# World store

Since Nov 23 the Lore tab and the Arthuria world library are **one store**: `state.world` in the campaign save (`data/campaign.json`), keyed by stable ID. Every NPC, location, faction, event and lore entry is one record shaped by `schema/entity.schema.json`, so the Lore tab, the DM's entity editor, the bundle export and import, and the lore repo sync all read and write the same records.

Because the world is part of the campaign save, Undo, save points and the startup backup cover all of it (before the merge, the library in `data/entities.json` had none of these).

Code: `src/entities.js` (the store and its migration), `src/lore.js` (the Lore tab view), `src/lorebook.js` (lore repo sync), `src/bundle.js` (export and import). Test: `test/world-store.js`.

## Lore tab fields

| Lore tab | Record |
|---|---|
| Category | `type`, plus `category` for lore records and `dungeon: true` for dungeons (see below) |
| Name | `name` |
| What the party can learn | `body` |
| DM only | `dmNotes` |
| Share with phones | `shared` |
| Lore repo link | `sync` (`folder`, `path`, `sha`, `hash`, `at`) |
| Added / changed | `createdAt` / `updatedAt` |

| Category | Record |
|---|---|
| Locations | `location` |
| Dungeons | `location` with `dungeon: true` |
| NPCs | `npc` |
| Factions | `faction` |
| Events | `event` |
| Creatures, Items, Books, Notes | `lore` with `category` `creature`, `item`, `book` or `note` (any other category shows under Notes and keeps its own word) |

- Changing an entry's category to another type gives it a new ID (`npc_x` becomes `lore_x`), and every link to it in the world follows. A record with fields the Lore tab does not show (an NPC's `race`, a location's `map`) keeps its type: change that in Arthuria or the entity editor.
- Lore tab edits keep the fields the tab does not show, and leave `source` alone, so a record imported from Arthuria stays Arthuria's: it shows a 🗺 Arthuria badge and is not pushed to the lore repo.
- The tab still caps what you type at 80 characters for a name and 2,000 for the text and the DM note; a longer record from Arthuria keeps its words when edited.

## Table-only fields

`shared`, `sync` and `createdAt` mean something only at this table. They are never exported, and an import keeps the table's values.

## Export

`/api/export` carries every world record, Lore tab entries included, without the table-only fields. DM notes are included as before.

## Migration from two stores

On the first start after the merge (`worldMerged` is not set in `campaign.json`):

1. Every valid record in `data/entities.json` moves into the world. A record that never passed the schema is skipped and named in the server log; the file itself is **left on disk as it was**.
2. Every Lore tab entry in `campaign.json` becomes a record. Its old ID is kept inside the new one (`lore1abc` becomes `npc_lore1abc`), so the same entry from an older save point lands on the same record.
3. A Lore tab entry with the same type and name as a library record joins it when their words do not disagree: the entry fills the record's empty fields (its text, DM note, Share tick, repo link). If both hold different text or DM notes, both are kept as separate records, so no words are lost.
4. The old Lore tab list is copied to `data/lore-before-merge.json`, and the startup backup (`data/backups/`) holds all the files as they were before the move.

Loading a **save point from before the merge** rebuilds the world as it was then: that save point's Lore tab plus `data/entities.json`. Undo steps and save points made after the merge hold the world itself.
