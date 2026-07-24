import { loadConfig } from "../config.js";
import { BRAND } from "../version.js";
import { bold, dim, green, red, yellow } from "../tui/ansi.js";

interface StatsResponse {
  uptime: string;
  commandsToday: number;
  tunnelUrl: string | null;
  topCommands: { command: string; count: number }[];
  connection: { connectionEstablished: boolean };
}

/** `pokeclaw status` — query a running server's /stats endpoint. */
export async function runStatus(): Promise<void> {
  const config = loadConfig();
  const url = `http://127.0.0.1:${config.port}/stats`;
  process.stdout.write(`\n${BRAND} ${bold("PokeClaw status")}\n\n`);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const stats = (await res.json()) as StatsResponse;
    const conn = stats.connection.connectionEstablished
      ? green("● connected")
      : yellow("○ waiting");
    process.stdout.write(`  Server    ${green("● running")} on port ${config.port}\n`);
    process.stdout.write(`  Poke      ${conn}\n`);
    process.stdout.write(`  Uptime    ${stats.uptime}\n`);
    process.stdout.write(`  Tunnel    ${stats.tunnelUrl ?? dim("(none)")}\n`);
    process.stdout.write(`  Commands  ${stats.commandsToday} today\n`);
    if (stats.topCommands.length) {
      process.stdout.write(
        `  Top       ${stats.topCommands.map((t) => `${t.command}:${t.count}`).join("  ")}\n`,
      );
    }
  } catch {
    process.stdout.write(`  ${red("● not running")} (no response on port ${config.port})\n`);
    process.stdout.write(dim(`  Start it with: pokeclaw start\n`));
  }
  process.stdout.write("\n");
}
