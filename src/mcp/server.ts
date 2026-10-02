import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { ToolManager } from "../tools/manager";
import type { ToolImage } from "../tools/types";

export interface McpServerHandle {
  /** Public URL of the MCP endpoint, e.g. http://127.0.0.1:PORT/mcp */
  url: string;
  stop(): Promise<void>;
}

/**
 * Expose the ToolManager registry as a real local MCP server (Streamable HTTP).
 *
 * This is the piece that makes Poke's assistant able to call local tools:
 * PokeTunnel opens a reverse tunnel to the URL we hand it, Poke's server
 * speaks MCP through that tunnel, and every tool call lands in `onCallTool`.
 *
 * Runs in stateless mode (no session IDs): every HTTP request gets a fresh
 * transport + server instance, so it also works through proxies that don't
 * preserve MCP session headers, and concurrent tool calls can't interfere.
 */
export async function startMcpServer(opts: {
  tools: ToolManager;
  /**
   * Called for every incoming tools/call. TunnelService passes its
   * handleToolCall here so permission checks and TUI events stay in one place.
   */
  onCallTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ output: string; isError: boolean; images?: ToolImage[] }>;
  /** Port to listen on. Defaults to 0 (ephemeral). */
  port?: number;
  /**
   * Optional request logger (method + path of every incoming MCP request).
   * TunnelService passes its log function so Poke's server-side calls show
   * up in the pokeclaw log — invaluable when a tool call 404s.
   */
  log?: (msg: string) => void;
}): Promise<McpServerHandle> {
  const createServer = () => {
    const server = new Server(
      { name: "pokeclaw", version: "0.1.0" },
      { capabilities: { tools: {} } },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: opts.tools.list().map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const name = request.params.name;
      const rawArgs = request.params.arguments;
      const args =
        typeof rawArgs === "object" && rawArgs !== null
          ? (rawArgs as Record<string, unknown>)
          : {};
      const result = await opts.onCallTool(name, args);
      const content: Array<
        | { type: "text"; text: string }
        | { type: "image"; data: string; mimeType: string }
      > = [{ type: "text" as const, text: result.output }];
      for (const img of result.images ?? []) {
        content.push({ type: "image" as const, data: img.data, mimeType: img.mimeType });
      }
      return { content, isError: result.isError };
    });

    return server;
  };

  const bunServer = Bun.serve({
    hostname: "127.0.0.1",
    port: opts.port ?? 0,
    fetch: async (req) => {
      // This port is MCP-only: serve MCP on every path, not just /mcp.
      // Poke's server doesn't always POST tool calls to the exact path we
      // registered (its runtime call path can differ from the serverUrl
      // path), and a strict path check turns those calls into 404s —
      // surfacing on Poke's side as "error posting to endpoint: not found".
      const pathname = new URL(req.url).pathname;
      opts.log?.(`MCP ${req.method} ${pathname}`);
      // Stateless: fresh transport + server per request.
      const server = createServer();
      const transport = new WebStandardStreamableHTTPServerTransport();
      await server.connect(transport);
      const response = await transport.handleRequest(req);
      const body = response.body;
      if (!body) {
        await transport.close().catch(() => undefined);
        return response;
      }
      // handleRequest() resolves once the Response exists, not once its
      // stream is consumed. Drain a tee'd branch in the background and only
      // close the transport afterwards — closing earlier would truncate the
      // SSE stream before the server writes the response into it.
      const [serveBranch, drainBranch] = body.tee();
      void (async () => {
        try {
          const reader = drainBranch.getReader();
          for (;;) {
            const { done } = await reader.read();
            if (done) break;
          }
        } catch {
          // Client went away; still clean up.
        } finally {
          await transport.close().catch(() => undefined);
        }
      })();
      return new Response(serveBranch, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    },
  });

  const url = `http://127.0.0.1:${bunServer.port}/mcp`;
  return {
    url,
    stop: async () => {
      bunServer.stop();
    },
  };
}
