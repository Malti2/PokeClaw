#!/bin/bash
## PokeClaw — macOS Onboarding & Launch Script  🌴
##
## Installs Homebrew, the runtime (Bun or Node), cloudflared and dependencies,
## then hands off to the `pokeclaw` CLI (onboarding wizard + live TUI dashboard).
##
## Usage:
##   bash start-pokeclaw-mac.sh            # interactive setup + start
##   bash start-pokeclaw-mac.sh --quiet    # skip onboarding, use existing config/env
##
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="$HOME/.pokeclaw"
QUIET=false
RUNTIME=""
RUN=()

for arg in "$@"; do
  case "$arg" in
    --quiet|-q) QUIET=true ;;
  esac
done

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

ensure_webview_runner() {
  local runner="$CONFIG_DIR/webview-runner"
  [ -f "$runner" ] && return 0
  command -v xcrun >/dev/null 2>&1 || { echo "⚠️   Xcode tools not found — skipping webview runner"; return 0; }
  mkdir -p "$CONFIG_DIR"
  local src="$CONFIG_DIR/webview-runner.swift"
  cat > "$src" << 'SWIFT'
import Cocoa
import WebKit

class AppDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var webView: WKWebView!

    func applicationDidFinishLaunching(_ notification: Notification) {
        let args = CommandLine.arguments
        guard args.count > 1 else { NSApp.terminate(nil); return }
        let htmlPath = args[1]
        let w = args.count > 2 ? Int(args[2]) ?? 800 : 800
        let h = args.count > 3 ? Int(args[3]) ?? 600 : 600

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: w, height: h),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false)
        window.title = args.count > 4 ? args[4] : (htmlPath as NSString).lastPathComponent

        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: w, height: h))
        window.contentView = webView

        let url = URL(fileURLWithPath: htmlPath)
        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
SWIFT
  echo "   Compiling webview runner…"
  xcrun swiftc -o "$runner" "$src" 2>/dev/null && rm "$src"
  [ -f "$runner" ] && echo "✅  Webview runner ready" || echo "⚠️   Webview runner compilation failed"
}

ensure_cloudflared() {
  command -v cloudflared >/dev/null 2>&1 && { echo "✅  cloudflared detected"; return; }
  echo "Step — Installing cloudflared…"
  brew install cloudflared
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
echo "🌴  PokeClaw — macOS Setup & Launch"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command -v brew >/dev/null 2>&1; then
  echo "✅  Homebrew detected"
elif [ "$QUIET" = true ]; then
  echo "❌  Homebrew not found. Run without --quiet, or install it: https://brew.sh"
  exit 1
else
  echo "Step — Installing Homebrew…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [ -f /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$HOME/.zprofile" 2>/dev/null || true
  fi
fi

ensure_runtime
ensure_webview_runner
ensure_cloudflared
ensure_build

if [ "$QUIET" = false ] && [ ! -f "$CONFIG_DIR/config.json" ]; then
  "${RUN[@]}" onboard
fi

exec "${RUN[@]}" start
