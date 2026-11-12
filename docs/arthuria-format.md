# Data exchange with Arthuria (format v1)

Tavern Screen and Arthuria share campaign data as **one JSON file**, the *campaign bundle*. JSON Schemas live in [`schema/`](../schema/) (draft 2020-12):

| File | What it describes |
|---|---|
| `common.schema.json` | Shared parts: stable IDs, references, file paths, base entity fields |
| `entity.schema.json` | One entity: `npc`, `location`, `faction`, `event`, `lore`, or `pc` (player character) |
| `bundle.schema.json` | The whole file: entities plus embedded image files |

## Stable IDs

Every record has an ID shaped `<type>_<key>`, for example `npc_3fa94c21d0` or `location_old-mill`. An ID is never reused or changed, so importing the same record twice updates it rather than duplicating it. Arthuria can mint its own IDs in the same shape (any 4 to 40 letters, digits or dashes after the underscore). Player characters use `pc_<roster id>`.

References between records (`location`, `faction`, `parent`, `where`, `who`, `members`, `links[].to`) are IDs.

## Fields every entity has

`id`, `type`, `name` (required); `summary`, `body` (Markdown), `tags`, `image`, `links`, `source` (`tavern-screen` or `arthuria`), `updatedAt`. **`dmNotes` is DM-only**: Tavern Screen never shows it to players or the TV.

Type-specific fields:

- **npc**: `race`, `role`, `mood` (one of the 8 dialogue emotions), `hue`, `faction`, `location`, `knows[]`, `statblock`
- **location**: `region`, `parent`, `map`, `theme`, `poi[]`
- **faction**: `goals`, `members[]`
- **event**: `when` (in-world date text), `session` (real date), `where`, `who[]`
- **lore**: `category`, `secret`
- **pc**: `system`, `cls`, `race`, `level`, `player`, `catchphrase`, `hue`, `stats` (rules-system fields), `anim`
  - `status`: `alive` or `dead`. A fallen character is `dead` and keeps a `death` record: `at` (date-time, required), `cause`, `epitaph` and `session` (short text). Import sets, clears or leaves the death record by `status` (a missing `status` changes nothing).

Unknown fields are rejected, so typos surface at import time.

## Bundle

```json
{
  "format": "tavern-bundle",
  "version": 1,
  "exportedAt": "2026-11-12T03:00:00Z",
  "source": "tavern-screen",
  "campaign": { "name": "The Sunken Crossroads", "system": "dnd5e" },
  "entities": [ { "id": "npc_3fa94c21d0", "type": "npc", "name": "Mirela", "mood": "suspicious", "image": "creatures/mirela.webm" } ],
  "files": { "creatures/mirela.webm": "<base64>" }
}
```

`image` and `map` values are keys into `files`. On import, files must be PNG, JPG, WebP, GIF or WebM, the bytes must match the extension, and each file is capped at 20 MB.

## Endpoints (DM only: the laptop itself, or `?key=DM_KEY` / `x-dm-key` header)

| Method | Path | Does |
|---|---|---|
| GET | `/api/export` | Download the bundle. `?notes=0` leaves out `dmNotes` (to share with players). |
| POST | `/api/import` | Upload a bundle (JSON body). Upserts by ID. Returns `{ entities, characters, skipped[] }`. |
| GET | `/api/transcript.md` | The session log as a Markdown script: scenes, NPC lines with emotion, player lines, rolls. DM-only and private entries are left out. |

Socket events for the DM UI: `dm:entity:save` (acks `{ id }` or `{ error }`) and `dm:entity:delete`. The DM's state includes `entities`.
