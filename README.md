# Tavern Screen

Jackbox-style D&D for a laptop + TV. The laptop runs the server and shows the table on the TV; players join from their phones by scanning the QR code (same Wi-Fi).

## Run

```bash
npm install
npm start            # PORT=3000 by default
```

The console prints:

| URL | Who | Notes |
|---|---|---|
| `http://localhost:3000/dm` | DM (laptop) | Controls + live preview of the TV. Localhost is auto-authorized as DM. |
| `http://localhost:3000/screen` | TV | Presentation only. Drag to the TV, double-click for fullscreen. If the TV just mirrors the laptop, use `/dm` alone. |
| `https://<lan-ip>:3443/play?room=ABCD` | Players | Encoded in the QR on the TV. Short link: `/j/ABCD`. |
| `https://<lan-ip>:3443/codm?key=YYYY` | Co-DM (phone/tablet) | Private QR under **Co-DM → Invite** on the DM page. Atmosphere only. |
| `https://<lan-ip>:3443/dm?key=XXXX` | DM from another device | Key printed at startup (or set `DM_KEY`). |

Env: `PORT` (3000), `HTTPS_PORT` (3443), `HTTPS=0` (turn HTTPS off), `HTTPS_CERT` + `HTTPS_KEY` (use your own certificate, e.g. from mkcert), `DM_KEY`, `CODM_KEY`, `PUBLIC_HOST` (force the address in the QR), `DATA_DIR`, `UPLOAD_DIR`. Allow Node through the OS firewall on first run (both ports).

### Joining, room codes and reconnects

- The TV shows a 4-letter **room code** next to the QR. Phones need it to sit down, so old tabs and neighbours can't walk in. **New code** in the DM top bar makes a fresh one; phones already seated keep playing.
- A phone that drops (screen lock, Wi-Fi blip, server restart) gets its seat back by itself. Opening a character that another phone is using asks before taking it over.
- **Join address** in the DM top bar picks which network adapter's IP goes into the QR, if the laptop has several (Wi-Fi, Ethernet, VPN, WSL).

### HTTPS and the certificate warning

Phones connect over HTTPS so the microphone can work on them. On first start the server makes a certificate for this laptop. Each phone shows a one-time "connection not private" warning: tap **Advanced → Proceed**. To get rid of the warning, open `http://<lan-ip>:3000/tavern-cert.crt` on the phone and install it (iPhone: Settings → General → VPN & Device Management, then Settings → General → About → Certificate Trust Settings). Or use mkcert and set `HTTPS_CERT`/`HTTPS_KEY`.

### Display settings

The ⚙ button on phones and the DM page sets text size, a color-blind safe or high-contrast palette, and reduced motion for that device. The DM's ⚙ also sets the TV for the whole table.

## Pillars

- **Exploration**: scene title/description/theme, points of interest (players tap to investigate), DM-called skill checks with DC; phones roll and pass/fail shows on the TV. Free-text "What do you do?" actions.
- **Combat**: enemy presets or custom stats, initiative, turn order. On their turn a player's phone shows Attack (target picker) / Dodge / Dash / Hide / Help / Potion. Server rolls d20 vs AC, crits, damage. On an enemy's turn the DM picks a target. HP ± and remove controls for everything.
- **Social (visual novel)**: procedural NPC portrait + dialogue box with typewriter text. 8 emotion buttons (or keys 1–8) change the face and the dialogue styling (color, shake for angry, tremble for fearful, italics for sad, etc.) live on TV and phones. DM can push up to 4 dialogue choices; players can also pick a choice, speak freely, or roll Persuasion/Deception/Intimidation/Insight.

## Characters (persistent)

Characters are saved to `data/characters.json`, and portraits go to `uploads/portraits/`. Both survive restarts, and HP carries over between sessions.

- **Joining:** phones show a "Who are you?" grid of saved characters. Tap yours to claim it, or tap **+ New character**. Phones remember their character and reclaim it automatically. Claiming a character on a second phone takes it over.
- **Player profile** (✎ on the phone): a selfie or uploaded portrait (auto-cropped to 512 px), plus race, played-by, color, catchphrase and backstory.
- **DM Characters panel:** edit everything, including level, HP, AC, hit, damage dice, initiative and all 10 skills. You can also set:
  - a **turn theme**: a built-in or uploaded sound played on their combat turn, intro and crits
  - DM-only **plot hooks** and **secrets**, which never reach phones or the TV
- **⭐ Spotlight:** a full-screen character intro on the TV, with portrait, name, "played by" and catchphrase.
- **🤫 Whisper:** a private message that pops up on just that player's phone and is kept in their whisper log.
- **Automatic moments:**
  - A natural 20 (attack or check) triggers a "NATURAL 20!" spotlight with the catchphrase.
  - Combat shows a "Your move" card with the active character's portrait.
  - When a player speaks in a social scene, their portrait appears opposite the NPC.

To back up or move your party, copy `data/` and `uploads/`.

