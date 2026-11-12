# Backlog

- **Phone 3D dice roll (optional):** show a 3D dice animation on phones. Keep it off by default; use the existing 2D roll as the fallback.
- **TV version label and project stats pop-up:** added in this change. Stats are in `public/devstats.json`.
- **Event log flashes on every update:** `stage.js` re-renders the whole log, so each `.log li` replays its `slidein` animation. Fix: animate only new entries (track the last rendered id), or keep existing DOM nodes.
- **Hide or minimize the action log (DM, phone, TV):** not built. Only text size, colors and motion exist in Display settings. Add a show/hide toggle per screen, saved on the device, and a TV setting from the DM.
