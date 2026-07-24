import { randomBytes } from "crypto";
import { DEFAULT_CONFIG, loadConfig, saveConfig, type PokeClawConfig } from "../config";
import { BRAND } from "../version";
import { bold, cyan, dim, green } from "./ansi";
import { Prompter } from "./prompt";

/** Interactive setup wizard — writes ~/.pokeclaw/launch.env. */
export async function runOnboard(): Promise<PokeClawConfig> {
  const current = loadConfig();
  const p = new Prompter();
  process.stdout.write(`\n${BRAND} ${bold("PokeClaw — Onboarding")}\n`);
  process.stdout.write(dim("Set up the local MCP server. Press Enter to accept defaults.\n\n"));

  try {
    const port = Number(await p.ask("Port", String(current.port))) || DEFAULT_CONFIG.port;
    const rootsRaw = await p.ask("Allowed folders (comma-separated)", current.roots.join(","));
    const roots = rootsRaw
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);

    let token = current.token;
    const wantToken = await p.confirm("Require an auth token (recommended)", true);
    if (wantToken) {
      const generate = !token && (await p.confirm("Generate a random token", true));
      token = generate
        ? randomBytes(24).toString("hex")
        : await p.ask("Token", token || randomBytes(24).toString("hex"));
    } else {
      token = "";
    }

    const tunnelEnabled = await p.confirm(
      "Enable the Poke tunnel (npx poke tunnel)",
      current.tunnelEnabled,
    );

    const config: PokeClawConfig = {
      port,
      roots: roots.length ? roots : DEFAULT_CONFIG.roots,
      token,
      tunnelEnabled,
    };

    saveConfig(config);
    process.stdout.write(`\n${green("✓")} Saved config to ${cyan("~/.pokeclaw/launch.env")}\n`);
    if (token) {
      process.stdout.write(dim(`  MCP URL: <tunnel-url>/mcp?token=${token}\n`));
    }
    process.stdout.write(dim(`  Start with: ${cyan("pokeclaw start")}\n\n`));
    return config;
  } finally {
    p.close();
  }
}
