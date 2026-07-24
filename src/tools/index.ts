import { logger, previewArgs } from "../logger.js";
import { MUTATING_TOOLS, policyDecision } from "../security.js";
import { state } from "../state.js";
import {
  toolDeleteFile,
  toolEditFile,
  toolListDirectory,
  toolMoveFile,
  toolReadFile,
  toolSearchFiles,
  toolSearchText,
  toolWriteFile,
} from "./files.js";
import { toolGetEnv, toolGit, toolRunCommand } from "./exec.js";
import { toolSystemInfo } from "./system.js";
import { toolCreateApp, toolEditApp, toolListApps, toolOpenApp } from "./apps.js";

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const str = { type: "string" };
const num = { type: "number" };
const bool = { type: "boolean" };

export const TOOLS: ToolDef[] = [
  {
    name: "read_file",
    description: "Read the full contents of a file on the local machine (macOS/Linux/Windows).",
    inputSchema: { type: "object", properties: { path: str }, required: ["path"] },
  },
  {
    name: "write_file",
    description: "Write (create or overwrite) a file on the local machine.",
    inputSchema: {
      type: "object",
      properties: { path: str, content: str },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description:
      "Replace an exact substring in a file. Set replace_all=true to replace every occurrence; otherwise old_string must be unique.",
    inputSchema: {
      type: "object",
      properties: { path: str, old_string: str, new_string: str, replace_all: bool },
      required: ["path", "old_string", "new_string"],
    },
  },
  {
    name: "delete_file",
    description: "Delete a file, or a directory when recursive=true.",
    inputSchema: {
      type: "object",
      properties: { path: str, recursive: bool },
      required: ["path"],
    },
  },
  {
    name: "move_file",
    description: "Move or rename a file/directory within allowed roots.",
    inputSchema: {
      type: "object",
      properties: { from: str, to: str },
      required: ["from", "to"],
    },
  },
  {
    name: "list_directory",
    description: "List files and folders inside a directory.",
    inputSchema: { type: "object", properties: { path: str } },
  },
  {
    name: "search_files",
    description: "Search for files by name pattern (glob) under a directory.",
    inputSchema: {
      type: "object",
      properties: { root: str, pattern: str },
      required: ["root", "pattern"],
    },
  },
  {
    name: "search_text",
    description: "Search for text inside files below a directory.",
    inputSchema: {
      type: "object",
      properties: { root: str, query: str, case_sensitive: bool, max_results: num },
      required: ["root", "query"],
    },
  },
  {
    name: "run_command",
    description:
      "Run a shell command on the local machine and return stdout/stderr. Commands run in your home directory unless cwd is set.",
    inputSchema: {
      type: "object",
      properties: { command: str, cwd: str, timeout_ms: num },
      required: ["command"],
    },
  },
  {
    name: "git",
    description:
      "Run a read-only git subcommand (status, diff, log, branch, show, remote) in a repo.",
    inputSchema: {
      type: "object",
      properties: { repo: str, subcommand: str },
      required: ["repo"],
    },
  },
  {
    name: "get_env",
    description: "Read an environment variable from the machine.",
    inputSchema: { type: "object", properties: { name: str }, required: ["name"] },
  },
  {
    name: "system_info",
    description: "Get machine and runtime details for debugging and support.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "create_app",
    description:
      "Create a native desktop app from HTML content and open it in a dedicated WebKit window (macOS) or GTK/WebKit window (Linux). Writes the HTML to ~/.pokeclaw/apps/.",
    inputSchema: {
      type: "object",
      properties: { name: str, html: str, width: num, height: num },
      required: ["name", "html", "width", "height"],
    },
  },
  {
    name: "list_apps",
    description: "List all apps created via create_app.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "edit_app",
    description: "Update an existing app's HTML content and reopen it.",
    inputSchema: {
      type: "object",
      properties: { name: str, html: str, width: num, height: num },
      required: ["name", "html"],
    },
  },
  {
    name: "open_app",
    description: "Open an existing app in its native window.",
    inputSchema: {
      type: "object",
      properties: { name: str, width: num, height: num },
      required: ["name"],
    },
  },
];

type ToolFn = (args: Record<string, unknown>) => string | Promise<string>;

const HANDLERS: Record<string, ToolFn> = {
  read_file: toolReadFile,
  write_file: toolWriteFile,
  edit_file: toolEditFile,
  delete_file: toolDeleteFile,
  move_file: toolMoveFile,
  list_directory: toolListDirectory,
  search_files: toolSearchFiles,
  search_text: toolSearchText,
  run_command: toolRunCommand,
  git: toolGit,
  get_env: toolGetEnv,
  system_info: toolSystemInfo,
  create_app: toolCreateApp,
  list_apps: toolListApps,
  edit_app: toolEditApp,
  open_app: toolOpenApp,
};

/**
 * Run a tool by name, enforcing the active security policy (read-only /
 * approval), auditing mutating calls, and recording usage for the TUI/stats.
 */
export async function dispatchTool(name: string, args: Record<string, unknown>): Promise<string> {
  const handler = HANDLERS[name];
  if (!handler) throw new Error(`Unknown tool: ${name}`);

  const preview = previewArgs(args);
  logger.recordToolCall(name, preview);
  logger.log("info", `${name} ${preview}`);
  state.recordTool(name);

  const command = name === "run_command" ? String(args.command ?? "") : undefined;
  const decision = policyDecision(name, command);
  if (!decision.allowed) {
    logger.log("warn", `Rejected ${name}: ${decision.reason}`);
    throw new Error(decision.reason ?? "Blocked by policy");
  }
  if (decision.needsApproval) {
    const approved = await state.requestApproval(name, preview);
    if (!approved) {
      logger.log("warn", `Denied by operator: ${name}`);
      throw new Error("Denied by operator (approval policy)");
    }
  }

  if (MUTATING_TOOLS.has(name)) {
    logger.audit({ tool: name, args, policy: policyDecision(name, command) });
  }

  return handler(args);
}
