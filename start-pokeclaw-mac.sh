#!/bin/bash
## PokeClaw — macOS Onboarding & Launch Script
##
## Usage:
##   bash start-pokeclaw-mac.sh            # interactive setup
##   bash start-pokeclaw-mac.sh --quiet    # skip prompts, use env vars / saved config
##
## Environment variables (all optional):
##   POKECLAW_PORT            — port (default: 3741)
##   POKECLAW_ROOTS           — comma-separated allowed paths (default: $HOME)
##   POKECLAW_TOKEN           — secret auth token
##   POKECLAW_TUNNEL_ENABLED  — 1 to enable tunnel (default: 1)
##
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="$HOME/.pokeclaw"
CONFIG_FILE="$CONFIG_DIR/launch.env"
PORT="${POKECLAW_PORT:-3741}"
ROOTS="${POKECLAW_ROOTS:-$HOME}"
TOKEN="${POKECLAW_TOKEN:-}"
TUNNEL_ENABLED="${POKECLAW_TUNNEL_ENABLED:-1}"
QUIET=false
RUNTIME=""
SERVER_PID=""
MENU_BAR_PID=""

for arg in "$@"; do
  case "$arg" in
    --quiet|-q) QUIET=true ;;
  esac
done

if [ -f "$CONFIG_FILE" ]; then
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi

PORT="${POKECLAW_PORT:-${PORT:-3741}}"
ROOTS="${POKECLAW_ROOTS:-${ROOTS:-$HOME}}"
TOKEN="${POKECLAW_TOKEN:-${TOKEN:-}}"
TUNNEL_ENABLED="${POKECLAW_TUNNEL_ENABLED:-${TUNNEL_ENABLED:-1}}"

# Startup checks for required binaries
check_binaries() {
  if ! command -v npx >/dev/null 2>&1; then
    echo "❌ Error: 'npx' is not installed. Please install Node.js (https://nodejs.org)."
    exit 1
  fi
  if ! command -v rg >/dev/null 2>&1; then
    echo "❌ Error: 'rg' (ripgrep) is not installed. Please install it (e.g., 'brew install ripgrep')."
    exit 1
  fi
}

check_poke_login() {
  if ! npx poke login --check >/dev/null 2>&1; then
    echo "⚠️  You are not logged in to Poke."
    echo "   Running 'npx poke login' now..."
    npx poke login
  fi
}

save_config() {
  mkdir -p "$CONFIG_DIR"
  {
    printf 'export POKECLAW_PORT=%q\n' "$PORT"
    printf 'export POKECLAW_ROOTS=%q\n' "$ROOTS"
    printf 'export POKECLAW_TOKEN=%q\n' "$TOKEN"
    printf 'export POKECLAW_TUNNEL_ENABLED=%q\n' "$TUNNEL_ENABLED"
  } > "$CONFIG_FILE"
}

prompt() {
  local message="$1"
  local default_value="${2:-}"
  local input=""
  if [ -n "$default_value" ]; then
    read -r -p "${message} [${default_value}]: " input
  else
    read -r -p "${message}: " input
  fi
  printf '%s' "${input:-$default_value}"
}

confirm() {
  local message="$1"
  local default_value="${2:-Y}"
  local suffix="[Y/n]"
  local input=""
  local default_upper="$(printf %s "$default_value" | tr "[:lower:]" "[:upper:]" | cut -c1)"
  if [ "$default_upper" = "N" ]; then
    suffix="[y/N]"
  fi
  read -r -p "${message} ${suffix}: " input
  input="${input:-$default_value}"
  case "$(printf %s "$input" | tr "[:upper:]" "[:lower:]")" in
    y|yes) return 0 ;;
    *) return 1 ;;
  esac
}

ensure_runtime() {
  if command -v bun >/dev/null 2>&1; then
    RUNTIME="bun"
    echo "✅  Bun $(bun --version) already installed"
  elif command -v node >/dev/null 2>&1; then
    RUNTIME="node"
    echo "✅  Node $(node --version) found — will use node"
  else
    echo ""
    echo "Step 2 — Installing Bun…"
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
    if command -v bun >/dev/null 2>&1; then
      RUNTIME="bun"
      echo "✅  Bun installed"
    else
      echo "⚠️   Bun needs a new shell. Falling back to node…"
      RUNTIME="node"
    fi
  fi
}

