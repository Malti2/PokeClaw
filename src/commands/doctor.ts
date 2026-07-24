import { execSync } from "child_process";
import { existsSync } from "fs";
import { createServer } from "net";
import { platform } from "os";
import { configExists, loadConfig } from "../config.js";
import { cloudflaredAvailable } from "../tunnel.js";
import { BRAND } from "../version.js";
import { bold, green, red, yellow } from "../tui/ansi.js";

type Status = "ok" | "warn" | "fail";

function line(status: Status, label: string, detail: string): void {
  const icon = status === "ok" ? green("✓") : status === "warn" ? yellow("!") : red("✖");
  process.stdout.write(`  ${icon} ${bold(label)}  ${detail}\n`);
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

  let hasBun = false;
  try {
    execSync("command -v bun", { stdio: "ignore" });
    hasBun = true;
  } catch {
    /* bun optional */
  }
  line(hasBun ? "ok" : "warn", "Bun", hasBun ? "installed" : "not found (optional, Node is used)");

  line(
    cloudflaredAvailable() ? "ok" : "warn",
    "cloudflared",
    cloudflaredAvailable() ? "installed" : "not found — tunnel will be disabled",
  );

  line(
    configExists() ? "ok" : "warn",
    "Config",
    configExists() ? "~/.pokeclaw/config.json" : "missing — run 'pokeclaw onboard'",
  );

  line(
    config.token ? "ok" : "warn",
    "Auth token",
    config.token ? "set" : "NOT SET — anyone with the URL can access your machine",
  );

  line(
    config.policy === "full" ? "warn" : "ok",
    "Security policy",
    config.policy === "full" ? "full (consider 'approval' for remote use)" : config.policy,
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
