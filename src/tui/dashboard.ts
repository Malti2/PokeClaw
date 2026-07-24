import { emitKeypressEvents } from "readline";
import { readFileSync, existsSync } from "fs";
import { BRAND, VERSION } from "../version";
import { STATUS_FILE, type PokeClawConfig } from "../config";
import { ServerClient, type HealthInfo, type ServerStats, type ToolCall } from "../client";
import { readSystemUsage } from "../system";
import {
  ALT_SCREEN_OFF,
  ALT_SCREEN_ON,
  bold,
  CLEAR_SCREEN,
  cyan,
  dim,
  gray,
  green,
  HIDE_CURSOR,
  moveTo,
  padEnd,
  red,
  SHOW_CURSOR,
  truncate,
  yellow,
} from "./ansi";

interface Key {
  name?: string;
  ctrl?: boolean;
  sequence?: string;
}

/**
 * Full-screen live dashboard rendered with raw ANSI (no runtime deps).
 * It polls the local server's status endpoints (/health, /stats, /console,
 * /tool-calls) and the shared status file for the Poke tunnel URL.
 */
export class Dashboard {
  private readonly client: ServerClient;
  private paused = false;
  private filter = "";
  private filtering = false;
  private showHelp = false;
  private dirty = true;
  private started = false;

  private health: HealthInfo | null = null;
  private stats: ServerStats | null = null;
  private consoleLines: string[] = [];
  private toolCalls: ToolCall[] = [];
  private clearedBefore = 0;

  private renderTimer: ReturnType<typeof setInterval> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private onQuit?: () => void;
  private readonly tunnelActive: boolean;

  constructor(
    private readonly config: PokeClawConfig,
    options: { onQuit?: () => void; tunnelActive?: boolean } = {},
  ) {
    this.client = new ServerClient(config.port);
    this.onQuit = options.onQuit;
    this.tunnelActive = options.tunnelActive ?? config.tunnelEnabled;
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    process.stdout.write(ALT_SCREEN_ON + HIDE_CURSOR + CLEAR_SCREEN);

    if (process.stdin.isTTY) {
      emitKeypressEvents(process.stdin);
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on("keypress", (_str, key: Key) => this.onKey(key));
    }

    process.stdout.on("resize", () => this.markDirty());

    void this.poll();
    this.pollTimer = setInterval(() => void this.poll(), 1000);
    // Repaint at most ~15fps when dirty.
    this.renderTimer = setInterval(() => {
      if (this.dirty) this.render();
    }, 66);

    this.render();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.renderTimer) clearInterval(this.renderTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
    process.stdout.write(SHOW_CURSOR + ALT_SCREEN_OFF);
  }

  private markDirty(): void {
    this.dirty = true;
  }

  private async poll(): Promise<void> {
    const [health, stats, consoleLines, toolCalls] = await Promise.all([
      this.client.health(),
      this.client.stats(),
      this.client.consoleLines(),
      this.client.toolCalls(),
    ]);
    this.health = health;
    this.stats = stats;
    if (!this.paused) {
      this.consoleLines = consoleLines;
      this.toolCalls = toolCalls;
    }
    this.markDirty();
  }

  private tunnelStatus(): string | null {
    if (!existsSync(STATUS_FILE)) return null;
    try {
      const text = readFileSync(STATUS_FILE, "utf-8").trim();
      return text || null;
    } catch {
      return null;
    }
  }

  private onKey(key: Key): void {
    if (!key) return;
    const name = key.name ?? key.sequence ?? "";

    if (this.filtering) {
      if (name === "return") {
        this.filtering = false;
      } else if (name === "backspace") {
        this.filter = this.filter.slice(0, -1);
      } else if (name === "escape") {
        this.filtering = false;
        this.filter = "";
      } else if (key.sequence && key.sequence.length === 1 && !key.ctrl) {
        this.filter += key.sequence;
      }
      this.markDirty();
      return;
    }

    if ((key.ctrl && name === "c") || name === "q") {
      this.stop();
      if (this.onQuit) this.onQuit();
      else process.exit(0);
    } else if (name === "p") {
      this.paused = !this.paused;
    } else if (name === "c") {
      this.clearedBefore = this.consoleLines.length;
    } else if (name === "f") {
      this.filtering = true;
      this.filter = "";
    } else if (name === "?") {
      this.showHelp = !this.showHelp;
    }
    this.markDirty();
  }

