# Running Tavern Screen on Termux (Android)

Termux runs the server on the phone itself. This guide is based on reading the code and README at `main` (a91ee4a). **None of these steps have been run on a device yet.**

## Limits to know first

- **TV display:** the README's TV setup assumes a laptop drives an HDMI/extended display. A phone running Termux can't drive a TV directly. `/screen` only works if a browser on another screen can reach the phone's address. Untested.
- **Speech:** Chrome's Web Speech API works on phones over HTTPS. The Vosk local model (item 13) is not verified on Termux.
- **Packaging:** `start.sh` and Docker are not verified here.

## 1. Install Termux

Install Termux from F-Droid. The Play Store build is outdated and not supported.

## 2. Install Node.js and git

```bash
pkg update && pkg upgrade
pkg install nodejs git unzip
node -v        # README requires Node 20 or newer
```

## 3. Get the code

Either clone the repo or unzip the project archive:

```bash
git clone https://github.com/Greiye/TTRPG-Session-Tool.git tavern
# or: unzip Mikey-DM-tool.zip -d tavern
cd tavern
```

Keep the project in Termux's home folder (`~`). Shared storage can't hold `node_modules`.

## 4. Install dependencies

```bash
npm install
```

Dependencies are `express`, `socket.io`, `qrcode`, `selfsigned`, and `ajv`. I expect them to install without native builds, but this is untested. If an install fails on a native module, run `pkg install python make clang` and retry.

## 5. Start the server

```bash
npm start
```

The console prints the URLs, including the join link and QR target. Use the printed `https://<lan-ip>:3443/...` URLs, not `localhost`, when another device connects.

- `http://localhost:3000/dm` opens the DM page on the phone. Localhost is authorized as DM automatically.
- Remote DM from another device: `https://<lan-ip>:3443/dm?key=<DM_KEY>`. The key is printed at startup, or set `DM_KEY` before `npm start`.

To keep the server running while the screen is off, run `termux-wake-lock` first. This is standard Termux behavior and not tested here.

## 6. Connect phones

1. Phones must be on the same Wi-Fi as the Termux device.
2. Open the join URL or scan the QR code shown on the DM page or TV.
3. Enter the 4-letter room code shown next to the QR.

If the server picks the wrong network address, set `PUBLIC_HOST=<ip>` before `npm start`. Use `ip -4 addr` (or `pkg install net-tools` then `ifconfig`) to find the address. Untested.

## 7. Trust the HTTPS certificate

On first start the server creates a self-signed certificate. Each phone shows a one-time "connection not private" warning:

1. Tap **Advanced → Proceed**.
2. To remove the warning, open `http://<lan-ip>:3000/tavern-cert.crt` on the phone and install it. The README covers iPhone and Android steps, but Android steps are untested.

The microphone and Chrome speech need HTTPS, so do not skip this step if you use voice.

## 8. Stop the server

Press Ctrl+C in Termux. Game data is saved in `data/` as you play, so restarting picks up where you left off.

## Untested on a device

- Every command in this guide
- Node 20+ from `pkg`
- Phone-based TV output
- Certificate install on Android
- Keeping the server alive with the screen off
