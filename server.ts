#!/usr/bin/env bun
/**
 * PokeClaw — Local MCP Server for Poke
 * Gives Poke access to your MacBook's filesystem and terminal.
 *
 * Tools:
 *   read_file      — Read a file's contents
 *   write_file     — Write or overwrite a file
 *   list_directory — List files/folders in a directory
 *   search_files   — Search for files by glob pattern
 *   run_command    — Execute a shell command and return output
 *   get_env        — Read an environment variable
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
 */

import { createServer } from "http";
import type { IncomingMessage, ServerResponse } from "http";
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from "fs";
import { execSync } from "child_process";
import { resolve, join, dirname, homedir } from "path";

// ─── Config ────────────────────────────────────────────────────────────────────
const PORT   = parseInt(process.env.POKECLAW_PORT  ?? "3741", 10);
const TOKEN  = process.env.POKECLAW_TOKEN ?? "";
const HOME   = homedir();
const ROOTS: string[] = (process.env.POKECLAW_ROOTS ?? HOME)
  .split(",")
  .map((r) => r.trim().replace(/^~/, HOME))
  .filter(Boolean);

// ─── Logging ───────────────────────────────────────────────────────────────────
function log(msg: string) {
  const ts = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  console.log(`[${ts}] ${msg}`);
}

function logToolUse(tool: string, args: Record<string, unknown>) {
  const preview = Object.entries(args)
    .map(([k, v]) => {
      const s = String(v ?? "");
      return `${k}=${s.length > 60 ? s.slice(0, 60) + "…" : s}`;
    })
    .join("  ");
  console.log(`\n🐾 Poke is using tool: \x1b[36m${tool}\x1b[0m`);
  if (preview) console.log(`   ${preview}`);
}

// ─── Auth ──────────────────────────────────────────────────────────────────────
function isAuthorised(req: IncomingMessage, url: URL): boolean {
  if (!TOKEN) return true;
  // 1. ?token= query param
  if (url.searchParams.get("token") === TOKEN) return true;
  // 2. Authorization: Bearer <token>
  const header = req.headers["authorization"] ?? "";
  if (header.startsWith("Bearer ") && header.slice(7) === TOKEN) return true;
  return false;
}

// ─── Path guard ────────────────────────────────────────────────────────────────
function safePath(raw: string): string {
  const p = resolve(raw.replace(/^~/, HOME));
  const allowed = ROOTS.some((root) => p === resolve(root) || p.startsWith(resolve(root) + "/"));
  if (!allowed) throw new Error(`Access denied: '${p}' is outside allowed roots (${ROOTS.join(", ")})`);
  return p;
}

// ─── Dangerous-command guard ───────────────────────────────────────────────────
const BLOCK = [
  /\brm\s+-[a-z]*r[a-z]*f\s+\//,  // rm -rf /
  /\bsudo\s+rm\b/,
  /:\(\)\s*\{.*\}/,                 // fork bomb
  /\bmkfs\b/,
  /\bdd\s+if=/,
  />\s*\/dev\/sd[a-z]/,
];
function blocked(cmd: string): boolean {
  return BLOCK.some((re) => re.test(cmd));
}

// ─── Tool implementations ──────────────────────────────────────────────────────

function toolReadFile(args: Record<string, unknown>): string {
  if (!args.path) throw new Error("path is required");
  const p = safePath(String(args.path));
  return readFileSync(p, "utf-8");
}

function toolWriteFile(args: Record<string, unknown>): string {
  if (!args.path)    throw new Error("path is required");
  if (args.content === undefined) throw new Error("content is required");
  const p       = safePath(String(args.path));
  const content = String(args.content);
  const dir     = dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(p, content, "utf-8");
  return `Written ${content.length} chars to ${p}`;
}

