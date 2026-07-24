import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";
import type { URL as NodeURL } from "url";
import { APP_NAME, VERSION } from "./version.js";
import type { PokeClawConfig } from "./config.js";
import { setActiveConfig } from "./runtime.js";
import { logger } from "./logger.js";
import { state } from "./state.js";
import { dispatchTool, TOOLS } from "./tools/index.js";

const NOTIFY_ENDPOINT = [
  process.env.POKECLAW_POKE_WEBHOOK_URL,
  process.env.POKECLAW_NOTIFY_URL,
  process.env.POKECLAW_MESSAGE_ENDPOINT,
  process.env.POKE_PLATFORM_ENDPOINT,
  process.env.POKE_WEBHOOK_URL,
  process.env.POKECLAW_POKE_ENDPOINT,
]
  .map((value) => value?.trim())
  .find((value): value is string => Boolean(value));
const NOTIFY_TOKEN = (
  process.env.POKECLAW_POKE_WEBHOOK_TOKEN ??
  process.env.POKE_NOTIFY_TOKEN ??
  ""
).trim();

function isAuthorised(req: IncomingMessage, url: NodeURL, token: string): boolean {
  if (!token) return true;
  if (url.searchParams.get("token") === token) return true;
  const header = req.headers["authorization"] ?? "";
  if (header.startsWith("Bearer ") && header.slice(7) === token) return true;
  return false;
}

function statsPayload() {
  return {
    status: "ok",
    uptimeSeconds: state.uptimeSeconds(),
    uptime: state.uptime(),
    commandsToday: state.commandsToday,
    topCommands: state.topCommands(3),
    startedAt: new Date(state.startedAt).toISOString(),
    tunnelUrl: state.tunnelUrl,
    connection: {
      serverListening: state.serverListening,
      connectionEstablished: state.connectionEstablished,
      connectionEstablishedAt: state.connectionEstablishedAt
        ? new Date(state.connectionEstablishedAt).toISOString()
        : null,
      startupNotificationSent: state.startupNotificationSent,
      notifyEndpointConfigured: Boolean(NOTIFY_ENDPOINT),
    },
  };
}

async function notifyPokePlatform(
  config: PokeClawConfig,
  event: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  if (!NOTIFY_ENDPOINT) return false;
  const body = {
    event,
    source: APP_NAME,
    version: VERSION,
    timestamp: new Date().toISOString(),
    port: config.port,
    localUrl: `http://127.0.0.1:${config.port}/mcp`,
    healthUrl: `http://127.0.0.1:${config.port}/health`,
    authEnabled: Boolean(config.token),
    roots: config.roots.length,
    ...payload,
  };
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (NOTIFY_TOKEN) headers.Authorization = `Bearer ${NOTIFY_TOKEN}`;
    const response = await fetch(NOTIFY_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.log("warn", `Failed to notify Poke platform for ${event}: ${message}`);
    return false;
  }
}

function markConnectionEstablished(config: PokeClawConfig, trigger: string): void {
  if (state.markConnected()) {
    logger.log("info", `Poke connected (${trigger})`);
    void notifyPokePlatform(config, "connection_established", { trigger });
  }
}

async function handleRPC(config: PokeClawConfig, body: Record<string, unknown>): Promise<unknown> {
  const method = String(body.method ?? "");
  const id = body.id ?? null;
  const params = (body.params ?? {}) as Record<string, unknown>;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

  try {
    switch (method) {
      case "initialize": {
        markConnectionEstablished(config, "initialize");
        return ok({
          protocolVersion: "2024-11-05",
          serverInfo: { name: APP_NAME, version: VERSION },
          capabilities: { tools: {} },
        });
      }
      case "notifications/initialized":
        markConnectionEstablished(config, "notifications/initialized");
        return null;
      case "tools/list":
        return ok({ tools: TOOLS });
      case "tools/call": {
        const toolName = String(params.name ?? "");
        const args = (params.arguments ?? {}) as Record<string, unknown>;
        const text = await dispatchTool(toolName, args);
        return ok({ content: [{ type: "text", text }] });
      }
      case "ping":
        return ok({});
      default:
        return err(-32601, `Method not found: ${method}`);
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    logger.log("error", `Error in ${method}: ${message}`);
    return err(-32603, message);
  }
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  });
  res.end(JSON.stringify(data));
}

export function createPokeClawServer(config: PokeClawConfig): Server {
  setActiveConfig(config);

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost:${config.port}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      });
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      json(res, 200, {
        status: "ok",
        name: APP_NAME,
        version: VERSION,
        auth: Boolean(config.token),
        policy: config.policy,
        roots: config.roots.length,
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/logs") {
      json(res, 200, { lines: logger.logs.slice(-100) });
      return;
    }
    if (req.method === "GET" && url.pathname === "/stats") {
      json(res, 200, statsPayload());
      return;
    }
    if (req.method === "GET" && url.pathname === "/tool-calls") {
      json(res, 200, { calls: logger.toolCalls.slice(-25) });
      return;
    }

    if (url.pathname === "/mcp") {
      if (!isAuthorised(req, url, config.token)) {
        json(res, 401, { error: "Unauthorized: supply ?token= or Authorization: Bearer header" });
        return;
      }
      if (req.method !== "POST") {
        json(res, 405, { error: "Method Not Allowed" });
        return;
      }
      let raw = "";
      for await (const chunk of req) raw += chunk;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(raw);
      } catch {
        json(res, 400, { error: "Invalid JSON" });
        return;
      }
      const result = await handleRPC(config, parsed);
      if (result === null) {
        res.writeHead(204);
        res.end();
        return;
      }
      json(res, 200, result);
      return;
    }

    json(res, 404, { error: "Not found" });
  });
}

export interface StartOptions {
  onListening?: () => void;
}

/** Start the HTTP/MCP server and wire up startup notifications. */
export function startServer(config: PokeClawConfig, opts: StartOptions = {}): Server {
  const server = createPokeClawServer(config);
  server.listen(config.port, "127.0.0.1", () => {
    state.setListening(true);
    void notifyPokePlatform(config, "server_started", {}).then((sent) => {
      state.startupNotificationSent = sent;
    });
    opts.onListening?.();
  });
  return server;
}
