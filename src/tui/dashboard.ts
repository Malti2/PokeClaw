import { emitKeypressEvents } from "readline";
import { BRAND, VERSION } from "../version.js";
import type { LogLevel } from "../config.js";
import { getConfig } from "../runtime.js";
import { logger } from "../logger.js";
import { state, type ApprovalRequest } from "../state.js";
import { readSystemUsage } from "../tools/system.js";
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
} from "./ansi.js";

const LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];
const POLICIES = ["full", "approval", "readonly"] as const;

interface Key {
  name?: string;
  ctrl?: boolean;
  sequence?: string;
}

/**
 * Full-screen live dashboard rendered with raw ANSI (no runtime deps).
 * Shows connection/tunnel status, recent tool calls, live logs, and handles
 * interactive approval prompts and hotkeys.
 */
export class Dashboard {
  private paused = false;
  private filter = "";
  private filtering = false;
  private showHelp = false;
  private dirty = true;
  private renderTimer: ReturnType<typeof setInterval> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;

    logger.silence(true);
    process.stdout.write(ALT_SCREEN_ON + HIDE_CURSOR + CLEAR_SCREEN);

    if (process.stdin.isTTY) {
      emitKeypressEvents(process.stdin);
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on("keypress", (_str, key: Key) => this.onKey(key));
    }

    state.setApprovalHandler(() => this.markDirty());
    logger.on("update", () => this.markDirty());
    state.on("update", () => this.markDirty());
    process.stdout.on("resize", () => this.markDirty());

    // Repaint at most ~15fps when dirty; tick once a second for uptime/cpu.
    this.renderTimer = setInterval(() => {
      if (this.dirty) this.render();
    }, 66);
    this.tickTimer = setInterval(() => this.markDirty(), 1000);

