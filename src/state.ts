import { EventEmitter } from "events";
import { formatDuration } from "./util/duration.js";

export interface TopCommand {
  command: string;
  count: number;
}

export interface ApprovalRequest {
  id: number;
  tool: string;
  preview: string;
  resolve: (approved: boolean) => void;
}

export type ApprovalHandler = (req: ApprovalRequest) => void;

/**
 * Runtime state shared between the HTTP/RPC server and the TUI: counters,
 * connection status, tunnel URL, and the interactive approval queue.
 */
class RuntimeState extends EventEmitter {
  readonly startedAt = Date.now();
  serverListening = false;
  connectionEstablished = false;
  connectionEstablishedAt: number | null = null;
  startupNotificationSent = false;
  tunnelUrl: string | null = null;

  commandsToday = 0;
  private activeDayKey = new Date().toISOString().slice(0, 10);
  private toolCounts = new Map<string, number>();

  private approvalSeq = 0;
  private approvalHandler: ApprovalHandler | null = null;
  readonly pendingApprovals: ApprovalRequest[] = [];

  recordTool(tool: string): void {
    const dayKey = new Date().toISOString().slice(0, 10);
    if (dayKey !== this.activeDayKey) {
      this.activeDayKey = dayKey;
      this.commandsToday = 0;
    }
    this.commandsToday += 1;
    this.toolCounts.set(tool, (this.toolCounts.get(tool) ?? 0) + 1);
    this.emit("update");
  }

  setListening(listening: boolean): void {
    this.serverListening = listening;
    this.emit("update");
  }

  setTunnelUrl(url: string | null): void {
    this.tunnelUrl = url;
    this.emit("update");
  }

  markConnected(): boolean {
    if (this.connectionEstablished) return false;
    this.connectionEstablished = true;
    this.connectionEstablishedAt = Date.now();
    this.emit("update");
    return true;
  }

  topCommands(limit = 5): TopCommand[] {
    return Array.from(this.toolCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([command, count]) => ({ command, count }));
  }

  uptimeSeconds(): number {
    return Math.floor((Date.now() - this.startedAt) / 1000);
  }

  uptime(): string {
    return formatDuration(this.uptimeSeconds());
  }

  /** Register an interactive approval handler (called by the TUI). */
  setApprovalHandler(handler: ApprovalHandler | null): void {
    this.approvalHandler = handler;
  }

  hasApprovalHandler(): boolean {
    return this.approvalHandler !== null;
  }

  /**
   * Ask the interactive handler to approve a tool call. Resolves to false when
   * no handler is registered (e.g. headless daemon) so callers can deny safely.
   */
  requestApproval(tool: string, preview: string): Promise<boolean> {
    if (!this.approvalHandler) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const req: ApprovalRequest = {
        id: ++this.approvalSeq,
        tool,
        preview,
        resolve: (approved) => {
          const idx = this.pendingApprovals.indexOf(req);
          if (idx >= 0) this.pendingApprovals.splice(idx, 1);
          this.emit("update");
          resolve(approved);
        },
      };
      this.pendingApprovals.push(req);
      this.emit("update");
      this.approvalHandler?.(req);
    });
  }
}

export const state = new RuntimeState();
