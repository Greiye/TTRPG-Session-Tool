# Exports: turning sessions into art, music, animation and comics

Status: design only, nothing built yet (Mike, 2026-11-16).

Mike's goal: the tool should become an inspiration tool. After a session, his artistic friends should be able to pick up what happened at the table and make art, music, animations and comics from it.

Scope: a small friends group, one table, one laptop. Exports are files on the laptop that the DM shares by hand (group chat, a shared drive, a USB stick). No accounts, no public links, no uploads to any service.

## What the game already has

These exist today and are the raw material for exports:

| Source | Where | Notes |
|---|---|---|
| Session log | `state.log`, `src/state.js` | Kept to the last 80 entries, so it is not a full session record |
| Transcript, script, recap | `/api/transcript.md`, `/api/script.md`, `/api/recap.md` (`src/bundle.js`) | Markdown. Already skip entries that are not visible to everyone |
| Campaign bundle | `/api/export` (`docs/arthuria-format.md`) | JSON for Arthuria. Includes `dmNotes` unless `?notes=0` |
| Backdrops, portraits, creature art, maps, audio | `uploads/` (`src/assets.js`) | PNG, JPG, WebP, GIF, WebM, MP4, MP3, OGG, WAV and more |
| Layered sprites | `src/layered.js` | Shared sets plus per-character layers, 512 px |
| NPC dialogue with emotion | log entries of kind `npc` with `emotion` (8 emotions in `src/cast.js`) | The visual novel beats |
| TV moments | `src/moments.js` | Chapters, entrances, quote wall, relics, journal book, epilogue slides |
| Atmosphere | `state.audio`, `state.weather`, story clock (`src/clock.js`) | Music track, overlays, weather kind and intensity, time of day |
| Party trail | `src/trail.js` | Places the party actually stood on |
| Legends | `src/legends.js` | Hall of fame, best kill, worst plan, trophies with their story |
| 3D battle map | `lib/iso-battle` | WebGL renderer already uses `preserveDrawingBuffer`, so a snapshot is one `toBlob` call |
| NPC voice clips | `public/stt.js` | DM mic recordings with transcript, already downloadable per clip |

Two gaps matter for exports:

1. **The log forgets.** Only 80 entries are kept. Exports need a full, append-only record of the session.
2. **Nothing marks a moment as worth keeping.** The DM has no way to say "this one" during play.

## The foundation: session journal and Keep button

Everything below reads from one new record, so build this first.

**Session journal.** An append-only file per session (`data/sessions/<date>/journal.jsonl`, one JSON object per line). Every log entry, TV moment, mode change, emotion change, music change, weather change, clock step and dice result is written to it, with:

- `t` (time), `kind`, `text`, `who`
- `scene` (title and backdrop file), `mode` (exploration, combat, social)
- `mood`: NPC emotion, weather kind and intensity, time of day, music track name
- `vis`: the same visibility value the log already uses
- `kept`: true when the DM pressed Keep

**Keep button.** A star on the DM page (and a keyboard key) that marks the last thing that happened as a moment. One tap, no dialog. A nat 20, a TV moment, a relic reveal and a fight's last blow are kept automatically; the DM can un-keep any of them with one tap, in line with the "every automated result gets a one-tap DM override" rule.

**Snap.** When something is kept, the laptop also saves a still of the TV (see export 4) and of the 3D battle map if it is open. These become reference images for artists.

## DM control: what leaves the table

The DM decides what goes out. The rules are simple:

1. **Only what the table saw.** An entry goes out only if its `vis` is `all` (or missing). DM-only and private entries (whispers, secret objectives, notices sent to one character) stay out. This is the rule `transcript()` already follows.
2. **Secrets stay out until revealed.** Unrevealed relics, covered points of interest, unrevealed dungeon rooms, hidden town nodes and lore marked secret are left out. Once revealed at the table, they can go out.
3. **DM-only fields never go out.** `dmNotes`, character `secret` and `hooks`, enemy stat fields and everything in `FIELD_RULES` (`src/visibility.js`) are stripped, with no switch to include them. The campaign bundle keeps its own `notes` switch for Arthuria; exports for friends do not.
4. **Review before it leaves.** At End Session (or any time from a Logs menu), the DM gets a Pack screen: the list of kept moments with checkboxes, all ticked by default, plus a few switches. Press Pack, and the files are written to a folder on the laptop and opened.