function toolListDirectory(args: Record<string, unknown>): string {
  const raw = args.path ? String(args.path) : HOME;
  const p   = safePath(raw);
  const entries = readdirSync(p).map((name) => {
    try {
      const full = join(p, name);
      const st   = statSync(full);
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
  if (!args.root)    throw new Error("root is required");
  if (!args.pattern) throw new Error("pattern is required");
  const root    = safePath(String(args.root));
  const pattern = String(args.pattern);
  // Use find(1) so we don't need an npm dependency for glob
  const cmd = `find "${root}" -name "${pattern}" 2>/dev/null | head -200`;
  const out = execSync(cmd, { encoding: "utf-8", timeout: 15_000 });
  return out.trim() || "No files matched.";
}

function toolRunCommand(args: Record<string, unknown>): string {
  if (!args.command) throw new Error("command is required");
  const command   = String(args.command);
  const cwd       = args.cwd ? safePath(String(args.cwd)) : HOME;
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

// ─── MCP tool schemas ──────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "read_file",
    description: "Read the full contents of a file on the local Mac.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or ~ path to the file." },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write (create or overwrite) a file on the local Mac.",
    inputSchema: {
      type: "object",
      properties: {
        path:    { type: "string", description: "Absolute or ~ path to the file." },
        content: { type: "string", description: "Text content to write." },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_directory",
    description: "List files and folders inside a directory.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path. Defaults to home." },
      },
    },
  },
  {
    name: "search_files",
    description: "Search for files by name pattern (glob) under a directory.",
    inputSchema: {
      type: "object",
      properties: {
        root:    { type: "string", description: "Directory to search in." },
        pattern: { type: "string", description: "Glob pattern, e.g. '**/*.ts'" },
      },
      required: ["root", "pattern"],
    },
  },
  {
    name: "run_command",
    description: "Run a shell command on the Mac and return stdout/stderr. Commands run in your home directory.",
    inputSchema: {
      type: "object",
      properties: {
        command:    { type: "string",  description: "Shell command to execute." },
        cwd:        { type: "string",  description: "Working directory (optional, defaults to home)." },
        timeout_ms: { type: "number",  description: "Max ms to wait (default 30000)." },
      },
      required: ["command"],
    },
  },
  {
    name: "get_env",
    description: "Read an environment variable from the Mac.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Environment variable name." },
      },
      required: ["name"],
    },
  },
];

// ─── MCP JSON-RPC handler ───────────────────────────────────────────────────��──
async function handleRPC(body: Record<string, unknown>): Promise<unknown> {
  const method = String(body.method ?? "");
  const id     = body.id ?? null;
  const params = (body.params ?? {}) as Record<string, unknown>;

  const ok  = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

  try {
    switch (method) {
      case "initialize":
        return ok({
          protocolVersion: "2024-11-05",
          serverInfo: { name: "PokeClaw", version: "1.0.0" },
          capabilities: { tools: {} },
        });

      case "notifications/initialized":
        return null; // no response for notifications

      case "tools/list":
        return ok({ tools: TOOLS });

      case "tools/call": {
        const toolName = String(params.name ?? "");
        const args     = (params.arguments ?? {}) as Record<string, unknown>;

        logToolUse(toolName, args);

        let text: string;
        switch (toolName) {
          case "read_file":      text = toolReadFile(args);          break;
          case "write_file":     text = toolWriteFile(args);         break;
          case "list_directory": text = toolListDirectory(args);     break;
          case "search_files":   text = await toolSearchFiles(args); break;
          case "run_command":    text = toolRunCommand(args);        break;
          case "get_env":        text = toolGetEnv(args);            break;
          default:
            return err(-32601, `Unknown tool: ${toolName}`);
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
    log(`⚠️  Error in ${method}: ${message}`);
    return err(-32603, message);
  }
}

// ─── HTTP server ───────────────────────────────────────────────────────────────
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
  const url  = new URL(req.url ?? "/", base);

  // CORS pre-flight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    });
    res.end();
    return;
  }

  // Health endpoint
  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, { status: "ok", name: "PokeClaw", version: "1.0.0" });
    return;
  }

  // MCP endpoint
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
    if (result === null) { res.writeHead(204); res.end(); return; }
    json(res, 200, result);
    return;
  }

  json(res, 404, { error: "Not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n🐾  PokeClaw is running`);
  console.log(`    Local  : http://127.0.0.1:${PORT}/mcp`);
  if (TOKEN) {
    console.log(`    Auth   : token required  (?token=... or Authorization: Bearer ...)`);
  } else {
    console.log(`    Auth   : NONE  — set POKECLAW_TOKEN to require a token`);
  }
  console.log(`    Roots  : ${ROOTS.join(", ")}`);
  console.log(`\n    Waiting for Poke…\n`);
});
