#!/bin/bash
## PokeClaw — macOS Onboarding & Launch Script
##
## Usage:
##   bash start-pokeclaw.sh            # full interactive onboarding
##   bash start-pokeclaw.sh --quiet    # skip prompts, use env vars / defaults
##
## Environment variables (all optional):
##   POKECLAW_PORT   — port (default: 3741)
##   POKECLAW_TOKEN  — secret auth token
##   POKECLAW_ROOTS  — comma-separated allowed paths (default: $HOME)
##
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TUNNEL_LOG="${SCRIPT_DIR}/pokeclaw.log"
PORT="${POKECLAW_PORT:-3741}"
QUIET=false

# ── Parse flags ────────────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --quiet|-q) QUIET=true ;;
  esac
done

# ── Banner ─────────────────────────────────────────────────────────────────────
echo ""
echo "🐾  PokeClaw — macOS Setup & Launch"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Step 1: Homebrew ───────────────────────────────────────────────────────────
if command -v brew &>/dev/null; then
  echo "✅  Homebrew already installed"
else
  if [ "$QUIET" = true ]; then
    echo "❌  Homebrew not found. Run without --quiet to install it."
    echo "    Or install manually: https://brew.sh"
    exit 1
  fi
  echo ""
  echo "Step 1 — Installing Homebrew…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Apple Silicon: add brew to PATH
  if [ -f /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$HOME/.zprofile"
  fi
  echo "✅  Homebrew installed"
fi

# ── Step 2: Runtime (Bun preferred) ───────────────────────────────────────────
if command -v bun &>/dev/null; then
  RUNTIME="bun"
  echo "✅  Bun $(bun --version) already installed"
elif command -v node &>/dev/null; then
  RUNTIME="node"
  echo "✅  Node $(node --version) found — will use node"
else
  echo ""
  echo "Step 2 — Installing Bun…"
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  if command -v bun &>/dev/null; then
    RUNTIME="bun"
    echo "✅  Bun installed"
  else
    echo "⚠️   Bun needs a new shell. Falling back to node…"
    RUNTIME="node"
  fi
fi

# ── Step 3: cloudflared ────────────────────────────────────────────────────────
if command -v cloudflared &>/dev/null; then
  echo "✅  cloudflared already installed"
else
  echo ""
  echo "Step 3 — Installing cloudflared…"
  brew install cloudflared
  echo "✅  cloudflared installed"
fi

# ── Step 4: npm dependencies (only needed for node runtime) ───────────────────
cd "$SCRIPT_DIR"
if [ "$RUNTIME" = "bun" ]; then
  if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo "Step 4 — Installing bun dependencies…"
    bun add glob 2>/dev/null || true
    echo "✅  Dependencies ready"
  else
    echo "✅  Dependencies already present"
  fi
else
  if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo "Step 4 — Installing npm dependencies…"
    npm init -y >/dev/null 2>&1 || true
    npm install glob
    npm install -D typescript @types/node
    echo "✅  Dependencies installed"
  else
    echo "✅  Dependencies already present"
  fi
fi

# ── Step 5: Interactive configuration ─────────────────────────────────────────
if [ "$QUIET" = false ]; then
  echo ""
  echo "Step 5 — Configuration"
  echo "────────────────────────────────────────"

  # Port
  read -r -p "   Port [${PORT}]: " _input
  [ -n "$_input" ] && PORT="$_input"

  # Allowed roots
  _default_roots="${POKECLAW_ROOTS:-$HOME}"
  read -r -p "   Allowed folders (comma-separated) [${_default_roots}]: " _input
  POKECLAW_ROOTS="${_input:-$_default_roots}"

  # Token
  _cur_token="${POKECLAW_TOKEN:-}"
  if [ -n "$_cur_token" ]; then
    read -r -p "   Auth token (leave blank to keep existing): " _input
    POKECLAW_TOKEN="${_input:-$_cur_token}"
  else
    read -r -p "   Auth token (recommended — press Enter to skip): " POKECLAW_TOKEN
  fi

  # Persist to ~/.zshrc?
  echo ""
  read -r -p "   Save settings to ~/.zshrc? [Y/n]: " _save
  _save="${_save:-Y}"
  if [[ "$_save" =~ ^[Yy]$ ]]; then
    # Remove old PokeClaw block if present
    if grep -q "# PokeClaw — start" "$HOME/.zshrc" 2>/dev/null; then
      sed -i '' '/# PokeClaw — start/,/# PokeClaw — end/d' "$HOME/.zshrc"
    fi
    {
      echo ""
      echo "# PokeClaw — start"
      echo "export POKECLAW_PORT=\"${PORT}\""
      echo "export POKECLAW_ROOTS=\"${POKECLAW_ROOTS}\""
      [ -n "${POKECLAW_TOKEN:-}" ] && echo "export POKECLAW_TOKEN=\"${POKECLAW_TOKEN}\""
      echo "# PokeClaw — end"
    } >> "$HOME/.zshrc"
    echo "✅  Settings saved to ~/.zshrc"
  fi

  export POKECLAW_PORT="$PORT"
  export POKECLAW_ROOTS="${POKECLAW_ROOTS:-$HOME}"
  export POKECLAW_TOKEN="${POKECLAW_TOKEN:-}"

else
  # Quiet mode — use whatever is already exported
  echo "⚡  Quiet mode — using existing environment"
  echo "   POKECLAW_PORT  = ${POKECLAW_PORT:-3741}"
  echo "   POKECLAW_ROOTS = ${POKECLAW_ROOTS:-$HOME}"
  if [ -n "${POKECLAW_TOKEN:-}" ]; then
    echo "   POKECLAW_TOKEN = (set)"
  else
    echo "   POKECLAW_TOKEN = (not set)"
  fi
fi

# ── Step 6: Kill any process already on the port ──────────────────────────────
_existing=$(lsof -ti tcp:"${PORT}" 2>/dev/null || true)
if [ -n "$_existing" ]; then
  echo ""
  echo "⚠️   Port ${PORT} in use — killing PID ${_existing}…"
  kill "$_existing" 2>/dev/null || true
  sleep 1
fi

# ── Step 7: Start PokeClaw server ─────────────────────────────────────────────
echo ""
echo "🚀  Starting PokeClaw on port ${PORT}…"

if [ "$RUNTIME" = "bun" ]; then
  bun run "$SCRIPT_DIR/server.ts" &
else
  npx ts-node "$SCRIPT_DIR/server.ts" &
fi
SERVER_PID=$!

sleep 2
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "❌  Server failed to start. Check logs above."
  exit 1
fi
echo "✅  Server running (PID ${SERVER_PID})"

# ── Step 8: Start cloudflared tunnel ──────────────────────────────────────────
echo "🌐  Starting cloudflared tunnel…"
echo "    (logs → ${TUNNEL_LOG})"
rm -f "$TUNNEL_LOG"
cloudflared tunnel --url "http://127.0.0.1:${PORT}" >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

# Wait for tunnel URL to appear in log
TUNNEL_URL=""
for _i in {1..30}; do
  sleep 1
  TUNNEL_URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1 || true)
  [ -n "$TUNNEL_URL" ] && break
