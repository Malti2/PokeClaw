import { execSync } from "child_process";
import { existsSync } from "fs";
import { createServer } from "net";
import { platform } from "os";
import { configExists, loadConfig } from "../config";
import { pokeLoggedIn } from "../tunnel";
import { BRAND } from "../version";
import { bold, green, red, yellow } from "../tui/ansi";

type Status = "ok" | "warn" | "fail";

function line(status: Status, label: string, detail: string): void {
  const icon = status === "ok" ? green("✓") : status === "warn" ? yellow("!") : red("✖");
  process.stdout.write(`  ${icon} ${bold(label)}  ${detail}\n`);
}

function hasBinary(binary: string): boolean {
  try {
    execSync(`command -v ${binary}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}

/** `pokeclaw doctor` — diagnose the local environment and configuration. */
export async function runDoctor(): Promise<void> {
  process.stdout.write(`\n${BRAND} ${bold("PokeClaw doctor")}\n\n`);
  const config = loadConfig();

  const major = Number(process.versions.node.split(".")[0]);
  line(major >= 18 ? "ok" : "fail", "Node.js", `${process.version} (need >= 18)`);

  const hasBun = hasBinary("bun");
  line(hasBun ? "ok" : "warn", "Bun", hasBun ? "installed" : "not found (optional, Node is used)");

  const hasNpx = hasBinary("npx");
  line(hasNpx ? "ok" : "fail", "npx", hasNpx ? "installed" : "not found — required for 'npx poke'");

  const hasRg = hasBinary("rg");
  line(hasRg ? "ok" : "warn", "ripgrep (rg)", hasRg ? "installed" : "not found — needed for search_text");

  const loggedIn = pokeLoggedIn();
  line(
    loggedIn ? "ok" : "warn",
    "Poke login",
    loggedIn ? "logged in" : "not logged in — run 'npx poke login'",
  );

  line(
    configExists() ? "ok" : "warn",
    "Config",
    configExists() ? "~/.pokeclaw/launch.env" : "missing — run 'pokeclaw onboard'",
  );

  line(
    config.token ? "ok" : "warn",
    "Auth token",
    config.token ? "set" : "NOT SET — anyone with the URL can access your machine",
  );

  const missingRoots = config.roots.filter((r) => !existsSync(r));
  line(
    missingRoots.length ? "warn" : "ok",
    "Roots",
    missingRoots.length ? `missing: ${missingRoots.join(", ")}` : config.roots.join(", "),
  );

  const free = await portFree(config.port);
  line(
    free ? "ok" : "warn",
    "Port",
    free ? `${config.port} available` : `${config.port} in use (server may already be running)`,
  );

  line("ok", "Platform", `${platform()} ${process.arch}`);
  process.stdout.write("\n");
}
