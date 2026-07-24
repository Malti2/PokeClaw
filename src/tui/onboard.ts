import { randomBytes } from "crypto";
import {
  DEFAULT_CONFIG,
  loadConfig,
  saveConfig,
  type Policy,
  type PokeClawConfig,
} from "../config.js";
import { BRAND } from "../version.js";
import { bold, cyan, dim, green } from "./ansi.js";
import { Prompter } from "./prompt.js";

const POLICIES: Policy[] = ["full", "approval", "readonly"];

/** Interactive setup wizard — writes ~/.pokeclaw/config.json. */
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
    const wantToken = await p.confirm(
      "Require an auth token (recommended)",
      Boolean(token) || true,
    );
    if (wantToken) {
      const generate = !token && (await p.confirm("Generate a random token", true));
      token = generate
        ? randomBytes(24).toString("hex")
        : await p.ask("Token", token || randomBytes(24).toString("hex"));
    } else {
      token = "";
    }

    const policy = (
      await p.select(
        "Security policy",
        [
          "full     — read, write and run commands",
          "approval — mutating/command calls need your OK in the dashboard",
          "readonly — no writes, deletes or commands",
        ],
        POLICIES.indexOf(current.policy),
      )
    ).split(/\s/)[0] as Policy;

    const tunnelEnabled = await p.confirm("Enable the Cloudflare tunnel", current.tunnel.enabled);
    let mode = current.tunnel.mode;
    let name = current.tunnel.name;
    let hostname = current.tunnel.hostname;
    if (tunnelEnabled) {
      const named = await p.confirm("Use a named (stable) tunnel", mode === "named");
      mode = named ? "named" : "quick";
      if (named) {
        name = await p.ask("Tunnel name", name);
        hostname = await p.ask("Hostname (optional)", hostname);
      }
    }

    const config: PokeClawConfig = {
      port,
      roots: roots.length ? roots : DEFAULT_CONFIG.roots,
      token,
      logLevel: current.logLevel,
      policy: POLICIES.includes(policy) ? policy : current.policy,
      commandAllowlist: current.commandAllowlist,
      tunnel: { enabled: tunnelEnabled, mode, name, hostname },
    };

    saveConfig(config);
    process.stdout.write(`\n${green("✓")} Saved config to ${cyan("~/.pokeclaw/config.json")}\n`);
    if (token) {
      process.stdout.write(dim(`  MCP URL: <tunnel-url>/mcp?token=${token}\n`));
    }
    process.stdout.write(dim(`  Start with: ${cyan("pokeclaw start")}\n\n`));
    return config;
  } finally {
    p.close();
  }
}
