import { spawn } from "child_process";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { CONFIG_DIR } from "../config.js";

const APPS_DIR = join(CONFIG_DIR, "apps");
const RUNNER = join(CONFIG_DIR, "webview-runner");

function launchRunner(htmlPath: string, name: string, args: Record<string, unknown>): void {
  if (!existsSync(RUNNER)) return;
  const w = String(Number(args.width) || 800);
  const h = String(Number(args.height) || 600);
  const child = spawn(RUNNER, [htmlPath, w, h, name], { detached: true, stdio: "ignore" });
  child.unref();
}

export function toolCreateApp(args: Record<string, unknown>): string {
  const name = String(args.name ?? "").trim();
  const html = String(args.html ?? "");
  if (!name) throw new Error("name is required");
  if (!html) throw new Error("html content is required");
  const appDir = join(APPS_DIR, name);
  const htmlPath = join(appDir, "app.html");
  mkdirSync(appDir, { recursive: true });
  writeFileSync(htmlPath, html, "utf-8");
  launchRunner(htmlPath, name, args);
  return `🌴 Created ${name}\n  Path: ${htmlPath}`;
}

export function toolListApps(): string {
  if (!existsSync(APPS_DIR)) return "No apps created yet.";
  const entries = readdirSync(APPS_DIR).filter(
    (n) => statSync(join(APPS_DIR, n)).isDirectory() && existsSync(join(APPS_DIR, n, "app.html")),
  );
  return entries.length ? entries.join("\n") : "No apps created yet.";
}

export function toolEditApp(args: Record<string, unknown>): string {
  const name = String(args.name ?? "").trim();
  const html = String(args.html ?? "");
  if (!name) throw new Error("name is required");
  if (!html) throw new Error("html content is required");
  const htmlPath = join(APPS_DIR, name, "app.html");
  if (!existsSync(htmlPath)) throw new Error(`app "${name}" not found`);
  writeFileSync(htmlPath, html, "utf-8");
  launchRunner(htmlPath, name, args);
  return `🌴 Updated ${name}`;
}

export function toolOpenApp(args: Record<string, unknown>): string {
  const name = String(args.name ?? "").trim();
  if (!name) throw new Error("name is required");
  const htmlPath = join(APPS_DIR, name, "app.html");
  if (!existsSync(htmlPath)) throw new Error(`app "${name}" not found`);
  if (!existsSync(RUNNER)) throw new Error("webview runner not found");
  launchRunner(htmlPath, name, args);
  return `🌴 Opened ${name}`;
}
