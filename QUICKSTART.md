# MikuChat Quickstart

Terminal-based QQ chat client with Miku aesthetics. Built on OpenTUI + NapCat + OneBot 11.

## Prerequisites

| Requirement | Version | Why |
|---|---|---|
| [Bun](https://bun.sh) | >= 1.1 | Runtime (uses `bun:sqlite`, JSX transform) |
| [Kitty](https://sw.kovidgoyal.net/kitty/) | >= 0.28 | Terminal with graphics protocol support |
| [NapCat](https://github.com/NapNeko/NapCatQQ) | latest | QQ headless client (OneBot 11 backend) |
| [Xvfb](https://www.x.org/releases/X11R7.6/doc/man/man1/Xvfb.1.xhtml) | any | Virtual display for headless QQ |
| [sharp](https://sharp.pixelplumbing.com/) | (bundled) | JPEG→PNG conversion for Kitty image rendering |

## Step 1: Install NapCat

```bash
# Download NapCat (includes QQ binary)
# See: https://github.com/NapNeko/NapCatQQ/releases
# Extract to e.g. ~/Napcat/

# Verify QQ binary exists
ls ~/Napcat/opt/QQ/qq
```

## Step 2: Configure NapCat

First run NapCat once manually to generate config, then edit:

```bash
# Find config file (replace YOUR_QQ_NUMBER):
nano ~/Napcat/opt/QQ/resources/app/app_launcher/napcat/config/onebot11_YOUR_QQ_NUMBER.json
```

Ensure these settings:

```json
{
  "network": {
    "websocketServers": [
      {
        "name": "qqterm",
        "enable": true,
        "host": "0.0.0.0",
        "port": 3001,
        "token": "",
        "messagePostFormat": "array",
        "reportSelfMessage": true,
        "heartInterval": 30000
      }
    ]
  }
}
```

**Critical**: `reportSelfMessage: true` — without this, your own sent messages won't appear in chat.

## Step 3: Install MikuChat

```bash
git clone <repo-url> ~/mikuchat
cd ~/mikuchat
bun install
```

## Step 4: Run

```bash
# Option A: Run from source (development)
cd ~/mikuchat
bun run dev

# Option B: Install as global command
sudo tee /usr/local/bin/mikuchat << 'EOF'
#!/bin/bash
cd ~/mikuchat && exec bun run --conditions=browser ./src/main.tsx "$@"
EOF
sudo chmod +x /usr/local/bin/mikuchat

# Then run from anywhere:
mikuchat
```

## Step 5: Connect to QQ

Once MikuChat is running, you'll see the home screen with the MIKUCODE logo and a Miku braille art background.

### Option A: Auto-start NapCat from MikuChat

```
/start
```

This launches Xvfb + NapCat + connects WebSocket automatically. First-time login requires QR code scan — the QR URL will appear in the command log.

### Option B: Connect to existing NapCat

If NapCat is already running separately:

```
/connect
```

Connects to `ws://127.0.0.1:3001/` by default.

## Usage

### Home Screen Commands

| Command | Description |
|---|---|
| `/start` | Start NapCat and connect |
| `/connect` | Connect to running NapCat |
| `/disconnect` | Disconnect WebSocket |
| `/stop` | Stop NapCat (only if started by MikuChat) |
| `/status` | Show connection status |
| `exit` | Quit MikuChat |

### Navigation

| Key | Action |
|---|---|
| `Ctrl+K` | Search conversations (fuzzy search by name/ID) |
| `Ctrl+C` | Quit |
| Click session | Open chat |

### Chat Screen

| Key | Action |
|---|---|
| `Enter` | Send message |
| `Meta+Enter` | New line |
| `Ctrl+B` | Toggle sidebar |
| `/back` or `/home` | Return to home |

## File Locations

| Path | Contents |
|---|---|
| `~/.local/share/mikuchat/qc.db` | SQLite database (sessions + messages) |
| `~/.cache/mikuchat/images/` | Downloaded image cache (JPEG→PNG converted) |
| `~/.config/mikuchat/` | Config directory (reserved for future use) |

## Customization

### NapCat Path

Edit `src/qq/napcat.ts` line 14:

```typescript
const DEFAULT_QQ_PATH = "/home/youruser/Napcat/opt/QQ/qq"
```

### WebSocket URL

Edit `src/qq/client.ts` line 27:

```typescript
constructor(url = "ws://127.0.0.1:3001/", token = "") {
```

### Theme

The Miku theme is at `src/tui/context/theme/miku.json`. Key colors:

| Token | Value | Description |
|---|---|---|
| `background` | `#0A1A1E` | Deep teal-black (the "fluorescent" base) |
| `primary` | `#39C5BB` | Miku teal |
| `secondary` | `#E12885` | Miku pink |
| `border` | `#E5C07B` | Warm yellow card borders |

To switch themes at runtime, the theme system supports all OpenCode built-in themes. The default is `miku`.

## Troubleshooting

### Black background instead of teal-tinted

The `getCustomThemes()` function may be failing silently and resetting the theme to `opencode`. Check that the miku theme is correctly loaded by verifying the background isn't pure black (`#0A0A0A`). The miku background should have a visible deep teal tint (`#0A1A1E`).

### Images not rendering

1. **Must use Kitty terminal** — other terminals don't support Kitty Graphics Protocol
2. **JPEG images fail silently** — MikuChat converts via `sharp`, ensure it's installed (`bun install`)
3. **OpenTUI intercepts stdout** — image rendering uses `fs.writeSync(1, ...)` to bypass

### NapCat won't start

1. Verify QQ binary path: `ls ~/Napcat/opt/QQ/qq`
2. Verify Xvfb is available: `which Xvfb`
3. Check if port 3001 is already in use: `lsof -i :3001`

### No messages appearing after connect

1. Verify `reportSelfMessage: true` in NapCat config
2. Check WebSocket port matches (default: 3001)
3. Try `/status` to verify connection state

### Database migration after rename

If upgrading from `qc-dev`, copy the old database (including WAL files):

```bash
cp ~/.local/share/qc-dev/qc.db* ~/.local/share/mikuchat/
```

**Important**: Copy all three files (`qc.db`, `qc.db-wal`, `qc.db-shm`). SQLite WAL mode stores recent data in the WAL file — copying only the main `.db` file loses recent messages.

## Architecture

```
src/
  main.tsx                Entry point, provider tree, global keybinds
  pages/
    home.tsx              Home screen (logo, commands, session list)
    search.tsx            Ctrl+K session search dialog
  qq/
    client.ts             OneBot 11 WebSocket client
    bridge.ts             WS events → SQLite bridge with dedup
    db.ts                 SQLite CRUD (sessions, messages)
    napcat.ts             NapCat process lifecycle manager
    types.ts              OneBot 11 protocol types
  tui/
    component/
      chat-prompt.tsx     Chat input widget (rounded border, pills)
      miku-background.tsx Full-screen braille art background
      braille-scale.ts    Braille character art dynamic scaler
      image-renderable.ts Kitty Graphics Protocol renderer
      qq-image.tsx        QQ image download + cache + render
      border.tsx          MikuPanelBorder, EmptyBorder, SplitBorder
    context/
      qq.tsx              QQ connection state provider
      chat-sync.tsx       Session/message state sync from DB
      theme/miku.json     Miku color theme
    routes/
      chat/index.tsx      Chat page (messages, input, sidebar)
      chat/sidebar.tsx    Session sidebar
  stubs/                  46 stub modules for OpenCode backend deps
```

See `REFACTOR.md` for the planned multi-platform abstraction (QQ + Telegram).
See `DEVLOG.md` for the full development log and all pitfalls encountered.
