import { execSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { dirname, join } from "path";
import { safePath, shellQuote } from "../security.js";

function execCapture(command: string, timeout = 15_000): string {
  return execSync(command, { encoding: "utf-8", timeout, stdio: ["pipe", "pipe", "pipe"] }).trim();
}

export function toolReadFile(args: Record<string, unknown>): string {
  if (!args.path) throw new Error("path is required");
  return readFileSync(safePath(String(args.path)), "utf-8");
}

export function toolWriteFile(args: Record<string, unknown>): string {
  if (!args.path) throw new Error("path is required");
  if (args.content === undefined) throw new Error("content is required");
  const p = safePath(String(args.path));
  const content = String(args.content);
  const dir = dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(p, content, "utf-8");
  return `Written ${content.length} chars to ${p}`;
}

export function toolEditFile(args: Record<string, unknown>): string {
  if (!args.path) throw new Error("path is required");
  if (args.old_string === undefined) throw new Error("old_string is required");
  if (args.new_string === undefined) throw new Error("new_string is required");
  const p = safePath(String(args.path));
  const oldString = String(args.old_string);
  const newString = String(args.new_string);
  const replaceAll = args.replace_all === true;
  const original = readFileSync(p, "utf-8");

  const occurrences = original.split(oldString).length - 1;
  if (occurrences === 0) throw new Error("old_string not found in file");
  if (occurrences > 1 && !replaceAll) {
    throw new Error(
      `old_string is not unique (${occurrences} matches). Pass replace_all=true or add more context.`,
    );
  }
  const updated = replaceAll
    ? original.split(oldString).join(newString)
    : original.replace(oldString, newString);
  writeFileSync(p, updated, "utf-8");
  return `Edited ${p} (${replaceAll ? occurrences : 1} replacement${occurrences > 1 && replaceAll ? "s" : ""})`;
}

export function toolDeleteFile(args: Record<string, unknown>): string {
  if (!args.path) throw new Error("path is required");
  const p = safePath(String(args.path));
  if (!existsSync(p)) throw new Error(`Not found: ${p}`);
  const recursive = args.recursive === true;
  const st = statSync(p);
  if (st.isDirectory() && !recursive) {
    throw new Error(`'${p}' is a directory. Pass recursive=true to delete it.`);
  }
  rmSync(p, { recursive, force: false });
  return `Deleted ${p}`;
}

export function toolMoveFile(args: Record<string, unknown>): string {
  if (!args.from) throw new Error("from is required");
  if (!args.to) throw new Error("to is required");
  const from = safePath(String(args.from));
  const to = safePath(String(args.to));
  if (!existsSync(from)) throw new Error(`Not found: ${from}`);
  const dir = dirname(to);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  renameSync(from, to);
  return `Moved ${from} -> ${to}`;
}

export function toolListDirectory(args: Record<string, unknown>): string {
  const raw = args.path ? String(args.path) : safePath(".");
  const p = safePath(raw);
  const entries = readdirSync(p).map((name) => {
    try {
      const st = statSync(join(p, name));
      const type = st.isDirectory() ? "dir " : "file";
      const size = st.isFile() ? ` (${st.size} B)` : "";
      return `${type}  ${name}${size}`;
    } catch {
      return `?     ${name}`;
    }
  });
  return entries.length ? entries.join("\n") : "(empty)";
}

export function toolSearchFiles(args: Record<string, unknown>): string {
  if (!args.root) throw new Error("root is required");
  if (!args.pattern) throw new Error("pattern is required");
  const root = safePath(String(args.root));
  const pattern = String(args.pattern);
  const cmd = `find ${shellQuote(root)} -name ${shellQuote(pattern)} 2>/dev/null | head -200`;
  return execCapture(cmd) || "No files matched.";
}

export function toolSearchText(args: Record<string, unknown>): string {
  if (!args.root) throw new Error("root is required");
  if (!args.query) throw new Error("query is required");
  const root = safePath(String(args.root));
  const query = String(args.query);
  const caseSensitive = args.case_sensitive === true;
  const maxResults = Number.isFinite(Number(args.max_results))
    ? Math.max(1, Math.min(200, Number(args.max_results)))
    : 50;
  const flags = caseSensitive ? "" : "-i";
  const cmd = `rg --hidden --glob '!**/.git/**' --glob '!**/node_modules/**' --line-number --color never ${flags} ${shellQuote(query)} ${shellQuote(root)} 2>/dev/null | head -${maxResults}`;
  return execCapture(cmd) || "No matches found.";
}
