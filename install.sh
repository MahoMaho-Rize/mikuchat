#!/bin/bash
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
BIN_PATH="/usr/local/bin/mikuchat"
WARN=0

echo "=== MikuChat installer ==="
echo "Source:  $REPO_DIR"
echo ""

# ── Build dependencies ──────────────────────────────────────

# [1] Bun (required)
if ! command -v bun &>/dev/null; then
  echo "FATAL: bun is not installed."
  echo "       Install it from https://bun.sh"
  echo "       curl -fsSL https://bun.sh/install | bash"
  exit 1
fi
echo "[ok] bun $(bun --version)"

# ── Install & build ─────────────────────────────────────────

echo ""
echo "Installing dependencies..."
cd "$REPO_DIR"
bun install --frozen-lockfile 2>/dev/null || bun install

echo "Building..."
bun run build

# ── Install system command ──────────────────────────────────

echo ""
echo "Installing mikuchat to $BIN_PATH (requires sudo)..."
sudo tee "$BIN_PATH" > /dev/null << EOF
#!/bin/bash
cd "$REPO_DIR" && exec bun dist/main.js "\$@"
EOF
sudo chmod +x "$BIN_PATH"

# ── Runtime dependency checks ───────────────────────────────

echo ""
echo "Checking runtime dependencies..."

# [2] Kitty terminal (required for graphics)
if [ -n "$TERM" ] && echo "$TERM" | grep -qi kitty; then
  echo "[ok] Kitty terminal detected (TERM=$TERM)"
elif command -v kitty &>/dev/null; then
  echo "[ok] kitty binary found: $(which kitty)"
else
  echo "[!!] Kitty terminal not detected."
  echo "     MikuChat requires Kitty for image rendering and keyboard protocol."
  echo "     Install: https://sw.kovidgoyal.net/kitty/binary/"
  WARN=$((WARN + 1))
fi

# [3] Xvfb (required for /start — launching NapCat from MikuChat)
if command -v Xvfb &>/dev/null; then
  echo "[ok] Xvfb found: $(which Xvfb)"
else
  echo "[!!] Xvfb not found."
  echo "     Required if you want to launch NapCat from MikuChat (/start)."
  echo "     Not needed if you run NapCat separately and use /connect."
  echo "     Install: sudo apt install xvfb  (Debian/Ubuntu)"
  echo "              sudo pacman -S xorg-server-xvfb  (Arch)"
  WARN=$((WARN + 1))
fi

# [4] NapCat / QQ binary
QQ_PATH="${NAPCAT_QQ_PATH:-}"
if [ -z "$QQ_PATH" ]; then
  # Probe common locations
  for p in \
    "$HOME/NapCat/opt/QQ/qq" \
    "$HOME/Napcat/opt/QQ/qq" \
    "$HOME/.local/share/NapCat/opt/QQ/qq" \
    "/opt/QQ/qq" \
    "/usr/local/share/NapCat/opt/QQ/qq"; do
    if [ -x "$p" ]; then
      QQ_PATH="$p"
      break
    fi
  done
fi

if [ -n "$QQ_PATH" ]; then
  echo "[ok] QQ binary found: $QQ_PATH"
else
  echo "[!!] NapCat QQ binary not found."
  echo "     Download NapCat from: https://github.com/NapNeko/NapCatQQ/releases"
  echo "     Extract to ~/NapCat/ so that ~/NapCat/opt/QQ/qq exists."
  echo "     Or set NAPCAT_QQ_PATH=/path/to/qq before running mikuchat."
  WARN=$((WARN + 1))
fi

# ── Done ────────────────────────────────────────────────────

VERSION=$(bun -e "console.log(require('./package.json').version)" 2>/dev/null || echo "0.0.0")
echo ""
if [ "$WARN" -gt 0 ]; then
  echo "MikuChat v$VERSION installed with $WARN warning(s)."
  echo "Fix the warnings above before running, or use /connect to skip NapCat auto-start."
else
  echo "MikuChat v$VERSION installed. All dependencies OK."
fi
echo ""
echo "  Run:  mikuchat"
echo ""
echo "  First time?  See QUICKSTART.md for NapCat configuration."
