import { existsSync, mkdirSync, writeFileSync } from "fs";
import { homedir, platform } from "os";
import { join } from "path";
import { BRAND } from "../version";
import { bold, cyan, dim, green, yellow } from "../tui/ansi";

function cliEntry(): { exec: string; args: string[] } {
  // Path to this CLI's compiled entrypoint (dist/cli.js).
  const self = join(__dirname, "..", "cli.js");
  return { exec: process.execPath, args: [self, "start", "--headless"] };
}

/** `pokeclaw install-service` — write a launchd/systemd user service. */
export function runInstallService(): void {
  const home = homedir();
  const { exec, args } = cliEntry();
  const fullCmd = [exec, ...args].join(" ");
  process.stdout.write(`\n${BRAND} ${bold("Install autostart service")}\n\n`);

  if (platform() === "darwin") {
    const plistDir = join(home, "Library", "LaunchAgents");
    const plistPath = join(plistDir, "com.pokeclaw.plist");
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.pokeclaw</string>
  <key>ProgramArguments</key>
  <array>
${[exec, ...args].map((a) => `    <string>${a}</string>`).join("\n")}
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/pokeclaw.log</string>
  <key>StandardErrorPath</key><string>/tmp/pokeclaw-error.log</string>
</dict>
</plist>
`;
    mkdirSync(plistDir, { recursive: true });
    writeFileSync(plistPath, plist, "utf-8");
    process.stdout.write(`${green("✓")} Wrote ${cyan(plistPath)}\n`);
    process.stdout.write(`\nEnable it:\n  ${bold(`launchctl load ${plistPath}`)}\n\n`);
    return;
  }

  if (platform() === "linux") {
    const dir = join(home, ".config", "systemd", "user");
    const unitPath = join(dir, "pokeclaw.service");
    const unit = `[Unit]
Description=PokeClaw MCP Server
After=network.target

[Service]
Type=simple
ExecStart=${fullCmd}
Restart=on-failure
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
`;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(unitPath, unit, "utf-8");
    process.stdout.write(`${green("✓")} Wrote ${cyan(unitPath)}\n`);
    process.stdout.write(
      `\nEnable it:\n  ${bold("systemctl --user daemon-reload")}\n  ${bold("systemctl --user enable --now pokeclaw")}\n\n`,
    );
    return;
  }

  process.stdout.write(
    yellow(`Autostart is not automated on ${platform()}.\n`) +
      dim(`Run this command at login:\n  ${fullCmd}\n\n`),
  );
}
