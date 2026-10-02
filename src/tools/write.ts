import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { err, needString, ok, schemaFor, type ToolDefinition } from "./types";

/** Write (create or overwrite) a file, creating parent directories. */
export const writeTool: ToolDefinition = {
  name: "write",
  description: "Create or overwrite a file with the given content. Creates parent directories.",
  inputSchema: schemaFor(
    {
      path: { type: "string", description: "Path to the file, relative to cwd or absolute." },
      content: { type: "string", description: "Full new content of the file." },
    },
    ["path", "content"],
  ),
  permission: "write",
  handler: async (args) => {
    const path = needString(args, "path");
    const content = args.content;
    if (typeof content !== "string") return err(`Missing required argument "content".`);
    try {
      const abs = resolve(path);
      await mkdir(dirname(abs), { recursive: true });
      writeFileSync(abs, content, "utf-8");
      return ok(`Wrote ${content.length} characters to ${path}`);
    } catch (e) {
      return err(`Cannot write "${path}": ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};
