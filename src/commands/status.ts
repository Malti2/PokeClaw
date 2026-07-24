import { existsSync, readFileSync } from "fs";
import { loadConfig, STATUS_FILE } from "../config";
import { BRAND } from "../version";
import { ServerClient } from "../client";
import { bold, dim, green, red, yellow } from "../tui/ansi";

function tunnelStatus(): string | null {
  if (!existsSync(STATUS_FILE)) return null;
  try {
    return readFileSync(STATUS_FILE, "utf-8").trim() || null;
  } catch {
    return null;
  }
}

/** `pokeclaw status` — query a running server's /stats endpoint. */
export async function runStatus(): Promise<void> {
  const config = loadConfig();
  const client = new ServerClient(config.port);
  process.stdout.write(`\n${BRAND} ${bold("PokeClaw status")}\n\n`);

  const stats = await client.stats();
  if (!stats) {
    process.stdout.write(`  ${red("● not running")} (no response on port ${config.port})\n`);
    process.stdout.write(dim(`  Start it with: pokeclaw start\n\n`));
    return;
  }

  const conn = stats.connection.connectionEstablished ? green("● connected") : yellow("○ waiting");
  process.stdout.write(`  Server    ${green("● running")} on port ${config.port}\n`);
  process.stdout.write(`  Poke      ${conn}\n`);
  process.stdout.write(`  Uptime    ${stats.uptime}\n`);
  process.stdout.write(`  Tunnel    ${tunnelStatus() ?? dim("(none)")}\n`);
  process.stdout.write(`  Commands  ${stats.commandsToday} today\n`);
  if (stats.topCommands.length) {
    process.stdout.write(
      `  Top       ${stats.topCommands.map((t) => `${t.command}:${t.count}`).join("  ")}\n`,
    );
  }
  process.stdout.write("\n");
}
