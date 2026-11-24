# AI Text RPG spec v2, merged

Mike uploaded "AI Text RPG Project Spec v2" on Nov 24 and asked to merge it with this project's plan, not build it.
That spec describes a single-player web app where an AI is the game master, with one chat feed as the whole
game. Tavern Screen is a live in-person tool: the laptop runs the game, phones and the TV are windows into one
shared world, the human DM keeps secrets and pacing, and the tool automates bookkeeping, never judgment.

So this file takes the spec's ideas one by one and marks each against what already exists:

- **Built**: the tool already does this (where it lives is named).
- **Partly**: some of it exists; the missing part is in the backlog.
- **New**: not built; added to `docs/backlog.md` as PR AC or PR AD.
- **Not adopted**: conflicts with how this table plays, with a one-line reason.

Nothing in the spec is copied over as-is. Pixel values, colours and the AI prompt text are left out; this project
already has its own look (parchment theme, `public/theme.css`) and its own rules (`src/rules/`).

## Refactor protocol (spec section 0)

| Spec idea | Status | Where, or why |
|---|---|---|
| Codebase inventory first (`CODEBASE_MAP.md`) | Built | `docs/module-graph.md` from real imports, `npm run graph`, kept fresh by `test/module-graph.js` |
| Duplication audit (`DUPLICATION_REPORT.md`) | New | PR AC: a tool that lists near-duplicate code, and a report of what should merge |
| Ordered refactor plan, each step testable and revertible | Partly | `docs/improvement-review.md`, `docs/studio-review.md`; one PR per change, tests in `test/run.js`. PR AC adds the merge steps the audit finds |
| Approval before touching save format or sync | Built | Standing rule: save migrations and `src/visibility.js` changes get a test; see `CLAUDE.md` |
| Preserve behaviour, no feature loss, delete dead code only when proven unused | Built | `CLAUDE.md` rules, full unit and UI suites in CI |
| Profile before optimising (render time, message size, dice frame rate, audio latency) | Partly | Open PR #157 measures socket payloads. PR AC adds dice and TV frame-rate checks |
| Optimise hot paths only, keep motion tokens | Partly | See Motion below |

## Shared systems (spec section 2)

