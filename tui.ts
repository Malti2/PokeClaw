import { execSync, spawn, type ChildProcess } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { createInterface } from "readline/promises";

export type TunnelMode = "quick" | "named";

export interface TunnelState {
  enabled: boolean;
  mode: TunnelMode;
  name: string;
  id?: string;
  credentialsFile?: string;
  configFile?: string;
  hostname?: string;
  publicUrl?: string;
  logFile?: string;
}

export interface PersistedLaunchConfig {
  port: number;
  roots: string[];
  token: string;
  paths: {
    configDir: string;
    configFile: string;
    tunnelConfigFile: string;
  };
  tunnel: TunnelState;
}

export interface LaunchBootstrapResult {
  config: PersistedLaunchConfig;
  tunnelProcess: ChildProcess | null;
  tunnelSummary: string | null;
}

const APP_NAME = "PokeClaw";
const HOME = homedir();
const CONFIG_DIR = join(HOME, ".pokeclaw");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const TUNNEL_CONFIG_FILE = join(CONFIG_DIR, "poke-gate.yaml");
const DEFAULT_TUNNEL_NAME = "poke-gate";
const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  cyan: "\u001b[36m",
  blue: "\u001b[34m",
  magenta: "\u001b[35m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
};

function color(text: string, code: string, enabled: boolean): string {
  return enabled ? `${code}${text}${ANSI.reset}` : text;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function safeTrim(value: string | undefined | null): string {
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
    return raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
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

export function loadLaunchConfig(defaults: { port: number; roots: string[]; token: string }): PersistedLaunchConfig {
  const saved = readJson<Partial<PersistedLaunchConfig>>(CONFIG_FILE) ?? {};
  const tunnel = saved.tunnel ?? {};
  const savedPaths = saved.paths ?? {};
  const roots = parseRoots(saved.roots ?? defaults.roots);

  return {
    port: Number(saved.port ?? defaults.port) || defaults.port,
    roots: roots.length ? roots : defaults.roots,
    token: safeTrim(saved.token) || defaults.token,
    paths: {
      configDir: savedPaths.configDir ? String(savedPaths.configDir) : CONFIG_DIR,
      configFile: savedPaths.configFile ? String(savedPaths.configFile) : CONFIG_FILE,
      tunnelConfigFile: savedPaths.tunnelConfigFile ? String(savedPaths.tunnelConfigFile) : TUNNEL_CONFIG_FILE,
    },
    tunnel: {
      enabled: tunnel.enabled ?? false,
      mode: tunnel.mode === "named" ? "named" : "quick",
      name: safeTrim(tunnel.name) || DEFAULT_TUNNEL_NAME,
      id: safeTrim(tunnel.id) || undefined,
      credentialsFile: safeTrim(tunnel.credentialsFile) || undefined,
      configFile: safeTrim(tunnel.configFile) || undefined,
      hostname: safeTrim(tunnel.hostname) || undefined,
      publicUrl: safeTrim(tunnel.publicUrl) || undefined,
      logFile: safeTrim(tunnel.logFile) || undefined,
    },
  };
}

export function saveLaunchConfig(config: PersistedLaunchConfig): void {
  ensureDir(config.paths.configDir);
  writeFileSync(config.paths.configFile, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
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
  const title = `${APP_NAME} TUI`;
  const lines = [
    color(title, `${ANSI.bold}${ANSI.magenta}`, isTTY),
    color("glassmorphism-inspired onboarding and settings", ANSI.dim, isTTY),
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
  const roots = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return roots.length ? roots : fallback;
}

function updateTunnelConfigFile(config: PersistedLaunchConfig): void {
  ensureDir(dirname(config.paths.tunnelConfigFile));
  const yaml = [
    `tunnel: ${config.tunnel.id ?? config.tunnel.name}`,
    `credentials-file: ${config.tunnel.credentialsFile ?? join(config.paths.configDir, `${config.tunnel.name}.json`)}`,
    `ingress:`,
    `  - service: http://127.0.0.1:${config.port}`,
    `  - service: http_status:404`,
    "",
  ].join("\n");
  writeFileSync(config.paths.tunnelConfigFile, yaml, "utf-8");
  config.tunnel.configFile = config.paths.tunnelConfigFile;
}

function detectCloudflared(): string | null {
  try {
    const path = execSync("command -v cloudflared", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    return path || null;
  } catch {
    return null;
  }
}

function runCommand(command: string): string {
  return execSync(command, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
}

function parseTunnelCreation(output: string): { id?: string; credentialsFile?: string } {
  const idMatch = output.match(/([0-9a-f]{8}-[0-9a-f-]{27,})/i);
  const credentialsMatch = output.match(/(?:credentials file written to|Written to|Saved to)\s+(.+?\.json)/i);
  return {
    id: idMatch?.[1],
    credentialsFile: credentialsMatch?.[1]?.trim().replace(/^"|"$/g, ""),
  };
}

function listKnownTunnels(output: string): boolean {
  return new RegExp(`\\b${DEFAULT_TUNNEL_NAME}\\b`, "i").test(output);
}

async function ensureTunnelProfile(config: PersistedLaunchConfig, isTTY: boolean): Promise<PersistedLaunchConfig> {
  const cloudflared = detectCloudflared();
  if (!cloudflared) {
    if (isTTY) {
      console.log(color("cloudflared was not found, so the tunnel will stay disabled for now.", ANSI.yellow, isTTY));
    }
    config.tunnel.enabled = false;
    return config;
  }

  const listOutput = (() => {
    try {
      return runCommand(`${shellQuote(cloudflared)} tunnel list 2>/dev/null || true`);
    } catch {
      return "";
    }
  })();

  if (!config.tunnel.id || !config.tunnel.credentialsFile || !listKnownTunnels(listOutput)) {
    try {
      const createOutput = runCommand(`${shellQuote(cloudflared)} tunnel create ${shellQuote(config.tunnel.name)}`);
      const parsed = parseTunnelCreation(createOutput);
      config.tunnel.id = parsed.id ?? config.tunnel.id;
      config.tunnel.credentialsFile = parsed.credentialsFile ?? config.tunnel.credentialsFile;
      config.tunnel.enabled = true;
    } catch {
      // Fall back to the existing saved profile if Cloudflare creation is unavailable.
      config.tunnel.enabled = Boolean(config.tunnel.id || config.tunnel.credentialsFile);
    }
  } else {
    config.tunnel.enabled = true;
  }

  if (config.tunnel.enabled) {
    updateTunnelConfigFile(config);
  }

  saveLaunchConfig(config);
  return config;
}

function startTunnelProcess(config: PersistedLaunchConfig): ChildProcess | null {
  const cloudflared = detectCloudflared();
  if (!cloudflared || !config.tunnel.enabled) return null;

  const logFile = join(config.paths.configDir, "poke-gate.log");
  config.tunnel.logFile = logFile;
  saveLaunchConfig(config);

  const commandArgs = config.tunnel.mode === "named" && config.tunnel.configFile
    ? ["tunnel", "--config", config.tunnel.configFile, "run", config.tunnel.name]
    : ["tunnel", "--url", `http://127.0.0.1:${config.port}`];

  const child = spawn(cloudflared, commandArgs, {
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const chunks: string[] = [];
  const capture = (data: Buffer | string) => {
    const text = data.toString();
    chunks.push(text);
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && !config.tunnel.publicUrl) {
      config.tunnel.publicUrl = match[0];
      saveLaunchConfig(config);
    }
  };

  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);
  child.on("exit", () => {
    if (!config.tunnel.publicUrl && chunks.length) {
      const joined = chunks.join("");
      const match = joined.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match) {
        config.tunnel.publicUrl = match[0];
        saveLaunchConfig(config);
      }
    }
  });

  return child;
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
        `Tunnel file: ${config.paths.tunnelConfigFile}`,
        `Port: ${config.port}`,
        `Roots: ${config.roots.join(", ") || "(none)"}`,
        `Token: ${config.token ? "set" : "not set"}`,
        `Tunnel: ${config.tunnel.enabled ? `${config.tunnel.name}${config.tunnel.id ? ` (${config.tunnel.id})` : ""}` : "disabled"}`,
        "",
        "1) Change port",
        "2) Change roots",
        "3) Change token",
        "4) Manage tunnel",
        "5) Toggle tunnel mode (quick/named)",
        "6) Save and return",
      ], true));

      const choice = await ask(rl, "Choose an option", "6");
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
          const manageTunnel = await confirm(rl, "Keep the tunnel enabled", config.tunnel.enabled);
          config.tunnel.enabled = manageTunnel;
          if (manageTunnel) {
            const tunnelName = await ask(rl, "Tunnel name", config.tunnel.name || DEFAULT_TUNNEL_NAME);
            config.tunnel.name = tunnelName || DEFAULT_TUNNEL_NAME;
            const hostname = await ask(rl, "Hostname (optional)", config.tunnel.hostname ?? "");
            config.tunnel.hostname = hostname || undefined;
            config = await ensureTunnelProfile(config, true);
          }
          break;
        }
        case "5": {
          config.tunnel.mode = config.tunnel.mode === "named" ? "quick" : "named";
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
      "This will save your port, roots, token, and tunnel settings locally.",
      "",
      `Current port: ${config.port}`,
      `Current roots: ${config.roots.join(", ") || "(none)"}`,
      `Current token: ${config.token ? "set" : "not set"}`,
      `Tunnel mode: ${config.tunnel.mode}`,
    ], true));

    config.port = Number(await ask(rl, "Port", String(config.port))) || config.port;
    const roots = await ask(rl, "Allowed roots (comma-separated)", config.roots.join(", "));
    config.roots = normalizeRoots(roots, config.roots);
    config.token = await ask(rl, "Token (leave blank for no auth)", config.token);

    const useTunnel = await confirm(rl, "Enable the persistent poke-gate tunnel", true);
    config.tunnel.enabled = useTunnel;
    if (useTunnel) {
      config.tunnel.mode = await confirm(rl, "Use named tunnel mode", true) ? "named" : "quick";
      config.tunnel.name = await ask(rl, "Tunnel name", config.tunnel.name || DEFAULT_TUNNEL_NAME) || DEFAULT_TUNNEL_NAME;
      const hostname = await ask(rl, "Hostname for the named tunnel (optional)", config.tunnel.hostname ?? "");
      config.tunnel.hostname = hostname || undefined;
      config = await ensureTunnelProfile(config, true);
    }

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
          `Tunnel: ${config.tunnel.enabled ? `${config.tunnel.name} (${config.tunnel.mode})` : "disabled"}`,
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
  const tunnelProcess = config.tunnel.enabled ? startTunnelProcess(config) : null;
  const tunnelSummary = config.tunnel.publicUrl
    ? `${config.tunnel.publicUrl}/mcp${config.token ? `?token=${encodeURIComponent(config.token)}` : ""}`
    : config.tunnel.hostname
      ? `https://${config.tunnel.hostname}/mcp${config.token ? `?token=${encodeURIComponent(config.token)}` : ""}`
      : null;

  return { config, tunnelProcess, tunnelSummary };
}
