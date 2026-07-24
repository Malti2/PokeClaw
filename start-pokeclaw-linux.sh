#!/bin/bash
## PokeClaw — Linux Onboarding & Launch Script  🌴
##
## Installs the runtime (Bun or Node), cloudflared and dependencies, then hands
## off to the `pokeclaw` CLI (onboarding wizard + live TUI dashboard).
##
## Usage:
##   bash start-pokeclaw-linux.sh            # interactive setup + start
##   bash start-pokeclaw-linux.sh --quiet    # skip onboarding, use existing config/env
##
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="$HOME/.pokeclaw"
QUIET=false
RUNTIME=""
RUN=()
PM="unknown"

for arg in "$@"; do
  case "$arg" in
    --quiet|-q) QUIET=true ;;
  esac
done

ensure_pm() {
  if command -v apt-get >/dev/null 2>&1; then PM="apt"
  elif command -v dnf >/dev/null 2>&1; then PM="dnf"
  elif command -v pacman >/dev/null 2>&1; then PM="pacman"
  else PM="unknown"
  fi
}

ensure_pkg() {
  local pkg="$1"
  command -v "$pkg" >/dev/null 2>&1 && return
  echo "   Installing ${pkg}…"
  case "$PM" in
    apt) sudo apt-get update -qq >/dev/null; sudo apt-get install -y "$pkg" ;;
    dnf) sudo dnf install -y "$pkg" ;;
    pacman) sudo pacman -Sy --noconfirm "$pkg" ;;
    *) echo "❌  Unknown package manager. Please install '${pkg}' manually."; exit 1 ;;
  esac
}

ensure_runtime() {
  if command -v bun >/dev/null 2>&1; then
    RUNTIME="bun"
    echo "✅  Bun $(bun --version) detected"
  elif command -v node >/dev/null 2>&1; then
    RUNTIME="node"
    echo "✅  Node $(node --version) detected"
  else
    echo "Step — Installing Bun…"
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
    if command -v bun >/dev/null 2>&1; then RUNTIME="bun"; else RUNTIME="node"; fi
  fi
}

ensure_cloudflared() {
  command -v cloudflared >/dev/null 2>&1 && { echo "✅  cloudflared detected"; return; }
  echo "Step — Installing cloudflared…"
  case "$PM" in
    apt)
      curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
      echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" \
        | sudo tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
      sudo apt-get update -qq; sudo apt-get install -y cloudflared ;;
    dnf)
      curl -fsSL https://pkg.cloudflare.com/cloudflared-ascii.repo | sudo tee /etc/yum.repos.d/cloudflared.repo >/dev/null
      sudo dnf install -y cloudflared ;;
    pacman)
      if command -v yay >/dev/null 2>&1; then yay -S --noconfirm cloudflared
      elif command -v paru >/dev/null 2>&1; then paru -S --noconfirm cloudflared
      else echo "⚠️   Install cloudflared manually (AUR/binary)."; fi ;;
    *) echo "⚠️   Install cloudflared manually: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" ;;
  esac
}

ensure_webview_runner() {
  local runner="$CONFIG_DIR/webview-runner"
  [ -f "$runner" ] && return 0
  mkdir -p "$CONFIG_DIR"
  cat > "$runner" << 'PYEOF'
#!/usr/bin/env python3
import sys, os

args = sys.argv[1:]
if not args:
    sys.exit(1)

html_path = args[0]
width = int(args[1]) if len(args) > 1 else 800
height = int(args[2]) if len(args) > 2 else 600

try:
    import gi
    gi.require_version('Gtk', '3.0')
    gi.require_version('WebKit2', '4.0')
    from gi.repository import Gtk, WebKit2

    win = Gtk.Window()
    win.set_default_size(width, height)
    win.set_title(args[3] if len(args) > 3 else os.path.splitext(os.path.basename(html_path))[0])
    win.connect('destroy', Gtk.main_quit)

    scroller = Gtk.ScrolledWindow()
    webview = WebKit2.WebView()
    webview.load_uri('file://' + os.path.abspath(html_path))
    scroller.add(webview)

    win.add(scroller)
    win.show_all()
    Gtk.main()
except ImportError:
    import subprocess
    subprocess.run(['xdg-open', html_path])
PYEOF
  chmod +x "$runner"
  echo "✅  Webview runner ready"
}

ensure_build() {
  cd "$SCRIPT_DIR"
  if [ "$RUNTIME" = "bun" ]; then
    echo "Step — Installing dependencies (bun)…"
    bun install >/dev/null
    RUN=(bun run "$SCRIPT_DIR/src/cli.ts")
  else
    echo "Step — Installing dependencies + building (node)…"
    npm install >/dev/null
    npm run build >/dev/null
    RUN=(node "$SCRIPT_DIR/dist/cli.js")
  fi
  echo "✅  Ready"
}

echo ""
echo "🌴  PokeClaw — Linux Setup & Launch"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ensure_pm
case "$PM" in
  apt|dnf|pacman) echo "📦  Package manager: ${PM}" ;;
  *) echo "❌  Unsupported distro (need apt-get, dnf, or pacman)."; exit 1 ;;
esac

ensure_pkg curl
ensure_runtime
ensure_cloudflared
ensure_webview_runner
ensure_build

if [ "$QUIET" = false ] && [ ! -f "$CONFIG_DIR/config.json" ]; then
  "${RUN[@]}" onboard
fi

exec "${RUN[@]}" start
