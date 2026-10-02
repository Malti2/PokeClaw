import { describe, expect, test } from "bun:test";
import { AgentSession } from "../src/agent/session";
import { buildTerminalMessage, TERMINAL_NOTE, type MessageSender } from "../src/poke/client";
import {
  TunnelService,
  type PermissionDecision,
  type PermissionRequest,
  type ToolCallEvent,
} from "../src/services/tunnel";

/**
 * Headless verification of the Poke-native flow with a mocked transport:
 *
 *   ask() → (mock) sendMessage → simulated tool calls through the tunnel
 *   handler → permission check → tool-start/tool-end events → answer via
 *   reply_to_terminal → ask() resolves.
 *
 * No network access: the tunnel connection is stubbed out.
 */

/** Simulates Poke's assistant: calls tools, then delivers the answer. */
class MockPokeClient implements MessageSender {
  sent: string[] = [];
  constructor(private readonly tunnel: TunnelService) {}

  async sendMessage(text: string): Promise<{ success: boolean; message: string }> {
    this.sent.push(text);
    queueMicrotask(async () => {
      await this.tunnel.handleToolCall("list", { path: "." });
      await this.tunnel.handleToolCall("bash", { command: "echo hello-from-poke" });
      await this.tunnel.handleToolCall("reply_to_terminal", { answer: "The answer is 42." });
    });
    return { success: true, message: "queued" };
  }
}

/** Never replies — used to exercise the timeout path. */
class SilentMockClient implements MessageSender {
  async sendMessage(): Promise<{ success: boolean; message: string }> {
    return { success: true, message: "queued" };
  }
}

function makeTunnel(permissionMode: "ask" | "auto" | "readonly" = "ask") {
  const tunnel = new TunnelService({ permissionMode });
  // No real network in tests: skip the Poke connection, keep tool plumbing.
  tunnel.ensureConnected = async () => {};
  return tunnel;
}

describe("terminal note prefix", () => {
  test("every message is prefixed and keeps the user prompt", () => {
    const msg = buildTerminalMessage("list the files");
    expect(msg.startsWith(TERMINAL_NOTE)).toBe(true);
    expect(msg).toContain("list the files");
    expect(msg).toContain("reply_to_terminal");
  });

  test("note is phrased as a request, not a command (no injection-like absolutes)", () => {
    expect(TERMINAL_NOTE).toContain("please");
    expect(TERMINAL_NOTE).not.toMatch(/ONLY/i);
    expect(TERMINAL_NOTE).not.toMatch(/NOTHING/i);
    expect(TERMINAL_NOTE).not.toMatch(/Do NOT/i);
  });
});

describe("ask → tool events → answer flow", () => {
  test("full round trip through the mocked Poke client", async () => {
    const tunnel = makeTunnel("ask");
    const events: ToolCallEvent[] = [];
    const permissionRequests: PermissionRequest[] = [];
    tunnel.onToolEvent((e) => events.push(e));
    tunnel.setPermissionHandler(async (req): Promise<PermissionDecision> => {
      permissionRequests.push(req);
      return "allow";
    });

    const client = new MockPokeClient(tunnel);
    const session = new AgentSession(tunnel, client);

    const answer = await session.ask("What is the answer?");

    // 1. The answer came back through reply_to_terminal.
    expect(answer).toBe("The answer is 42.");

    // The tool-end bookkeeping for reply_to_terminal lands a microtask
    // after ask() resolves (the reply resolves the promise first).
    await new Promise((r) => setTimeout(r, 20));

    // 2. The outbound message carried the terminal-session instruction.
    expect(client.sent).toHaveLength(1);
    expect(client.sent[0].startsWith(TERMINAL_NOTE)).toBe(true);
    expect(client.sent[0]).toContain("What is the answer?");

    // 3. Tool events fired in order: list, bash, reply_to_terminal.
    const names = events.map((e) => `${e.type}:${e.name}`);
    expect(names).toEqual([
      "tool-start:list",
      "tool-end:list",
      "tool-start:bash",
      "tool-end:bash",
      "tool-start:reply_to_terminal",
      "tool-end:reply_to_terminal",
    ]);

    // 4. Read-only tools ran free; bash required a permission decision.
    expect(permissionRequests.map((r) => r.tool.name)).toEqual(["bash"]);
    expect(permissionRequests[0].args).toMatchObject({ command: "echo hello-from-poke" });

    // 5. Tool results carried outputs and durations.
    const bashEnd = events.find((e) => e.type === "tool-end" && e.name === "bash");
    expect(bashEnd?.isError).toBe(false);
    expect(bashEnd?.output).toContain("hello-from-poke");
    expect(typeof bashEnd?.ms).toBe("number");
  });

  test("permission denied surfaces as a tool error", async () => {
    const tunnel = makeTunnel("ask");
    tunnel.setPermissionHandler(async () => "deny" as PermissionDecision);
    const result = await tunnel.handleToolCall("bash", { command: "rm -rf /" });
    expect(result.isError).toBe(true);
    expect(result.output).toContain("permission denied");
  });

  test("readonly mode denies write tools without prompting", async () => {
    const tunnel = makeTunnel("readonly");
    let prompted = false;
    tunnel.setPermissionHandler(async () => {
      prompted = true;
      return "allow";
    });
    const result = await tunnel.handleToolCall("write", { path: "x.txt", content: "x" });
    expect(result.isError).toBe(true);
    expect(prompted).toBe(false);
  });

  test("session allow-list skips repeat prompts", async () => {
    const tunnel = makeTunnel("ask");
    let prompts = 0;
    tunnel.setPermissionHandler(async () => {
      prompts++;
      return "allow-session" as PermissionDecision;
    });
    await tunnel.handleToolCall("bash", { command: "echo one" });
    await tunnel.handleToolCall("bash", { command: "echo two" });
    expect(prompts).toBe(1);
  });

  test("reply_to_terminal is advertised in the tool registry", () => {
    const tunnel = makeTunnel();
    const tools = tunnel.listTools();
    const names = tools.map((t) => t.name);
    for (const expected of [
      "read",
      "write",
      "edit",
      "list",
      "glob",
      "grep",
      "bash",
      "todo_write",
      "todo_read",
      "reply_to_terminal",
    ]) {
      expect(names).toContain(expected);
    }
    const reply = tools.find((t) => t.name === "reply_to_terminal");
    expect(reply?.inputSchema).toMatchObject({ type: "object" });
  });

  test("only one active query at a time", async () => {
    const tunnel = makeTunnel();
    const session = new AgentSession(tunnel, new SilentMockClient());
    const first = session.ask("first", { timeoutMs: 500 });
    await expect(session.ask("second")).rejects.toThrow(/already in flight/);
    await expect(first).rejects.toThrow(/Timed out/);
    // After the timeout the session is usable again.
    expect(session.isBusy).toBe(false);
  });

  test("abort rejects the wait (best effort)", async () => {
    const tunnel = makeTunnel();
    const session = new AgentSession(tunnel, new SilentMockClient());
    const controller = new AbortController();
    const pending = session.ask("hello", { signal: controller.signal, timeoutMs: 60_000 });
    controller.abort();
    await expect(pending).rejects.toThrow(/Aborted/);
    expect(session.isBusy).toBe(false);
  });
});
