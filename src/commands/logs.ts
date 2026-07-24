import { loadConfig } from "../config.js";
import { dim, red } from "../tui/ansi.js";

/** `pokeclaw logs` — print recent logs from a running server. */
export async function runLogs(): Promise<void> {
  const config = loadConfig();
  const url = `http://127.0.0.1:${config.port}/logs`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { lines: string[] };
    if (!data.lines.length) {
      process.stdout.write(dim("(no logs yet)\n"));
      return;
    }
    process.stdout.write(data.lines.join("\n") + "\n");
  } catch {
    process.stderr.write(red(`Could not reach PokeClaw on port ${config.port}. Is it running?\n`));
    process.exitCode = 1;
  }
}
