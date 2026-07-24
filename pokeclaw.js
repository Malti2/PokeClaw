#!/usr/bin/env node
/**
 * PokeClaw — single cross-platform launcher.
 *
 * One entry point for macOS, Linux and Windows. Start it with:
 *
 *   node pokeclaw.js            # interactive setup + start
 *   node pokeclaw.js --quiet    # skip prompts, use env / saved config
 *   node pokeclaw.js --headless # no dashboard (services/daemons)
 *   node pokeclaw.js --no-tunnel# local server only
 *
 * (On macOS/Linux you can also `chmod +x pokeclaw.js && ./pokeclaw.js`.)
 *
 * It detects the OS, picks the runtime (Bun if present, else Node via ts-node),
 * opens the tunnel with `npx poke tunnel`, and — when the `pokeclaw` CLI has
 * been built (`npm run build`) — shows the live TUI dashboard. Node.js/`npx`
 * is the only hard requirement (it is needed for `npx poke` anyway).
 */
"use strict";

const { spawn, execSync } = require("child_process");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");

const HOME = os.homedir();
const SCRIPT_DIR = __dirname;
const CONFIG_DIR = path.join(HOME, ".pokeclaw");
const CONFIG_FILE = path.join(CONFIG_DIR, "launch.env");
const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";

const argv = process.argv.slice(2);
const FLAGS = new Set(argv);
const QUIET = FLAGS.has("--quiet") || FLAGS.has("-q");
const HEADLESS = FLAGS.has("--headless");
const NO_TUNNEL = FLAGS.has("--no-tunnel");
if (FLAGS.has("--help") || FLAGS.has("-h")) {
  process.stdout.write(
    "PokeClaw launcher\n\n" +
      "  node pokeclaw.js [--quiet] [--headless] [--no-tunnel]\n\n" +
      "Starts the local MCP server and the Poke tunnel (npx poke tunnel).\n",
  );
  process.exit(0);
}

