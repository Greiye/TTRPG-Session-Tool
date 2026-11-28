---
name: run-tavern-screen
description: Run, start, launch, drive, or screenshot Tavern Screen (the TTRPG session tool) - boot the server on a throwaway data dir, open the DM, TV and phone pages in headless Chromium, join a player, switch exploration/social/combat, take screenshots, or call internal modules directly. Use to see a change working in the real app, not just in tests.
---

# Run Tavern Screen

Node 22 server (`server.js`) with three browser surfaces: DM page `/dm`, TV page `/screen`, phones `/play`.
The agent path is `driver.mjs` in this folder: it boots the server on a temp `DATA_DIR`, opens DM + TV
(and phones on demand) in headless Chromium via the container's global Playwright, and reads one command
per line from stdin. Paths below are relative to the repo root.

**Never point anything at the real `data/` or `uploads/`** (on Mike's laptop they are the campaign). The
driver and every command below use a temp dir.

## Setup

```bash
npm ci
```

Playwright is preinstalled globally in the cloud container (`require('playwright')` resolves via
`NODE_PATH`); do not `npm install` it or run `playwright install`.

## Run (agent path): the driver

```bash
OUT=/tmp/shots node .claude/skills/run-tavern-screen/driver.mjs <<'EOF'
join Thorn
emit dm:worldmap:show {"on":false}
mode social
click dm #convoPool [data-pool="pool-albert"]
hold dm 1200 #convoStart
wait tv .vn
emit dm:emotion {"emotion":"angry"}
wait tv .vn-box
state
ss tv tv-social.png
mode combat
emit dm:combat:start
ss tv tv-combat.png
ss Thorn phone-combat.png
errors
quit
EOF
```

Then Read the PNGs in `$OUT` (default `./shots`) and actually look at them. Exit code is 1 if any
command failed. Startup takes ~3 s; the whole script above ~15 s.

Commands (`page` = `dm`, `tv`, or a phone's name from `join`):

| Command | Does |
|---|---|
| `join <name> [class]` | opens an iPhone 13 page, joins the room as a new character |
| `mode <exploration\|social\|combat>` | clicks the real DM mode button, waits for it to light |
| `emit <event> [json]` | emits from a Node-side DM socket (any `dm:*` in `src/sockets/*.js`), prints the ack |
| `click/wait <page> <selector>` | Playwright click / waitForSelector (8 s) |
| `fill <page> <selector> <text>` | fill an input |
| `hold <page> <ms> <selector>` | press and hold (Start conversation 1 s, sheet features 3 s, initiative 3 s) |
| `eval <page> <js>` | evaluate in the page, prints JSON. DM page has a global `socket` |
| `ss <page> [file]` | screenshot into `$OUT` |
| `state` | mode, players, NPC + emotion, combat on/off (from the latest DM `state` broadcast) |
| `errors` | page errors and console errors seen so far |
| `quit` | closes browser, stops server, deletes the temp dir (`KEEP=1` keeps it) |

Selectors may contain spaces (everything after the page/ms is the selector). For interactive use, run the
driver in tmux and `send-keys` lines; it prints `> ` when ready for the next one.

## Direct invocation (PRs that touch `src/` internals)

Most PRs change a module in `src/`. Call it without the app, with a temp data dir (requiring
`src/config.js` without `DATA_DIR` creates `data/` in the repo):

```bash
T=$(mktemp -d) && DATA_DIR=$T/data UPLOAD_DIR=$T/up node -e "
const dice = require('./src/dice'); console.log(dice.parse('2d6+3'));
const { state } = require('./src/state'); console.log('mode', state.mode);
"; rm -rf $T
```

## Test

```bash
node test/run.js smoke ui     # named scripts only (~27 s for these two)
npm test                      # all unit + socket scripts
npm run test:ui               # all browser scripts
```

`test/run.js` gives every script its own temp `DATA_DIR`. Add new scripts to `UNIT` or `UI` in it.

## Run (human path)

```bash
T=$(mktemp -d) && DATA_DIR=$T/data UPLOAD_DIR=$T/up PORT=3999 HTTPS_PORT=4443 LOBBY=0 npm start
```

Prints the DM/TV/phone URLs and the room code; `curl localhost:3999/api/join-info` returns
`{"room":..,"url":..}`. HTTPS on `HTTPS_PORT` uses a self-signed cert written to `$DATA_DIR/certs`.
On Mike's laptop it's plain `npm start` (real data, `localhost:3000/dm`). Ctrl-C to stop.

## Gotchas

- **The TV opens with a "Project stats" card for 12 s** (`#tvStats`, `public/screen.html`) covering the
  whole screen. The driver clicks it away; your own scripts must too, or every early TV screenshot is that card.
- **Social mode on the TV still shows the world map** until `dm:worldmap:show {"on":false}`. After that it
  shows "A conversation is about to begin…": the visual novel (`.vn`) appears only after the DM picks an
  NPC in `#convoPool` and **holds** `#convoStart` for 1 s. A click does nothing.
- **`LOBBY=0 TEST_MODE=0`**: without them the server starts in the lobby screen and with test mode (fake
  party) on. The driver sets both, plus `HTTPS=0` and `DM_KEY=dmkey`.
- **Not every `dm:*` handler acks.** `dm:mode`, `dm:emotion`, `dm:combat:start` don't; `emit` gives up
  after 1.5 s and prints `"(no ack)"`. That is not a failure: check with `state` or `wait`.
- **A DM socket waiting for `state` hangs if nothing changes** (the server only broadcasts on change). The
  driver keeps the last broadcast instead of waiting for the next one.
- The server writes its save on SIGTERM; delete the temp dir only after the process exits, or `rm` fails
  with `ENOTEMPTY` (the driver waits for exit).
- Ports 5060/5061 are on fetch()'s bad-port list; the driver's random port skips them.
- Google Fonts fail offline: console errors for `fonts.g…` are filtered from `errors`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Every command after one hangs, then `Target page, context or browser has been closed` | the shell `timeout` killed the run during a stuck step; look at the step before (usually waiting on a state that never changes) |
| `ERR page.waitForSelector: Timeout 8000ms exceeded` on `wait tv .vn` | conversation not started: worldmap off, pick an NPC, `hold dm 1200 #convoStart` |
| TV screenshot is a parchment "Project stats" table | stats card not dismissed (see Gotchas) |
| `Error: ENOTEMPTY ... rmdir .../data` on quit | server still flushing; wait for its exit before deleting |
