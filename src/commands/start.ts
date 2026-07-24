import type { ChildProcess } from "child_process";
import { loadConfig } from "../config.js";
import { setActiveConfig } from "../runtime.js";
import { logger } from "../logger.js";
import { BRAND, VERSION } from "../version.js";
import { startServer } from "../server.js";
import { startTunnel } from "../tunnel.js";
import { Dashboard } from "../tui/dashboard.js";
import { green, red } from "../tui/ansi.js";

export interface StartFlags {
  headless?: boolean;
  noTunnel?: boolean;
}

/** `pokeclaw start` — boot the MCP server, optional tunnel, and TUI. */
export function runStart(flags: StartFlags = {}): void {
  const config = loadConfig();
  setActiveConfig(config);
  logger.setLevel(config.logLevel);

  const useTui = !flags.headless && Boolean(process.stdout.isTTY) && Boolean(process.stdin.isTTY);
  let tunnel: ChildProcess | null = null;
  let dashboard: Dashboard | null = null;

  const server = startServer(config, {
    onListening: () => {
      if (!useTui) printBanner(config.port, Boolean(config.token), config.policy);
    },
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      process.stderr.write(
        red(
          `\n✖ Port ${config.port} is already in use. Set POKECLAW_PORT or run 'pokeclaw onboard'.\n`,
        ),
      );
    } else {
      process.stderr.write(red(`\n✖ Server error: ${err.message}\n`));
    }
    process.exit(1);
  });

  if (config.tunnel.enabled && !flags.noTunnel) {
    tunnel = startTunnel(config);
  }

  if (useTui) {
    dashboard = new Dashboard();
    dashboard.start();
  }

  const shutdown = (): void => {
    dashboard?.stop();
    tunnel?.kill();
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function printBanner(port: number, auth: boolean, policy: string): void {
  logger.plain(`${BRAND} PokeClaw ${VERSION} is running`);
  logger.plain(`Local  : http://127.0.0.1:${port}/mcp`);
  logger.plain(`Health : http://127.0.0.1:${port}/health`);
  logger.plain(
    auth
      ? "Auth   : token required (?token=... or Authorization: Bearer ...)"
      : green("Auth   : NONE — set a token via 'pokeclaw onboard'"),
  );
  logger.plain(`Policy : ${policy}`);
  logger.plain("Waiting for Poke…");
}
