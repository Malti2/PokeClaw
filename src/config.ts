import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export type PermissionMode = "ask" | "auto" | "readonly";

export interface PokeClawConfig {
  /** Poke V2 API key (Kitchen key). Never logged. */
  apiKey?: string;
  /** Override for the Poke API base URL. */
  baseUrl?: string;
  permissionMode?: PermissionMode;
  /**
   * Per-tool on/off switch, e.g. { "screenshot": false, "bash": false }.
   * Tools not listed here default to enabled.
   */
  tools?: Record<string, boolean>;
  /** Extra directories to scan for skills (default: ~/.config/pokeclaw/skills). */
  skillsDirs?: string[];
  /** Skill names to disable. */
  disabledSkills?: string[];
}

export const CONFIG_DIR = join(homedir(), ".config", "pokeclaw");
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");
export const DEFAULT_SKILLS_DIR = join(CONFIG_DIR, "skills");

const VALID_KEYS = ["apiKey", "baseUrl", "permissionMode", "tools", "skillsDirs", "disabledSkills"] as const;
export type ConfigKey = (typeof VALID_KEYS)[number];

function isStringRecord(v: unknown): v is Record<string, boolean> {
  if (typeof v !== "object" || v === null) return false;
  return Object.values(v as Record<string, unknown>).every((x) => typeof x === "boolean");
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function sanitize(raw: unknown): PokeClawConfig {
  const out: PokeClawConfig = {};
  if (typeof raw !== "object" || raw === null) return out;
  const c = raw as Record<string, unknown>;
  if (typeof c.apiKey === "string" && c.apiKey.length > 0) out.apiKey = c.apiKey;
  if (typeof c.baseUrl === "string" && c.baseUrl.length > 0) out.baseUrl = c.baseUrl;
  if (c.permissionMode === "ask" || c.permissionMode === "auto" || c.permissionMode === "readonly") {
    out.permissionMode = c.permissionMode;
  }
  if (isStringRecord(c.tools)) out.tools = { ...c.tools };
  if (isStringArray(c.skillsDirs)) out.skillsDirs = [...c.skillsDirs];
  if (isStringArray(c.disabledSkills)) out.disabledSkills = [...c.disabledSkills];
  return out;
}

export function loadConfig(): PokeClawConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      return sanitize(JSON.parse(readFileSync(CONFIG_PATH, "utf-8")));
    }
  } catch {
    // Corrupt or unreadable config -> treat as empty.
  }
  return {};
}

export function saveConfig(cfg: PokeClawConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(sanitize(cfg), null, 2) + "\n", { mode: 0o600 });
}

export function setConfigValue(key: string, value: string): void {
  if (!(VALID_KEYS as readonly string[]).includes(key)) {
    throw new Error(`Unknown config key "${key}". Valid keys: ${VALID_KEYS.join(", ")}`);
  }
  const cfg = loadConfig();
  if (key === "tools" || key === "skillsDirs" || key === "disabledSkills") {
    // Structured keys: value must be JSON, e.g. '{"screenshot":false}' or '["a","b"]'.
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error(`Config key "${key}" expects a JSON value, e.g. '${key === "tools" ? "{\"screenshot\":false}" : "[\"my-skill\"]"}'.`);
    }
    (cfg as Record<string, unknown>)[key] = parsed;
  } else {
    (cfg as Record<string, string>)[key] = value;
  }
  saveConfig(cfg);
}

export function getConfigValue(key: string): string | undefined {
  if (!(VALID_KEYS as readonly string[]).includes(key)) {
    throw new Error(`Unknown config key "${key}". Valid keys: ${VALID_KEYS.join(", ")}`);
  }
  const v = (loadConfig() as Record<string, unknown>)[key];
  if (typeof v === "string") return v;
  if (v !== undefined) return JSON.stringify(v);
  return undefined;
}

/** True unless the user explicitly disabled this tool in config. */
export function toolEnabled(cfg: PokeClawConfig, name: string): boolean {
  return cfg.tools?.[name] !== false;
}

/** Redacted view for display: the key itself is never printed. */
export function redactConfig(cfg: PokeClawConfig): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(cfg)) {
    out[k] =
      k === "apiKey" && typeof v === "string" && v.length > 4 ? `****${v.slice(-4)}` : String(v);
  }
  return out;
}

export function permissionModeOf(cfg: PokeClawConfig): PermissionMode {
  return cfg.permissionMode ?? "ask";
}

/** Base URL for the Poke API: explicit config wins, then POKE_API env, then default. */
export function baseUrlOf(cfg: PokeClawConfig): string {
  const raw = cfg.baseUrl ?? process.env.POKE_API ?? "https://poke.com/api/v1";
  return raw.replace(/\/+$/, "");
}
