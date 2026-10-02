import { buildTerminalMessage, PokeError, type MessageSender } from "../poke/client";
import { TunnelService } from "../services/tunnel";

export interface AskOptions {
  signal?: AbortSignal;
  /** Max time to wait for Poke's reply. Defaults to 10 minutes. */
  timeoutMs?: number;
}

export const DEFAULT_REPLY_TIMEOUT_MS = 10 * 60 * 1000;

export interface AgentSessionOptions {
  /** Build the outbound message (note + prompt). Defaults to buildTerminalMessage. */
  noteBuilder?: (prompt: string) => string;
}

/**
 * One conversational turn against Poke.
 *
 * `ask(prompt)` ensures the tunnel is up (started once, then reused),
 * sends the message, and waits until Poke calls `reply_to_terminal`.
 * Only one active query at a time; aborting the wait is best-effort —
 * the message already sent to Poke cannot be recalled.
 */
export class AgentSession {
  private busy = false;
  private resolveReply: ((answer: string) => void) | null = null;
  private rejectReply: ((err: Error) => void) | null = null;

  constructor(
    private readonly tunnel: TunnelService,
    private readonly client: MessageSender,
    opts: AgentSessionOptions = {},
  ) {
    this.noteBuilder = opts.noteBuilder ?? buildTerminalMessage;
    this.tunnel.setReplyHandler((answer) => this.deliverReply(answer));
  }

  private readonly noteBuilder: (prompt: string) => string;

  get isBusy(): boolean {
    return this.busy;
  }

  private deliverReply(answer: string): void {
    if (this.resolveReply) {
      const resolve = this.resolveReply;
      this.resolveReply = null;
      this.rejectReply = null;
      resolve(answer);
    }
  }

  async ask(prompt: string, opts: AskOptions = {}): Promise<string> {
    if (this.busy) {
      throw new PokeError(
        "A query is already in flight. Wait for it or abort it first.",
        "unknown",
      );
    }
    const trimmed = prompt.trim();
    if (!trimmed) throw new PokeError("Cannot send an empty prompt.", "unknown");

    this.busy = true;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_REPLY_TIMEOUT_MS;

    const replyPromise = new Promise<string>((resolve, reject) => {
      this.resolveReply = resolve;
      this.rejectReply = reject;
    });

    const timer = setTimeout(() => {
      this.failReply(
        new PokeError(
          `Timed out waiting for Poke's reply after ${Math.round(timeoutMs / 60000)} min. The request may still be processing on Poke's side.`,
          "timeout",
        ),
      );
    }, timeoutMs);

    const onAbort = () => {
      this.failReply(
        new PokeError(
          "Aborted by user. (The message was already sent to Poke and cannot be recalled.)",
          "aborted",
        ),
      );
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      await this.tunnel.ensureConnected();
      await this.client.sendMessage(this.noteBuilder(trimmed));
      return await replyPromise;
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      this.resolveReply = null;
      this.rejectReply = null;
      this.busy = false;
    }
  }

  private failReply(err: Error): void {
    if (this.rejectReply) {
      const reject = this.rejectReply;
      this.resolveReply = null;
      this.rejectReply = null;
      reject(err);
    }
  }
}
