import { homedir } from "os";
import { join, resolve } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

export const HOME = homedir();
export const CONFIG_DIR = join(HOME, ".pokeclaw");
/**
 * The CLI shares the exact same config file as the single launcher
 * (`pokeclaw.js`): `~/.pokeclaw/launch.env`. That keeps the whole
 * `npx poke` launch flow consistent no matter how PokeClaw was started.
 */
export const CONFIG_FILE = join(CONFIG_DIR, "launch.env");
export const STATUS_FILE = join(CONFIG_DIR, "status.txt");

export interface PokeClawConfig {
  port: number;
  roots: string[];
  token: string;
  tunnelEnabled: boolean;
}

export const DEFAULT_CONFIG: PokeClawConfig = {
  port: 3741,
  roots: [HOME],
  token: "",
  tunnelEnabled: true,
};

/** Remove one layer of shell quoting from a `launch.env` value. */
function unquote(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/'\\''/g, "'");
  }
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}

/** Parse `export KEY=value` lines from the shared launch.env file. */
function readEnvFile(): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(CONFIG_FILE)) return out;
  try {
    const text = readFileSync(CONFIG_FILE, "utf-8");
    for (const line of text.split("\n")) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (match) out[match[1]] = unquote(match[2]);
    }
  } catch {
    /* ignore malformed config */
  }
  return out;
}

function parseRoots(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  const roots = raw
    .split(",")
    .map((r) => r.trim().replace(/^~/, HOME))
    .filter(Boolean);
  return roots.length ? roots : undefined;
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === "") return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

/**
 * Resolve the effective config from (in order of precedence):
 * environment variables > ~/.pokeclaw/launch.env > defaults.
 */
export function loadConfig(): PokeClawConfig {
  const file = readEnvFile();
  const env = process.env;

  const port = Number(env.POKECLAW_PORT ?? file.POKECLAW_PORT) || DEFAULT_CONFIG.port;
  const roots =
    parseRoots(env.POKECLAW_ROOTS) ?? parseRoots(file.POKECLAW_ROOTS) ?? DEFAULT_CONFIG.roots;
  const token = env.POKECLAW_TOKEN ?? file.POKECLAW_TOKEN ?? DEFAULT_CONFIG.token;
  const tunnelEnabled = parseBool(
    env.POKECLAW_TUNNEL_ENABLED ?? file.POKECLAW_TUNNEL_ENABLED,
    DEFAULT_CONFIG.tunnelEnabled,
  );

  return {
    port,
    roots: roots.map((r) => resolve(r)),
    token,
    tunnelEnabled,
  };
}

/** Single-quote a value for safe `source`-ing from bash. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** Persist config to the shared launch.env consumed by the bash launchers. */
export function saveConfig(config: PokeClawConfig): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  const lines = [
    `export POKECLAW_PORT=${shellQuote(String(config.port))}`,
    `export POKECLAW_ROOTS=${shellQuote(config.roots.join(","))}`,
    `export POKECLAW_TOKEN=${shellQuote(config.token)}`,
    `export POKECLAW_TUNNEL_ENABLED=${shellQuote(config.tunnelEnabled ? "1" : "0")}`,
    "",
  ];
  writeFileSync(CONFIG_FILE, lines.join("\n"), "utf-8");
}

export function configExists(): boolean {
  return existsSync(CONFIG_FILE);
}