Pack screen switches (all with plain labels, no colour codes or hex values shown):

- Use real player names (off by default; character names only)
- Include NPC voice clips (off by default)
- Include music track names (on) and music files (off, see Privacy)
- Include dice numbers (on)

## Export formats

| What | Format | Why |
|---|---|---|
| Stills (TV, battle map, portraits, backdrops) | PNG for crisp art and UI, WebP for small files | Every art app opens PNG; WebP keeps the folder small |
| Short clips (TV moments, animated portraits) | WebM (VP9) from the browser; MP4 where the browser can record it | Chrome records WebM natively and recent versions record MP4. No ffmpeg on the laptop is assumed |
| Audio (voice clips, ambience) | WebM or OGG (Opus) as recorded; WAV on request | MediaRecorder gives Opus. WAV can be written in plain JS from the decoded audio for musicians who want lossless |
| Logs and scripts | Markdown | Already used for transcript, script, recap. Readable anywhere |
| Machine data (moments, mood timeline, panels) | JSON, plus CSV for the mood timeline | JSON for tools and scripts; CSV opens in a spreadsheet or a DAW marker import |
| Comic panels | `panels.json` plus a printable HTML storyboard (print to PDF) | See export 2 |
| Everything together | A folder, optionally zipped | Zipping needs a small library; a folder works with no new dependency |

### Comic-friendly panel format

One file per session, `panels.json`:

```json
{
  "title": "The Mill at Dusk",
  "session": "2026-11-16",
  "pages": [
    {
      "panels": [
        {
          "id": "p1",
          "shot": "wide",
          "scene": "Old Mill",
          "image": "stills/0412-tv.png",
          "time": "dusk",
          "weather": "rain, heavy",
          "caption": "The rain had not stopped for three days.",
          "bubbles": [
            { "who": "Greer", "emotion": "suspicious", "text": "You're late." }
          ],
          "sfx": "CRACK"
        }
      ]
    }
  ]
}
```

- One kept moment becomes one panel. Narration becomes `caption`, NPC and player lines become `bubbles` with the speaker's emotion, a crit or a big hit gets a short `sfx` word.
- `shot` is a hint (`wide` for a new scene or chapter card, `close` for a dialogue line, `action` for a combat beat). The comic maker is free to ignore it.
- Pages are split every 4 to 6 panels and at every chapter card.
- The storyboard HTML lays the panels out on pages with the still in each box and the text below, so a friend can print it and sketch over it.

## Export flows, by craft

### Artists (illustration, portraits, character art)

What they get: the session's kept stills, the backdrops and portraits used, and a **character reference sheet** per hero and per NPC who appeared: portrait, layered sprite parts, the character's colour as a name ("ember red", not a colour code), catchphrase, the emotions they showed this session, and their best quotes.

Flow: DM presses Pack, ticks "Art", and sends the `art/` folder to the artist.

### Musicians (soundtrack, themes, ambience)

What they get: a **mood timeline**, minute by minute: mode (exploration, combat, social), NPC emotion, weather, time of day, which music track was playing, and an intensity number (higher in combat, at low HP, at a crit). Plus a cue sheet in Markdown ("12:40 Combat starts in the rain at dusk, track: Storm Drums") and each character's theme name.

Flow: DM presses Pack, ticks "Music", and sends `music/timeline.csv` and `music/cues.md`. CSV markers line up with a recording of the session if the friend wants to score it.

### Animators (motion, short clips)

What they get: short TV clips of kept moments (WebM or MP4), the animated portraits and creature loops already uploaded, the 3D battle map stills at each kept combat beat, and a beat list in JSON (who moved, who hit whom, roll results, emotion changes) that can drive a storyboard or an animatic.

