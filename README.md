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
| `http://<lan-ip>:3000/play` | Players | Encoded in the QR on the TV. |
| `http://<lan-ip>:3000/codm?key=YYYY` | Co-DM (phone/tablet) | Private QR under **Co-DM → Invite** on the DM page. Atmosphere only. |
| `http://<lan-ip>:3000/dm?key=XXXX` | DM from another device | Key printed at startup (or set `DM_KEY`). |

Env: `PORT`, `DM_KEY`, `CODM_KEY`, `PUBLIC_HOST` (override the IP in the QR if auto-detect picks the wrong adapter). Allow Node through the OS firewall on first run.

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

## Notes

- State is in memory; restarting the server clears the session. Phones auto-rejoin after a refresh.
- Files: `server.js` (state, rules, dice, sockets), `public/stage.js` (shared TV/VN renderer + portrait), `public/dm.js`, `public/voice.js`, `public/play.js`, `public/style.css`.
