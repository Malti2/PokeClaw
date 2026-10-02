# PokeClaw 🌴

**OpenClaw-style personal AI agent, powered by Poke.** Terminal-first: you chat in the terminal, Poke does the work in the cloud and operates your machine through local tools.

No third-party LLMs — the brain is always Poke.

## What it does

- **Terminal chat (Ink TUI)** — ask anything, watch Poke work with live tool cards, approve sensitive actions with `1/2/3`
- **OpenClaw-like tools** — `read`, `write`, `edit`, `bash`, `glob`, `grep`, `webfetch`, `todo`, plus:
  - `screenshot` — capture the screen as PNG so Poke can *see* it (image goes back through MCP)
  - `ui_snapshot` / `ui_click` / `ui_type` — macOS accessibility tree: see UI elements by id and click them precisely instead of guessing pixels
- **Skills** — OpenClaw-style `SKILL.md` folders in `~/.config/pokeclaw/skills/`. The catalog is injected into Poke's context; full instructions load on demand via `load_skill`
- **Configurable** — every tool can be toggled in `~/.config/pokeclaw/config.json` (`tools: { "screenshot": false }`), permission modes `ask` / `auto` / `readonly`
- **Poke tunnel** — local MCP server + reverse tunnel with auto-reconnect, so Poke reaches your machine securely

## Quick start

```sh
git clone https://github.com/Malti2/PokeClaw.git && cd PokeClaw
bun install
bun src/main.tsx
```

First start runs the onboarding: paste your Poke V2 API key (`poke.com/kitchen/api-keys`), then a one-time Poke account login (device flow) for the tunnel.

Or one-liner installs: `scripts/install.sh` (macOS/Linux), `scripts/install.ps1` (Windows).

## Config

`~/.config/pokeclaw/config.json`:

```json
{
  "permissionMode": "ask",
  "tools": { "screenshot": false },
  "skillsDirs": ["~/my-skills"],
  "disabledSkills": ["morning-briefing"]
}
```

`pokeclaw config set permissionMode auto` etc. (structured keys take JSON).

## Skills

Drop a folder with a `SKILL.md` into `~/.config/pokeclaw/skills/`:

```md
---
name: my-skill
description: One-liner for when to use this.
---

# instructions for Poke...
```

See `examples/skills/morning-briefing/SKILL.md`. `/skills` in the TUI lists installed skills.

## TUI commands

`/help` `/tools` `/skills` `/config` `/tunnel` `/clear` `/exit` — Enter sends, Alt+Enter newline, Esc aborts, Ctrl+C quits.

`pokeclaw --print "do X"` for non-interactive single queries.

## How it works

`POST /inbound/api-message` (V2 API key) delivers your message to Poke; the answer comes back asynchronously as a `reply_to_terminal` tool call through the reverse tunnel (`PokeTunnel` + local MCP server). Tools sync every 30s; the tunnel auto-reconnects with backoff.

## Dev

```sh
bun test        # 41 tests
bun run typecheck
```
