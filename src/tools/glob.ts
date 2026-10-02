import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { err, needString, ok, optString, schemaFor, type ToolDefinition } from "./types";

const SKIP_DIRS = new Set(["node_modules", ".git", ".hg", ".svn", "dist", "build", ".next", "target"]);

function globToRegExp(glob: string): RegExp {
  let re = "";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // "**" matches across directories; "**/" also matches zero directories
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 3;
        } else {
          re += ".*";
          i += 2;
        }
      } else {
        re += "[^/]*";
        i += 1;
      }
    } else if (c === "?") {
      re += "[^/]";
      i += 1;
    } else if (c === "{") {
      const end = glob.indexOf("}", i);
      if (end > i) {
        re += "(?:" + glob.slice(i + 1, end).split(",").map((s) => globToRegExp(s).source).join("|") + ")";
        i = end + 1;
      } else {
        re += "\\{";
        i += 1;
      }
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      i += 1;
    }
  }
  return new RegExp("^" + re + "$");
}

/** Normalize a relative path for glob matching (Windows uses `\` separators). */
export function toMatchPath(p: string): string {
  return p.replace(/\\/g, "/");
}

async function walk(dir: string, out: string[], root: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".") {
      // Skip hidden files/dirs except when explicitly relevant; keep it simple: skip hidden dirs.
      if (e.isDirectory()) continue;
    }
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      await walk(full, out, root);
    } else if (e.isFile()) {
      out.push(full.slice(root.length + 1));
    }
  }
}

/** Find files by glob pattern, e.g. "src/**\/*.ts". */
export const globTool: ToolDefinition = {
  name: "glob",
  description: "Find files matching a glob pattern (supports *, **, ?, {a,b}). Skips node_modules and .git.",
  inputSchema: schemaFor(
    {
      pattern: { type: "string", description: "Glob pattern, e.g. \"src/**/*.ts\"." },
      path: { type: "string", description: "Directory to search in (default: cwd)." },
    },
    ["pattern"],
  ),
  permission: "read",
  handler: async (args, ctx) => {
    const pattern = needString(args, "pattern");
    const root = resolve(ctx.cwd, optString(args, "path") ?? ".");
    try {
      const files: string[] = [];
      await walk(root, files, root);
      const re = globToRegExp(pattern);
      const matches = files
        .map(toMatchPath)
        .filter((f) => re.test(f))
        .slice(0, 200);
      if (matches.length === 0) return ok(`No files match "${pattern}".`);
      return ok(matches.join("\n"));
    } catch (e) {
      return err(`Glob failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};
