import type { ChildProcess } from "child_process";
import { loadConfig } from "../config";
import { BRAND, VERSION } from "../version";
import { startServer } from "../serverProcess";
import { pokeLoggedIn, pokeLogin, startTunnel } from "../tunnel";
import { Dashboard } from "../tui/dashboard";
import { bold, cyan, dim, green, red, yellow } from "../tui/ansi";

export interface StartFlags {
  headless?: boolean;
  noTunnel?: boolean;
}

/** `pokeclaw start` — boot the MCP server, the Poke tunnel, and the TUI. */
export function runStart(flags: StartFlags = {}): void {
  const config = loadConfig();
  const useTui =
    !flags.headless && Boolean(process.stdout.isTTY) && Boolean(process.stdin.isTTY);
  const wantTunnel = config.tunnelEnabled && !flags.noTunnel;

  if (wantTunnel && !pokeLoggedIn()) {
    if (useTui) {
      // Log in before taking over the screen with the dashboard.
      process.stdout.write(yellow("You are not logged in to Poke — running 'npx poke login'…\n"));
      pokeLogin();
    } else {
      process.stdout.write(
        yellow("Not logged in to Poke. Run 'npx poke login', then start again.\n"),
      );
    }
  }

  const server: ChildProcess = startServer(config, { inheritStdio: !useTui });
  server.on("error", (err) => {
    process.stderr.write(red(`\n✖ Failed to start server: ${err.message}\n`));
    process.exit(1);
  });

  let tunnel: ChildProcess | null = null;
  if (wantTunnel) {
    tunnel = startTunnel(config, useTui ? undefined : (line) => process.stdout.write(line + "\n"));
  }

  let dashboard: Dashboard | null = null;
  let shuttingDown = false;
  const shutdown = (code = 0): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    dashboard?.stop();
    if (tunnel && !tunnel.killed) tunnel.kill();
    if (!server.killed) server.kill();
    process.exit(code);
  };

  server.on("exit", (code) => {
    if (!shuttingDown) {
      dashboard?.stop();
      process.stderr.write(red(`\nServer exited (code ${code ?? "?"}).\n`));
      shutdown(code ?? 0);
    }
  });

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  if (useTui) {
    dashboard = new Dashboard(config, { onQuit: () => shutdown(0), tunnelActive: wantTunnel });
    dashboard.start();
  } else {
    printBanner(config.port, Boolean(config.token), wantTunnel);
  }
}

function printBanner(port: number, auth: boolean, tunnel: boolean): void {
  process.stdout.write(`${BRAND} ${bold(`PokeClaw ${VERSION}`)} is running\n`);
  process.stdout.write(`Local  : http://127.0.0.1:${port}/mcp\n`);
  process.stdout.write(`Health : http://127.0.0.1:${port}/health\n`);
  process.stdout.write(
    auth
      ? "Auth   : token required (?token=... or Authorization: Bearer ...)\n"
      : green("Auth   : NONE — set a token via 'pokeclaw onboard'\n"),
  );
  process.stdout.write(
    tunnel
      ? `Tunnel : npx poke tunnel (name: pokeclaw)\n`
      : dim("Tunnel : disabled (--no-tunnel)\n"),
  );
  process.stdout.write(dim(`Tip    : run '${cyan("pokeclaw status")}' or '${cyan("pokeclaw logs")}' from another shell\n`));
  process.stdout.write("Waiting for Poke…\n");
}
