# Lore sync

The Lore tab (📚) keeps step with Mike's lore repo, [Greiye/Artheria.ES.3D.Lore.Game](https://github.com/Greiye/Artheria.ES.3D.Lore.Game). It uses the same connection as the Creature Designer (Planning › 🐉 Creatures › wiki settings): a fine-grained GitHub token with Contents read and write on the lore repo, or Folder mode pointed at a local clone (for example `Documents\GitHub\Artheria.ES.3D.Lore.Game`, then commit and push with GitHub Desktop).

## Pull (⤓ Pull lore repo)

| Folder in the lore repo | Lands in |
|---|---|
| `content/lore/*.md` (red books) | Locations if tagged `place`, `town`, `city`, `village`, `region` or `start-area`; Dungeons if `dungeon`, `ruin` or `cave`; NPCs if `character`, `npc` or `villain`; Creatures if `creature`; Items if `item` or `artifact`; else Books |
| `content/artifacts/*.md` | `type: character` becomes an NPC; songs, food and art follow the tags above, else Notes |
| `content/table/*.md` | the `cat:` the page names |

- The entry's name is the page `title`; its text is the page body without the `# Title` line, cut to 2,000 characters.
- An entry with the same name and category that has no page yet gets linked to the page, and keeps its DM note.
- A page that has not changed since the last sync is skipped. A page that changed while its entry was also edited at the table keeps the table's words; the message lists it.
- Pull never changes DM notes or the Share tick. Creature pages (`content/creatures/`) stay with the Creature Designer, which has its own Pull and "To lore".
- Files starting with `_` and `README.md` are skipped.

## Push (⤒ Push to lore repo)

- Writes every entry made or changed at the table to `content/table/<name>.md`, one commit per page. The button shows how many wait.
- Entries that came from `content/lore/` or `content/artifacts/` are never written: edit those books in the lore repo, then pull. Records imported from Arthuria are not written either.
- DM notes and the Share tick never leave the laptop.
- A page changed on GitHub since the last sync is not overwritten; the DM is asked first.
- The lore game's build reads only `content/lore/` and `content/artifacts/`, so a pushed page can never break its deploy. To turn a table page into a library book, move it to `content/lore/` and give it `type: lore`.

## Page format (`content/table/`)

```markdown
---
title: "Old Tom"
contributor: "mike"
credit_as: "Mike"
created: 2026-11-19
type: table
cat: npc
tags: [npc, table]
game_id: lore1abc
---
# Old Tom

A ferryman on the Lyal. Charges a song.
```

`cat` is one of `location`, `dungeon`, `npc`, `faction`, `event`, `creature`, `item`, `book`, `note`. `game_id` is the entry's stable world ID (`docs/world-store.md`). Pages can be edited by hand on github.com; the next pull brings the change in.

Entries are world store records (`docs/world-store.md`); the page link is the record's `sync` field.

Code: `src/lorebook.js` (sync), `src/wiki.js` (GitHub or folder), `src/sockets/lore.js`, `public/js/dm/lore.js`. Tests: `test/lore-sync.js`, `test/lore-sync-ui.js`.
