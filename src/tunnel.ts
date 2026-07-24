import { spawn, type ChildProcess, execSync } from "child_process";
import type { PokeClawConfig } from "./config.js";
import { logger } from "./logger.js";
import { state } from "./state.js";

export function cloudflaredAvailable(): boolean {
  try {
    execSync("command -v cloudflared", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

/**
 * Spawn a cloudflared quick tunnel and capture its public URL into runtime
 * state so the dashboard can display it. Returns the child process.
 */
export function startTunnel(config: PokeClawConfig): ChildProcess | null {
  if (!cloudflaredAvailable()) {
    logger.log("warn", "cloudflared not found — tunnel disabled. Install it to expose PokeClaw.");
    return null;
  }

  const args =
    config.tunnel.mode === "named"
      ? ["tunnel", "run", config.tunnel.name]
      : ["tunnel", "--url", `http://127.0.0.1:${config.port}`];

  const child = spawn("cloudflared", args, { stdio: ["ignore", "pipe", "pipe"] });

  const scan = (buf: Buffer): void => {
    const text = buf.toString();
    const match = text.match(URL_RE);
    if (match && state.tunnelUrl !== match[0]) {
      state.setTunnelUrl(match[0]);
      logger.log("info", `Tunnel ready: ${match[0]}`);
    }
  };
  child.stdout?.on("data", scan);
  child.stderr?.on("data", scan);
  child.on("exit", (code) => {
    state.setTunnelUrl(null);
    logger.log("warn", `cloudflared exited (code ${code ?? "?"})`);
  });

  if (config.tunnel.mode === "named" && config.tunnel.hostname) {
    state.setTunnelUrl(`https://${config.tunnel.hostname}`);
  }
  return child;
}
