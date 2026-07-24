# 🌴 PokeClaw

**PokeClaw** is a local [MCP](https://modelcontextprotocol.io) server that gives [Poke](https://poke.com) access to your Mac or Linux machine's filesystem and terminal.

> **⚠️ AI Disclaimer**
>
> Poke is an AI and can make mistakes. PokeClaw gives Poke access to your files and terminal. While dangerous commands are blocked, use at your own risk.

## What is Poke?

[Poke](https://poke.com) is your personal AI — the assistant you text to get things done. Poke can manage your emails, calendar, reminders, integrations, and much more, all through a simple conversation.

By default, Poke lives in the cloud and doesn't have access to files on your computer. **PokeClaw changes that.** It runs a small server locally on your machine and creates a secure tunnel so Poke can reach it. Once connected, you can ask Poke things like:

- "Read my project notes in ~/Documents/notes.md"
- "Run `git status` in my repo"
- "List everything on my Desktop"
- "What is my NODE_ENV set to?"

PokeClaw works on **macOS** (any Mac) and **Linux** (Debian/Ubuntu, Fedora/RHEL, Arch, and compatible distributions).

The secure tunnel is created with [Poke's own CLI](https://poke.com) via `npx poke tunnel` — no separate tunnel binary to install or configure.

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

Use the platform-specific launcher that matches your system:

### macOS

```bash
bash start-pokeclaw-mac.sh
```

The macOS launcher will:
1. **Install Homebrew** if not present
2. **Install Bun** (preferred) or use Node.js if already installed
3. **Install dependencies**
4. **Guide you through configuration** — port, allowed folders, auth token
5. **Optionally save settings** to `~/.pokeclaw/launch.env` for future sessions
6. **Start the PokeClaw server and the Poke tunnel** (`npx poke tunnel`), which are handled directly by the launcher script

> **Prerequisites:** the launcher needs `npx` (bundled with [Node.js](https://nodejs.org)) for `npx poke`, and `rg` ([ripgrep](https://github.com/BurntSushi/ripgrep), e.g. `brew install ripgrep`). If you are not logged in to Poke yet, the launcher runs `npx poke login` for you.

> **Quiet mode:** Relaunch with `bash start-pokeclaw-mac.sh --quiet` to skip all prompts and use your saved settings.

---

### Linux

```bash
bash start-pokeclaw-linux.sh
```

The Linux launcher performs the same setup as the macOS version, with the following differences:

- **No Homebrew** — uses your system package manager instead (`apt` for Debian/Ubuntu, `dnf` for Fedora/RHEL, `pacman` for Arch)
- Missing prerequisites such as `curl` and `rg` (ripgrep) are installed via your package manager
- The tunnel is created with `npx poke tunnel` — the same way as on macOS
- Settings are saved to `~/.pokeclaw/launch.env`
- Port-in-use detection uses `lsof` with a `fuser` fallback

Supported distributions:
- Debian / Ubuntu (and derivatives): uses `apt`
- Fedora / RHEL / CentOS Stream: uses `dnf`
- Arch Linux (and derivatives): uses `pacman`

> **Quiet mode:** Relaunch with `bash start-pokeclaw-linux.sh --quiet` to skip all prompts and use your saved settings.

---

## Terminal dashboard & CLI (`pokeclaw`)

PokeClaw ships a unified `pokeclaw` command with a live terminal dashboard (TUI). It is a companion to the bash launchers — it starts the same `server.ts` and opens the tunnel the same way (`npx poke tunnel … --name pokeclaw`), and it reads/writes the **same** `~/.pokeclaw/launch.env`, so the two are fully interchangeable.

Build it once (needs Node.js 18+):

```bash
npm install
npm run build
npm link   # optional — puts `pokeclaw` on your PATH
```

Then:

```bash
pokeclaw onboard          # interactive setup → ~/.pokeclaw/launch.env
pokeclaw start            # server + Poke tunnel + live dashboard
pokeclaw start --headless # no dashboard (for services/daemons)
pokeclaw start --no-tunnel # local server only
pokeclaw status           # status of a running server
pokeclaw logs             # recent server logs
pokeclaw doctor           # environment & config diagnostics
pokeclaw install-service  # launchd/systemd autostart unit
```

The dashboard shows connection/tunnel status, uptime, CPU/RAM, recent tool calls, and a live log. Hotkeys: `q` quit · `p` pause · `c` clear · `f` filter · `?` help. Without a TTY (or with `--headless`) it prints a plain banner and keeps running. `pokeclaw start` runs `npx poke login` for you if you are not signed in.

---
## Manual Setup (Advanced)

If you prefer to configure things yourself:

### Prerequisites

- Node.js 18+ (provides `npx`, used for `npx poke tunnel`) or Bun for running the server
- `rg` ([ripgrep](https://github.com/BurntSushi/ripgrep)) for the `search_text` tool
- A [Poke](https://poke.com) account (`npx poke login`) to open the tunnel

### Step 1 — Set up the server

```bash
mkdir -p ~/pokeclaw
cp server.ts ~/pokeclaw/server.ts
cd ~/pokeclaw
bun init -y
```

`server.ts` has no external runtime dependencies — Bun runs it directly. If you prefer Node.js, install the TypeScript runner instead:

```bash
npm init -y && npm install -D ts-node typescript @types/node
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
npx poke tunnel http://localhost:3741 --name pokeclaw
```

---

## Step 4 — Connect to Poke

1. Copy the public tunnel URL printed by `npx poke tunnel` (shown by the launcher when the tunnel connects)
2. Go to **[Poke](https://poke.com) → Settings → Integrations → Add MCP Server**
3. Name: `PokeClaw`
4. URL: `<your-tunnel-url>/mcp?token=your-secret-token-here`
   - The token is passed as a query parameter — **no Authorization header needed**
   - If you did not set a token, use: `<your-tunnel-url>/mcp`
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

- Server listens on `127.0.0.1` only — not exposed without the tunnel
- Set `POKECLAW_TOKEN` so only Poke (with the token) can call it
- Token can be passed as `?token=...` query param OR `Authorization: Bearer ...` header
- Limit `POKECLAW_ROOTS` to folders Poke actually needs
- Stop the tunnel (`npx poke tunnel`) or the server anytime to instantly revoke all access
- Dangerous commands (`rm -rf /`, `sudo rm`, fork bombs) are blocked in code

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "port already in use" | Set `POKECLAW_PORT=3742` (or any free port) |
| Poke says "connection refused" | Make sure both `server.ts` AND the tunnel (`npx poke tunnel`) are running |
| Tunnel URL changes | Restart → get new URL → update in [Poke settings](https://poke.com/settings/integrations) |
| Permission denied on a file | Add its parent directory to `POKECLAW_ROOTS` |
| Command times out | Pass `timeout_ms` in your request to Poke |
| Bun not found after install | Run `source ~/.zshrc` (macOS) or `source ~/.bashrc` (Linux), or open a new terminal |
| Poke rejects the URL | Use the `?token=` query parameter format instead of the Authorization header |
| `npx poke` asks you to log in | Run `npx poke login` once, then relaunch |
| `rg` (ripgrep) not found | macOS: `brew install ripgrep` · Linux: the launcher installs it via your package manager |

The launcher starts the tunnel with a stable `--name pokeclaw`, so re-running it reconnects the same named Poke tunnel.

---

## Beta branch notes

This branch includes:

- richer server logging with color when available
- a new `search_text` MCP tool for searching file contents
- a new `system_info` MCP tool for quick runtime diagnostics
- `/health` now returns auth and root-count details
- `POKECLAW_LOG_LEVEL` for quieter or more verbose logs

---

Made for [Poke](https://poke.com) — your personal AI.