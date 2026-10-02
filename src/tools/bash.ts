import { err, needString, ok, optString, schemaFor, type ToolDefinition } from "./types";

const MAX_OUTPUT = 30_000;

/**
 * Shell invocation for the current platform.
 * Exported for tests: pass a platform override to check other OSes.
 */
export function shellForPlatform(
  platform: NodeJS.Platform = process.platform,
): string[] {
  // Windows has no bash by default; cmd.exe is always present.
  if (platform === "win32") return ["cmd.exe", "/d", "/s", "/c"];
  return ["bash", "-c"];
}

async function readStream(stream: ReadableStream<Uint8Array> | number | null | undefined): Promise<string> {
  if (!stream || typeof stream === "number") return "";
  return new Response(stream).text();
}

/** Execute a shell command with timeout; output is truncated. */
export const bashTool: ToolDefinition = {
  name: "bash",
  description:
    "Execute a shell command (bash on macOS/Linux, cmd.exe on Windows). " +
    "Always quote paths. Prefer dedicated tools (read/edit/grep) for file work. " +
    "Long-running commands should be backgrounded by the command itself. " +
    "On Windows there are no Unix utilities: use dir/type instead of ls/cat.",
  inputSchema: schemaFor(
    {
      command: { type: "string", description: "The shell command to run." },
      cwd: { type: "string", description: "Working directory (default: session cwd)." },
      timeout: { type: "number", description: "Timeout in seconds (default 60, max 600)." },
    },
    ["command"],
  ),
  permission: "bash",
  handler: async (args, ctx) => {
    const command = needString(args, "command");
    const cwd = optString(args, "cwd") ?? ctx.cwd;
    const timeoutSec = Math.min(
      Math.max(typeof args.timeout === "number" ? args.timeout : 60, 1),
      600,
    );

    let proc: ReturnType<typeof Bun.spawn>;
    try {
      proc = Bun.spawn([...shellForPlatform(), command], {
        stdout: "pipe",
        stderr: "pipe",
        cwd,
      });
    } catch (e) {
      return err(`Failed to start command: ${e instanceof Error ? e.message : String(e)}`);
    }

    let timedOut = false;
    const killer = setTimeout(() => {
      // proc.exitCode is null while the process is still running.
      if (proc.exitCode === null) {
        timedOut = true;
        try {
          proc.kill();
        } catch {
          // Already exited.
        }
      }
    }, timeoutSec * 1000);

    try {
      const [stdout, stderr] = await Promise.all([
        readStream(proc.stdout),
        readStream(proc.stderr),
      ]);
      const exitCode = await proc.exited;
      const combined = [
        stdout.trim() && `stdout:\n${stdout.trim()}`,
        stderr.trim() && `stderr:\n${stderr.trim()}`,
      ]
        .filter(Boolean)
        .join("\n");
      let output = combined || "(no output)";
      if (output.length > MAX_OUTPUT) {
        output = output.slice(0, MAX_OUTPUT) + `\n… (output truncated at ${MAX_OUTPUT} chars)`;
      }
      const header = `exit code: ${exitCode}${timedOut ? " (timed out, killed)" : ""}`;
      return ok(`${header}\n${output}`);
    } finally {
      clearTimeout(killer);
    }
  },
};