Flow: TV recording runs only while the DM has it on (a Record toggle on the DM page). Kept moments cut the last few seconds into a clip. DM presses Pack, ticks "Animation".

### Comic makers

What they get: `panels.json`, the printable storyboard, the stills each panel points at, and the script (`/api/script.md` already reads like a comic script).

Flow: DM presses Pack, ticks "Comic", reorders or drops panels on the Pack screen if they want, and sends the `comic/` folder.

### Everyone: the session story pack

One folder that has all of the above, with a short `README.md` that says what each file is for. This is what most sessions will produce.

```
session-2026-11-16-the-mill-at-dusk/
  README.md
  story/recap.md, script.md, transcript.md
  moments.json
  art/stills/, art/portraits/, art/backdrops/, art/characters/<name>.png and .md
  music/timeline.csv, music/cues.md
  animation/clips/, animation/beats.json, animation/battle/
  comic/panels.json, comic/storyboard.html
```

## Privacy and friends-only scope

- Files stay on the laptop until the DM shares them by hand. No cloud upload, no share links, no public gallery.
- Character names by default. Real player names (used by Legends) only if the DM ticks the switch.
- Voice clips are the DM's own voice; still off by default.
- Uploaded music may be someone else's work. The pack lists track names and cue times by default, not the music files, so it is safe to pass around the group.
- Secrets and DM-only fields follow the DM control rules above, with no override.
- No accounts, no consent forms. If a player asks not to be in the art, the DM unticks their moments on the Pack screen.

## Prioritised exports

Effort: S is about a day, M a few days, L a week or more, for one PR each.

| # | Export | For | Effort | Depends on |
|---|---|---|---|---|
| 1 | Session journal, Keep button and the story pack (Markdown, `moments.json`, art files used) | Everyone | M | nothing |
| 2 | Comic panel pack (`panels.json` and printable storyboard) | Comic makers | M | 1 |
| 3 | Mood timeline and cue sheet (CSV, Markdown) | Musicians | S | 1 |
| 4 | Snap stills of the TV and the 3D battle map at kept moments (PNG, WebP) | Artists, comic makers | S for the battle map, M for the TV | 1 |
| 5 | Character reference sheets (PNG plus Markdown) | Artists, animators | S | 1 |
| 6 | World map with the party trail (PNG) | Artists, comic makers | S | none |
| 7 | TV moment clips (WebM, MP4 where available) | Animators | L | 1, 4 |
| 8 | Dice and combat highlights (beat list JSON, highlight cards) | Animators, comic makers | S | 1 |

### Notes on effort

- **TV stills and clips.** The TV is a web page, not one canvas, so it cannot be grabbed with `toBlob`. Two options: the browser's screen capture (`getDisplayMedia`), which asks once per session and then records the TV tab as WebM, or a headless browser on the laptop that replays the moment. Screen capture is simpler and matches what the friends saw, so it is the suggested route. The 3D battle map is already a WebGL canvas with `preserveDrawingBuffer`, so its stills are cheap.
- **Full journal.** Writing JSON lines to disk is cheap. It must also capture events that are not log entries today (music, weather, clock, emotion changes), which means a small hook in the socket handlers.
- **System-agnostic.** Exports describe what happened (who, what, how it felt), not rules. Dice results are kept as numbers and labels, never as 5e-specific fields, so Mike's own system works the same way.

## Suggested first export

**Export 1: the session journal, the Keep button, and a basic story pack.**

It is the foundation every other export reads from, it fixes the 80-entry log limit, and on its own it already gives every friend something useful: a folder with the recap, the script, the kept moments with their mood, and the art that was on screen. Exports 2, 3, 5 and 8 then become small additions that read the same journal.

## Open questions for Mike

- Should Keep live on the DM page only, or also on the co-DM page?
- Should players be able to suggest a moment from their phone (a "that was great" tap the DM can accept)? This fits "spectators suggest but don't decide".
- Is a shared drive folder the usual way the group passes files around, or a group chat?
