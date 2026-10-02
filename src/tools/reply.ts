import { needString, ok, schemaFor, type ToolDefinition } from "./types";

/**
 * Special tool Poke's assistant calls to deliver its answer to the terminal.
 * The handler forwards the answer to the tunnel, which resolves the pending
 * `ask()` promise. It carries no side effects, so it never needs permission.
 */
export function createReplyTool(onReply: (answer: string) => void): ToolDefinition {
  return {
    name: "reply_to_terminal",
    description:
      "Deliver your full answer to the user's terminal. Call this exactly once per request with the complete response text.",
    inputSchema: schemaFor(
      {
        answer: { type: "string", description: "The full answer text for the terminal." },
      },
      ["answer"],
    ),
    permission: "read",
    handler: async (args) => {
      const answer = needString(args, "answer");
      onReply(answer);
      return ok("Answer delivered to terminal.");
    },
  };
}
