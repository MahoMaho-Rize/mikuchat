# MikuChat Quickstart

Terminal-based QQ chat client with Miku aesthetics. Built on Bun + SolidJS + OpenTUI + NapCat (OneBot 11).

## Prerequisites

### Required

| Dependency | Version | Description |
|---|---|---|
| [Bun](https://bun.sh) | >= 1.1 | Runtime (`bun:sqlite`, JSX, native bundler) |
| [Kitty](https://sw.kovidgoyal.net/kitty/) | >= 0.28 | Terminal — Kitty Graphics Protocol + keyboard protocol |
| [NapCat](https://github.com/NapNeko/NapCatQQ) | latest | QQ headless backend (OneBot 11 WebSocket) |
| [Xvfb](https://www.x.org/releases/X11R7.6/doc/man/man1/Xvfb.1.xhtml) | any | Virtual X display for headless QQ (only if launching NapCat from MikuChat) |

### Bundled (installed by `bun install`)

| Package | Purpose |
|---|---|
| `solid-js` + `@opentui/solid` | Reactive UI framework + terminal renderer |
| `sharp` | JPEG/WebP to PNG conversion for Kitty image rendering (requires `libvips` native lib) |
| `zod` | Event validation |
| `fuzzysort` | Fuzzy search for sessions |

### Optional (system)

| Tool | When needed |
|---|---|
| `xclip` / `xsel` / `wl-copy` | Clipboard support on Linux (X11 / Wayland) |

> **Note**: SQLite is built into Bun (`bun:sqlite`), no external installation needed.

## Install

### 1. Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. Install NapCat + QQ

Download from [NapCat releases](https://github.com/NapNeko/NapCatQQ/releases) and extract:

```bash
# Example: extract to ~/Napcat/
mkdir -p ~/Napcat && cd ~/Napcat
# Download and extract the release archive here

# Verify the QQ binary exists:
ls ~/Napcat/opt/QQ/qq
```

### 3. Install Xvfb (if launching NapCat from MikuChat)

```bash
# Debian/Ubuntu
sudo apt install xvfb

# Arch
sudo pacman -S xorg-server-xvfb

# Not needed if you run NapCat separately
```

### 4. Clone and install MikuChat

```bash
git clone <repo-url> ~/mikuchat
cd ~/mikuchat
bun install
```

## Configure NapCat

Run NapCat once manually to generate its config, then edit the OneBot 11 WebSocket settings:

```bash
# Replace YOUR_QQ_NUMBER with your actual QQ number:
nano ~/Napcat/opt/QQ/resources/app/app_launcher/napcat/config/onebot11_YOUR_QQ_NUMBER.json
```

Required settings:

```json
{
  "network": {
    "websocketServers": [
      {
        "name": "mikuchat",
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

**Critical**: `"reportSelfMessage": true` — without this your own sent messages won't appear.

## Build & Install

### One-liner (recommended)

```bash
cd ~/mikuchat && ./install.sh
```

`install.sh` does everything:
1. Checks `bun` is installed
2. `bun install` + `bun run build` (compiles to `dist/`)
3. Installs `/usr/local/bin/mikuchat` (requires `sudo`)
4. Checks runtime dependencies (Kitty, Xvfb, NapCat QQ binary) and warns if missing

### Manual steps

```bash
cd ~/mikuchat
bun install
bun run build
sudo tee /usr/local/bin/mikuchat << EOF
#!/bin/bash
cd $HOME/mikuchat && exec bun dist/main.js "\$@"
EOF
sudo chmod +x /usr/local/bin/mikuchat
```

### Run

```bash
# Production (compiled bundle, fast startup)
mikuchat

# Development (from source, live changes)
bun run dev
```

## Configure MikuChat

### QQ binary path

MikuChat auto-detects the QQ binary by probing these locations in order:

1. `$NAPCAT_QQ_PATH` (environment variable — highest priority)
2. `~/NapCat/opt/QQ/qq`
3. `~/Napcat/opt/QQ/qq`
4. `~/.local/share/NapCat/opt/QQ/qq`
5. `/opt/QQ/qq`

If your NapCat is installed elsewhere, set the env var:

```bash
export NAPCAT_QQ_PATH=/path/to/your/qq
mikuchat
```

Or add it to your shell profile (`~/.bashrc` / `~/.zshrc`).

### WebSocket URL

The default NapCat WebSocket endpoint is `ws://127.0.0.1:3001/`. The `/connect` command uses this by default. To change it, pass the URL as an argument:

```
/connect ws://192.168.1.100:3001
```

## Connect to QQ

### Option A: Auto-start NapCat

Type `/start` on the home screen. This launches Xvfb + NapCat and connects the WebSocket automatically. First login requires scanning a QR code — the URL appears in the command log.

### Option B: Connect to running NapCat

If NapCat is already running separately, type `/connect` to connect to `ws://127.0.0.1:3001/`.

## Usage

### Home screen commands

| Command | Description |
|---|---|
| `/start` | Launch NapCat + connect |
| `/connect` | Connect to running NapCat |
| `/disconnect` | Disconnect WebSocket |
| `/stop` | Stop NapCat (only if started by MikuChat) |
| `/status` | Show connection status |
| `exit` | Quit |

### Navigation

| Key | Action |
|---|---|
| `Ctrl+K` | Fuzzy search conversations |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+C` | Quit |
| Click session | Open chat |

### Chat

| Key | Action |
|---|---|
| `Enter` | Send message |
| `Meta+Enter` | New line |
| `PageUp` / `PageDown` | Scroll history |
| `Home` | Load older messages / jump to top |
| `End` | Jump to latest (unfreeze scroll) |
| `/back` or `/home` | Return to home screen |
| `/img ~/path.png` | Send an image |

### Scroll behavior

When you scroll up to browse history, MikuChat freezes the view so new incoming messages don't interrupt you. A `↓ N new messages` indicator appears at the bottom. Press `End` or click the indicator to catch up.

## File locations

| Path | Contents |
|---|---|
| `~/.local/share/mikuchat/qc.db` | SQLite database (sessions + messages) |
| `~/.cache/mikuchat/images/` | Downloaded image cache |
| `~/.config/mikuchat/` | Config directory (reserved) |

## Theming

The default theme is `miku` (teal + pink). Key colors:

| Token | Value | Description |
|---|---|---|
| `background` | `#0A1A1E` | Deep teal-black |
| `primary` | `#39C5BB` | Miku teal |
| `secondary` | `#E12885` | Miku pink |
| `border` | `#E5C07B` | Warm yellow |

34 built-in themes are available. Custom themes can be placed in `.mikuchat/themes/` as JSON files.

## Troubleshooting

### Images not rendering

1. **Must use Kitty terminal** — other terminals lack the Graphics Protocol
2. Ensure `sharp` installed correctly (`bun install`) — it needs `libvips` native bindings
3. Image rendering uses `fs.writeSync(1, ...)` to bypass OpenTUI's stdout interception

### NapCat won't start

1. Verify QQ binary: `ls ~/Napcat/opt/QQ/qq`
2. Verify Xvfb: `which Xvfb`
3. Check port conflict: `lsof -i :3001`

### No messages after connect

1. Verify `reportSelfMessage: true` in NapCat config
2. Check WebSocket port matches (default: 3001)
3. Run `/status` to check connection state

### Database migration from older versions

```bash
# Copy all three files (SQLite WAL mode):
cp ~/.local/share/qc-dev/qc.db* ~/.local/share/mikuchat/
```

## Architecture

```
src/
  main.tsx                 Entry point, provider tree, global keybinds
  pages/
    home.tsx               Home screen (logo, commands, session list)
    search.tsx             Ctrl+K session search dialog
  qq/
    client.ts              OneBot 11 WebSocket client
    bridge.ts              WS events -> SQLite bridge with dedup
    db.ts                  SQLite CRUD (sessions, messages)
    layout.ts              Message height precomputation cache
    napcat.ts              NapCat process lifecycle manager
    types.ts               OneBot 11 protocol types
  tui/
    component/
      chat-prompt.tsx      Chat input widget
      miku-background.tsx  Full-screen braille art background
      image-renderable.ts  Kitty Graphics Protocol renderer (Unicode Placeholders)
      qq-image.tsx         QQ image display component
      border.tsx           Custom border styles
    context/
      qq.tsx               QQ connection state provider
      chat-sync.tsx        Session/message sync from SQLite
      theme/miku.json      Miku color theme
    routes/
      chat/index.tsx       Chat page (messages, input, sidebar)
      chat/sidebar.tsx     Session sidebar
  stubs/                   Stub modules for inherited OpenCode dependencies
```