ensure_dependencies() {
  cd "$SCRIPT_DIR"
  if [ "$RUNTIME" = "node" ]; then
    if [ ! -d "$SCRIPT_DIR/node_modules" ] || [ ! -x "$SCRIPT_DIR/node_modules/.bin/ts-node" ]; then
      echo "Step 3 — Installing node dependencies…"
      npm init -y >/dev/null 2>&1 || true
      npm install ts-node typescript @types/node >/dev/null
      echo "✅  Dependencies installed"
    else
      echo "✅  Dependencies already present"
    fi
  fi
}

launch_server() {
  if [ "$RUNTIME" = "bun" ]; then
    POKECLAW_DISABLE_STDIN=1 POKECLAW_PORT="$PORT" POKECLAW_ROOTS="$ROOTS" POKECLAW_TOKEN="$TOKEN" \
      bun run "$SCRIPT_DIR/server.ts" &
  else
    POKECLAW_DISABLE_STDIN=1 POKECLAW_PORT="$PORT" POKECLAW_ROOTS="$ROOTS" POKECLAW_TOKEN="$TOKEN" \
      npx ts-node --transpile-only "$SCRIPT_DIR/server.ts" &
  fi
  SERVER_PID=$!
}

find_port_pid() {
  local pid=""
  pid="$(lsof -ti tcp:"${PORT}" 2>/dev/null | head -n1 || true)"
  if [ -z "$pid" ]; then
    pid="$(fuser "${PORT}/tcp" 2>/dev/null | awk '{print $1}' | head -n1 || true)"
  fi
  printf '%s' "$pid"
}

run_tunnel() {
  echo ""
  echo "🔗  Connecting to Poke tunnel..."
  npx poke tunnel http://localhost:"$PORT" --name pokeclaw
}

launch_menu_bar() {
  (
    while true; do
      echo "PokeClaw Tunnel: Connected (tunnel.poke.com)" > "$CONFIG_DIR/status.txt"
      sleep 10
    done
  ) &
  MENU_BAR_PID=$!
}

cleanup() {
  if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
  if [ -n "${MENU_BAR_PID:-}" ] && kill -0 "$MENU_BAR_PID" 2>/dev/null; then
    kill "$MENU_BAR_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo ""
echo "🌴  PokeClaw — macOS Setup & Launch"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check_binaries

if command -v brew >/dev/null 2>&1; then
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
  if [ -f /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$HOME/.zprofile" 2>/dev/null || true
  fi
  echo "✅  Homebrew installed"
fi

ensure_runtime
ensure_dependencies

if [ "$QUIET" = false ]; then
  echo ""
  echo "Step 4 — Configuration"
  echo "────────────────────────────────────────"

  PORT="$(prompt '   Port' "$PORT")"
  ROOTS="$(prompt '   Allowed folders (comma-separated)' "$ROOTS")"
  if [ -n "$TOKEN" ]; then
    TOKEN="$(prompt '   Auth token (leave blank to keep existing)' "$TOKEN")"
  else
    TOKEN="$(prompt '   Auth token (recommended — press Enter to skip)' "")"
  fi

  if confirm '   Enable PokeClaw' Y; then
    TUNNEL_ENABLED=1
  else
    TUNNEL_ENABLED=0
  fi

  save_config
else
  echo "⚡  Quiet mode — using existing environment and saved config"
  echo "   POKECLAW_PORT          = ${PORT:-3741}"
  echo "   POKECLAW_ROOTS         = ${ROOTS:-$HOME}"
  echo "   POKECLAW_TOKEN         = $([ -n "$TOKEN" ] && echo '(set)' || echo '(not set)')"
  echo "   POKECLAW_TUNNEL_ENABLED = ${TUNNEL_ENABLED:-0}"
fi

if [ "$TUNNEL_ENABLED" = "1" ]; then
  check_poke_login
fi

existing_pid="$(find_port_pid)"
if [ -n "$existing_pid" ]; then
  echo ""
  echo "⚠️   Port ${PORT} in use — killing PID ${existing_pid}…"
  kill "$existing_pid" 2>/dev/null || true
  sleep 1
fi

launch_server
launch_menu_bar
sleep 1

echo ""
echo "🚀  PokeClaw server is running on port ${PORT}"
echo "    Local URL: http://127.0.0.1:${PORT}/mcp"
if [ "$TUNNEL_ENABLED" = "1" ]; then
  run_tunnel
else
  echo "    Tunnel   : disabled"
  wait "$SERVER_PID"
fi
