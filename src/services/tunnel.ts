import { PokeTunnel, login, logout, isLoggedIn, getToken } from "poke";
import { ToolManager } from "../tools/manager";
import type { ToolDefinition, ToolImage } from "../tools/types";
import type { Skill } from "../skills/loader";
import { startMcpServer, type McpServerHandle } from "../mcp/server";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadConfig, permissionModeOf, type PermissionMode } from "../config";

interface State {
  connectionId?: string;
  connectionHistory?: string[];
}

export type TunnelLogger = (msg: string) => void;

export interface LoginCodeInfo {
  userCode: string;
  loginUrl: string;
}

const CONFIG_DIR = join(homedir(), ".config", "pokeclaw");
const STATE_PATH = join(CONFIG_DIR, "state.json");

export interface ToolCallEvent {
  type: "tool-start" | "tool-end";
  name: string;
  args: Record<string, unknown>;
  output?: string;
  isError?: boolean;
  ms?: number;
}

export interface PermissionRequest {
  tool: ToolDefinition;
  args: Record<string, unknown>;
}

export type PermissionDecision = "allow" | "deny" | "allow-session";

/**
 * Manages the Poke tunnel connection and is the single entry point for
 * incoming tool calls from Poke's assistant.
 *
 * - `list_tools` is served from the ToolManager registry (single source of truth).
 * - `handleToolCall` executes a tool locally with permission checks and emits
 *   tool-start/tool-end events so the TUI can render live ToolCards.
 * - `reply_to_terminal` is registered like any other tool; its handler
 *   resolves the pending `ask()` promise in AgentSession.
 */
export class TunnelService {
  private toolManager: ToolManager;
  private tunnel?: PokeTunnel;
  private mcp?: McpServerHandle;
  private connected = false;
  private connecting: Promise<void> | null = null;
  private toolListeners = new Set<(e: ToolCallEvent) => void>();
  private permissionHandler: ((req: PermissionRequest) => Promise<PermissionDecision>) | null = null;
  private permissionMode: PermissionMode;
  private sessionAllowedTools = new Set<string>();
  private onReplyToTerminal: ((answer: string) => void) | null = null;
  private loginCodeHandler: ((info: LoginCodeInfo | null) => void) | null = null;

  private logger: TunnelLogger;

  // --- auto-reconnect state -------------------------------------------------
  // If the tunnel drops unexpectedly (network blip, firewall, sleep), Poke's
  // broker reports "no available upstreams" for every tool call until a new
  // upstream connects. Reconnect with backoff instead of staying dead.
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectAttempts = 0;
  private stopRequested = false;
  private activeToken: string | undefined;
  private static readonly MAX_RECONNECT_ATTEMPTS = 20;

  constructor(opts: {
    permissionMode?: PermissionMode;
    logger?: TunnelLogger;
    disabledTools?: Set<string>;
    skills?: Skill[];
  } = {}) {
    this.logger = opts.logger ?? (() => {});
    this.permissionMode = opts.permissionMode ?? permissionModeOf(loadConfig());
    this.toolManager = new ToolManager({
      onReplyToTerminal: (answer) => this.onReplyToTerminal?.(answer),
      disabledTools: opts.disabledTools,
      skills: opts.skills,
    });
  }

  // ------------------------------------------------------------------ wiring

  /** Live tool-call events for the TUI. */
  onToolEvent(listener: (e: ToolCallEvent) => void): () => void {
    this.toolListeners.add(listener);
    return () => this.toolListeners.delete(listener);
  }

  private emitToolEvent(e: ToolCallEvent): void {
    for (const l of this.toolListeners) {
      try {
        l(e);
      } catch {
        // Listener errors must not break tool execution.
      }
    }
  }

  /** Set by the TUI (or headless callers) to approve write/bash tool calls. */
  setPermissionHandler(handler: (req: PermissionRequest) => Promise<PermissionDecision>): void {
    this.permissionHandler = handler;
  }

  setPermissionMode(mode: PermissionMode): void {
    this.permissionMode = mode;
  }

  /** Set by the TUI to render the device-login code as a proper screen. */
  setLoginCodeHandler(handler: ((info: LoginCodeInfo | null) => void) | null) {
    this.loginCodeHandler = handler;
  }

  /** Called by AgentSession: resolves the pending ask() with Poke's answer. */
  setReplyHandler(handler: (answer: string) => void): void {
    this.onReplyToTerminal = handler;
  }

  clearSessionPermissions(): void {
    this.sessionAllowedTools.clear();
  }

  get isConnected(): boolean {
    return this.connected;
  }

  /** True while a reconnect attempt is scheduled or running. */
  get isReconnecting(): boolean {
    return this.reconnectTimer !== undefined;
  }