  private render(): void {
    this.dirty = false;
    const width = Math.max(40, process.stdout.columns ?? 80);
    const height = Math.max(16, process.stdout.rows ?? 24);
    const usage = readSystemUsage();

    const lines: string[] = [];
    const rule = (label?: string): string =>
      label
        ? gray("── ") + bold(label) + " " + gray("─".repeat(Math.max(0, width - label.length - 4)))
        : gray("─".repeat(width));

    const connected = Boolean(this.stats?.connection.connectionEstablished);
    const listening = Boolean(this.stats?.connection.serverListening) || Boolean(this.health);
    const connDot = connected ? green("●") : listening ? yellow("○") : red("○");
    const connText = connected
      ? "Connected"
      : listening
        ? "Waiting for Poke…"
        : "Server offline";
    const version = this.health?.version ?? VERSION;
    lines.push(truncate(`${BRAND} ${bold(`PokeClaw v${version}`)}   ${connDot} ${connText}`, width));
    lines.push(gray("─".repeat(width)));

    const uptime = this.stats?.uptime ?? "—";
    const tunnel = !this.tunnelActive
      ? dim("(disabled)")
      : (this.tunnelStatus() ?? dim("(starting — npx poke tunnel)"));
    const authText = this.config.token ? green("● token") : red("○ none");
    lines.push(truncate(` Uptime  ${padEnd(uptime, 16)} Port ${this.config.port}`, width));
    lines.push(truncate(` Tunnel  ${tunnel}`, width));
    lines.push(truncate(` Auth    ${authText}`, width));
    lines.push(truncate(` Roots   ${this.config.roots.join(", ")}`, width));
    lines.push(
      truncate(
        ` CPU ${usage.cpuPercent}%   MEM ${usage.memoryPercent}%   Commands today ${this.stats?.commandsToday ?? 0}`,
        width,
      ),
    );

    // Recent tool calls
    lines.push(rule("Recent tool calls"));
    const calls = this.toolCalls.slice(-5);
    if (!calls.length) lines.push(dim(" (none yet)"));
    for (const call of calls) {
      lines.push(
        truncate(` ${dim(call.timestamp)} ${cyan(padEnd(call.tool, 14))} ${call.preview}`, width),
      );
    }

    // Logs (fills remaining space)
    const filterLabel = this.filter ? ` /${this.filter}/` : "";
    const pausedLabel = this.paused ? " [paused]" : "";
    lines.push(rule(`Logs${filterLabel}${pausedLabel}`));

    const footerLines = 2;
    const used = lines.length;
    const logRoom = Math.max(1, height - used - footerLines);
    const visible = this.consoleLines.slice(Math.min(this.clearedBefore, this.consoleLines.length));
    const filtered = this.filter
      ? visible.filter((l) => l.toLowerCase().includes(this.filter.toLowerCase()))
      : visible;
    const shown = filtered.slice(-logRoom);
    for (const line of shown) lines.push(truncate(" " + colorLog(line), width));
    for (let i = shown.length; i < logRoom; i++) lines.push("");

    // Footer / filter / help
    lines.push(gray("─".repeat(width)));
    if (this.filtering) {
      lines.push(
        truncate(
          ` ${cyan("filter:")} ${this.filter}${dim("▏")}  ${dim("[enter] apply [esc] clear")}`,
          width,
        ),
      );
    } else if (this.showHelp) {
      lines.push(
        truncate(
          ` ${dim("q")} quit  ${dim("p")} pause  ${dim("c")} clear  ${dim("f")} filter  ${dim("?")} close help`,
          width,
        ),
      );
    } else {
      lines.push(
        truncate(
          ` ${hotkey("q")}uit ${hotkey("p")}ause ${hotkey("c")}lear ${hotkey("f")}ilter ${hotkey("?")}help`,
          width,
        ),
      );
    }

    process.stdout.write(moveTo(1, 1) + CLEAR_SCREEN + lines.slice(0, height).join("\n"));
  }
}

function hotkey(k: string): string {
  return gray("[") + bold(k) + gray("]");
}

function colorLog(line: string): string {
  if (/\bERROR\b/.test(line)) return red(line);
  if (/\bWARN\b/.test(line)) return yellow(line);
  if (/\bDEBUG\b/.test(line)) return gray(line);
  return line;
}
