#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${POKECLAW_PORT:-3741}"
ROOTS="${POKECLAW_ROOTS:-$HOME}"
TOKEN="${POKECLAW_TOKEN:-}"

cd "$SCRIPT_DIR"

if command -v bun &>/dev/null; then
  if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo "Installing bun dependencies…"
    bun add poke glob 2>/dev/null || true
  fi
  export POKECLAW_PORT="$PORT"
  export POKECLAW_ROOTS="$ROOTS"
  export POKECLAW_TOKEN="$TOKEN"
  exec bun run "$SCRIPT_DIR/server.ts"
elif command -v node &>/dev/null; then
  if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo "Installing node dependencies…"
    npm init -y >/dev/null 2>&1 || true
    npm install poke glob
    npm install -D typescript @types/node
  fi
  export POKECLAW_PORT="$PORT"
  export POKECLAW_ROOTS="$ROOTS"
  export POKECLAW_TOKEN="$TOKEN"
  exec npx ts-node "$SCRIPT_DIR/server.ts"
else
  echo "Neither bun nor node was found. Install one of them first."
  exit 1
fi
