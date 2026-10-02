import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import { Spinner } from "./Spinner";

export type ToolStatus = "running" | "done" | "error";

/** Human-friendly one-line summary of a tool call. */
export function formatToolCall(name: string, args: Record<string, unknown>): string {
  const s = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
  switch (name) {
    case "read":
      return `Read ${s(args.path)}${args.offset ? ` @${String(args.offset)}` : ""}`;
    case "write":
      return `Write ${s(args.path)}`;
    case "edit":
      return `Edit ${s(args.path)}`;
    case "list":
      return `List ${s(args.path ?? ".")}`;
    case "glob":
      return `Glob ${s(args.pattern)}`;
    case "grep":
      return `Grep ${s(args.pattern)}${args.path ? ` in ${s(args.path)}` : ""}`;
    case "bash":
      return `Bash: ${s(args.command)}`;
    case "webfetch":
      return `Fetch ${s(args.url)}`;
    case "todo_write":
      return "Update todos";
    case "todo_read":
      return "Read todos";
    case "reply_to_terminal":
      return "Reply";
    default:
      return `${name}(${Object.entries(args)
        .map(([k, v]) => `${k}=${s(v)}`)
        .join(", ")})`;
  }
}

function diffColored(line: string): { color?: string } {
  if (line.startsWith("+") && !line.startsWith("+++")) return { color: "green" };
  if (line.startsWith("-") && !line.startsWith("---")) return { color: "red" };
  if (line.startsWith("@@")) return { color: "cyan" };
  return {};
}

export interface ToolEntry {
  id: string;
  name: string;
  label: string;
  status: ToolStatus;
  output: string;
  ms: number;
}

const MAX_DETAIL_LINES = 24;

export function ToolCard({ entry, expanded }: { entry: ToolEntry; expanded: boolean }) {
  const { status, label, output, ms } = entry;
  const color = status === "running" ? theme.tool : status === "done" ? theme.success : theme.error;

  const lines = output.split("\n");
  const truncated = lines.length > MAX_DETAIL_LINES;
  const shown = lines.slice(0, MAX_DETAIL_LINES);

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Box>
        <Text color={theme.dim}>⎿ </Text>
        {status === "running" ? (
          <Spinner label="" />
        ) : (
          <Text color={color}>{status === "done" ? "✓" : "✗"} </Text>
        )}
        <Text color={status === "running" ? theme.tool : theme.dim}>{label}</Text>
        {status !== "running" && (
          <Text color={theme.faint}> {(ms / 1000).toFixed(1)}s</Text>
        )}
      </Box>
      {expanded && (
        <Box marginLeft={2} flexDirection="column">
          {shown.map((line, i) => (
            <Text key={i} color={diffColored(line).color ?? theme.faint} wrap="truncate">
              {line}
            </Text>
          ))}
          {truncated && <Text color={theme.faint}>… {lines.length - shown.length} more lines</Text>}
        </Box>
      )}
    </Box>
  );
}