    this.render();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.renderTimer) clearInterval(this.renderTimer);
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
    process.stdout.write(SHOW_CURSOR + ALT_SCREEN_OFF);
    logger.silence(false);
  }

  private markDirty(): void {
    this.dirty = true;
  }

  private currentApproval(): ApprovalRequest | undefined {
    return state.pendingApprovals[0];
  }

  private onKey(key: Key): void {
    if (!key) return;
    const name = key.name ?? key.sequence ?? "";

    // Answer a pending approval first.
    const approval = this.currentApproval();
    if (approval && !this.filtering) {
      if (name === "y") approval.resolve(true);
      else if (name === "n") approval.resolve(false);
      this.markDirty();
      return;
    }

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
      process.exit(0);
    } else if (name === "l") {
      const idx = LEVELS.indexOf(logger.level);
      logger.setLevel(LEVELS[(idx + 1) % LEVELS.length]);
    } else if (name === "p") {
      this.paused = !this.paused;
    } else if (name === "c") {
      logger.logs.length = 0;
    } else if (name === "f") {
      this.filtering = true;
      this.filter = "";
    } else if (name === "a") {
      const cfg = getConfig();
      const idx = POLICIES.indexOf(cfg.policy);
      cfg.policy = POLICIES[(idx + 1) % POLICIES.length];
      logger.log("info", `Policy changed to ${cfg.policy}`);
    } else if (name === "?") {
      this.showHelp = !this.showHelp;
    }
    this.markDirty();
  }

  private render(): void {
    this.dirty = false;
    const width = Math.max(40, process.stdout.columns ?? 80);
    const height = Math.max(16, process.stdout.rows ?? 24);
    const cfg = getConfig();
    const usage = readSystemUsage();

    const lines: string[] = [];
    const rule = (label?: string): string =>
      label
        ? gray("── ") + bold(label) + " " + gray("─".repeat(Math.max(0, width - label.length - 4)))
        : gray("─".repeat(width));

    // Header
    const connDot = state.connectionEstablished ? green("●") : yellow("○");
    const connText = state.connectionEstablished ? "Connected" : "Waiting for Poke…";
    lines.push(
      truncate(`${BRAND} ${bold(`PokeClaw v${VERSION}`)}   ${connDot} ${connText}`, width),
    );
    lines.push(gray("─".repeat(width)));

    const tunnel = state.tunnelUrl ?? dim("(disabled — run with a tunnel to expose)");
    const authText = cfg.token ? green("● token") : red("○ none");
    lines.push(truncate(` Uptime  ${padEnd(state.uptime(), 16)} Port ${cfg.port}`, width));
    lines.push(truncate(` Tunnel  ${tunnel}`, width));
    lines.push(
      truncate(` Auth    ${padEnd(authText, 20)} Policy ${policyColor(cfg.policy)}`, width),
    );
    lines.push(truncate(` Roots   ${cfg.roots.join(", ")}`, width));
    lines.push(
      truncate(
        ` CPU ${usage.cpuPercent}%   MEM ${usage.memoryPercent}%   Commands today ${state.commandsToday}`,
        width,
      ),
    );

    // Recent tool calls
    lines.push(rule("Recent tool calls"));
    const calls = logger.toolCalls.slice(-5);
    if (!calls.length) lines.push(dim(" (none yet)"));
    for (const c of calls) {
      lines.push(truncate(` ${dim(c.timestamp)} ${cyan(padEnd(c.tool, 14))} ${c.preview}`, width));
    }

    // Logs (fills remaining space)
    const filterLabel = this.filter ? ` /${this.filter}/` : "";
    const pausedLabel = this.paused ? " [paused]" : "";
    lines.push(rule(`Logs (${logger.level})${filterLabel}${pausedLabel}`));

    const footerLines = 2;
    const used = lines.length;
    const logRoom = Math.max(1, height - used - footerLines);
    let logSource = this.filter
      ? logger.logs.filter((l) => l.toLowerCase().includes(this.filter.toLowerCase()))
      : logger.logs;
    if (this.paused) logSource = logSource.slice(0, logSource.length); // frozen snapshot ordering
    const shown = logSource.slice(-logRoom);
    for (const l of shown) lines.push(truncate(" " + colorLog(l), width));
    for (let i = shown.length; i < logRoom; i++) lines.push("");

    // Footer / approval / help
    lines.push(gray("─".repeat(width)));
    const approval = this.currentApproval();
    if (approval) {
      lines.push(
        truncate(
          ` ${yellow("APPROVE?")} ${bold(approval.tool)} ${dim(approval.preview)}  ${green("[y]")}es ${red("[n]")}o`,
          width,
        ),
      );
    } else if (this.filtering) {
      lines.push(
        truncate(
          ` ${cyan("filter:")} ${this.filter}${dim("▏")}  ${dim("[enter] apply [esc] clear")}`,
          width,
        ),
      );
    } else if (this.showHelp) {
      lines.push(
        truncate(
          ` ${dim("q")} quit  ${dim("l")} log-level  ${dim("p")} pause  ${dim("c")} clear  ${dim("f")} filter  ${dim("a")} policy  ${dim("?")} close help`,
          width,
        ),
      );
    } else {
      lines.push(
        truncate(
          ` ${key("q")}uit ${key("l")}og ${key("p")}ause ${key("c")}lear ${key("f")}ilter ${key("a")} policy ${key("?")}help`,
          width,
        ),
      );
    }

    process.stdout.write(moveTo(1, 1) + CLEAR_SCREEN + lines.slice(0, height).join("\n"));
  }
}

function key(k: string): string {
  return gray("[") + bold(k) + gray("]");
}

function policyColor(policy: string): string {
  if (policy === "readonly") return green(policy);
  if (policy === "approval") return yellow(policy);
  return policy;
}

function colorLog(line: string): string {
  if (/\bERROR\b/.test(line)) return red(line);
  if (/\bWARN\b/.test(line)) return yellow(line);
  if (/\bDEBUG\b/.test(line)) return gray(line);
  return line;
}
