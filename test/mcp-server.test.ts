import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ToolManager } from "../src/tools/manager";
import { startMcpServer } from "../src/mcp/server";

describe("local MCP server", () => {
  test("advertises tools and executes calls end to end", async () => {
    const box: { value: string | null } = { value: null };
    const tools = new ToolManager({
      onReplyToTerminal: (answer) => {
        box.value = answer;
      },
    });

    const permissionLog: string[] = [];
    const handle = await startMcpServer({
      tools,
      onCallTool: async (name, args) => {
        permissionLog.push(name);
        const result = await tools.execute(name, args, { cwd: process.cwd() });
        return { output: result.output, isError: result.isError ?? false };
      },
    });

    try {
      const client = new Client({ name: "pokeclaw-test", version: "0.0.0" });
      const transport = new StreamableHTTPClientTransport(new URL(handle.url));
      await client.connect(transport);

      const { tools: listed } = await client.listTools();
      const names = listed.map((t) => t.name);
      for (const expected of ["read", "write", "edit", "bash", "reply_to_terminal"]) {
        expect(names).toContain(expected);
      }

      // Read-only tool call through MCP.
      const listRes = await client.callTool({ name: "list", arguments: { path: "." } });
      expect(listRes.isError).toBeFalsy();
      const listText = (listRes.content as Array<{ text: string }>)
        .map((c) => c.text)
        .join("\n");
      expect(listText).toContain("package.json");

      // reply_to_terminal delivers the answer to the local callback.
      await client.callTool({
        name: "reply_to_terminal",
        arguments: { answer: "done via MCP" },
      });
      expect(box.value).toBe("done via MCP");

      // Unknown tool -> MCP-level error result, not a transport failure.
      const badRes = await client.callTool({ name: "nope", arguments: {} });
      expect(badRes.isError).toBe(true);

      expect(permissionLog).toEqual(["list", "reply_to_terminal", "nope"]);

      await client.close();
    } finally {
      await handle.stop();
    }
  });

  test("serves MCP on any path, not just /mcp", async () => {
    // Poke's server doesn't always POST tool calls to the exact path we
    // registered — a strict path check turned those calls into 404s
    // ("error posting to endpoint: not found"). This port is MCP-only,
    // so every path must speak MCP.
    const tools = new ToolManager({ onReplyToTerminal: () => {} });
    const handle = await startMcpServer({
      tools,
      onCallTool: async (name) => ({ output: `called ${name}`, isError: false }),
    });
    try {
      const rootUrl = handle.url.replace(/\/mcp$/, "/");
      for (const url of [handle.url, rootUrl]) {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/list",
            params: {},
          }),
        });
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toContain("reply_to_terminal");
      }
    } finally {
      await handle.stop();
    }
  });

  test("logs incoming request paths when a logger is passed", async () => {
    const tools = new ToolManager({ onReplyToTerminal: () => {} });
    const seen: string[] = [];
    const handle = await startMcpServer({
      tools,
      onCallTool: async (name) => ({ output: `called ${name}`, isError: false }),
      log: (msg) => seen.push(msg),
    });
    try {
      await fetch(handle.url.replace(/\/mcp$/, "/"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(seen.some((m) => m.includes("POST /"))).toBe(true);
    } finally {
      await handle.stop();
    }
  });
});