| Spec idea | Status | Where, or why |
|---|---|---|
| Layout and theme tokens | Partly | `public/theme.css` palette and one "dark surface" list; contrast checked by `test/contrast-ui.js`. The spec's dark slate colours are not adopted (parchment theme stays) |
| Motion tokens: one easing, three durations, reduce-motion fallback | Partly | Motion setting and `Settings.reducedMotion()` in `public/settings.js`, shared animations in `public/anim.js`. But the CSS has 22 different easings. PR AC folds them into a few tokens |
| One event type for everything (FeedItem) | Partly | `state.log` lines plus the append-only Storybook journal (`src/storybook.js`). One chat feed as the game is not adopted (see below) |
| One Card component with variants | Partly | Item cards (PR #143), creature cards, gold roll pop-up (`public/rollpop.js`). PR AD adds flip cards for abilities, reusing the item card |
| One Modal shell | Partly | Shared slide-in dialogs and `public/js/dm/dgwindow.js` windows. PR AC audits the remaining one-off pop-ups |
| One RollEngine and one result card | Built | `src/dice.js` + `src/rolls.js` for every roll (checks, saves, attacks, damage, roll calls), TV pop-up `public/rollpop.js`, 3D tray `public/dice3d.js`, dice log |
| HP bar | Built | Party bar on the TV, hero card on phones, HP number or description setting |
| One Snapshot for redo and rewind | Built | One-tap Undo and Redo (`src/undo.js`, 15 steps of the whole table), named save points and startup backups (`src/saves.js`) |
| Version history of a generated message (v1, v2, v3) | Not adopted | Nothing is generated; the DM speaks. Undo covers a wrong tap |
| One Character record | Built | `src/sheet.js` (stats, HP, abilities, spells, inventory, special moves), DM-only fields stripped in `src/visibility.js` |
| Key Bank: skills tied to a profession, quick buttons, DM one-click rolls | Partly | Skills come from the rules system; roll calls and the check library roll them; PR Y plans profession kits. PR AD adds phone quick-roll buttons and a profession key bank in the rules file |
| Abilities as cards with uses, range, duration | Partly | Features and spells on the phone Sheet and Spells tabs. PR AD adds flip cards |
| NPC memory ("Memory recalled") | New | PR AD: when a conversation opens, the DM sees what that NPC and those players last did together, from the Storybook journal. No AI |
| Voice profile per NPC | Partly | NPC speech styles (font and colour, `src/speech.js`) and languages. TTS voice is PR AD |
| One Action resolver for every input | Partly | Phones act through roll calls, the strike pop-up, special moves, item use and shops; speech goes to the DM in person. A typed chat box is not adopted |
| Optional message with an item or target | New | PR AD: an optional short battle cry with a strike, shown on the TV with the roll |
| Every option has an explanation | Partly | Tooltips on most DM controls. PR AD adds one-time tips on phones |
| One AudioBus with music, ambient and narration | Partly | `public/audio.js` (two music decks with crossfade, ambience layers, SFX, master volume) and the Soundscape tool (`src/soundscape.js`). Narration is PR AD |
| Ambient layers follow place, time and weather | Partly | Soundscape environments and the shared weather slider. PR AD makes night layers follow the story clock |
| Audio only after a user gesture, mute persists | Built | TV and phones unlock audio on first tap |
| Motion: pop-in sprites, card flip, drag-to-roll die, Ken Burns, processing indicator | Partly | Pop-ins and sprite animations (`public/anim.js`), hold-to-roll initiative, strike gestures. PR AD adds drag-to-roll and a slow backdrop drift; the "AI is thinking" indicator is not needed |
| One map engine, three views | Built | World map (`src/worldmap.js`), 3D isometric battle map with overhead view and compass (`lib/iso-battle/`), dungeon pop-up |
| Battle map ready before combat, enemies placed on spawn | Built | Battle map Generate and the token tray; DM can still drag any token |
| Location card with banner | Built | World map place cards and town nodes |
| Nearby places sorted by distance | New | PR AD: phone map lists known places by travel legs from the party |
| Wiki ordered smallest to largest | Partly | Lore tab and creature wiki (`src/wiki.js`, lore repo). PR AD adds a sort by scale |
| Settings store | Built | `public/settings.js`: text size, colours, Motion, dice tray, HP display, gestures and more, per device in `localStorage`, table settings from the DM |
| Show hidden dice, show DM thoughts | Partly | Secret DC hides pass/fail from the table; DM sees everything. A "thoughts" row is not needed |
| Custom instructions | Partly | House rules (`src/houserules.js`) and the rules file are this table's version |
| Pacing: Adventure or Downtime | Partly | Downtime mode, camp and rests exist. An encounter-rate dial is not adopted: the DM decides encounters |
| Sync over WebSocket, presence, shared state | Built | Socket.IO, `broadcast()` in `src/state.js`, per-viewer state in `src/visibility.js`, Reconnecting pill |

## Screens (spec section 3)

| Spec idea | Status | Where, or why |
|---|---|---|
| Social scene with sprites popping in, active speaker bright | Built | Visual-novel social on the TV, emotion buttons, join circle, speaker focus |
| Combat started from chat | Not adopted | The DM starts combat with one tap; there is no chat |
| Attack builder (melee, ranged, spell, modifiers, favourites) | Partly | Strike pop-up with named special moves and one-tap attacks. A full builder adds screens players do not need at the table |
| Target selection, enemies and allies apart | Built | Strike pop-up target pick |
| Tutorial on first use | New | PR AD: one-time tips on the phone the first time a player sees each tab |
| Ability check card with drag-to-roll die | Partly | Roll calls on phones and the TV pop-up. Drag-to-roll is PR AD |
| Landing page with Google and Apple sign-in and a Terms gate | Not adopted | No accounts: friends join by QR on the LAN |

## Not adopted

| Spec idea | Why not |
|---|---|
| AI as game master (MessageProducer, AI turns, AI drafts for the DM) | The human DM runs the game; the tool automates bookkeeping, never judgment |
| Stealth DM takeover (DM poses as the AI, no signal to players) | There is no AI to pose as, and the DM is at the table. The existing takeover (`src/control.js`) is open: the DM plays a character for an absent player |
| One chat feed as the whole game | In-person play happens out loud; the TV, phones and DM screen each show what they need |
| Typed free-text actions and suggested phrases | Players speak to the DM; typing slows the table |
| Redo an AI turn with new rolls, rewind with message truncation | Nothing is generated; Undo, Redo and save points already cover mistakes |
| GM tiers, paid "Freedom Pass", model choice | No AI and no payments; friends-only tool |
| Google and Apple sign-in, Terms of Use, landing page | No accounts or public release (see `docs/studio-review.md`) |
| AI scene image generation | Mike makes or picks his own art; backdrops are uploads |
| Encounter-rate pacing driven by AI | Judgment stays with the DM |
| Spec colour values, column widths and font sizes | The parchment theme and contrast test already set the look |
| `CODEBASE_MAP.md` as a hand-written file | `docs/module-graph.md` is generated from the code, so it cannot go stale |

## Where the new items went

- PR AC (code health, no behaviour change): duplication audit and report, motion tokens, one dialog shell, dice and TV frame-rate checks.
- PR AD (table play): profession key bank and phone quick rolls, flip ability cards, drag-to-roll die, NPC memory from the journal, optional battle cry, nearby places by distance, lore sorted by scale, one-time phone tips, night ambience from the story clock, backdrop drift, NPC voices read aloud.

Both are in `docs/backlog.md`, marked Not built.
