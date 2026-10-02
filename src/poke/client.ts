import { getToken, isLoggedIn, login } from "poke";
import { baseUrlOf, loadConfig, saveConfig, type PokeClawConfig } from "../config";

/**
 * Context note prepended to every outbound message so Poke's assistant knows
 * the user sits at a terminal: the terminal app cannot display normal chat
 * replies, so the answer should be delivered through the `reply_to_terminal`
 * tool instead.
 *
 * Deliberately phrased as a polite, conversational request rather than blunt
 * orders ("your ONLY action is …", "write NOTHING …"): this message arrives
 * over Poke's inbound channel, and commanding, prohibition-heavy phrasing
 * reads like a prompt injection — Poke's assistant flags it as a jailbreak
 * attempt instead of following it.
 */
export const AGENT_NOTE = [
  "(You're chatting with Malte through his terminal app, PokeClaw.",
  "The app can't display normal chat replies, so please send your answer",
  "with the `reply_to_terminal` tool from the PokeClaw integration.",
  "Feel free to use the integration's other tools — read, write, bash,",
  "screenshot, … — to work on his machine when that helps.)",
].join(" ");

// Kept for backwards compatibility; prefer buildAgentMessage.
export const TERMINAL_NOTE = AGENT_NOTE;

export interface AgentMessageOptions {
  /** Skill catalog note (names + one-liners); full skills load via load_skill. */
  skillsNote?: string;
}

export function buildAgentMessage(prompt: string, opts: AgentMessageOptions = {}): string {
  const parts = [AGENT_NOTE];
  if (opts.skillsNote) parts.push(opts.skillsNote);
  parts.push(prompt);
  return parts.join("\n\n");
}

/** Backwards-compatible wrapper (no skills note). */
export function buildTerminalMessage(prompt: string): string {
  return buildAgentMessage(prompt);
}

export class PokeError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "network" | "server" | "aborted" | "timeout" | "unknown",
  ) {
    super(message);
    this.name = "PokeError";
  }
}

export interface SendMessageResult {
  success: boolean;
  message: string;
}

/** Minimal contract AgentSession needs: deliver a message, get a confirmation. */
export interface MessageSender {
  sendMessage(text: string, opts?: { timeoutMs?: number }): Promise<SendMessageResult>;
}

/**
 * Thin client around Poke's inbound API.
 * `sendMessage` only confirms delivery ({success, message}) — the actual
 * answer arrives later via the `reply_to_terminal` tool call on the tunnel.
 */
export class PokeClient implements MessageSender {
  private apiKey: string | undefined;
  private baseUrl: string;

  constructor(cfg: PokeClawConfig = loadConfig()) {
    this.baseUrl = baseUrlOf(cfg);
  }

  /**
   * Resolve the V2 API key: 1) POKE_API_KEY env, 2) config file,
   * 3) interactive login() device flow (console-based; not for the TUI).
   */
  async resolveApiKey(): Promise<string> {
    if (process.env.POKE_API_KEY) {
      this.apiKey = process.env.POKE_API_KEY;
      return this.apiKey;
    }
    const cfg = loadConfig();
    if (cfg.apiKey) {
      this.apiKey = cfg.apiKey;
      return this.apiKey;
    }
    if (isLoggedIn()) {
      const token = getToken();
      if (token) {
        this.apiKey = token;
        return token;
      }
    }
    // Device flow: prints a code + URL, waits for the user on the web.
    await login({
      openBrowser: true,
      onCode: ({ userCode, loginUrl }) => {
        console.error("\n================ POKE AUTHENTICATION ================");
        console.error(`  1. Go to: ${loginUrl}`);
        console.error(`  2. Enter code: ${userCode}`);
        console.error("=====================================================\n");
      },
    });
    const token = getToken();
    if (!token) throw new PokeError("Login completed but no token was found.", "auth");
    const updated = loadConfig();
    saveConfig({ ...updated, apiKey: token });
    this.apiKey = token;
    return token;
  }

  /** Synchronous check (env + config only, no login flow). */
  hasApiKey(): boolean {
    if (process.env.POKE_API_KEY) return true;
    return Boolean(loadConfig().apiKey);
  }

  /** POST the message; resolves with the delivery confirmation. */
  async sendMessage(text: string, opts: { timeoutMs?: number } = {}): Promise<SendMessageResult> {
    const apiKey = this.apiKey ?? (await this.resolveApiKey());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/inbound/api-message`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: text }),
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        throw new PokeError("sendMessage timed out.", "timeout");
      }
      throw new PokeError(
        `Network error sending message: ${e instanceof Error ? e.message : String(e)}`,
        "network",
      );
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 || res.status === 403) {
      throw new PokeError(
        `Poke authentication failed (${res.status}). Check your V2 API key — get one at https://poke.com/kitchen/api-keys, then run \`pokeclaw config set apiKey <key>\`.`,
        "auth",
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new PokeError(`Poke API error (${res.status}): ${body.slice(0, 200)}`, "server");
    }

    const data = (await res.json().catch(() => ({}))) as Partial<SendMessageResult>;
    return { success: data.success ?? true, message: data.message ?? "" };
  }
}
