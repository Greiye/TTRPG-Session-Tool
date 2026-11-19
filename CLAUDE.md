# CLAUDE.md

Tavern Screen: a Jackbox-style tabletop tool for one group of friends at one table. The laptop runs the
server (Node 22, Express 4, Socket.IO 4) and shows the TV page; phones join over LAN by QR. Not a
public product: no accounts, scaling or store work.

## Run and test

- `npm start` (DM at `http://localhost:3000/dm`, TV at `/screen`, phones at `https://<lan-ip>:3443/play`).
- `npm test`: unit and socket tests through `test/run.js` (prints every failure, then a summary).
- `npm run test:ui`: browser tests in headless Chromium (needs `playwright`; CI installs it).
- Re-run only what failed: `node test/run.js <name> <name>`. One script alone: `node test/<name>.js`.
- `npm run doctor` (game-night check), `npm run backup` (zip of `data/` and `uploads/`),
  `npm run bots -- 4` (fake phones), `npm run scenario`, `npm run record` / `npm run replay`.
- After changing `lib/iso-battle/src/`, rebuild the 3D map bundle: `npm run build:iso`.

## Rules for every change

- **Never touch the real `data/` or `uploads/`.** On Mike's laptop they are the campaign. Tests get a temp
  `DATA_DIR`/`UPLOAD_DIR` (`test/run.js`, `test/helpers.js`, and `src/config.js` for scripts under `test/`).
  Spawned servers must pass their own temp `DATA_DIR`.
- **Every automated result gets a one-tap DM override.** Automate bookkeeping, never judgment.
- **System-agnostic.** Mike is making his own system (Daggerheart + 5e + homebrew). No 5e-only rules in
  shared code; rules go through `src/rules/`. Condition names and sizes stay editable.
- **Secrets stay DM-side.** All state goes out through `src/visibility.js` (per viewer: dm, codm, player,
  screen, guest). New DM-only fields must be stripped there, with a test.
- Animate where it makes sense, and respect the Motion setting (Reduce stops animations).
- Plain, short UI text. No inventory weight, no player emoji reactions on the TV, no whispers or table log.

## Where things live

- `server.js` boots; `src/state.js` holds the one shared state and `broadcast()`; `src/store.js` saves it
  (debounced atomic JSON writes, `data/campaign.json`); `src/saves.js` save points and startup backups.
- Socket handlers: `src/sockets/*.js` (guarded; one throw never ends the process, see `src/safety.js`).
- Storybook: `src/storybook.js` (append-only session journal in `data/sessions/`, Keep star), `src/storypack.js`
  (story pack zip), viewer `public/story.html` + `public/js/story.js`. New TV moments or mood fields go there too.
- HTTP routes: `src/routes.js`. Front end: plain ES modules, no build step, `public/js/{dm,play}/`,
  pages `public/{dm,screen,play,codm}.html`.
- Decisions: `docs/decisions.md`. Plans not yet built: `docs/backlog.md`. Reviews:
  `docs/studio-review.md`, `docs/improvement-review.md`.

## Tests

- Add a test for every feature or fix and list it in `UNIT` or `UI` in `test/run.js`.
- Browser tests: **wait for the thing, never a fixed time.** Use `page.waitForSelector`,
  `page.waitForFunction` or `h.until(() => …)` on the state or DOM you need. A fixed wait is only for
  "nothing should happen" checks, and must say so in a comment. Fixed sleeps are what made the UI job
  flaky on busy CI runners.
- A red CI run is a bug to fix, not a flake to re-run.

## Changelog

- `CHANGELOG.md` follows Keep a Changelog. Add a line under `## [Unreleased]` for every change.
- Releases: bump `package.json` `version`, rename Unreleased to `## [x.y.z] - YYYY-MM-DD`, tag `vX.Y.Z`.
- Commit trailer: `Co-Authored-By: Claude <noreply@anthropic.com>` (no model name).