## Shops (NPC merchants)
- DM card "Shops": paste or choose a price list (CSV, `;`-separated, or a Markdown table). Columns: name, price, stock, note. Price takes `gp`, `sp` or `cp` (default gp). Blank stock means unlimited. A header row is optional.
- Phones get a 🛒 Shops tab with open shops. Buying spends the character's gold and adds the item to the pack. Gold is private to the owner and the DM, and the DM sets it under "Party gold".
- Closing a shop hides it from phones. Shops are saved with the campaign.

## Co-DM & atmosphere

A co-DM runs the mood while the DM runs the game. On the DM page, **Co-DM → Invite** shows a private QR (don't put it on the TV). The co-DM page has the same atmosphere controls the DM has, at the bottom of the DM panel, and nothing else: it can't change modes, HP, combat or NPCs.

**Backdrops & effects**
- Upload PNG/JPG/WebP/GIF images or MP4/WebM looping videos. Click a thumbnail to put it on the TV, or **Scene theme** to revert. ✕ deletes.
- Stackable CSS overlays: Rain, Snow, Fog, Embers, Storm, Dark, Blood, Magic.

**Music & sound**
- Upload MP3/OGG/WAV/M4A. **▶ Music** loops a track with a 1.5 s crossfade. **🔊 SFX** plays it once. Play/pause, stop, and separate music and SFX volume.
- Built-in synthesized SFX (no files needed): Thunder, Sword hit, Spell, Roar, Bell.
- **Where sound plays:** the `/screen` tab (TV). If no `/screen` tab is open, because the TV mirrors the laptop, the `/dm` tab plays it. If the browser blocks autoplay, a "Click to enable sound" button appears; click it once.

Uploads (max 60 MB each) live in `uploads/` and persist across restarts.

## Live voice (placeholder)

DM page → Social → **Live voice**:
- **Record** captures the mic with `MediaRecorder`; each clip is listed with playback plus audio/transcript download.
- Live transcription uses the browser Web Speech API (Chrome/Edge). Interim text streams to the TV as a caption; "Auto-speak" turns each finished sentence into an NPC line.
- Swap `startRecognition()` in `public/voice.js` for a real STT service (Whisper, Deepgram, etc.) later.
- Mic access requires a secure context, so open the DM page as `http://localhost`, not the LAN IP.

## Rules systems

D&D 5e by default. **Rules** in the DM top bar switches to **Daggerheart (preview)**: duality dice (Hope/Fear), traits instead of skills, Evasion instead of AC. New rules systems are one file in `src/rules/`.

## Campaign data and Arthuria

The **Campaign data** card on the DM page exports one `.tavern.json` file with characters, NPCs, places, factions, events and lore (portraits embedded), imports one back, and downloads the session transcript as Markdown. Format: [docs/arthuria-format.md](docs/arthuria-format.md).

## Saving

Everything is saved as you play: the table (scene, mode, combat, NPC dialogue, log, whispers, backdrop, music) in `data/campaign.json`, characters in `data/characters.json`, world entries in `data/entities.json`. Restarting the server picks up where you left off. To back up or move a campaign, copy `data/` and `uploads/`, or use **Export bundle**.

## Uploads

| Kind | Formats | Max |
|---|---|---|
| Backdrop | PNG, JPG, WebP, GIF, MP4, WebM | 60 MB |
| Music / SFX | MP3, OGG, WAV, M4A, AAC, FLAC | 40 MB |
| Portrait | PNG, JPG, WebP, GIF, **animated WebM** | 12 MB |
| Creature art | PNG, JPG, WebP, GIF, animated WebM | 20 MB |
| Map | PNG, JPG, WebP | 25 MB |

If ffmpeg is installed, animated WebM portraits are cropped square and re-encoded small (256 px, creatures 384 px) with transparency kept. Without ffmpeg they're stored as uploaded.

## Development

```bash
npm test          # rules, visibility, uploads, Arthuria bundle, end-to-end socket test
npm run test:ui   # browser test (Playwright): DM, TV and phone pages, settings, animated portraits
```

Layout:

- `server.js`: wiring only. `src/`: `config`, `net` (LAN IPs), `tls` (HTTPS cert), `state` (live state + broadcast), `store` (saving), `visibility` (who sees what), `session` (room code, seats), `roster` (characters), `game` (combat flow), `dice`, `rules/` (5e, Daggerheart), `assets` + `media` (uploads), `entities` + `bundle` (Arthuria), `routes`, `sockets/` (player, dm, atmo).
- `public/`: `stage.js` (TV renderer, shared), `anim.js`, `settings.js`, `atmo.js`, `audio.js`, `voice.js`; `js/client.js` (the one socket); `js/dm/*` and `js/play/*` feature modules.
- `schema/`: JSON Schemas for the Arthuria bundle. `docs/decisions.md`: Phase 0 choices.


## Running it without a Node install (packaging)

- **Start script:** `./start.sh` (Mac/Linux) or `start.cmd` (Windows). Needs Node.js 20 or newer; installs packages on first run.
- **Docker:** `docker build -t tavern-screen .`, then run it with the ports 3000 and 3443 published and `data/` and `uploads/` mounted so saves survive restarts.

These are untested in this environment (no Docker here). Please try them and report what breaks.