  /** The advertised tool registry (single source of truth). */
  listTools(): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
    return this.toolManager.list().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  // ------------------------------------------------------- tool execution

  /**
   * Execute one tool call from Poke's assistant: permission check, run,
   * events. This is the seam the (mocked or live) transport invokes.
   */
  async handleToolCall(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ output: string; isError: boolean; images?: ToolImage[] }> {
    const tool = this.toolManager.get(toolName);
    if (!tool) {
      const output = `Error: unknown tool "${toolName}".`;
      this.emitToolEvent({ type: "tool-start", name: toolName, args });
      this.emitToolEvent({ type: "tool-end", name: toolName, args, output, isError: true, ms: 0 });
      return { output, isError: true };
    }

    const decision = await this.checkPermission(tool, args);
    this.emitToolEvent({ type: "tool-start", name: toolName, args });
    const started = Date.now();

    let output: string;
    let isError = false;
    let images: ToolImage[] | undefined;
    if (decision === "deny") {
      output = `Error: permission denied by user for tool "${toolName}". Ask the user or proceed without it.`;
      isError = true;
    } else {
      const result = await this.toolManager.execute(toolName, args, { cwd: process.cwd() });
      output = result.output;
      isError = result.isError ?? false;
      images = result.images;
    }

    const ms = Date.now() - started;
    this.emitToolEvent({ type: "tool-end", name: toolName, args, output, isError, ms });
    return { output, isError, images };
  }

  private async checkPermission(
    tool: ToolDefinition,
    args: Record<string, unknown>,
  ): Promise<PermissionDecision> {
    if (tool.permission === "read") return "allow";
    if (this.permissionMode === "readonly") return "deny";
    if (this.permissionMode === "auto") return "allow";
    if (this.sessionAllowedTools.has(tool.name)) return "allow";
    if (!this.permissionHandler) return "allow"; // non-interactive default
    const decision = await this.permissionHandler({ tool, args });
    if (decision === "allow-session") {
      this.sessionAllowedTools.add(tool.name);
      return "allow";
    }
    return decision;
  }

  // ------------------------------------------------------- connection

  private loadState(): State {
    try {
      if (existsSync(STATE_PATH)) {
        return JSON.parse(readFileSync(STATE_PATH, "utf-8"));
      }
    } catch {
      // ignore
    }
    return {};
  }

