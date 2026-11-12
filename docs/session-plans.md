# Session plans (Markdown format)

Write a session plan as plain Markdown, import it on the DM page (**Session plans** card), then launch each
scene, NPC or encounter with one click during play. Nothing launches on import.

## Sections

| Heading | Becomes | Body |
|---|---|---|
| `# Title` | plan name (optional, once) | — |
| `## Scene: Name` | a scene on the TV (title, read-aloud text, fog-of-war points) | paragraphs = read-aloud text; `- ` bullets = points of interest (max 8) |
| `## NPC: Name` | the NPC speaking in the dialogue box | `- emotion: happy`, `- hue: 28`, `- line: opening words`, `- choice: option` (max 4); other bullets and paragraphs = DM notes |
| `## Encounter: Name` | enemies added to the combat list | one foe per bullet: `- 3x Goblin (hp 7, ac 15, atk 4, dmg 1d6+2, side enemy)` |

## Rules of thumb

- Heading words are case-insensitive. The colon is optional: `## Scene Name` works too.
- Headings that are not Scene, NPC or Encounter are skipped, and the import reports them.
- Foe count is optional (`- Goblin` = 1). Use `3x` or `3 ` before the name. Counts cap at 12.
- Foe stats are optional; defaults are hp 10, ac 12, atk +3, dmg 1d6+2, side enemy.
  Keys: `hp`, `ac`, `atk` (a leading `+` is fine), `dmg` (for example `2d6+3`), `side` (enemy, ally or neutral).
  `cr` (for example `1/4` or `3`) sets the challenge rating used by the danger check. Without it, the check estimates CR from hp.
- Each encounter shows how dangerous it is for the characters at the table (Trivial to Deadly, 5e XP rules).
  Launching a Deadly encounter asks for confirmation first.
- Unknown emotions and unreadable foe lines are reported as warnings, not errors.
- Limits: 200 KB file, 40 sections of each kind, 20 foes per encounter.
- Shops are not in this format yet; they come later.

See `docs/sample-session.md` for a full example.
