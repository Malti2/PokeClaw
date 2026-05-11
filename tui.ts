import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { createInterface } from "readline/promises";
import { PokeTunnel, getToken, isLoggedIn, login } from "poke";

export interface TunnelState {
  enabled: boolean;
  connectionId?: string;
  publicUrl?: string;
}

export interface PersistedLaunchConfig {
  port: number;
  roots: string[];
  token: string;
  paths: {
    configDir: string;
    configFile: string;
  };
  tunnel: TunnelState;
}

export interface LaunchBootstrapResult {
  config: PersistedLaunchConfig;
  tunnelProcess: { stop: () => Promise<void> | void } | null;
  tunnelSummary: string | null;
}

const APP_NAME = "PokeClaw";
const HOME = homedir();
const CONFIG_DIR = join(HOME, ".pokeclaw");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const DEFAULT_TUNNEL_NAME = "pokeclaw";
const DEFAULT_TUNNEL_BASE_URL = "https://tunnel.poke.com";

const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  cyan: "\u001b[36m",
  blue: "\u001b[34m",
  magenta: "\u001b[35m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
};

function color(text: string, code: string, enabled: boolean): string {
  return enabled ? `${code}${text}${ANSI.reset}` : text;
}

function safeTrim(value: unknown): string {
  return String(value ?? "").trim();
}

function ensureDir(path: string) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function parseRoots(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
}

function readJson<T>(file: string): T | null {
  try {
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

function renderPanel(lines: string[], isTTY: boolean): string {
  const width = Math.max(60, ...lines.map((line) => line.length + 6));
  const top = `╭${"─".repeat(width - 2)}╮`;
  const bottom = `╰${"─".repeat(width - 2)}╯`;
  const body = lines.map((line) => {
    const padding = width - 2 - line.length;
    return `│ ${line}${" ".repeat(Math.max(0, padding - 1))}│`;
  });

  return [
    color(top, `${ANSI.cyan}${ANSI.bold}`, isTTY),
    ...body.map((line) => color(line, ANSI.dim, isTTY)),
    color(bottom, `${ANSI.cyan}${ANSI.bold}`, isTTY),
  ].join("\n");
}

function showBanner(isTTY: boolean) {
  const lines = [
    color(`${APP_NAME} TUI`, `${ANSI.bold}${ANSI.magenta}`, isTTY),
    color("local setup, settings, and Poke tunnel launch", ANSI.dim, isTTY),
    "",
    color("1) Onboarding", ANSI.green, isTTY),
    color("2) Settings", ANSI.blue, isTTY),
    color("3) Start server", ANSI.cyan, isTTY),
    color("4) Exit", ANSI.yellow, isTTY),
  ];
  console.log(renderPanel(lines, isTTY));
}

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && !process.env.POKECLAW_HEADLESS && !process.argv.includes("--headless"));
}

function createPrompt() {
  return createInterface({ input: process.stdin, output: process.stdout });
}

async function ask(rl: ReturnType<typeof createPrompt>, message: string, defaultValue = ""): Promise<string> {
  const prompt = defaultValue ? `${message} [${defaultValue}] ` : `${message} `;
  const answer = (await rl.question(prompt)).trim();
  return answer || defaultValue;
}

async function confirm(rl: ReturnType<typeof createPrompt>, message: string, defaultValue = true): Promise<boolean> {
  const suffix = defaultValue ? "[Y/n]" : "[y/N]";
  const answer = (await rl.question(`${message} ${suffix} `)).trim().toLowerCase();
  if (!answer) return defaultValue;
  return ["y", "yes"].includes(answer);
}

async function pause(rl: ReturnType<typeof createPrompt>, message = "Press Enter to continue"): Promise<void> {
  await rl.question(`${message} `);
}

function normalizeRoots(raw: string, fallback: string[]): string[] {
  const roots = raw.split(",").map((entry) => entry.trim()).filter(Boolean);
  return roots.length ? roots : fallback;
}

export function loadLaunchConfig(defaults: { port: number; roots: string[]; token: string }): PersistedLaunchConfig {
  const saved = readJson<Partial<PersistedLaunchConfig>>(CONFIG_FILE) ?? {};
  const roots = parseRoots(saved.roots ?? defaults.roots);
  const tunnel = saved.tunnel ?? {};

  return {
    port: Number(saved.port ?? defaults.port) || defaults.port,
    roots: roots.length ? roots : defaults.roots,
    token: safeTrim(saved.token) || defaults.token,
    paths: {
      configDir: CONFIG_DIR,
      configFile: CONFIG_FILE,
    },
    tunnel: {
      enabled: tunnel.enabled ?? false,
      connectionId: safeTrim(tunnel.connectionId) || undefined,
      publicUrl: safeTrim(tunnel.publicUrl) || undefined,
    },
  };
}

