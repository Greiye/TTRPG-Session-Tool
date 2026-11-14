# Code module archive

Features taken off the DM screen but kept so they can come back. Each one is a DM page module: the server
side still runs and is still tested, so restoring a feature is copying its file back to `public/js/dm/`
and adding one import line to `public/js/dm/main.js`.

| Module | What it was | Why it is here | Server side still in place |
| --- | --- | --- | --- |
| `public/js/dm/plans.js` | Session plans: import a Markdown plan, launch its scenes, NPCs and encounters | Sessions are planned on paper (Mike, Nov 14) | `src/plan.js`, `src/sockets/plans.js`, `test/plans.js`, `docs/session-plans.md` |
| `public/js/dm/intro.js` | Intro card: "Previously on…" on the TV | Too close to the epilogue and chapter cards (Mike, Nov 14) | `dm:intro` in `src/sockets/dm.js`, `introCard` in `public/stage.js` |
| `public/js/dm/epilogue.js` | Epilogue slideshow controls (were a row in the TV moments card) | Same as the intro card | `epilogueStart`/`epilogueEnd` in `src/moments.js`, TV slides in `public/moments.js` |

Nothing under `archive/` is served or loaded.