function hasCommand(cmd) {
  try {
    execSync(IS_WIN ? `where ${cmd}` : `command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function unquote(raw) {
  const v = raw.trim();
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/'\\''/g, "'");
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
  return v;
}

function readConfig() {
  const cfg = {};
  if (!existsSync(CONFIG_FILE)) return cfg;
  try {
    for (const line of readFileSync(CONFIG_FILE, "utf-8").split("\n")) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m) cfg[m[1]] = unquote(m[2]);
    }
  } catch {
    /* ignore */
  }
  return cfg;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function writeConfig(cfg) {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  const lines = [
    `export POKECLAW_PORT=${shellQuote(cfg.port)}`,
    `export POKECLAW_ROOTS=${shellQuote(cfg.roots)}`,
    `export POKECLAW_TOKEN=${shellQuote(cfg.token)}`,
    `export POKECLAW_TUNNEL_ENABLED=${shellQuote(cfg.tunnelEnabled)}`,
    "",
  ];
  writeFileSync(CONFIG_FILE, lines.join("\n"), "utf-8");
}

function ask(rl, question, def) {
  return new Promise((resolve) => {
    rl.question(def ? `${question} [${def}]: ` : `${question}: `, (a) => resolve(a.trim() || def || ""));
  });
}

async function resolveConfig() {
  const file = readConfig();
  const env = process.env;
  let port = env.POKECLAW_PORT || file.POKECLAW_PORT || "3741";
  let roots = env.POKECLAW_ROOTS || file.POKECLAW_ROOTS || HOME;
  let token = env.POKECLAW_TOKEN || file.POKECLAW_TOKEN || "";
  let tunnelEnabled = env.POKECLAW_TUNNEL_ENABLED || file.POKECLAW_TUNNEL_ENABLED || "1";

  const interactive = !QUIET && process.stdin.isTTY && process.stdout.isTTY;
  if (interactive) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      process.stdout.write("\n🌴  PokeClaw — Setup & Launch\n────────────────────────────────────────\n");
      port = await ask(rl, "   Port", port);
      roots = await ask(rl, "   Allowed folders (comma-separated)", roots);
      const tokenPrompt = token ? "   Auth token (leave blank to keep existing)" : "   Auth token (recommended — press Enter to skip)";
      token = (await ask(rl, tokenPrompt, token)) || "";
      const enable = await ask(rl, "   Enable PokeClaw tunnel? [Y/n]", "Y");
      tunnelEnabled = enable.toLowerCase().startsWith("n") ? "0" : "1";
    } finally {
      rl.close();
    }
    writeConfig({ port, roots, token, tunnelEnabled });
  }

  return { port, roots, token, tunnelEnabled };
}

function ensureRipgrepHint() {
  if (hasCommand("rg")) return;
  let hint = "";
  if (IS_MAC) hint = "brew install ripgrep";
  else if (IS_WIN) hint = "winget install BurntSushi.ripgrep.MSVC";
  else hint = "sudo apt install ripgrep  (or dnf/pacman)";
  process.stdout.write(`ℹ️   'rg' (ripgrep) not found — the search_text tool needs it. Install: ${hint}\n`);
}

/** Pick how to run server.ts: Bun if available, otherwise Node via ts-node. */
function serverRuntime() {
  const entry = path.join(SCRIPT_DIR, "server.ts");
  if (hasCommand("bun")) return { cmd: "bun", args: ["run", entry] };
  return { cmd: IS_WIN ? "npx.cmd" : "npx", args: ["ts-node", "--transpile-only", entry] };
}

function spawnServer(cfg, inheritStdio) {
  const { cmd, args } = serverRuntime();
  const io = inheritStdio ? "inherit" : "ignore";
  return spawn(cmd, args, {
    stdio: ["ignore", io, io],
    env: {
      ...process.env,
      POKECLAW_DISABLE_STDIN: "1",
      POKECLAW_PORT: cfg.port,
      POKECLAW_ROOTS: cfg.roots,
      POKECLAW_TOKEN: cfg.token,
    },
  });
}

function checkPokeLogin() {
  try {
    execSync(`${IS_WIN ? "npx.cmd" : "npx"} poke login --check`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function pokeLoginInteractive() {
  try {
    execSync(`${IS_WIN ? "npx.cmd" : "npx"} poke login`, { stdio: "inherit" });
  } catch {
    /* user can retry */
  }
}

/** When the CLI/TUI is built, delegate to it for the full dashboard experience. */
function delegateToCli(cfg) {
  const cliEntry = path.join(SCRIPT_DIR, "dist", "cli.js");
  if (HEADLESS || !existsSync(cliEntry) || !process.stdout.isTTY || !process.stdin.isTTY) return false;
  const args = [cliEntry, "start"];
  if (NO_TUNNEL) args.push("--no-tunnel");
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      POKECLAW_PORT: cfg.port,
      POKECLAW_ROOTS: cfg.roots,
      POKECLAW_TOKEN: cfg.token,
      POKECLAW_TUNNEL_ENABLED: cfg.tunnelEnabled,
    },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
  return true;
}

function inlineStart(cfg) {
  const wantTunnel = cfg.tunnelEnabled === "1" && !NO_TUNNEL;
  if (wantTunnel && !checkPokeLogin()) {
    process.stdout.write("⚠️  Not logged in to Poke — running 'npx poke login'…\n");
    pokeLoginInteractive();
  }

  const server = spawnServer(cfg, true);
  server.on("error", (err) => {
    process.stderr.write(`✖ Failed to start server: ${err.message}\n`);
    process.exit(1);
  });

  let tunnel = null;
  let shuttingDown = false;
  const shutdown = (code) => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (tunnel && !tunnel.killed) tunnel.kill();
    if (server && !server.killed) server.kill();
    process.exit(code || 0);
  };
  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
  server.on("exit", (code) => {
    if (!shuttingDown) {
      process.stderr.write(`\nServer exited (code ${code ?? "?"}).\n`);
      shutdown(code ?? 0);
    }
  });

  setTimeout(() => {
    process.stdout.write(`\n🚀  PokeClaw server is running on port ${cfg.port}\n`);
    process.stdout.write(`    Local URL: http://127.0.0.1:${cfg.port}/mcp\n`);
    if (wantTunnel) {
      process.stdout.write("\n🔗  Connecting to Poke tunnel...\n");
      const npx = IS_WIN ? "npx.cmd" : "npx";
      tunnel = spawn(npx, ["poke", "tunnel", `http://localhost:${cfg.port}`, "--name", "pokeclaw"], {
        stdio: "inherit",
      });
      tunnel.on("error", (err) => process.stderr.write(`Tunnel error: ${err.message}\n`));
    } else {
      process.stdout.write("    Tunnel   : disabled\n");
    }
  }, 1000);
}

async function main() {
  process.stdout.write(`\n🌴  PokeClaw launcher — ${process.platform} ${process.arch}\n`);

  if (!hasCommand("npx")) {
    process.stderr.write("✖ 'npx' is not installed. Please install Node.js (https://nodejs.org).\n");
    process.exit(1);
  }
  ensureRipgrepHint();

  const cfg = await resolveConfig();

  // Prefer the full CLI + TUI dashboard when it has been built; otherwise run
  // a self-contained server + tunnel launch that works with only Node present.
  if (!delegateToCli(cfg)) {
    inlineStart(cfg);
  }
}

main().catch((err) => {
  process.stderr.write(`✖ ${err && err.message ? err.message : String(err)}\n`);
  process.exit(1);
});
