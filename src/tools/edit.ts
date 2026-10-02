import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { err, needString, ok, schemaFor, type ToolDefinition } from "./types";

/** Compute a small unified diff between two texts (simple LCS on lines). */
export function unifiedDiff(oldText: string, newText: string, maxLines = 60): string {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push(" " + a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push("-" + a[i]);
      i++;
    } else {
      ops.push("+" + b[j]);
      j++;
    }
  }
  while (i < n) ops.push("-" + a[i++]);
  while (j < m) ops.push("+" + b[j++]);

  // Show only hunks around changes, with 3 lines of context.
  const changed = new Set<number>();
  ops.forEach((op, idx) => {
    if (op[0] !== " ") {
      for (let k = Math.max(0, idx - 3); k <= Math.min(ops.length - 1, idx + 3); k++) {
        changed.add(k);
      }
    }
  });
  const shown = [...changed].sort((x, y) => x - y);
  const lines: string[] = [];
  let prev = -2;
  for (const idx of shown) {
    if (idx > prev + 1 && prev !== -2) lines.push("@@");
    lines.push(ops[idx]);
    prev = idx;
    if (lines.length >= maxLines) {
      lines.push("… (diff truncated)");
      break;
    }
  }
  return lines.length > 0 ? lines.join("\n") : "(no visible changes)";
}

/** Exact-string replacement edit with a diff preview in the result. */
export const editTool: ToolDefinition = {
  name: "edit",
  description:
    "Edit a file by replacing oldText with newText. oldText must occur exactly once. Returns a diff preview.",
  inputSchema: schemaFor(
    {
      path: { type: "string", description: "Path to the file." },
      oldText: { type: "string", description: "Exact text to replace (must be unique in the file)." },
      newText: { type: "string", description: "Replacement text." },
    },
    ["path", "oldText", "newText"],
  ),
  permission: "write",
  handler: async (args) => {
    const path = needString(args, "path");
    const oldText = needString(args, "oldText");
    const newText = args.newText;
    if (typeof newText !== "string") return err(`Missing required argument "newText".`);
    try {
      const abs = resolve(path);
      const content = readFileSync(abs, "utf-8");
      const occurrences = content.split(oldText).length - 1;
      if (occurrences === 0) return err(`oldText not found in ${path}.`);
      if (occurrences > 1) {
        return err(
          `oldText occurs ${occurrences} times in ${path}; it must be unique. Include more surrounding context.`,
        );
      }
      const updated = content.replace(oldText, newText);
      writeFileSync(abs, updated, "utf-8");
      const diff = unifiedDiff(content, updated);
      return ok(`Edited ${path}. Diff:\n${diff}`);
    } catch (e) {
      return err(`Cannot edit "${path}": ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};
