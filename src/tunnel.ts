import { spawn, execSync, type ChildProcess } from "child_process";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { CONFIG_DIR, STATUS_FILE, type PokeClawConfig } from "./config";

const TUNNEL_NAME = "pokeclaw";
const URL_RE = /https:\/\/[^\s"']+/i;

/** Whether the user is already logged in to Poke (`npx poke login --check`). */
export function pokeLoggedIn(): boolean {
  try {
    execSync("npx poke login --check", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Run the interactive `npx poke login` flow (inherits the terminal). */
export function pokeLogin(): void {
  try {
    execSync("npx poke login", { stdio: "inherit" });
  } catch {
    /* user can retry via `npx poke login` */
  }
}

function writeStatus(text: string): void {
  try {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(STATUS_FILE, text, "utf-8");
  } catch {
    /* status file is best-effort */
  }
}

/**
 * Start the Poke tunnel with `npx poke tunnel <local-url> --name pokeclaw`.
 * The public URL (when detected on stdout/stderr) is written to the shared
 * status file so the dashboard and `pokeclaw status` can display it.
 */
export function startTunnel(
  config: PokeClawConfig,
  onLine?: (line: string) => void,
): ChildProcess {
  const localUrl = `http://localhost:${config.port}`;
  writeStatus("PokeClaw Tunnel: connecting…");

  const child = spawn("npx", ["poke", "tunnel", localUrl, "--name", TUNNEL_NAME], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const scan = (buf: Buffer): void => {
    const text = buf.toString();
    for (const raw of text.split("\n")) {
      const line = raw.trimEnd();
      if (!line) continue;
      if (onLine) onLine(line);
      const match = line.match(URL_RE);
      if (match) writeStatus(`PokeClaw Tunnel: Connected — ${match[0]}`);
    }
  };
  child.stdout?.on("data", scan);
  child.stderr?.on("data", scan);
  child.on("exit", (code) => {
    writeStatus(`PokeClaw Tunnel: stopped (code ${code ?? "?"})`);
  });

  return child;
}
