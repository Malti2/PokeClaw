import { loadConfig } from "../config";
import { ServerClient } from "../client";
import { dim, red } from "../tui/ansi";

/** `pokeclaw logs` — print recent console output from a running server. */
export async function runLogs(): Promise<void> {
  const config = loadConfig();
  const client = new ServerClient(config.port);

  const health = await client.health();
  if (!health) {
    process.stderr.write(
      red(`Could not reach PokeClaw on port ${config.port}. Is it running?\n`),
    );
    process.exitCode = 1;
    return;
  }

  const lines = await client.consoleLines();
  if (!lines.length) {
    process.stdout.write(dim("(no logs yet)\n"));
    return;
  }
  process.stdout.write(lines.join("\n") + "\n");
}
