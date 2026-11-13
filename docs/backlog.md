# Backlog

- **3D dice roll on the TV (optional):** show a 3D dice animation on the TV screen only, not on phones. Keep it off by default; the existing 2D roll stays as the fallback.
- **TV version label and project stats pop-up:** added in this change. Stats are in `public/devstats.json`.
- **Event log flashes on every update:** `stage.js` re-renders the whole log, so each `.log li` replays its `slidein` animation. Fix: animate only new entries (track the last rendered id), or keep existing DOM nodes.
- **Hide or minimize the action log (DM, phone, TV):** not built. Only text size, colors and motion exist in Display settings. Add a show/hide toggle per screen, saved on the device, and a TV setting from the DM.

## TV plan
- 3D dice roll on the TV screen (optional, above).
- Version label and stats pop-up: done in PR #35.
- Action log: animate new entries only (done in this PR); per-screen hide setting (done in this PR).
