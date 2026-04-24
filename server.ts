#!/usr/bin/env bun
/**
 * PokeClaw — Local MCP Server for Poke
 * Gives Poke access to your Mac's filesystem and terminal.
 *
 * Tools:
 *   read_file      — Read a file's contents
 *   write_file     — Write or overwrite a file
 *   list_directory — List files/folders in a directory
 *   search_files   — Search for files by glob pattern
 *   search_text    — Search file contents under a directory
 *   run_command    — Execute a shell command and return output
 *   get_env        — Read an environment variable
 *   system_info    — Inspect the local runtime and machine basics
 *
 * Auth:
 *   Set POKECLAW_TOKEN. Token accepted via:
 *     - Query param:  /mcp?token=<your-token>
 *     - Header:       Authorization: Bearer <your-token>
 *
 * Config (env vars):
 *   POKECLAW_PORT   — Port to listen on (default: 3741)
 *   POKECLAW_TOKEN  — Secret token (leave unset to disable auth)
 *   POKECLAW_ROOTS  — Comma-separated allowed root paths (default: $HOME)
 *   POKECLAW_LOG_LEVEL — info | debug
 */

import { createServer } from "http";
import type { IncomingMessage, ServerResponse } from "http";
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from "fs";
import { execSync } from "child_process";
import { resolve, join, dirname } from "path";
import { homedir, hostname, platform, release, arch } from "os";

const APP_NAME = "PokeClaw";
const VERSION = "1.1.0-beta";
const PORT = parseInt(process.env.POKECLAW_PORT ?? "3741", 10);
const TOKEN = process.env.POKECLAW_TOKEN ?? "";
const HOME = homedir();
const ROOTS: string[] = (process.env.POKECLAW_ROOTS ?? HOME)
  .split(",")
  .map((r) => r.trim().replace(/^~/, HOME))
  .filter(Boolean);
const LOG_LEVEL = (process.env.POKECLAW_LOG_LEVEL ?? "info").toLowerCase();
const RECENT_LOG_LIMIT = 250;
const recentLogs: string[] = [];
const recentConsole: { stream: "stdout" | "stderr"; line: string }[] = [];
const recentToolCalls: { timestamp: string; tool: string; preview: string }[] = [];