  private saveState(state: State) {
    try {
      if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true });
      }
      writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    } catch (e) {
      console.error("Error saving state:", e);
    }
  }

  private async triggerManualLogin(): Promise<string> {
    this.logger("Triggering Poke login flow...");

    try {
      await login({
        openBrowser: true,
        onCode: ({ userCode, loginUrl }) => {
          if (this.loginCodeHandler) {
            this.loginCodeHandler({ userCode, loginUrl });
          } else {
            console.error("\n============================================================");
            console.error(" POKE AUTHENTICATION REQUIRED");
            console.error("============================================================");
            console.error(`\n  1. Go to: ${loginUrl}`);
            console.error(`  2. Enter code: ${userCode}`);
            console.error("\n============================================================\n");
            this.logger("Opening browser (if supported)...");
          }
        },
      });
    } finally {
      this.loginCodeHandler?.(null);
    }

    const token = getToken();
    if (token) {
      return token;
    }
    throw new Error("Login completed but no token was found.");
  }

  /**
   * Tunnel auth uses the SDK user-login token (persisted in
   * ~/.config/poke/credentials.json), exactly like the official
   * `poke tunnel` CLI. The V2 API key is NOT valid here — the server
   * answers HTTP 403 for it.
   */
  private async ensureAuth(passedToken?: string): Promise<string> {
    // 1. Explicitly passed token (login-token override)
    if (passedToken) {
      this.logger("Using explicitly passed token.");
      return passedToken;
    }

    // 2. SDK login state
    if (isLoggedIn()) {
      const token = getToken();
      if (token) {
        this.logger("Using token from Poke login state.");
        return token;
      }
    }

    // 3. Device flow
    return await this.triggerManualLogin();
  }

  private async cleanupStaleConnections(token: string) {
    if (!token) return;
    const base = process.env.POKE_API ?? "https://poke.com/api/v1";
    const state = this.loadState();

    const ids = new Set<string>();
    if (state.connectionId) ids.add(state.connectionId);
    if (Array.isArray(state.connectionHistory)) {
      for (const id of state.connectionHistory) ids.add(id);
    }

    if (ids.size === 0) return;

    this.logger(`Cleaning up ${ids.size} old connection(s)…`);

    for (const id of ids) {
      try {
        await fetch(`${base}/mcp/connections/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // ignore cleanup
      }
    }

    this.saveState({ ...state, connectionId: undefined, connectionHistory: [] });
  }

  /**
   * Ensure the tunnel is connected, starting it once and reusing it.
   * Concurrent callers share the same in-flight attempt.
   */
  ensureConnected(passedToken?: string): Promise<void> {
    if (this.connected) return Promise.resolve();
    if (!this.connecting) {
      this.connecting = this.connect(passedToken).finally(() => {
        this.connecting = null;
      });
    }
    return this.connecting;
  }

  /**
   * Wait until Poke's server has pulled our tool list at least once.
   *
   * The SDK only re-syncs tools on `syncIntervalMs`, so without this the
   * first message can reach Poke's assistant before it has ever heard of
   * `reply_to_terminal` — the assistant then treats the instruction to call
   * it as a jailbreak attempt. We kick off one sync immediately (via the
   * SDK's internal syncTools, guarded because it isn't in the public
   * typings) and otherwise wait for the interval-driven `toolsSynced` event.
   * Times out with a warning rather than hanging the connect forever.
   */
  private waitForFirstToolSync(): Promise<void> {
    const tunnel = this.tunnel;
    if (!tunnel) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        tunnel.off("toolsSynced", onSynced);
        resolve();
      };
      const timer = setTimeout(() => {
        this.logger("Warning: timed out waiting for Poke to sync tools; continuing anyway.");
        done();
      }, 60_000);
      const onSynced = () => done();
      tunnel.on("toolsSynced", onSynced);
      try {
        const syncTools = (
          tunnel as unknown as { syncTools?: () => Promise<unknown> }
        ).syncTools;
        if (typeof syncTools === "function") {
          syncTools
            .call(tunnel)
            .catch((e: unknown) =>
              this.logger(`Immediate tool sync failed, waiting for interval sync: ${e instanceof Error ? e.message : String(e)}`),
            );
        }
      } catch (e: unknown) {
        this.logger(`Immediate tool sync failed, waiting for interval sync: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  async connect(passedToken?: string) {
    this.stopRequested = false;
    this.reconnectAttempts = 0;
    let currentToken = await this.ensureAuth(passedToken);
    this.activeToken = currentToken;
    let connectionAttempts = 0;
    const MAX_AUTH_RETRIES = 1;

    while (connectionAttempts <= MAX_AUTH_RETRIES) {
      try {
        await this.startTunnelOnce(currentToken);
        // If we reach here, it connected successfully
        break;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg === "AUTH_INVALID" && connectionAttempts < MAX_AUTH_RETRIES) {
          // The login token was rejected — drop it and run the device flow
          // again (surfaces the login screen in the TUI via the handler).
          this.logger("Login token rejected, re-authenticating...");
          await logout().catch(() => {});
          connectionAttempts++;
          currentToken = await this.triggerManualLogin();
          this.activeToken = currentToken;
          // The loop will continue and try to start the tunnel again with the new currentToken
        } else {
          // Let the caller handle it: the TUI shows it as an error entry,
          // --print prints it, the standalone tunnel command exits(1).
          throw error instanceof Error ? error : new Error(String(error));
        }
      }
    }
  }

  /**
   * Bring up one tunnel instance: local MCP server (once), PokeTunnel,
   * first tool sync. Resolves once Poke's assistant knows our tools.
   * Rejects with AUTH_INVALID when the token is rejected.
   */
  private startTunnelOnce(token: string, opts: { isReconnect?: boolean } = {}): Promise<void> {
    return new Promise(async (resolve, reject) => {
        let isResolved = false;
        let isAuthFailure = false;

        await this.cleanupStaleConnections(token);

        // Start the local MCP server first. Poke's server reaches our tools
        // through the reverse tunnel pointed at this URL — this is what lets
        // Poke's assistant actually call tools on this machine.
        if (!this.mcp) {
          this.mcp = await startMcpServer({
            tools: this.toolManager,
            onCallTool: (name, args) => this.handleToolCall(name, args),
            // Log every incoming MCP request (Poke's server -> tunnel ->
            // this server) so path mismatches show up in the pokeclaw log.
            log: (msg) => this.logger(msg),
          });
          this.logger(`Local MCP server listening at ${this.mcp.url}`);
        }

        this.tunnel = new PokeTunnel({
          url: this.mcp.url,
          token,
          name: "pokeclaw",
          cleanupOnStop: true,
          // Same re-sync cadence as the official `poke tunnel` CLI.
          syncIntervalMs: 30_000,
        });

        // Set up a "canary" to detect immediate auth failures
        const connectionStartTime = Date.now();

        this.tunnel.on("connected", (info) => {
          const state = this.loadState();
          const history = state.connectionHistory || [];
          if (info.connectionId) history.push(info.connectionId);
          this.saveState({ ...state, connectionId: info.connectionId, connectionHistory: history.slice(-10) });
          this.logger(`Tunnel connection established. ID: ${info.connectionId}`);
          this.connected = true;
          // Don't resolve yet: Poke's assistant must first learn our tool
          // list (incl. `reply_to_terminal`). The SDK only re-syncs on an
          // interval, so a message sent before the first sync reaches an
          // assistant that has never heard of our tools.
          void this.waitForFirstToolSync().then(
            () => {
              if (!isResolved && !isAuthFailure) {
                isResolved = true;
                resolve();
              }
            },
            (e: unknown) => {
              if (!isResolved && !isAuthFailure) {
                isAuthFailure = true;
                reject(e instanceof Error ? e : new Error(String(e)));
              }
            },
          );
        });

        this.tunnel.on("disconnected", () => {
          this.connected = false;
          if (isAuthFailure) return;
          this.logger("Tunnel disconnected.");
          const duration = Date.now() - connectionStartTime;

          // If we disconnect instantly (< 3s) AND haven't established connection yet, it's likely an auth issue
          if (!isResolved && duration < 3000) {
            isAuthFailure = true;
            this.tunnel?.stop();
            reject(
              opts.isReconnect
                ? new Error("Tunnel dropped immediately during reconnect")
                : new Error("AUTH_INVALID"),
            );
            return;
          }
          // Dropped after a successful connect: Poke's broker now reports
          // "no available upstreams" for tool calls — re-establish the
          // upstream instead of staying dead until restart.
          if (isResolved && !this.stopRequested) {
            this.scheduleReconnect();
          }
        });

        this.tunnel.on("error", (err) => {
          if (isAuthFailure) return;
          this.logger(`Tunnel error: ${err.message}`);
          const msg = err.message.toLowerCase();
          if (
            msg.includes("401") ||
            msg.includes("403") ||
            msg.includes("auth") ||
            msg.includes("forbidden")
          ) {
            isAuthFailure = true;
            this.tunnel?.stop();
            reject(new Error("AUTH_INVALID"));
          }
        });

        this.tunnel.on("toolsSynced", ({ toolCount }) =>
          this.logger(`Synced ${toolCount} tools to Poke.`),
        );

        this.logger("Starting Poke Tunnel...");
        try {
          await this.tunnel.start();
        } catch (e: unknown) {
          if (isResolved || isAuthFailure) return;
          // The SDK throws plain errors like "Failed to create tunnel: HTTP 403"
          // — map auth failures onto the AUTH_INVALID path.
          const m = e instanceof Error ? e.message : String(e);
          if (/\b401\b|\b403\b/i.test(m) || m.toLowerCase().includes("auth")) {
            isAuthFailure = true;
            reject(new Error("AUTH_INVALID"));
          } else {
            reject(e);
          }
        }
    });
  }

  /**
   * Schedule a reconnect attempt with exponential backoff after an
   * unexpected tunnel drop. A dropped upstream is exactly what makes Poke's
   * broker answer tool calls with "no available upstreams", so re-establish
   * it instead of staying dead until the user restarts. Gives up after
   * MAX_RECONNECT_ATTEMPTS so a permanently broken network doesn't spin
   * forever; an AUTH_INVALID aborts immediately (re-login needs the user).
   */
  private scheduleReconnect(): void {
    if (this.stopRequested || this.reconnectTimer) return;
    const token = this.activeToken;
    if (!token) return;
    if (this.reconnectAttempts >= TunnelService.MAX_RECONNECT_ATTEMPTS) {
      this.logger(
        `Tunnel reconnect: giving up after ${TunnelService.MAX_RECONNECT_ATTEMPTS} attempts. Restart pokeclaw to try again.`,
      );
      return;
    }
    const delayMs = Math.min(2000 * 2 ** this.reconnectAttempts, 30_000);
    this.reconnectAttempts++;
    this.logger(
      `Tunnel disconnected. Reconnecting in ${Math.round(delayMs / 1000)}s… (attempt ${this.reconnectAttempts}/${TunnelService.MAX_RECONNECT_ATTEMPTS})`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.stopRequested) return;
      const t = this.activeToken;
      if (!t) return;
      this.startTunnelOnce(t, { isReconnect: true }).then(
        () => {
          this.reconnectAttempts = 0;
        },
        (e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg === "AUTH_INVALID") {
            this.logger("Tunnel reconnect failed: login token rejected. Restart pokeclaw to log in again.");
            return;
          }
          this.logger(`Tunnel reconnect attempt failed (${msg}). Retrying…`);
          this.scheduleReconnect();
        },
      );
    }, delayMs);
  }

  async stop(): Promise<void> {
    // User-initiated stop: never reconnect afterwards.
    this.stopRequested = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.reconnectAttempts = 0;
    try {
      await this.tunnel?.stop();
    } catch {
      // ignore
    }
    try {
      await this.mcp?.stop();
    } catch {
      // ignore
    }
    this.mcp = undefined;
    this.connected = false;
  }
}
