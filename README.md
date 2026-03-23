## 🐾 PokeClaw — Poke Recipe for Mac Access

PokeClaw is a local MCP server that bridges Poke to your Mac's filesystem and terminal.
Once running, Poke can read/write files, search your Mac, and run shell commands on your behalf.

---

## Tools available when PokeClaw is active

| Tool | What it does |
|---|---|
| read_file | Read any file in allowed paths |
| write_file | Create or edit files on your Mac |
| list_directory | Browse folder contents |
| search_files | Find files by glob pattern (e.g. **/*.ts) |
| run_command | Run any shell command (git, npm, brew, python…) |
| get_env | Read environment variables |

---

## Automated Setup (Recommended)

The `start-pokeclaw.sh` script now handles the **full setup and launch** automatically. Just run it once:

```bash
bash start-pokeclaw.sh
```

The script will:
1. **Install Homebrew** if not present
2. **Install Bun** (preferred) or use Node.js if already installed
3. **Install cloudflared** via Homebrew if not present
4. **Install dependencies** (glob and TypeScript types)
5. **Guide you through configuration** — port, allowed folders, auth token
6. **Optionally save settings** to `~/.zshrc` for future sessions
7. **Launch the server and cloudflared tunnel**, then print your public MCP URL

No manual steps required on a fresh Mac.

---

## Manual Setup (Advanced)

If you prefer to configure things yourself:

### Prerequisites

- Node.js 18+ or Bun
- cloudflared: `brew install cloudflared`

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

Add to your `~/.zshrc` or pass inline:

```bash
export POKECLAW_PORT=3741
export POKECLAW_ROOTS="$HOME"                   # restrict to home folder
export POKECLAW_TOKEN="your-secret-token-here"  # recommended
```

To restrict to specific folders only:

```bash
export POKECLAW_ROOTS="$HOME/Documents,$HOME/Desktop,$HOME/Projects"
```

### Step 3 — Start PokeClaw

```bash
bash start-pokeclaw.sh
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
2. Go to **Poke → Settings → Integrations → Add MCP Server**
3. Name: `PokeClaw`
4. URL: `https://random-words.trycloudflare.com/mcp?token=your-secret-token-here`
   - The token is passed as a query parameter — **no Authorization header needed**
   - If you did not set a token, use: `https://random-words.trycloudflare.com/mcp`
5. Save — Poke will verify the connection
6. Test it: tell Poke "use PokeClaw to list my Desktop files"

> **Note:** The server also still accepts `Authorization: Bearer <token>` headers for backwards compatibility.

---

## Step 5 (optional) — Auto-start on login

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
| Poke says "connection refused" | Make sure both server.ts AND cloudflared are running |
| cloudflared URL changes | Restart → get new URL → update in Poke settings |
| Permission denied on a file | Add its parent directory to `POKECLAW_ROOTS` |
| Command times out | Pass `timeout_ms` in your request to Poke |
| Bun not found after install | Run `source ~/.zshrc` or open a new terminal tab |
| Poke UI rejects the URL | Use the `?token=` query parameter format instead of the Authorization header |

For a permanent (stable) tunnel URL, create a named Cloudflare tunnel:
https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/