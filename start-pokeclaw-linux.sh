#!/bin/bash
## PokeClaw — Linux Onboarding & Launch Script
##
## Usage:
##   bash start-pokeclaw-linux.sh            # interactive setup
##   bash start-pokeclaw-linux.sh --quiet    # skip prompts, use env vars / saved config
##
## Environment variables (all optional):
##   POKECLAW_PORT            — port (default: 3741)
##   POKECLAW_ROOTS           — comma-separated allowed paths (default: $HOME)
##   POKECLAW_TOKEN           — secret auth token
##   POKECLAW_TUNNEL_ENABLED  — 1 to enable cloudflared tunnel
##   POKECLAW_TUNNEL_MODE     — quick | named (default: quick)
##   POKECLAW_TUNNEL_NAME     — tunnel name for named mode (default: PokeClaw)
##   POKECLAW_TUNNEL_HOSTNAME — optional DNS hostname for named mode
##
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="$HOME/.pokeclaw"
CONFIG_FILE="$CONFIG_DIR/launch.env"
TUNNEL_CONFIG_FILE="$CONFIG_DIR/PokeClaw.yaml"
PORT="${POKECLAW_PORT:-3741}"
ROOTS="${POKECLAW_ROOTS:-$HOME}"
TOKEN="${POKECLAW_TOKEN:-}"
TUNNEL_ENABLED="${POKECLAW_TUNNEL_ENABLED:-}"
TUNNEL_MODE="${POKECLAW_TUNNEL_MODE:-quick}"
TUNNEL_NAME="${POKECLAW_TUNNEL_NAME:-PokeClaw}"
TUNNEL_HOSTNAME="${POKECLAW_TUNNEL_HOSTNAME:-}"
QUIET=false
RUNTIME=""
SERVER_PID=""
CLOUDflared=""
PM="unknown"

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
TUNNEL_ENABLED="${POKECLAW_TUNNEL_ENABLED:-${TUNNEL_ENABLED:-}}"
TUNNEL_MODE="${POKECLAW_TUNNEL_MODE:-${TUNNEL_MODE:-quick}}"
TUNNEL_NAME="${POKECLAW_TUNNEL_NAME:-${TUNNEL_NAME:-PokeClaw}}"
TUNNEL_HOSTNAME="${POKECLAW_TUNNEL_HOSTNAME:-${TUNNEL_HOSTNAME:-}}"

save_config() {
  mkdir -p "$CONFIG_DIR"
  {
    printf 'export POKECLAW_PORT=%q\n' "$PORT"
    printf 'export POKECLAW_ROOTS=%q\n' "$ROOTS"
    printf 'export POKECLAW_TOKEN=%q\n' "$TOKEN"
    printf 'export POKECLAW_TUNNEL_ENABLED=%q\n' "$TUNNEL_ENABLED"
    printf 'export POKECLAW_TUNNEL_MODE=%q\n' "$TUNNEL_MODE"
    printf 'export POKECLAW_TUNNEL_NAME=%q\n' "$TUNNEL_NAME"
    printf 'export POKECLAW_TUNNEL_HOSTNAME=%q\n' "$TUNNEL_HOSTNAME"
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

ensure_pm() {
  if command -v apt-get >/dev/null 2>&1; then PM="apt"
  elif command -v dnf >/dev/null 2>&1; then PM="dnf"
  elif command -v pacman >/dev/null 2>&1; then PM="pacman"
  else PM="unknown"
  fi
}

ensure_pkg() {
  local pkg="$1"
  if command -v "$pkg" >/dev/null 2>&1; then
    return
  fi
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

ensure_cloudflared() {
  if command -v cloudflared >/dev/null 2>&1; then
    CLOUDflared="$(command -v cloudflared)"
    echo "✅  cloudflared already installed"
    return
  fi

  echo ""
  echo "Step 3 — Installing cloudflared…"
  case "$PM" in
    apt)
      curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
      echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" \
        | sudo tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
      sudo apt-get update -qq
      sudo apt-get install -y cloudflared
      ;;
    dnf)
      curl -fsSL https://pkg.cloudflare.com/cloudflared-ascii.repo | sudo tee /etc/yum.repos.d/cloudflared.repo >/dev/null
      sudo dnf install -y cloudflared
      ;;
    pacman)
      if command -v yay >/dev/null 2>&1; then
        yay -S --noconfirm cloudflared
      elif command -v paru >/dev/null 2>&1; then
        paru -S --noconfirm cloudflared
      else
        echo "⚠️   Please install cloudflared manually (AUR or binary):"
        echo "    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
        exit 1
      fi
      ;;
    *)
      echo "❌  Cannot install cloudflared automatically. Please install it manually:"
      echo "    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
      exit 1
      ;;
  esac
  CLOUDflared="$(command -v cloudflared)"
  echo "✅  cloudflared installed"
}

