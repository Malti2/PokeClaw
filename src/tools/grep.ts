import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { err, needString, ok, optString, schemaFor, type ToolDefinition } from "./types";

const SKIP_DIRS = new Set(["node_modules", ".git", ".hg", ".svn", "dist", "build", ".next", "target"]);
const MAX_RESULTS = 100;

interface Hit {
  file: string;
  line: number;
  text: string;
}

async function rgAvailable(): Promise<boolean> {
  try {
    const p = Bun.spawn(["rg", "--version"], { stdout: "pipe", stderr: "pipe" });
    await p.exited;
    return p.exitCode === 0;
  } catch {
    return false;
  }
}

async function grepWithRg(pattern: string, root: string, include?: string): Promise<Hit[]> {
  const args = ["rg", "--no-heading", "--line-number", "--max-count", "20", "-e", pattern];
  if (include) args.push("-g", include);
  args.push(root);
  const p = Bun.spawn(args, { stdout: "pipe", stderr: "pipe", cwd: root });
  const out = await new Response(p.stdout).text();
  await p.exited;
  const hits: Hit[] = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const m = line.match(/^([^:]+):(\d+):(.*)$/);
    if (m && hits.length < MAX_RESULTS) {
      hits.push({ file: m[1], line: Number(m[2]), text: m[3].slice(0, 200) });
    }
  }
  return hits;
}

async function grepFallback(pattern: string, root: string, include?: string): Promise<Hit[]> {
  let re: RegExp;
  try {
    re = new RegExp(pattern);
  } catch {
    return [];
  }
  const includeRe = include ? new RegExp(include.replace(/\*/g, ".*")) : null;
  const hits: Hit[] = [];

  async function scan(dir: string): Promise<void> {
    if (hits.length >= MAX_RESULTS) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
        await scan(full);
      } else if (e.isFile()) {
        if (includeRe && !includeRe.test(e.name)) continue;
        if (e.name.startsWith(".")) continue;
        try {
          const content = await readFile(full, "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length && hits.length < MAX_RESULTS; i++) {
            if (re.test(lines[i])) {
              hits.push({ file: full.slice(root.length + 1), line: i + 1, text: lines[i].slice(0, 200) });
            }
          }
        } catch {
          // Binary or unreadable; skip.
        }
      }
    }
  }

  await scan(root);
  return hits;
}

/** Search file contents for a regex pattern (uses rg when available). */
export const grepTool: ToolDefinition = {
  name: "grep",
  description: "Search file contents for a regex pattern. Uses ripgrep when available, otherwise a built-in scan.",
  inputSchema: schemaFor(
    {
      pattern: { type: "string", description: "Regex pattern to search for." },
      path: { type: "string", description: "Directory to search in (default: cwd)." },
      include: { type: "string", description: "File glob filter, e.g. \"*.ts\"." },
    },
    ["pattern"],
  ),
  permission: "read",
  handler: async (args, ctx) => {
    const pattern = needString(args, "pattern");
    const root = resolve(ctx.cwd, optString(args, "path") ?? ".");
    const include = optString(args, "include");
    try {
      const hits = (await rgAvailable())
        ? await grepWithRg(pattern, root, include)
        : await grepFallback(pattern, root, include);
      if (hits.length === 0) return ok(`No matches for /${pattern}/.`);
      return ok(hits.map((h) => `${h.file}:${h.line}: ${h.text}`).join("\n"));
    } catch (e) {
      return err(`Grep failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};