export function saveLaunchConfig(config: PersistedLaunchConfig): void {
  ensureDir(config.paths.configDir);
  writeFileSync(config.paths.configFile, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

async function ensurePokeAuth(): Promise<string> {
  if (!isLoggedIn()) {
    await login();
  }

  const token = getToken();
  if (!token) {
    throw new Error("No Poke auth token available for tunnel startup.");
  }

  return token;
}

function setTunnelConnection(config: PersistedLaunchConfig, connectionId: string) {
  config.tunnel.connectionId = connectionId;
  config.tunnel.publicUrl = `${DEFAULT_TUNNEL_BASE_URL}/${connectionId}`;
  saveLaunchConfig(config);
}

async function startTunnelProcess(config: PersistedLaunchConfig): Promise<{ stop: () => Promise<void> | void } | null> {
  if (!config.tunnel.enabled) return null;

  const authToken = await ensurePokeAuth();
  const localMcpUrl = `http://127.0.0.1:${config.port}/mcp`;
  const tunnel = new PokeTunnel({
    url: localMcpUrl,
    name: DEFAULT_TUNNEL_NAME,
    token: authToken,
    cleanupOnStop: true,
  });

  tunnel.on("connected", (info: { connectionId?: string }) => {
    if (info?.connectionId) setTunnelConnection(config, info.connectionId);
  });

  tunnel.on("disconnected", () => {
    // The tunnel auto-reconnects inside the Poke SDK. We just keep the last stable URL in config.
  });

  tunnel.on("error", () => {
    // Surface errors in the server logs; no special handling needed here.
  });

  const info = await tunnel.start();
  const connectionId = info?.connectionId ?? (info as { connectionId?: string } | undefined)?.connectionId;
  if (connectionId) setTunnelConnection(config, connectionId);

  return tunnel;
}

async function editSettings(config: PersistedLaunchConfig): Promise<PersistedLaunchConfig> {
  const rl = createPrompt();
  try {
    let done = false;
    while (!done) {
      console.clear();
      showBanner(true);
      console.log(renderPanel([
        `Config file: ${config.paths.configFile}`,
        `Port: ${config.port}`,
        `Roots: ${config.roots.join(", ") || "(none)"}`,
        `Token: ${config.token ? "set" : "not set"}`,
        `Poke tunnel: ${config.tunnel.enabled ? (config.tunnel.connectionId ? `enabled (${config.tunnel.connectionId})` : "enabled") : "disabled"}`,
        "",
        "1) Change port",
        "2) Change roots",
        "3) Change token",
        "4) Toggle tunnel",
        "5) Save and return",
      ], true));

      const choice = await ask(rl, "Choose an option", "5");
      switch (choice) {
        case "1": {
          const port = Number(await ask(rl, "New port", String(config.port)));
          if (Number.isFinite(port) && port > 0) config.port = port;
          break;
        }
        case "2": {
          const roots = await ask(rl, "Comma-separated roots", config.roots.join(", "));
          config.roots = normalizeRoots(roots, config.roots);
          break;
        }
        case "3": {
          config.token = await ask(rl, "Token (blank to clear)", config.token);
          break;
        }
        case "4": {
          config.tunnel.enabled = await confirm(rl, "Enable the Poke tunnel", config.tunnel.enabled);
          break;
        }
        default:
          done = true;
          break;
      }
    }
  } finally {
    rl.close();
  }

  saveLaunchConfig(config);
  return config;
}

async function runOnboarding(config: PersistedLaunchConfig): Promise<PersistedLaunchConfig> {
  const rl = createPrompt();
  try {
    console.clear();
    showBanner(true);
    console.log(renderPanel([
      "Welcome to the PokeClaw onboarding flow.",
      "This will save your port, roots, token, and tunnel preference locally.",
      "",
      `Current port: ${config.port}`,
      `Current roots: ${config.roots.join(", ") || "(none)"}`,
      `Current token: ${config.token ? "set" : "not set"}`,
      `Tunnel: ${config.tunnel.enabled ? "enabled" : "disabled"}`,
    ], true));

    config.port = Number(await ask(rl, "Port", String(config.port))) || config.port;
    const roots = await ask(rl, "Allowed roots (comma-separated)", config.roots.join(", "));
    config.roots = normalizeRoots(roots, config.roots);
    config.token = await ask(rl, "Token (leave blank for no auth)", config.token);
    config.tunnel.enabled = await confirm(rl, "Enable the Poke tunnel", true);

    saveLaunchConfig(config);
    await pause(rl, "Setup saved. Press Enter to continue.");
    return config;
  } finally {
    rl.close();
  }
}

export async function resolveLaunchState(defaults: { port: number; roots: string[]; token: string }): Promise<LaunchBootstrapResult> {
  const config = loadLaunchConfig(defaults);
  const isTTY = isInteractive();

  if (isTTY) {
    const needsOnboarding = !existsSync(config.paths.configFile);
    if (needsOnboarding || process.argv.includes("--onboard")) {
      await runOnboarding(config);
    } else if (process.argv.includes("--settings")) {
      await editSettings(config);
    } else {
      const rl = createPrompt();
      try {
        console.clear();
        showBanner(true);
        console.log(renderPanel([
          `Loaded config: ${config.paths.configFile}`,
          `Port: ${config.port}`,
          `Roots: ${config.roots.join(", ") || "(none)"}`,
          `Token: ${config.token ? "set" : "not set"}`,
          `Tunnel: ${config.tunnel.enabled ? "enabled" : "disabled"}`,
          "",
          "1) Start server",
          "2) Settings",
          "3) Re-run onboarding",
          "4) Exit",
        ], true));

        const choice = await ask(rl, "Choose an option", "1");
        if (choice === "2") await editSettings(config);
        if (choice === "3") await runOnboarding(config);
        if (choice === "4") {
          rl.close();
          process.exit(0);
        }
      } finally {
        rl.close();
      }
    }
  }

  saveLaunchConfig(config);
  const tunnelProcess = await startTunnelProcess(config);
  const tunnelSummary = config.tunnel.publicUrl
    ? `${config.tunnel.publicUrl}/mcp${config.token ? `?token=${encodeURIComponent(config.token)}` : ""}`
    : null;

  return { config, tunnelProcess, tunnelSummary };
}
