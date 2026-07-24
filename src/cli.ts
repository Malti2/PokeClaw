#!/usr/bin/env node
import { APP_NAME, BRAND, VERSION } from "./version";
import { bold, cyan, dim } from "./tui/ansi";
import { runStart } from "./commands/start";
import { runOnboard } from "./tui/onboard";
import { runStatus } from "./commands/status";
import { runLogs } from "./commands/logs";
import { runDoctor } from "./commands/doctor";
import { runInstallService } from "./commands/installService";

function printHelp(): void {
  process.stdout.write(`
${BRAND} ${bold(`${APP_NAME} v${VERSION}`)} — local MCP server for Poke

${bold("Usage")}
  pokeclaw <command> [options]

${bold("Commands")}
  ${cyan("start")}            Start the server + Poke tunnel + TUI dashboard (default)
  ${cyan("onboard")}          Interactive setup wizard (writes ~/.pokeclaw/launch.env)
  ${cyan("status")}           Show status of a running server
  ${cyan("logs")}             Print recent logs from a running server
  ${cyan("doctor")}           Diagnose environment and configuration
  ${cyan("install-service")}  Install a launchd/systemd autostart service
  ${cyan("version")}          Print the version
  ${cyan("help")}             Show this help

${bold("Options for 'start'")}
  --headless       Run without the TUI (for services/daemons)
  --no-tunnel      Do not start the Poke tunnel (npx poke tunnel)

${dim("The tunnel uses Poke's own CLI: npx poke tunnel http://localhost:<port> --name pokeclaw")}
${dim("Docs: https://github.com/Malti2/PokeClaw")}
`);
}

async function main(): Promise<void> {
  const [, , rawCommand, ...rest] = process.argv;
  const command = rawCommand ?? "start";
  const flags = new Set(rest);

  switch (command) {
    case "start":
      runStart({ headless: flags.has("--headless"), noTunnel: flags.has("--no-tunnel") });
      break;
    case "onboard":
    case "setup":
      await runOnboard();
      break;
    case "status":
      await runStatus();
      break;
    case "logs":
      await runLogs();
      break;
    case "doctor":
      await runDoctor();
      break;
    case "install-service":
      runInstallService();
      break;
    case "version":
    case "--version":
    case "-v":
      process.stdout.write(`${VERSION}\n`);
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      process.stderr.write(`Unknown command: ${command}\n`);
      printHelp();
      process.exitCode = 1;
  }
}

void main();
