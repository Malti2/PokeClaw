#!/usr/bin/env node
import { APP_NAME, BRAND, VERSION } from "./version.js";
import { bold, cyan, dim } from "./tui/ansi.js";
import { runStart } from "./commands/start.js";
import { runOnboard } from "./tui/onboard.js";
import { runDoctor } from "./commands/doctor.js";
import { runStatus } from "./commands/status.js";
import { runLogs } from "./commands/logs.js";
import { runInstallService } from "./commands/installService.js";

function printHelp(): void {
  process.stdout.write(`
${BRAND} ${bold(`${APP_NAME} v${VERSION}`)} — local MCP server for Poke

${bold("Usage")}
  pokeclaw <command> [options]

${bold("Commands")}
  ${cyan("start")}            Start the server + TUI dashboard (default)
  ${cyan("onboard")}          Interactive setup wizard (writes ~/.pokeclaw/config.json)
  ${cyan("status")}           Show status of a running server
  ${cyan("logs")}             Print recent logs from a running server
  ${cyan("doctor")}           Diagnose environment and configuration
  ${cyan("install-service")}  Install a launchd/systemd autostart service
  ${cyan("version")}          Print the version
  ${cyan("help")}             Show this help

${bold("Options for 'start'")}
  --headless       Run without the TUI (for services/daemons)
  --no-tunnel      Do not start the Cloudflare tunnel

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
