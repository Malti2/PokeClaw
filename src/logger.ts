import { appendFileSync, existsSync, mkdirSync } from "fs";
import { EventEmitter } from "events";
import type { LogLevel } from "./config.js";
import { AUDIT_FILE, CONFIG_DIR } from "./config.js";
import { blue, dim, gray, red, yellow } from "./tui/ansi.js";

const RING_LIMIT = 500;
const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface ToolCallRecord {
  timestamp: string;
  tool: string;
  preview: string;
}

function nowTime(): string {
  return new Date().toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function ring<T>(buf: T[], item: T): void {
  buf.push(item);
  if (buf.length > RING_LIMIT) buf.splice(0, buf.length - RING_LIMIT);
}

/**
 * Central logger with in-memory ring buffers. It emits "update" events so the
 * TUI can re-render, and mirrors output to the console only when not silenced
 * (the TUI silences console output so it can own the screen).
 */
class Logger extends EventEmitter {
  level: LogLevel = "info";
  silenced = false;
  readonly logs: string[] = [];
  readonly toolCalls: ToolCallRecord[] = [];

  setLevel(level: LogLevel): void {
    this.level = level;
    this.emit("update");
  }

  /** When the TUI takes over the screen, stop writing to stdout directly. */
  silence(silenced: boolean): void {
    this.silenced = silenced;
  }

  private write(stream: "stdout" | "stderr", line: string): void {
    if (this.silenced) return;
    if (stream === "stderr") process.stderr.write(line + "\n");
    else process.stdout.write(line + "\n");
  }

  log(level: LogLevel, msg: string): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return;
    const stamp = nowTime();
    const prefix = level.toUpperCase();
    ring(this.logs, `[${stamp}] ${prefix} ${msg}`);

    const colored =
      level === "error"
        ? red(`[${stamp}] ${prefix} ${msg}`)
        : level === "warn"
          ? yellow(`[${stamp}] ${prefix} ${msg}`)
          : level === "debug"
            ? gray(`[${stamp}] ${prefix} ${msg}`)
            : `${dim(`[${stamp}]`)} ${blue(prefix)} ${msg}`;
    this.write(level === "error" ? "stderr" : "stdout", colored);
    this.emit("update");
  }

  /** Print a plain line (banner/status output) that should not be level-filtered. */
  plain(line: string): void {
    ring(this.logs, `[${nowTime()}] ${line}`);
    this.write("stdout", line);
    this.emit("update");
  }

  recordToolCall(tool: string, preview: string): void {
    ring(this.toolCalls, { timestamp: nowTime(), tool, preview: preview || "(no args)" });
    this.emit("update");
  }

  /** Append a durable audit record for mutating/command tool calls. */
  audit(entry: Record<string, unknown>): void {
    try {
      if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
      appendFileSync(AUDIT_FILE, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
    } catch {
      // Auditing must never break a tool call.
    }
  }
}

export const logger = new Logger();

export function previewArgs(args: Record<string, unknown>): string {
  const preview = (v: unknown): string => {
    if (typeof v === "string") return v.length > 80 ? `${v.slice(0, 80)}…` : v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (Array.isArray(v)) return `[${v.length} items]`;
    if (v && typeof v === "object") return "[object]";
    return String(v ?? "");
  };
  return Object.entries(args)
    .map(([k, v]) => `${k}=${preview(v)}`)
    .join("  ");
}