ensure_dependencies() {
  cd "$SCRIPT_DIR"
  if [ "$RUNTIME" = "node" ]; then
    if [ ! -d "$SCRIPT_DIR/node_modules" ] || [ ! -x "$SCRIPT_DIR/node_modules/.bin/ts-node" ]; then
      echo "Step 4 — Installing node dependencies…"
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

write_tunnel_config() {
  local tunnel_id="$1"
  local credentials_file="$2"
  mkdir -p "$CONFIG_DIR"
  cat > "$TUNNEL_CONFIG_FILE" <<YAML
tunnel: ${tunnel_id}
credentials-file: ${credentials_file}
ingress:
  - service: http://127.0.0.1:${PORT}
  - service: http_status:404
YAML
}

create_named_tunnel() {
  local output tunnel_id credentials_file route_output
  output="$($CLOUDflared tunnel create "$TUNNEL_NAME" 2>&1 || true)"
  tunnel_id="$(printf '%s\n' "$output" | grep -Eo '[0-9a-f]{8}-[0-9a-f-]{27,}' | head -n1 || true)"
  credentials_file="$(printf '%s\n' "$output" | sed -nE 's/.*(\/[^[:space:]]+\.json).*/\1/p' | head -n1 || true)"

  if [ -z "$tunnel_id" ]; then
    echo "❌  Could not create or detect the named tunnel id for ${TUNNEL_NAME}."
    echo "$output"
    exit 1
  fi

  if [ -z "$credentials_file" ]; then
    credentials_file="$CONFIG_DIR/${TUNNEL_NAME}.json"
  fi

  write_tunnel_config "$tunnel_id" "$credentials_file"

  if [ -n "$TUNNEL_HOSTNAME" ]; then
    route_output="$($CLOUDflared tunnel route dns "$TUNNEL_NAME" "$TUNNEL_HOSTNAME" 2>&1 || true)"
    if [ -n "$route_output" ]; then
      echo "$route_output"
    fi
  fi

  echo "✅  PokeClaw is ready"
}

run_tunnel() {
  local tunnel_cmd
  if [[ "$(printf %s "$TUNNEL_MODE" | tr '[:upper:]' '[:lower:]')" == "named" ]]; then
    create_named_tunnel
    tunnel_cmd=(tunnel --config "$TUNNEL_CONFIG_FILE" run "$TUNNEL_NAME")
  else
    tunnel_cmd=(tunnel --url "http://127.0.0.1:${PORT}")
  fi

  echo ""
  echo "🔗  PokeClaw is live"
  "$CLOUDflared" "${tunnel_cmd[@]}"
}

cleanup() {
  if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo ""
echo "🐾  PokeClaw — Linux Setup & Launch"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ensure_pm
case "$PM" in
  apt|dnf|pacman) echo "📦  Detected package manager: ${PM}" ;;
  *) echo "❌  Unsupported Linux distribution: no apt-get, dnf, or pacman found."; exit 1 ;;
esac

ensure_pkg curl
ensure_runtime
ensure_cloudflared
ensure_dependencies

if [ "$QUIET" = false ]; then
  echo ""
  echo "Step 5 — Configuration"
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
    if confirm '   Use named tunnel mode' N; then
      TUNNEL_MODE="named"
      TUNNEL_NAME="$(prompt '   Tunnel name' "$TUNNEL_NAME")"
      TUNNEL_HOSTNAME="$(prompt '   Hostname for the named tunnel (optional)' "$TUNNEL_HOSTNAME")"
    else
      TUNNEL_MODE="quick"
    fi
  else
    TUNNEL_ENABLED=0
  fi

  save_config
else
  echo "⚡  Quiet mode — using existing environment and saved config"
  echo "   POKECLAW_PORT           = ${PORT:-3741}"
  echo "   POKECLAW_ROOTS          = ${ROOTS:-$HOME}"
  echo "   POKECLAW_TOKEN          = $([ -n "$TOKEN" ] && echo '(set)' || echo '(not set)')"
  echo "   POKECLAW_TUNNEL_ENABLED  = ${TUNNEL_ENABLED:-0}"
  echo "   POKECLAW_TUNNEL_MODE     = ${TUNNEL_MODE:-quick}"
fi

existing_pid="$(find_port_pid)"
if [ -n "$existing_pid" ]; then
  echo ""
  echo "⚠️   Port ${PORT} in use — killing PID ${existing_pid}…"
  kill "$existing_pid" 2>/dev/null || true
  sleep 1
fi

launch_server
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
