import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { err, needString, ok, schemaFor, type ToolDefinition } from "./types";

/** Read a file with optional line range; output is line-numbered. */
export const readTool: ToolDefinition = {
  name: "read",
  description:
    "Read a file from disk. Returns line-numbered content. Use offset/limit for large files.",
  inputSchema: schemaFor(
    {
      path: { type: "string", description: "Path to the file, relative to cwd or absolute." },
      offset: { type: "number", description: "First line to read (1-based)." },
      limit: { type: "number", description: "Maximum number of lines to read." },
    },
    ["path"],
  ),
  permission: "read",
  handler: async (args) => {
    const path = needString(args, "path");
    const offset = typeof args.offset === "number" && args.offset > 0 ? Math.floor(args.offset) : 1;
    const limit = typeof args.limit === "number" && args.limit > 0 ? Math.floor(args.limit) : 2000;
    try {
      const content = readFileSync(resolve(path), "utf-8");
      const lines = content.split("\n");
      const slice = lines.slice(offset - 1, offset - 1 + limit);
      const numbered = slice.map((l, i) => `${offset + i}\t${l}`).join("\n");
      const remaining = lines.length - (offset - 1) - slice.length;
      const note = remaining > 0 ? `\n… (${remaining} more lines, use offset/limit)` : "";
      return ok(numbered + note);
    } catch (e) {
      return err(`Cannot read "${path}": ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};
