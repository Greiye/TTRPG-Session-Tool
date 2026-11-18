# Improvement review, 18 Nov 2026

Reviewed at `main` d0c0b8f (after PR #143). Scope: friends-only, one table, laptop is the server.
This does not repeat the 40 findings in `docs/studio-review.md`; it lists what is still open from it
and what is new.

**State today:** about 23,000 lines of app code (80 server modules, 75 front-end modules), 89 test
scripts (7,400 lines). `npm test` passes and takes 2 m 50 s. 420 commits, all in November. 7 of the last
40 CI runs were red, mostly browser-test flakes, one of them on `main`.

**The short version:** the code is in good shape for its age. The biggest risk is no longer a bug, it is
that features are being added faster than they are played. Slow down, play, and fix what the table
finds.

**Status, 18 Nov evening (Mike):** #1 declined (keep building). Done in PR #145: #3 backup, #5 flaky
browser tests, #6 tests off real data, #7 test runner, #8 `CLAUDE.md`. #2 done: tagged `v1.2.0`.

Effort: **S** under an hour of Claude time, **M** one PR, **L** several PRs.

## Top 10, in order

| # | Area | What | Why it matters | Effort | Claude can do it? |
| --- | --- | --- | --- | --- | --- |
| 1 | Playtest | **Feature freeze until one real game night.** Play the test session (`docs/test-session/`) with real friends, write down what breaks or confuses, fix only that. | 48 PRs merged from 16 to 18 Nov with no real table in between. Bots and tests prove the code runs, not that it is fun or clear. | You: one evening | Partly: Claude turns your notes into fixes |
| 2 | Reliability | **Tag a release and play from it** (studio R1, still open). Cut `1.2.0`, build the zip from the tag, and only update the game-night laptop between sessions. | `package.json` is still 1.1.0 and the whole 316-line Changelog is "Unreleased". If something breaks mid-game you cannot say which version you were on or roll back. A *tag* is a named, fixed point in git history. | S | Yes |
| 3 | Reliability | **Back up everything** (studio S5, still open). One button or `npm run backup` that zips `data/` and `uploads/`. | Save points and the export bundle skip backdrops, music, maps, sprites and creature art. A dead laptop loses all the art. | S | Yes |
| 4 | Reliability | **Save migrations** (studio S3, still open). Upgrade old `campaign.json` files instead of starting fresh. | Today a format change (`version` bump) starts a new, empty table (a copy is kept). The first time it happens after real play, the campaign looks gone mid-session. A *migration* is a small function that rewrites an old save into the new shape. | M | Yes |
| 5 | Tests/CI | **Fix flaky browser tests by waiting for state, not time.** The UI tests use 113 fixed sleeps (`h.wait(300)`); `strike-ui.js` alone has 15. | A *flaky* test fails sometimes with no code change. Each red run costs a re-run and teaches everyone to ignore red, which is how a real break gets merged. Replace each sleep with a wait for the thing it is waiting for (a selector, a state field). Add one automatic retry for the `ui` job only as a stopgap. | M | Yes |
| 6 | Tests/CI | **Tests must not touch the real `data/` folder.** Some in-process tests (`visibility`, `camp`, `table`, `studio`, `combatfx` and others) create `creatures.json`, `spells.json` and `saves/` in the repo's `data/`; a full run also left 8 startup backups there. | On your laptop, `data/` *is* your campaign. A test that writes there can, after a future change, overwrite real data. Fix: set a temp `DATA_DIR` once in a shared test setup. | S | Yes |
| 7 | Tests/CI | **One test runner instead of 72 commands chained with `&&`** (studio Q3, still open). | The first failure hides every later result, and the run is slow. A runner prints all failures at once and can run scripts in parallel (likely under a minute). | S | Yes |
| 8 | Code health | **Add a `CLAUDE.md`** (none exists). Half a page: how to run and test, the flaky-test rules from #5, "keep features system-agnostic", "every automated result has a DM override", Changelog style, where state lives (`src/state.js`, `src/visibility.js`). | Every new Claude thread re-learns these from memory notes and sometimes gets them wrong. `CLAUDE.md` is read automatically at the start of every session. | S | Yes |
| 9 | Game | **Custom rules file** (studio G1, still open). Stats, dice, conditions and labels from `data/rules.json` with an editor. | Your own system (Daggerheart + 5e + homebrew) still needs code changes for every rule. This is the largest gap between the tool and how you want to play. | L | Yes, once you write down the rules |
| 10 | Docs | **Split the backlog into "to do" and "done".** `docs/backlog.md` is 280 lines of dated notes with no status per item. | You cannot see at a glance what is built. Keep one short list of open items at the top, and move built items to a "Done" section with their PR number. | S | Yes |

## Also worth doing (smaller)

| Area | What | Effort |
| --- | --- | --- |
| Reliability | Phone wake lock on by default in combat and conversations (studio P1, still open). Phones that sleep drop and rejoin. | S |
| Reliability | Undo keeps only 15 steps (studio D1, still open); raise to 30. | S |
| Playtest | One-page DM quick reference for holds, menus and shortcuts (studio O2, still open). | S |
| Playtest | Add-to-Home-Screen manifest for `/play` (studio O3, still open). | S |
| Security | `npm audit`: 1 moderate issue in `ajv` 8.17.1 (fixed in 8.20.0). Low risk on a home LAN; one-line update. | S |
| Code health | Name tests by feature, not date: `nov17-fixes.js`, `nov18.js`, `nov18-ui.js`, `phase-d.js` say nothing about what they check. | S |
| Code health | Largest files to split when next touched: `public/stage.js` (811 lines), `src/sockets/dm.js` (660). Not urgent. | M |

## Removal candidates (from the studio review)

All four were already handled on 16 Nov: `archive/` DM modules removed, `docs/termux.md` removed, old
`dnd-party/` copies removed from project files (screenshots kept), `public/voice.js` merged into
`public/stt.js`. Nothing else stands out for removal; the next candidates come from the playtest
(features nobody used).

## Still open from the studio review, not in the top 10

O4 join card, Q5 bug note, V1 PR X (templates, condition icons), V2 ruler, V4 ping, G2 rest/loot/creator,
D2 TV break card, P2 haptics, T2 4K check, T3 portrait chips, A2 music, X2 colour-only bars, R3 package name.

## Suggested order

1. Before the next game night: #2 (tag 1.2.0), #3 (backup), #6 (tests off real data), phone wake lock.
2. Game night (#1). Keep a notes file open; afterwards hand it to Claude.
3. Fix what the table found, then #5 and #7 (test reliability) and #8 (`CLAUDE.md`).
4. Then #4 (migrations) before any save-format change, and #9 (custom rules).
