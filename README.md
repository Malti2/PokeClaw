# 🌴 PokeClaw

**PokeClaw** is a local [MCP](https://modelcontextprotocol.io) server that gives [Poke](https://poke.com) secure access to your computer's filesystem and terminal — now with a real terminal dashboard, a unified `pokeclaw` CLI, and configurable security policies.

> **⚠️ AI Disclaimer**
>
> Poke is an AI and can make mistakes. PokeClaw gives Poke access to your files and terminal. While dangerous commands are blocked and you can run in `approval`/`readonly` mode, use at your own risk.

## What is Poke?

[Poke](https://poke.com) is your personal AI — the assistant you text to get things done. By default it lives in the cloud with no access to your computer. **PokeClaw changes that:** it runs a small local server and opens a secure Cloudflare tunnel so Poke can reach it. Once connected you can ask Poke things like:

- "Read my project notes in ~/Documents/notes.md"
- "Run `git status` in my repo"
- "List everything on my Desktop"
- "What is my NODE_ENV set to?"

PokeClaw runs on **macOS**, **Linux** (Debian/Ubuntu, Fedora/RHEL, Arch), and **Windows**.

---

## 🌴 What's new

- **Live TUI dashboard** — connection/tunnel status, uptime, CPU/RAM, recent tool calls, live logs, and hotkeys. Runs automatically when you have a terminal; use `--headless` for services.
- **Unified `pokeclaw` CLI** — `onboard`, `start`, `status`, `doctor`, `logs`, `install-service`.
- **Security policies** — `full`, `approval` (confirm mutating/command calls in the dashboard), or `readonly`. Plus a command allowlist and an audit log at `~/.pokeclaw/audit.log`.
- **More tools** — `edit_file`, `move_file`, `delete_file`, and a read-only `git` tool.
- **Cross-platform `system_info`** — works on macOS, Linux, and Windows (previously macOS-only).
- **Central config** — `~/.pokeclaw/config.json`, overridable by environment variables.

---

## Tools available when PokeClaw is active

| Tool | What it does |
|---|---|
| `read_file` | Read any file in allowed paths |
| `write_file` | Create or overwrite files |
| `edit_file` | Replace an exact substring in a file (optionally all occurrences) |
| `delete_file` | Delete a file (directories require `recursive: true`) |
| `move_file` | Move or rename a file |
| `list_directory` | Browse folder contents |
| `search_files` | Find files by glob pattern (e.g. `**/*.ts`) |
| `search_text` | Search text inside files under allowed paths |
| `run_command` | Run a shell command (`git`, `npm`, `python`…) |
| `git` | Read-only git (`status`, `diff`, `log`, `branch`, `show`, `remote`) |
| `get_env` | Read environment variables |
| `system_info` | Machine/runtime details for troubleshooting |
| `create_app` / `list_apps` / `edit_app` / `open_app` | Build and open tiny local webview apps |

Mutating tools (`write_file`, `edit_file`, `delete_file`, `move_file`, `run_command`, the app tools) are gated by the active security policy.

---

## Automated Setup (Recommended)

Use the launcher for your platform. Each one installs the runtime + `cloudflared`, installs dependencies, runs the onboarding wizard, and starts the dashboard.

### macOS
```bash
bash start-pokeclaw-mac.sh
```

### Linux
```bash
bash start-pokeclaw-linux.sh
```
Uses your package manager (`apt`, `dnf`, or `pacman`) instead of Homebrew.

### Windows
```powershell
powershell -ExecutionPolicy Bypass -File start-pokeclaw.ps1
```
Requires Node.js 18+ (or Bun). Installs `cloudflared` via `winget` when available.

> **Quiet mode:** add `--quiet` (bash) or `-Quiet` (PowerShell) to skip onboarding and use your saved config / environment variables.

---

## The `pokeclaw` CLI

After the launcher builds the project you can also use the CLI directly (or install it globally with `npm install -g .`):

```bash
pokeclaw onboard          # interactive setup wizard → ~/.pokeclaw/config.json
pokeclaw start            # start the server + live TUI dashboard
pokeclaw start --headless # start without the TUI (for services)
pokeclaw start --no-tunnel# start without the Cloudflare tunnel
pokeclaw status           # show status of a running server
pokeclaw logs             # print recent logs from a running server
pokeclaw doctor           # diagnose environment + configuration
pokeclaw install-service  # install a launchd/systemd autostart service
```

### Dashboard hotkeys

`q` quit · `l` cycle log level · `p` pause logs · `c` clear logs · `f` filter logs · `a` cycle policy · `?` help. When the policy is `approval`, pending calls appear with a `[y]es / [n]o` prompt.

---

## Manual Setup (Advanced)

### Prerequisites
- Node.js 18+ or Bun
- `cloudflared` (macOS: `brew install cloudflared`; Linux: package manager; Windows: `winget install Cloudflare.cloudflared`)

### Build & run
```bash
npm install
npm run build
node dist/cli.js onboard
node dist/cli.js start
```

With Bun you can skip the build and run the TypeScript directly:
```bash
bun install
bun run src/cli.ts start
```

### Configuration

Config lives in `~/.pokeclaw/config.json` (written by `pokeclaw onboard`). Any of these environment variables override it:

```bash
export POKECLAW_PORT=3741
export POKECLAW_ROOTS="$HOME/Documents,$HOME/Projects"
export POKECLAW_TOKEN="your-secret-token-here"
export POKECLAW_LOG_LEVEL=info          # debug | info | warn | error
export POKECLAW_POLICY=approval         # full | approval | readonly
export POKECLAW_COMMAND_ALLOWLIST="git,ls,cat"
export POKECLAW_TUNNEL_ENABLED=1
export POKECLAW_TUNNEL_MODE=quick       # quick | named
```

---

## Connect to Poke

1. Copy the tunnel URL shown in the dashboard (e.g. `https://random-words.trycloudflare.com`).
2. Go to **[Poke](https://poke.com) → Settings → Integrations → Add MCP Server**.
3. Name: `PokeClaw`
4. URL: `https://random-words.trycloudflare.com/mcp?token=your-secret-token-here`
   - The token is passed as a query parameter — no Authorization header needed.
   - Without a token, use `https://random-words.trycloudflare.com/mcp`.
5. Save — Poke verifies the connection.
6. Test it: tell Poke "use PokeClaw to list my Desktop files".

> The server also accepts `Authorization: Bearer <token>` for compatibility.

---

## Auto-start on login

The easiest way is:

```bash
pokeclaw install-service
```

This writes a **launchd** agent (macOS) or **systemd user** unit (Linux) that runs `pokeclaw start --headless`, then prints the command to enable it. On Windows, use Task Scheduler to run the PowerShell launcher at login.

---

## Security notes

- The MCP server binds to `127.0.0.1` only — it is not reachable without the tunnel.
- Set a `POKECLAW_TOKEN` so only Poke (with the token) can call it.
- Choose a **policy**: `readonly` blocks all writes/commands; `approval` requires you to confirm each mutating call in the dashboard (and denies them automatically when running headless without an operator); `full` allows everything.
- Limit `POKECLAW_ROOTS` to folders Poke actually needs — every path is validated against these roots.
- Mutating tool calls are recorded to `~/.pokeclaw/audit.log`.
- Dangerous commands (`rm -rf /`, `sudo rm`, disk wipes, fork bombs) are always blocked.
- Stop the server (or the tunnel) anytime to instantly revoke access.

---

## Development

```bash
npm install
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

The codebase is modular under `src/` (`config`, `security`, `state`, `logger`, `server`, `tools/`, `tui/`, `commands/`). `server.ts` at the repo root is a thin backward-compatible entrypoint that runs the server headless.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "port already in use" | Set `POKECLAW_PORT` to a free port, or run `pokeclaw doctor` |
| Poke says "connection refused" | Make sure the server AND cloudflared are running (`pokeclaw status`) |
| cloudflared URL changes | Restart → new URL shown in the dashboard → update it in [Poke settings](https://poke.com/settings/integrations) |
| Permission denied on a file | Add its parent directory to `POKECLAW_ROOTS` |
| A tool is blocked | Check your policy — `readonly`/`approval` gate mutating tools |
| Bun not found after install | Open a new terminal, or `source` your shell profile |

For a permanent (stable) tunnel URL, create a named Cloudflare tunnel:
https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/

---

Made for [Poke](https://poke.com) — your personal AI. 🌴
