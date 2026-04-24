# 🐾 PokeClaw

**PokeClaw** is a local [MCP](https://modelcontextprotocol.io) server that gives [Poke](https://poke.com) access to your Mac or Linux machine's filesystem and terminal.

## What is Poke?

[Poke](https://poke.com) is your personal AI — the assistant you text to get things done. Poke can manage your emails, calendar, reminders, integrations, and much more, all through a simple conversation.

By default, Poke lives in the cloud and doesn't have access to files on your computer. **PokeClaw changes that.** It runs a small server locally on your machine and creates a secure tunnel so Poke can reach it. Once connected, you can ask Poke things like:

- "Read my project notes in ~/Documents/notes.md"
- "Run `git status` in my repo"
- "List everything on my Desktop"
- "What is my NODE_ENV set to?"

PokeClaw works on **macOS** (any Mac) and **Linux** (Debian/Ubuntu, Fedora/RHEL, Arch, and compatible distributions).

### Native Mac companion (experimental)

A native SwiftUI scaffold now lives in `native-mac/`. It is intentionally lightweight for now and exists to explore a Mac-first shell that can eventually sit alongside the local MCP server.

Planned next steps:
- turn the scaffold into a menu bar utility
- add server status and tunnel visibility
- wire in controls for start/stop and quick copy actions
- tighten the visual polish so the Mac app feels like a first-class companion


---

## Tools available when PokeClaw is active

| Tool | What it does |
|---|---|
| `read_file` | Read any file in allowed paths |
| `write_file` | Create or edit files on your machine |
| `list_directory` | Browse folder contents |
| `search_files` | Find files by glob pattern (e.g. `**/*.ts`) |
| `run_command` | Run any shell command (`git`, `npm`, `brew`, `python`…) |
| `get_env` | Read environment variables |
| `search_text` | Search text inside files under allowed paths |
| `system_info` | Show machine/runtime details for troubleshooting |

---

## Automated Setup (Recommended)

Choose the script that matches your OS. Both handle the **full setup and launch** automatically.

### macOS

```bash
bash start-pokeclaw-mac.sh
```

The script will:
1. **Install Homebrew** if not present
2. **Install Bun** (preferred) or use Node.js if already installed
3. **Install cloudflared** via Homebrew if not present
4. **Install dependencies**
5. **Guide you through configuration** — port, allowed folders, auth token
6. **Optionally save settings** to `~/.zshrc` for future sessions
7. **Launch the server and cloudflared tunnel**, then print your public MCP URL

> **Quiet mode:** Relaunch with `bash start-pokeclaw-mac.sh --quiet` to skip all prompts and use your saved settings.

---

### Linux

```bash
bash start-pokeclaw-linux.sh
```

The Linux script performs the same steps as the macOS version, with the following differences:

- **No Homebrew** — uses your system package manager instead (`apt` for Debian/Ubuntu, `dnf` for Fedora/RHEL, `pacman` for Arch)
- **cloudflared** is installed via the official Cloudflare package repository (apt/dnf) or AUR (Arch)
- Settings are saved to `~/.bashrc` instead of `~/.zshrc`
- Port-in-use detection uses `lsof` with a `fuser` fallback

Supported distributions:
- Debian / Ubuntu (and derivatives): uses `apt`
- Fedora / RHEL / CentOS Stream: uses `dnf`
- Arch Linux (and derivatives): uses `pacman` + AUR helper (`yay` or `paru`) for cloudflared

> **Quiet mode:** Relaunch with `bash start-pokeclaw-linux.sh --quiet` to skip all prompts and use your saved settings.

---

## Manual Setup (Advanced)

If you prefer to configure things yourself:

### Prerequisites

- Node.js 18+ or Bun
- **macOS:** cloudflared via `brew install cloudflared`
- **Linux:** cloudflared via your package manager or from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

### Step 1 — Set up the server

```bash
mkdir -p ~/pokeclaw
cp server.ts ~/pokeclaw/server.ts
cd ~/pokeclaw
bun init -y
bun add glob
```

Or with npm:

```bash
npm init -y && npm install glob && npm install -D typescript @types/node
```

### Step 2 — Configure environment variables

**macOS** — add to `~/.zshrc`:

```bash
export POKECLAW_PORT=3741
export POKECLAW_ROOTS="$HOME"
export POKECLAW_TOKEN="your-secret-token-here"
export POKECLAW_LOG_LEVEL=info
```

**Linux** — add to `~/.bashrc`:

```bash
export POKECLAW_PORT=3741
export POKECLAW_ROOTS="$HOME"
export POKECLAW_TOKEN="your-secret-token-here"
export POKECLAW_LOG_LEVEL=info
```

To restrict to specific folders only:

```bash
export POKECLAW_ROOTS="$HOME/Documents,$HOME/Desktop,$HOME/Projects"
```

### Step 3 — Start PokeClaw

**macOS:**
```bash
bash start-pokeclaw-mac.sh
```

**Linux:**
```bash
bash start-pokeclaw-linux.sh
```

Or start each component manually:

```bash
# Terminal 1
bun run ~/pokeclaw/server.ts

# Terminal 2
cloudflared tunnel --url http://127.0.0.1:3741
```

---

## Step 4 — Connect to Poke

1. Copy the tunnel URL printed by the script (e.g. `https://random-words.trycloudflare.com`)
2. Go to **[Poke](https://poke.com) → Settings → Integrations → Add MCP Server**
3. Name: `PokeClaw`
4. URL: `https://random-words.trycloudflare.com/mcp?token=your-secret-token-here`
   - The token is passed as a query parameter — **no Authorization header needed**
   - If you did not set a token, use: `https://random-words.trycloudflare.com/mcp`
5. Save — Poke will verify the connection
6. Test it: tell Poke "use PokeClaw to list my Desktop files"

> **Note:** The server also accepts `Authorization: Bearer <token>` headers for backwards compatibility.

---

## Step 5 (optional) — Auto-start on login

### macOS — LaunchAgent

Save as `~/Library/LaunchAgents/com.pokeclaw.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.pokeclaw</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/bun</string>
    <string>run</string>
    <string>$HOME/pokeclaw/server.ts</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>POKECLAW_PORT</key><string>3741</string>
    <key>POKECLAW_ROOTS</key><string>/Users/your-username</string>
    <key>POKECLAW_TOKEN</key><string>your-secret-token-here</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/pokeclaw.log</string>
  <key>StandardErrorPath</key><string>/tmp/pokeclaw-error.log</string>
</dict>
</plist>
```

Load it:

```bash
launchctl load ~/Library/LaunchAgents/com.pokeclaw.plist
```

### Linux — systemd user service

Save as `~/.config/systemd/user/pokeclaw.service`:

```ini
[Unit]
Description=PokeClaw MCP Server
After=network.target

[Service]
Type=simple
ExecStart=/home/your-username/.bun/bin/bun run /home/your-username/pokeclaw/server.ts
Environment=POKECLAW_PORT=3741
Environment=POKECLAW_ROOTS=/home/your-username
Environment=POKECLAW_TOKEN=your-secret-token-here
Restart=on-failure
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
```

Enable and start:

```bash
systemctl --user daemon-reload
systemctl --user enable --now pokeclaw
```

---

## Security notes

- Server listens on `127.0.0.1` only — not exposed without cloudflared
- Set `POKECLAW_TOKEN` so only Poke (with the token) can call it
- Token can be passed as `?token=...` query param OR `Authorization: Bearer ...` header
- Limit `POKECLAW_ROOTS` to folders Poke actually needs
- Stop cloudflared or the server anytime to instantly revoke all access
- Dangerous commands (`rm -rf /`, `sudo rm`, fork bombs) are blocked in code

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "port already in use" | Set `POKECLAW_PORT=3742` (or any free port) |
| Poke says "connection refused" | Make sure both `server.ts` AND cloudflared are running |
| cloudflared URL changes | Restart → get new URL → update in [Poke settings](https://poke.com/settings/integrations) |
| Permission denied on a file | Add its parent directory to `POKECLAW_ROOTS` |
| Command times out | Pass `timeout_ms` in your request to Poke |
| Bun not found after install | Run `source ~/.zshrc` (macOS) or `source ~/.bashrc` (Linux), or open a new terminal |
| Poke rejects the URL | Use the `?token=` query parameter format instead of the Authorization header |
| Linux: `lsb_release` not found | Install with `sudo apt install lsb-release` or `sudo dnf install redhat-lsb-core` |
| Linux: cloudflared not in repo | Install the binary directly from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ |

For a permanent (stable) tunnel URL, create a named Cloudflare tunnel:
https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/

---

## Beta branch notes

This branch starts with a few practical improvements:

- richer server logging with color when available
- a new `search_text` MCP tool for searching file contents
- a new `system_info` MCP tool for quick runtime diagnostics
- `/health` now returns auth and root-count details
- `POKECLAW_LOG_LEVEL` for quieter or more verbose logs

I also want to explore a more polished desktop wrapper next, likely a native macOS menu bar app or a lightweight Electron shell around the server.

---

Made for [Poke](https://poke.com) — your personal AI.