done

# ── Done ───────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🐾  PokeClaw is ready!"
echo ""
if [ -n "$TUNNEL_URL" ]; then
  echo "   Tunnel URL : ${TUNNEL_URL}"
  if [ -n "${POKECLAW_TOKEN:-}" ]; then
    echo "   MCP URL    : ${TUNNEL_URL}/mcp?token=${POKECLAW_TOKEN}"
    echo ""
    echo "   👆 Add this URL in Poke → Settings → Integrations → Add MCP Server"
  else
    echo "   MCP URL    : ${TUNNEL_URL}/mcp"
    echo ""
    echo "   👆 Add this URL in Poke → Settings → Integrations → Add MCP Server"
    echo "   ⚠️   No token set — set POKECLAW_TOKEN to require authentication"
  fi
else
  echo "   ⚠️   Could not detect tunnel URL automatically."
  echo "   Check ${TUNNEL_LOG} for the cloudflared public URL."
fi
echo ""
echo "   Server PID : ${SERVER_PID}"
echo "   Tunnel PID : ${TUNNEL_PID}"
echo "   Tunnel log : ${TUNNEL_LOG}"
echo ""
echo "   Stop with:  kill ${SERVER_PID} ${TUNNEL_PID}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Keep alive — Ctrl+C stops both processes cleanly
trap "echo ''; echo '🛑 Stopping PokeClaw…'; kill ${SERVER_PID} ${TUNNEL_PID} 2>/dev/null; exit 0" INT TERM
wait
