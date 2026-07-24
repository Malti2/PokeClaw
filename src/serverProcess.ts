import { spawn, execSync, type ChildProcess } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import type { PokeClawConfig } from "./config";

/** Locate the monolithic server.ts shipped alongside the CLI. */
export function resolveServerEntry(): string {
  const candidates = [
    join(__dirname, "..", "server.ts"),
    join(__dirname, "..", "..", "server.ts"),
    join(process.cwd(), "server.ts"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

function hasBinary(binary: string): boolean {
  try {
    execSync(`command -v ${binary}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Spawn the local MCP server (server.ts) as a child process, using Bun when
 * available and falling back to Node via ts-node. stdin is disabled so the
 * TUI owns the terminal; status is exposed over the server's HTTP endpoints.
 *
 * When the TUI is active, `inheritStdio` must be false so the server does not
 * write to the terminal the dashboard owns (the TUI reads logs over HTTP).
 */
export function startServer(
  config: PokeClawConfig,
  options: { inheritStdio?: boolean } = {},
): ChildProcess {
  const entry = resolveServerEntry();
  const env = {
    ...process.env,
    POKECLAW_DISABLE_STDIN: "1",
    POKECLAW_PORT: String(config.port),
    POKECLAW_ROOTS: config.roots.join(","),
    POKECLAW_TOKEN: config.token,
  };

  let command: string;
  let args: string[];
  if (hasBinary("bun")) {
    command = "bun";
    args = ["run", entry];
  } else {
    command = "npx";
    args = ["ts-node", "--transpile-only", entry];
  }

  const io: "inherit" | "ignore" = options.inheritStdio ? "inherit" : "ignore";
  return spawn(command, args, { stdio: ["ignore", io, io], env });
}
