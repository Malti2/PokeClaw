import { homedir } from "os";
import { join, resolve } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

export const HOME = homedir();
export const CONFIG_DIR = join(HOME, ".pokeclaw");
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");
export const AUDIT_FILE = join(CONFIG_DIR, "audit.log");

export type TunnelMode = "quick" | "named";
export type LogLevel = "debug" | "info" | "warn" | "error";
/**
 * Security policy for filesystem/command tools:
 *  - full:     read + write + run_command allowed
 *  - readonly: only non-mutating tools (no write/edit/delete/move/run_command)
 *  - approval: mutating/command tools require interactive TUI approval
 */
export type Policy = "full" | "readonly" | "approval";

export interface PokeClawConfig {
  port: number;
  roots: string[];
  token: string;
  logLevel: LogLevel;
  policy: Policy;
  /** Extra commands allowed under the `approval` policy without prompting. */
  commandAllowlist: string[];
  tunnel: {
    enabled: boolean;
    mode: TunnelMode;
    name: string;
    hostname: string;
  };
}

export const DEFAULT_CONFIG: PokeClawConfig = {
  port: 3741,
  roots: [HOME],
  token: "",
  logLevel: "info",
  policy: "full",
  commandAllowlist: [],
  tunnel: {
    enabled: false,
    mode: "quick",
    name: "PokeClaw",
    hostname: "",
  },
};

function parseRoots(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  const roots = raw
    .split(",")
    .map((r) => r.trim().replace(/^~/, HOME))
    .filter(Boolean);
  return roots.length ? roots : undefined;
}

function isPolicy(value: unknown): value is Policy {
  return value === "full" || value === "readonly" || value === "approval";
}

function isLogLevel(value: unknown): value is LogLevel {
  return value === "debug" || value === "info" || value === "warn" || value === "error";
}

function readConfigFile(): Partial<PokeClawConfig> {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as Partial<PokeClawConfig>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Resolve the effective config from (in order of precedence):
 * environment variables > ~/.pokeclaw/config.json > defaults.
 */
export function loadConfig(): PokeClawConfig {
  const file = readConfigFile();
  const env = process.env;

  const port = Number(env.POKECLAW_PORT) || file.port || DEFAULT_CONFIG.port;
  const roots =
    parseRoots(env.POKECLAW_ROOTS) ??
    (Array.isArray(file.roots) && file.roots.length ? file.roots : undefined) ??
    DEFAULT_CONFIG.roots;
  const token = env.POKECLAW_TOKEN ?? file.token ?? DEFAULT_CONFIG.token;
  const logLevel = (env.POKECLAW_LOG_LEVEL?.toLowerCase() ??
    file.logLevel ??
    DEFAULT_CONFIG.logLevel) as LogLevel;
  const policyRaw = env.POKECLAW_POLICY?.toLowerCase() ?? file.policy ?? DEFAULT_CONFIG.policy;

  const allowlist =
    parseRoots(env.POKECLAW_COMMAND_ALLOWLIST) ??
    (Array.isArray(file.commandAllowlist) ? file.commandAllowlist : undefined) ??
    DEFAULT_CONFIG.commandAllowlist;

  return {
    port,
    roots: roots.map((r) => resolve(r)),
    token,
    logLevel: isLogLevel(logLevel) ? logLevel : DEFAULT_CONFIG.logLevel,
    policy: isPolicy(policyRaw) ? policyRaw : DEFAULT_CONFIG.policy,
    commandAllowlist: allowlist,
    tunnel: {
      enabled: env.POKECLAW_TUNNEL_ENABLED
        ? env.POKECLAW_TUNNEL_ENABLED === "1" || env.POKECLAW_TUNNEL_ENABLED === "true"
        : (file.tunnel?.enabled ?? DEFAULT_CONFIG.tunnel.enabled),
      mode:
        (env.POKECLAW_TUNNEL_MODE as TunnelMode) ?? file.tunnel?.mode ?? DEFAULT_CONFIG.tunnel.mode,
      name: env.POKECLAW_TUNNEL_NAME ?? file.tunnel?.name ?? DEFAULT_CONFIG.tunnel.name,
      hostname:
        env.POKECLAW_TUNNEL_HOSTNAME ?? file.tunnel?.hostname ?? DEFAULT_CONFIG.tunnel.hostname,
    },
  };
}

export function saveConfig(config: PokeClawConfig): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function configExists(): boolean {
  return existsSync(CONFIG_FILE);
}
