import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { err, ok, optString, schemaFor, type ToolDefinition } from "./types";

/** List directory entries, directories first. */
export const listTool: ToolDefinition = {
  name: "list",
  description: "List files and directories in a directory. Directories are marked with a trailing /.",
  inputSchema: schemaFor(
    {
      path: { type: "string", description: "Directory to list (default: cwd)." },
    },
    [],
  ),
  permission: "read",
  handler: async (args, ctx) => {
    const dir = resolve(ctx.cwd, optString(args, "path") ?? ".");
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      const dirs = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name + "/")
        .sort();
      const files = entries
        .filter((e) => !e.isDirectory())
        .map((e) => e.name)
        .sort();
      const all = [...dirs, ...files];
      if (all.length === 0) return ok(`(empty directory: ${dir})`);
      return ok(all.join("\n"));
    } catch (e) {
      return err(`Cannot list "${dir}": ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};