function timestamp() {
  return new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function pushRecentLog(entry: string) {
  recentLogs.push(entry);
  if (recentLogs.length > RECENT_LOG_LIMIT) recentLogs.splice(0, recentLogs.length - RECENT_LOG_LIMIT);
}

function pushConsole(stream: "stdout" | "stderr", line: string) {
  recentConsole.push({ stream, line });
  if (recentConsole.length > RECENT_LOG_LIMIT) recentConsole.splice(0, recentConsole.length - RECENT_LOG_LIMIT);
}

function pushRecentToolCall(entry: { timestamp: string; tool: string; preview: string }) {
  recentToolCalls.push(entry);
  if (recentToolCalls.length > RECENT_LOG_LIMIT) recentToolCalls.splice(0, recentToolCalls.length - RECENT_LOG_LIMIT);
}

function emitConsole(stream: "stdout" | "stderr", message: string) {
  const line = `[${timestamp()}] ${message}`;
  pushConsole(stream, line);
  if (stream === "stderr") {
    console.error(message);
  } else {
    console.log(message);
  }
}

function log(level: "info" | "warn" | "error" | "debug", msg: string) {
  if (level === "debug" && LOG_LEVEL !== "debug") return;
  const prefix = level.toUpperCase();
  const entry = `[${timestamp()}] ${prefix} ${msg}`;
  pushRecentLog(entry);
  const stream = level === "error" ? "stderr" : "stdout";
  emitConsole(stream, `[${timestamp()}] ${prefix} ${msg}`);
}

function previewValue(v: unknown): string {
  if (typeof v === "string") return v.length > 80 ? `${v.slice(0, 80)}…` : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.length} items]`;
  if (v && typeof v === "object") return "[object]";
  return String(v ?? "");
}

function logToolUse(tool: string, args: Record<string, unknown>) {
  const preview = Object.entries(args)
    .map(([k, v]) => `${k}=${previewValue(v)}`)
    .join("  ");
  const entry = `TOOL ${tool}${preview ? ` :: ${preview}` : ""}`;
  const stamp = timestamp();
  pushRecentLog(`[${stamp}] ${entry}`);
  pushRecentToolCall({ timestamp: stamp, tool, preview: preview || "(no args)" });
  emitConsole("stdout", `Poke is using tool: ${tool}`);
  if (preview) emitConsole("stdout", `   ${preview}`);
}

function isAuthorised(req: IncomingMessage, url: URL): boolean {
  if (!TOKEN) return true;
  if (url.searchParams.get("token") === TOKEN) return true;
  const header = req.headers["authorization"] ?? "";
  if (header.startsWith("Bearer ") && header.slice(7) === TOKEN) return true;
  return false;
}

function safePath(raw: string): string {
  const p = resolve(raw.replace(/^~/, HOME));
  const allowed = ROOTS.some((root) => p === resolve(root) || p.startsWith(resolve(root) + "/"));
  if (!allowed) throw new Error(`Access denied: '${p}' is outside allowed roots (${ROOTS.join(", ")})`);
  return p;
}

const BLOCK = [
  /\brm\s+-[a-z]*r[a-z]*f\s+\//,
  /\bsudo\s+rm\b/,
  /:\(\)\s*\{.*\}/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  />\s*\/dev\/sd[a-z]/,
];
function blocked(cmd: string): boolean {
  return BLOCK.some((re) => re.test(cmd));
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function execSearchCommand(command: string): string {
  return execSync(command, { encoding: "utf-8", timeout: 15_000, stdio: ["pipe", "pipe", "pipe"] }).trim();
}

function toolReadFile(args: Record<string, unknown>): string {
  if (!args.path) throw new Error("path is required");
  const p = safePath(String(args.path));
  return readFileSync(p, "utf-8");
}

function toolWriteFile(args: Record<string, unknown>): string {
  if (!args.path) throw new Error("path is required");
  if (args.content === undefined) throw new Error("content is required");
  const p = safePath(String(args.path));
  const content = String(args.content);
  const dir = dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(p, content, "utf-8");
  return `Written ${content.length} chars to ${p}`;
}

function toolListDirectory(args: Record<string, unknown>): string {
  const raw = args.path ? String(args.path) : HOME;
  const p = safePath(raw);
  const entries = readdirSync(p).map((name) => {
    try {
      const full = join(p, name);
      const st = statSync(full);
      const type = st.isDirectory() ? "dir " : "file";
      const size = st.isFile() ? ` (${st.size} B)` : "";
      return `${type}  ${name}${size}`;
    } catch {
      return `?     ${name}`;
    }
  });
  return entries.length ? entries.join("\n") : "(empty)";
}

async function toolSearchFiles(args: Record<string, unknown>): Promise<string> {
  if (!args.root) throw new Error("root is required");
  if (!args.pattern) throw new Error("pattern is required");
  const root = safePath(String(args.root));
  const pattern = String(args.pattern);
  const cmd = `find ${shellQuote(root)} -name ${shellQuote(pattern)} 2>/dev/null | head -200`;
  const out = execSearchCommand(cmd);
  return out || "No files matched.";
}

async function toolSearchText(args: Record<string, unknown>): Promise<string> {
  if (!args.root) throw new Error("root is required");
  if (!args.query) throw new Error("query is required");
  const root = safePath(String(args.root));
  const query = String(args.query);
  const caseSensitive = args.case_sensitive === true;
  const maxResults = Number.isFinite(Number(args.max_results)) ? Math.max(1, Math.min(200, Number(args.max_results))) : 50;
  const flags = caseSensitive ? "" : "-i";
  const cmd = `rg --hidden --glob '!**/.git/**' --glob '!**/node_modules/**' --line-number --color never ${flags} ${shellQuote(query)} ${shellQuote(root)} 2>/dev/null | head -${maxResults}`;
  const out = execSearchCommand(cmd);
  return out || "No matches found.";
}

function parseTopMemoryBytes(value: string, unit: string): number {
  const amount = Number(value);
  switch (unit.toUpperCase()) {
    case "K": return amount * 1024;
    case "M": return amount * 1024 * 1024;
    case "G": return amount * 1024 * 1024 * 1024;
    default: return amount;
  }
}

function readSystemUsage(): { cpuPercent: string; memoryPercent: string } {
  let cpuPercent = "unknown";
  let memoryPercent = "unknown";

  try {
    const topOutput = execSync("top -l 1 -s 0", { encoding: "utf-8", timeout: 10_000, stdio: ["pipe", "pipe", "pipe"] });
    const cpuMatch = topOutput.match(/CPU usage:\s+.*?([0-9.]+)% idle/i);
    if (cpuMatch) cpuPercent = (100 - Number(cpuMatch[1])).toFixed(1);

    const memoryMatch = topOutput.match(/PhysMem:\s+([0-9.]+)([KMG]) used/i);
    const totalBytesText = execSync("sysctl -n hw.memsize", { encoding: "utf-8", timeout: 5_000, stdio: ["pipe", "pipe", "pipe"] }).trim();
    const totalBytes = Number(totalBytesText);
    if (memoryMatch && Number.isFinite(totalBytes) && totalBytes > 0) {
      const usedBytes = parseTopMemoryBytes(memoryMatch[1], memoryMatch[2]);
      memoryPercent = ((usedBytes / totalBytes) * 100).toFixed(1);
    }
  } catch {
    // Keep fallback values when system commands are unavailable.
  }

  return { cpuPercent, memoryPercent };
}

function toolSystemInfo(): string {
  const systemUsage = readSystemUsage();
  return [
    `app=${APP_NAME}`,
    `version=${VERSION}`,
    `platform=${platform()}`,
    `release=${release()}`,
    `arch=${arch()}`,
    `host=${hostname()}`,
    `home=${HOME}`,
    `roots=${ROOTS.join(", ")}`,
    `auth=${TOKEN ? "enabled" : "disabled"}`,
    `log_level=${LOG_LEVEL}`,
    `cpu_percent=${systemUsage.cpuPercent}`,
    `memory_percent=${systemUsage.memoryPercent}`,
    `bun=${process.versions.bun ?? "(unknown)"}`,
    `node=${process.version}`,
    `cwd=${process.cwd()}`,
  ].join("\n");
}

function toolRunCommand(args: Record<string, unknown>): string {
  if (!args.command) throw new Error("command is required");
  const command = String(args.command);
  const cwd = args.cwd ? safePath(String(args.cwd)) : HOME;
  const timeoutMs = args.timeout_ms ? parseInt(String(args.timeout_ms), 10) : 30_000;
  if (blocked(command)) throw new Error("Blocked: command matched a dangerous pattern");
  try {
    const out = execSync(command, {
      cwd,
      timeout: timeoutMs,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return out || "(no output)";
  } catch (e: unknown) {
    if (e && typeof e === "object" && "stdout" in e) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      const combined = [err.stdout, err.stderr].filter(Boolean).join("\n").trim();
      throw new Error(combined || (err.message ?? "Command failed"));
    }
    throw e;
  }
}

function toolGetEnv(args: Record<string, unknown>): string {
  if (!args.name) throw new Error("name is required");
  const val = process.env[String(args.name)];
  return val !== undefined ? val : "(not set)";
}

const TOOLS = [
  { name: "read_file", description: "Read the full contents of a file on the local Mac.", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "write_file", description: "Write (create or overwrite) a file on the local Mac.", inputSchema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } },
  { name: "list_directory", description: "List files and folders inside a directory.", inputSchema: { type: "object", properties: { path: { type: "string" } } } },
  { name: "search_files", description: "Search for files by name pattern (glob) under a directory.", inputSchema: { type: "object", properties: { root: { type: "string" }, pattern: { type: "string" } }, required: ["root", "pattern"] } },
  { name: "search_text", description: "Search for text inside files below a directory.", inputSchema: { type: "object", properties: { root: { type: "string" }, query: { type: "string" }, case_sensitive: { type: "boolean" }, max_results: { type: "number" } }, required: ["root", "query"] } },
  { name: "run_command", description: "Run a shell command on the Mac and return stdout/stderr. Commands run in your home directory.", inputSchema: { type: "object", properties: { command: { type: "string" }, cwd: { type: "string" }, timeout_ms: { type: "number" } }, required: ["command"] } },
  { name: "get_env", description: "Read an environment variable from the Mac.", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "system_info", description: "Get machine and runtime details for debugging and support.", inputSchema: { type: "object", properties: {} } },
];

async function handleRPC(body: Record<string, unknown>): Promise<unknown> {
  const method = String(body.method ?? "");
  const id = body.id ?? null;
  const params = (body.params ?? {}) as Record<string, unknown>;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

  try {
    switch (method) {
      case "initialize":
        return ok({ protocolVersion: "2024-11-05", serverInfo: { name: APP_NAME, version: VERSION }, capabilities: { tools: {} } });
      case "notifications/initialized":
        return null;
      case "tools/list":
        return ok({ tools: TOOLS });
      case "tools/call": {
        const toolName = String(params.name ?? "");
        const args = (params.arguments ?? {}) as Record<string, unknown>;
        logToolUse(toolName, args);
        let text: string;
        switch (toolName) {
          case "read_file": text = toolReadFile(args); break;
          case "write_file": text = toolWriteFile(args); break;
          case "list_directory": text = toolListDirectory(args); break;
          case "search_files": text = await toolSearchFiles(args); break;
          case "search_text": text = await toolSearchText(args); break;
          case "run_command": text = toolRunCommand(args); break;
          case "get_env": text = toolGetEnv(args); break;
          case "system_info": text = toolSystemInfo(); break;
          default: return err(-32601, `Unknown tool: ${toolName}`);
        }
        return ok({ content: [{ type: "text", text }] });
      }
      case "ping":
        return ok({});
      default:
        return err(-32601, `Method not found: ${method}`);
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    log("error", `Error in ${method}: ${message}`);
    return err(-32603, message);
  }
}

function json(res: ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  });
  res.end(body);
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const base = `http://localhost:${PORT}`;
  const url = new URL(req.url ?? "/", base);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, { status: "ok", name: APP_NAME, version: VERSION, auth: Boolean(TOKEN), roots: ROOTS.length });
    return;
  }

  if (req.method === "GET" && url.pathname === "/logs") {
    json(res, 200, { lines: recentLogs.slice(-100) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/console") {
    json(res, 200, { lines: recentConsole.slice(-100) });
    return;
  }

  if (url.pathname === "/mcp") {
    if (!isAuthorised(req, url)) {
      json(res, 401, { error: "Unauthorized: supply ?token= or Authorization: Bearer header" });
      return;
    }

    if (req.method !== "POST") {
      json(res, 405, { error: "Method Not Allowed" });
      return;
    }

    let raw = "";
    for await (const chunk of req) raw += chunk;

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch {
      json(res, 400, { error: "Invalid JSON" });
      return;
    }

    const result = await handleRPC(body);
    if (result === null) {
      res.writeHead(204);
      res.end();
      return;
    }
    json(res, 200, result);
    return;
  }

  json(res, 404, { error: "Not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  emitConsole("stdout", `PokeClaw ${VERSION} is running`);
  emitConsole("stdout", `Local  : http://127.0.0.1:${PORT}/mcp`);
  emitConsole("stdout", `Health : http://127.0.0.1:${PORT}/health`);
  if (TOKEN) {
    emitConsole("stdout", `Auth   : token required  (?token=... or Authorization: Bearer ...)`);
  } else {
    emitConsole("stdout", `Auth   : NONE — set POKECLAW_TOKEN to require a token`);
  }
  emitConsole("stdout", `Roots  : ${ROOTS.join(", ")}`);
  emitConsole("stdout", `Tools  : ${TOOLS.map((tool) => tool.name).join(", ")}`);
  pushRecentLog(`[${timestamp()}] INFO server started on 127.0.0.1:${PORT}`);
  emitConsole("stdout", `Waiting for Poke…`);
});
