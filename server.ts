import { createServer } from "http";
import type { IncomingMessage, ServerResponse } from "http";
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from "fs";
import { execSync, spawn } from "child_process";
import { resolve, join, dirname } from "path";
import { homedir, hostname, platform, release, arch } from "os";

const APP_NAME = "PokeClaw";
const VERSION = "1.1.0-beta";
let PORT = parseInt(process.env.POKECLAW_PORT ?? "3741", 10);
let TOKEN = process.env.POKECLAW_TOKEN ?? "";
const HOME = homedir();
let ROOTS: string[] = (process.env.POKECLAW_ROOTS ?? HOME)
  .split(",")
  .map((r) => r.trim().replace(/^~/, HOME))
  .filter(Boolean);
const LOG_LEVEL = (process.env.POKECLAW_LOG_LEVEL ?? "info").toLowerCase();
const NOTIFY_ENDPOINT = [
  process.env.POKECLAW_POKE_WEBHOOK_URL,
  process.env.POKECLAW_NOTIFY_URL,
  process.env.POKECLAW_MESSAGE_ENDPOINT,
  process.env.POKE_PLATFORM_ENDPOINT,
  process.env.POKE_WEBHOOK_URL,
  process.env.POKECLAW_POKE_ENDPOINT,
].map((value) => value?.trim()).find((value): value is string => Boolean(value));
const NOTIFY_TOKEN = (process.env.POKECLAW_POKE_WEBHOOK_TOKEN ?? process.env.POKE_NOTIFY_TOKEN ?? "").trim();
const RECENT_LOG_LIMIT = 250;
const recentLogs: string[] = [];
const recentConsole: { stream: "stdout" | "stderr"; line: string }[] = [];
const recentToolCalls: { timestamp: string; tool: string; preview: string }[] = [];
const startedAt = Date.now();
const toolCounts = new Map<string, number>();
let commandsToday = 0;
let activeDayKey = new Date().toISOString().slice(0, 10);
let serverListening = false;
let connectionEstablished = false;
let connectionEstablishedAt: number | null = null;
let startupNotificationSent = false;

// SSE State
let sseClient: ServerResponse | null = null;

function timestamp() {
  return new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function pushRecentLog(entry: string) {
  recentLogs.push(entry);
  if (recentLogs.length > RECENT_LOG_LIMIT) recentLogs.splice(0, recentLogs.length - RECENT_LOG_LIMIT);
}

function pushConsole(stream: "stdout" | "stderr", line: string) {
  recentConsole.push({ stream, line });
  if (recentConsole.length > RECENT_LOG_LIMIT) recentConsole.splice(0, recentConsole.length - RECENT_LOG_LIMIT);
}

function pushRecentToolCall(entry: { timestamp: string; tool: string; preview: string }) {
  recentToolCalls.push(entry);
  if (recentToolCalls.length > RECENT_LOG_LIMIT) recentToolCalls.splice(0, recentToolCalls.length - RECENT_LOG_LIMIT);
}

function emitConsole(stream: "stdout" | "stderr", message: string) {
  const line = `[${timestamp()}] ${message}`;
  pushConsole(stream, line);
  if (stream === "stderr") {
    console.error(message);
  } else {
    console.log(message);
  }
}

function log(level: "info" | "warn" | "error" | "debug", msg: string) {
  if (level === "debug" && LOG_LEVEL !== "debug") return;
  const prefix = level.toUpperCase();
  const entry = `[${timestamp()}] ${prefix} ${msg}`;
  pushRecentLog(entry);
  const stream = level === "error" ? "stderr" : "stdout";
  emitConsole(stream, `[${timestamp()}] ${prefix} ${msg}`);
}

function previewValue(v: unknown): string {
  if (typeof v === "string") return v.length > 80 ? `${v.slice(0, 80)}…` : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.length} items]`;
  if (v && typeof v === "object") return "[object]";
  return String(v ?? "");
}

function logToolUse(tool: string, args: Record<string, unknown>) {
  const preview = Object.entries(args)
    .map(([k, v]) => `${k}=${previewValue(v)}`)
    .join("  ");
  const entry = `TOOL ${tool}${preview ? ` :: ${preview}` : ""}`;
  const stamp = timestamp();
  const dayKey = new Date().toISOString().slice(0, 10);
  if (dayKey !== activeDayKey) {
    activeDayKey = dayKey;
    commandsToday = 0;
  }
  commandsToday += 1;
  toolCounts.set(tool, (toolCounts.get(tool) ?? 0) + 1);
  pushRecentLog(`[${stamp}] ${entry}`);
  pushRecentToolCall({ timestamp: stamp, tool, preview: preview || "(no args)" });
  emitConsole("stdout", `Poke is using tool: ${tool}`);
  if (preview) emitConsole("stdout", `   ${preview}`);
}

function isAuthorised(req: IncomingMessage, url: URL): boolean {
  if (!TOKEN) return true;
  if (url.searchParams.get("token") === TOKEN) return true;
  const header = req.headers["authorization"] ?? "";
  if (header.startsWith("Bearer ") && header.slice(7) === TOKEN) return true;
  return false;
}

function safePath(raw: string): string {
  const p = resolve(raw.replace(/^~/, HOME));
  const allowed = ROOTS.some((root) => p === resolve(root) || p.startsWith(resolve(root) + "/"));
  if (!allowed) throw new Error(`Access denied: '${p}' is outside allowed roots (${ROOTS.join(", ")})`);
  return p;
}

const BLOCK = [
  /\brm\s+-[a-z]*r[a-z]*f\s+\//,
  /\bsudo\s+rm\b/,
  /:\(\)\s*\{.*\}/,
  /\bmkfs\b/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  />\s*\/dev\/sd[a-z]/,
];
function blocked(cmd: string): boolean {
  return BLOCK.some((re) => re.test(cmd));
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'" + '"' + "'" + '"' + "'")}'`;
}

function execSearchCommand(command: string): string {
  return execSync(command, { encoding: "utf-8", timeout: 15_000, stdio: ["pipe", "pipe", "pipe"] }).trim();
}

function toolReadFile(args: Record<string, unknown>): string {
  if (!args.path) throw new Error("path is required");
  const p = safePath(String(args.path));
  return readFileSync(p, "utf-8");
}

function toolWriteFile(args: Record<string, unknown>): string {
  if (!args.path) throw new Error("path is required");
  if (args.content === undefined) throw new Error("content is required");
  const p = safePath(String(args.path));
  const content = String(args.content);
  const dir = dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(p, content, "utf-8");
  return `Written ${content.length} chars to ${p}`;
}

function toolListDirectory(args: Record<string, unknown>): string {
  const raw = args.path ? String(args.path) : HOME;
  const p = safePath(raw);
  const entries = readdirSync(p).map((name) => {
    try {
      const full = join(p, name);
      const st = statSync(full);
      const type = st.isDirectory() ? "dir " : "file";
      const size = st.isFile() ? ` (${st.size} B)` : "";
      return `${type}  ${name}${size}`;
    } catch {
      return `?     ${name}`;
    }
  });
  return entries.length ? entries.join("\n") : "(empty)";
}

async function toolSearchFiles(args: Record<string, unknown>): Promise<string> {
  if (!args.root) throw new Error("root is required");
  if (!args.pattern) throw new Error("pattern is required");
  const root = safePath(String(args.root));
  const pattern = String(args.pattern);
  const cmd = "find " + shellQuote(root) + " -name " + shellQuote(pattern) + " 2>/dev/null | head -200";
  const out = execSearchCommand(cmd);
  return out || "No files matched.";
}

async function toolSearchText(args: Record<string, unknown>): Promise<string> {
  if (!args.root) throw new Error("root is required");
  if (!args.query) throw new Error("query is required");
  const root = safePath(String(args.root));
  const query = String(args.query);
  const caseSensitive = args.case_sensitive === true;
  const maxResults = Number.isFinite(Number(args.max_results)) ? Math.max(1, Math.min(200, Number(args.max_results))) : 50;
  const flags = caseSensitive ? "" : "-i";
  const cmd = "rg --hidden --glob '!**/.git/**' --glob '!**/node_modules/**' --line-number --color never " + flags + " " + shellQuote(query) + " " + shellQuote(root) + " 2>/dev/null | head -" + maxResults;
  const out = execSearchCommand(cmd);
  return out || "No matches found.";
}

function parseTopMemoryBytes(value: string, unit: string): number {
  const amount = Number(value);
  switch (unit.toUpperCase()) {
    case "K": return amount * 1024;
    case "M": return amount * 1024 * 1024;
    case "G": return amount * 1024 * 1024 * 1024;
    default: return amount;
  }
}

function readSystemUsage(): { cpuPercent: string; memoryPercent: string } {
  let cpuPercent = "unknown";
  let memoryPercent = "unknown";

  try {
    const topOutput = execSync("top -l 1 -s 0", { encoding: "utf-8", timeout: 10_000, stdio: ["pipe", "pipe", "pipe"] });
    const cpuMatch = topOutput.match(/CPU usage:\s+.*?([0-9.]+)% idle/i);
    if (cpuMatch) cpuPercent = (100 - Number(cpuMatch[1])).toFixed(1);

    const memoryMatch = topOutput.match(/PhysMem:\s+([0-9.]+)([KMG]) used/i);
    const totalBytesText = execSync("sysctl -n hw.memsize", { encoding: "utf-8", timeout: 5_000, stdio: ["pipe", "pipe", "pipe"] }).trim();
    const totalBytes = Number(totalBytesText);
    if (memoryMatch && Number.isFinite(totalBytes) && totalBytes > 0) {
      const usedBytes = parseTopMemoryBytes(memoryMatch[1], memoryMatch[2]);
      memoryPercent = ((usedBytes / totalBytes) * 100).toFixed(1);
    }
  } catch {
    // Keep fallback values when system commands are unavailable.
  }

  return { cpuPercent, memoryPercent };
}

function toolSystemInfo(): string {
  const systemUsage = readSystemUsage();
  return [
    "app=" + APP_NAME,
    "version=" + VERSION,
    "platform=" + platform(),
    "release=" + release(),
    "arch=" + arch(),
    "host=" + hostname(),
    "home=" + HOME,
    "roots=" + ROOTS.join(", "),
    "auth=" + (TOKEN ? "enabled" : "disabled"),
    "log_level=" + LOG_LEVEL,
    "cpu_percent=" + systemUsage.cpuPercent,
    "memory_percent=" + systemUsage.memoryPercent,
    "bun=" + (process.versions.bun ?? "(unknown)"),
    "node=" + process.version,
    "cwd=" + process.cwd(),
  ].join("\n");
}

function toolSystemStat(): string {
  let cpuTemp = "unknown";
  let diskUsage = "unknown";
  try {
    if (platform() === "darwin") {
      cpuTemp = execSync("sysctl -n machdep.cpu.temperature", { encoding: "utf-8" }).trim() + "°C";
    } else if (platform() === "linux") {
      cpuTemp = execSync("cat /sys/class/thermal/thermal_zone0/temp", { encoding: "utf-8" }).trim();
      cpuTemp = (parseInt(cpuTemp) / 1000).toFixed(1) + "°C";
    }
  } catch { /* skip */ }
  try {
    diskUsage = execSync("df -h", { encoding: "utf-8" }).trim();
  } catch { /* skip */ }
  return "CPU Temperature: " + cpuTemp + "\n\nDisk Usage:\n" + diskUsage;
}

function toolClipboardSync(args: Record<string, unknown>): string {
  const action = String(args.action ?? "read");
  if (action === "write") {
    const text = String(args.text ?? "");
    const cmd = platform() === "darwin" ? "pbcopy" : "xclip -selection clipboard";
    const child = require("child_process").spawn(cmd, { shell: true });
    child.stdin.write(text);
    child.stdin.end();
    return "Copied to clipboard.";
  } else {
    const cmd = platform() === "darwin" ? "pbpaste" : "xclip -selection clipboard -o";
    return execSync(cmd, { encoding: "utf-8" });
  }
}

function toolRunCommand(args: Record<string, unknown>): string {
  if (!args.command) throw new Error("command is required");
  const command = String(args.command);
  const cwd = args.cwd ? safePath(String(args.cwd)) : HOME;
  const timeoutMs = args.timeout_ms ? parseInt(String(args.timeout_ms), 10) : 30_000;
  if (blocked(command)) throw new Error("Blocked: command matched a dangerous pattern");
  try {
    const out = execSync(command, {
      cwd,
      timeout: timeoutMs,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return out || "(no output)";
  } catch (e: unknown) {
    if (e && typeof e === "object" && "stdout" in e) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      const combined = [err.stdout, err.stderr].filter(Boolean).join("\n").trim();
      throw new Error(combined || (err.message ?? "Command failed"));
    }
    throw e;
  }
}

function toolGetEnv(args: Record<string, unknown>): string {
  if (!args.name) throw new Error("name is required");
  const val = process.env[String(args.name)];
  return val !== undefined ? val : "(not set)";
}

// ---------------------------------------------------------------------------
// Native app windows — create_app / edit_app / open_app / list_apps
//
// PokeClaw turns HTML into a desktop "app" window. The window is opened with
// the best strategy available on the current OS, tried in order:
//   1. A Chromium browser in --app mode (a chromeless window) — works the same
//      on macOS, Linux and Windows whenever Chrome/Edge/Brave/Chromium exists.
//   2. An OS-native webview fallback:
//        macOS   → a compiled Swift/WebKit runner
//        Linux   → a Python GTK/WebKit runner
//        Windows → an HTML Application launched via mshta
//   3. The default browser as a last resort.
// ---------------------------------------------------------------------------

const POKECLAW_DIR = join(HOME, ".pokeclaw");
const APPS_DIR = join(POKECLAW_DIR, "apps");

/** Keep app names safe to use as a folder (no path traversal). */
function sanitizeAppName(raw: string): string {
  return raw
    .trim()
    .replace(/[^A-Za-z0-9 ._-]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 80)
    .trim();
}

function appDir(name: string): string {
  return join(APPS_DIR, name);
}

function appHtmlPath(name: string): string {
  return join(appDir(name), "app.html");
}

function commandExists(cmd: string): boolean {
  try {
    const probe = platform() === "win32" ? `where ${cmd}` : `command -v ${cmd}`;
    execSync(probe, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function firstExistingPath(paths: string[]): string | null {
  for (const p of paths) {
    try {
      if (existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function spawnDetached(cmd: string, args: string[]): void {
  try {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
    child.on("error", () => {
      /* viewer unavailable — swallow so a tool call never crashes */
    });
    child.unref();
  } catch {
    /* ignore spawn failures */
  }
}

/** Locate a Chromium-based browser binary for --app mode, or null. */
function findChromiumBrowser(): string | null {
  const plat = platform();
  if (plat === "darwin") {
    return firstExistingPath([
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ]);
  }
  if (plat === "win32") {
    const found = firstExistingPath([
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ]);
    if (found) return found;
    if (commandExists("chrome")) return "chrome";
    if (commandExists("msedge")) return "msedge";
    return null;
  }
  for (const cmd of [
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "microsoft-edge",
    "brave-browser",
  ]) {
    if (commandExists(cmd)) return cmd;
  }
  return null;
}

const MAC_RUNNER_SWIFT = `import Cocoa
import WebKit

class AppDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var webView: WKWebView!

    func applicationDidFinishLaunching(_ notification: Notification) {
        let args = CommandLine.arguments
        guard args.count > 1 else { NSApp.terminate(nil); return }
        let htmlPath = args[1]
        let w = args.count > 2 ? Int(args[2]) ?? 800 : 800
        let h = args.count > 3 ? Int(args[3]) ?? 600 : 600

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: w, height: h),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false)
        window.title = args.count > 4 ? args[4] : (htmlPath as NSString).lastPathComponent

        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: w, height: h))
        webView.autoresizingMask = [.width, .height]
        window.contentView = webView

        let url = URL(fileURLWithPath: htmlPath)
        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())

        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
`;

const LINUX_RUNNER_PY = `#!/usr/bin/env python3
import os
import sys

args = sys.argv[1:]
if not args:
    sys.exit(1)

html_path = os.path.abspath(args[0])
width = int(args[1]) if len(args) > 1 else 800
height = int(args[2]) if len(args) > 2 else 600
title = args[3] if len(args) > 3 else os.path.splitext(os.path.basename(html_path))[0]

def run_gtk():
    import gi
    gi.require_version('Gtk', '3.0')
    try:
        gi.require_version('WebKit2', '4.1')
    except ValueError:
        gi.require_version('WebKit2', '4.0')
    from gi.repository import Gtk, WebKit2

    win = Gtk.Window()
    win.set_default_size(width, height)
    win.set_title(title)
    win.connect('destroy', Gtk.main_quit)

    scroller = Gtk.ScrolledWindow()
    webview = WebKit2.WebView()
    webview.load_uri('file://' + html_path)
    scroller.add(webview)

    win.add(scroller)
    win.show_all()
    Gtk.main()

try:
    run_gtk()
except Exception:
    import subprocess
    subprocess.run(['xdg-open', html_path])
`;

/** macOS: compile (once) and return the Swift/WebKit runner path, or null. */
function ensureMacRunner(): string | null {
  const runner = join(POKECLAW_DIR, "webview-runner");
  if (existsSync(runner)) return runner;
  if (!commandExists("xcrun")) return null;
  try {
    mkdirSync(POKECLAW_DIR, { recursive: true });
    const src = join(POKECLAW_DIR, "webview-runner.swift");
    writeFileSync(src, MAC_RUNNER_SWIFT, "utf-8");
    execSync(`xcrun swiftc -O -o ${JSON.stringify(runner)} ${JSON.stringify(src)}`, {
      stdio: "ignore",
    });
    return existsSync(runner) ? runner : null;
  } catch {
    return null;
  }
}

/** Linux: write (once) and return the Python GTK/WebKit runner path, or null. */
function ensureLinuxRunner(): string | null {
  if (!commandExists("python3")) return null;
  try {
    mkdirSync(POKECLAW_DIR, { recursive: true });
    const runner = join(POKECLAW_DIR, "webview-runner.py");
    if (!existsSync(runner)) writeFileSync(runner, LINUX_RUNNER_PY, "utf-8");
    return runner;
  } catch {
    return null;
  }
}

/** Windows: write an .hta wrapper and launch it with mshta, returns success. */
function launchWindowsHta(name: string, width: number, height: number, title: string): boolean {
  if (!commandExists("mshta")) return false;
  try {
    const htaPath = join(appDir(name), "window.hta");
    const safeTitle = title.replace(/[<>]/g, "");
    const hta = `<!DOCTYPE html>
<html>
<head>
<title>${safeTitle}</title>
<hta:application id="pokeclawApp" border="thin" scroll="no" contextmenu="no" innerborder="no" maximizebutton="yes" />
<script>window.resizeTo(${width}, ${height});</script>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#fff;}iframe{border:0;width:100%;height:100%;}</style>
</head>
<body><iframe src="app.html"></iframe></body>
</html>
`;
    writeFileSync(htaPath, hta, "utf-8");
    spawnDetached("mshta", [htaPath]);
    return true;
  } catch {
    return false;
  }
}

function openInDefaultBrowser(fileUrl: string): void {
  const plat = platform();
  if (plat === "darwin") spawnDetached("open", [fileUrl]);
  else if (plat === "win32") spawnDetached("cmd", ["/c", "start", "", fileUrl]);
  else spawnDetached("xdg-open", [fileUrl]);
}

/** Open an already-written app in the best available window for this OS. */
function openAppWindow(name: string, width: number, height: number): string {
  const htmlPath = appHtmlPath(name);
  const fileUrl = "file://" + htmlPath;
  const w = Math.max(200, Math.floor(width) || 800);
  const h = Math.max(200, Math.floor(height) || 600);

  // 1) Chromium --app mode (chromeless window), consistent across all OSes.
  const chromium = findChromiumBrowser();
  if (chromium) {
    spawnDetached(chromium, [
      `--app=${fileUrl}`,
      `--window-size=${w},${h}`,
      `--user-data-dir=${join(POKECLAW_DIR, "chrome-profile")}`,
      "--no-first-run",
      "--no-default-browser-check",
    ]);
    return "chromium app window";
  }

  // 2) OS-native webview.
  const plat = platform();
  if (plat === "darwin") {
    const runner = ensureMacRunner();
    if (runner) {
      spawnDetached(runner, [htmlPath, String(w), String(h), name]);
      return "macOS WebKit window";
    }
  } else if (plat === "win32") {
    if (launchWindowsHta(name, w, h, name)) return "Windows HTA window";
  } else {
    const runner = ensureLinuxRunner();
    if (runner) {
      spawnDetached("python3", [runner, htmlPath, String(w), String(h), name]);
      return "Linux GTK WebKit window";
    }
  }

  // 3) Default browser.
  openInDefaultBrowser(fileUrl);
  return "default browser";
}

function toolCreateApp(args: Record<string, unknown>): string {
  const name = sanitizeAppName(String(args.name ?? ""));
  const html = String(args.html ?? "");
  if (!name) return "Error: name is required";
  if (!html) return "Error: html content is required";
  mkdirSync(appDir(name), { recursive: true });
  writeFileSync(appHtmlPath(name), html, "utf-8");
  const via = openAppWindow(name, Number(args.width) || 800, Number(args.height) || 600);
  return `✓ Created "${name}" (opened via ${via})\n  Path: ${appHtmlPath(name)}`;
}

function toolEditApp(args: Record<string, unknown>): string {
  const name = sanitizeAppName(String(args.name ?? ""));
  const html = String(args.html ?? "");
  if (!name) return "Error: name is required";
  if (!html) return "Error: html content is required";
  if (!existsSync(appHtmlPath(name))) return `Error: app "${name}" not found`;
  writeFileSync(appHtmlPath(name), html, "utf-8");
  const via = openAppWindow(name, Number(args.width) || 800, Number(args.height) || 600);
  return `✓ Updated "${name}" (opened via ${via})`;
}

function toolOpenApp(args: Record<string, unknown>): string {
  const name = sanitizeAppName(String(args.name ?? ""));
  if (!name) return "Error: name is required";
  if (!existsSync(appHtmlPath(name))) return `Error: app "${name}" not found`;
  const via = openAppWindow(name, Number(args.width) || 800, Number(args.height) || 600);
  return `✓ Opened "${name}" (via ${via})`;
}

function toolListApps(): string {
  if (!existsSync(APPS_DIR)) return "No apps created yet.";
  const entries = readdirSync(APPS_DIR).filter((n) => {
    try {
      return statSync(join(APPS_DIR, n)).isDirectory() && existsSync(join(APPS_DIR, n, "app.html"));
    } catch {
      return false;
    }
  });
  return entries.length ? entries.join("\n") : "No apps created yet.";
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const parts: string[] = [];
  if (days) parts.push(days + "d");
  if (hours || days) parts.push(hours + "h");
  if (minutes || hours || days) parts.push(minutes + "m");
  parts.push(remainder + "s");
  return parts.join(' ');
}

function statsPayload() {
  const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);
  const topCommands = Array.from(toolCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([command, count]) => ({ command, count }));

  return {
    status: 'ok',
    uptimeSeconds,
    uptime: formatDuration(uptimeSeconds),
    commandsToday,
    topCommands,
    startedAt: new Date(startedAt).toISOString(),
    connection: {
      serverListening,
      connectionEstablished,
      connectionEstablishedAt: connectionEstablishedAt ? new Date(connectionEstablishedAt).toISOString() : null,
      startupNotificationSent,
      notifyEndpointConfigured: Boolean(NOTIFY_ENDPOINT),
    },
  };
}

function notificationTargetSummary(): string {
  return NOTIFY_ENDPOINT ? 'configured' : 'not configured';
}

function renderStatusLines(): string[] {
  const stats = statsPayload();
  return [
    "status=" + stats.status,
    "server_listening=" + stats.connection.serverListening,
    "mcp_connected=" + stats.connection.connectionEstablished,
    "mcp_connected_at=" + (stats.connection.connectionEstablishedAt ?? '(not yet)'),
    "startup_notification_sent=" + stats.connection.startupNotificationSent,
    "notification_endpoint=" + notificationTargetSummary(),
    "uptime=" + stats.uptime,
    "commands_today=" + stats.commandsToday,
    "top_commands=" + (stats.topCommands.length ? stats.topCommands.map((item) => item.command + ":" + item.count).join(', ') : '(none)'),
  ];
}

function renderInfoLines(): string[] {
  return [
    ...toolSystemInfo().split('\n'),
    "server_listening=" + serverListening,
    "mcp_connected=" + connectionEstablished,
    "mcp_connected_at=" + (connectionEstablishedAt ? new Date(connectionEstablishedAt).toISOString() : '(not yet)'),
    "startup_notification_sent=" + startupNotificationSent,
    "notification_endpoint=" + notificationTargetSummary(),
  ];
}

function printConsoleBlock(title: string, lines: string[]) {
  emitConsole('stdout', title);
  for (const line of lines) emitConsole('stdout', "  " + line);
}

function handleConsoleCommand(rawCommand: string) {
  const command = rawCommand.trim();
  if (!command) return;

  const head = command.toLowerCase().split(/\s+/, 2)[0] ?? '';
  switch (head) {
    case 'status':
      printConsoleBlock('Console status', renderStatusLines());
      return;
    case 'info':
      printConsoleBlock('Console info', renderInfoLines());
      return;
    case 'help':
      printConsoleBlock('Console commands', [
        'status  - show uptime, connection, and command counters',
        'info    - show full system and connection information',
        'help    - show available console commands',
      ]);
      return;
    default:
      emitConsole('stdout', "Unknown console command: " + command);
      emitConsole('stdout', 'Type "status", "info", or "help".');
  }
}

function installStdinListener() {
  if (!process.stdin.isTTY || process.env.POKECLAW_DISABLE_STDIN !== undefined) return;
  process.stdin.setEncoding('utf8');
  process.stdin.resume();
  let buffer = '';

  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) handleConsoleCommand(line);
  });

  process.stdin.on('end', () => {
    if (buffer.trim()) handleConsoleCommand(buffer);
  });
}

async function notifyPokePlatform(event: string, payload: Record<string, unknown>) {
  if (!NOTIFY_ENDPOINT) return false;

  const body = {
    event,
    source: APP_NAME,
    version: VERSION,
    timestamp: new Date().toISOString(),
    port: PORT,
    localUrl: "http://127.0.0.1:" + PORT + "/mcp",
    healthUrl: "http://127.0.0.1:" + PORT + "/health",
    authEnabled: Boolean(TOKEN),
    roots: ROOTS,
    ...payload,
  };

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (NOTIFY_TOKEN) headers.Authorization = "Bearer " + NOTIFY_TOKEN;

    const response = await fetch(NOTIFY_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(("HTTP " + response.status + " " + response.statusText).trim());
    }

    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log('warn', "Failed to notify Poke platform for " + event + ": " + message);
    return false;
  }
}

function markConnectionEstablished(trigger: string) {
  if (connectionEstablished) return;
  connectionEstablished = true;
  connectionEstablishedAt = Date.now();
  void notifyPokePlatform('connection_established', {
    trigger,
    connection: statsPayload().connection,
  });
}

const TOOLS = [
  { name: "read_file", description: "Read the full contents of a file on the local Mac.", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "write_file", description: "Write (create or overwrite) a file on the local Mac.", inputSchema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } },
  { name: "list_directory", description: "List files and folders inside a directory.", inputSchema: { type: "object", properties: { path: { type: "string" } } } },
  { name: "search_files", description: "Search for files by name pattern (glob) under a directory.", inputSchema: { type: "object", properties: { root: { type: "string" }, pattern: { type: "string" } }, required: ["root", "pattern"] } },
  { name: "search_text", description: "Search for text inside files below a directory.", inputSchema: { type: "object", properties: { root: { type: "string" }, query: { type: "string" }, case_sensitive: { type: "boolean" }, max_results: { type: "number" } }, required: ["root", "query"] } },
  { name: "run_command", description: "Run a shell command on the Mac and return stdout/stderr. Commands run in your home directory.", inputSchema: { type: "object", properties: { command: { type: "string" }, cwd: { type: "string" }, timeout_ms: { type: "number" } }, required: ["command"] } },
  { name: "get_env", description: "Read an environment variable from the Mac.", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "system_info", description: "Get machine and runtime details for debugging and support.", inputSchema: { type: "object", properties: {} } },
  { name: "system_stat", description: "Report CPU temperature and disk usage (for all drives).", inputSchema: { type: "object", properties: {} } },
  { name: "clipboard_sync", description: "Read or write to the system clipboard.", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["read", "write"] }, text: { type: "string" } }, required: ["action"] } },
  { name: "create_app", description: "Create a desktop app window from HTML. Opens a chromeless app window on macOS, Linux and Windows (Chromium --app mode, with native WebKit/GTK or mshta fallbacks). Writes the HTML to ~/.pokeclaw/apps/ and opens it in its own window (not a browser tab). Choose width/height that fit the app (e.g. calculator ~320x480, editor ~900x600).", inputSchema: { type: "object", properties: { name: { type: "string", description: "App name used as folder name and window title" }, html: { type: "string", description: "Full HTML content including <style> and <script> tags" }, width: { type: "number", description: "Window width in pixels" }, height: { type: "number", description: "Window height in pixels" } }, required: ["name", "html", "width", "height"] } },
  { name: "list_apps", description: "List all apps created via create_app.", inputSchema: { type: "object", properties: {} } },
  { name: "edit_app", description: "Update an existing app's HTML content and reopen it. Same as create_app but for updates.", inputSchema: { type: "object", properties: { name: { type: "string" }, html: { type: "string", description: "Full HTML content including <style> and <script> tags" }, width: { type: "number" }, height: { type: "number" } }, required: ["name", "html"] } },
  { name: "open_app", description: "Open an existing app in its own desktop window.", inputSchema: { type: "object", properties: { name: { type: "string" }, width: { type: "number" }, height: { type: "number" } }, required: ["name"] } },
];

async function handleRPC(body: Record<string, unknown>): Promise<unknown> {
  const method = String(body.method ?? "");
  const id = body.id ?? null;
  const params = (body.params ?? {}) as Record<string, unknown>;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

  try {
    switch (method) {
      case "initialize": {
        const result = { protocolVersion: "2024-11-05", serverInfo: { name: APP_NAME, version: VERSION }, capabilities: { tools: {} } };
        markConnectionEstablished("initialize");
        return ok(result);
      }
      case "notifications/initialized":
        markConnectionEstablished("notifications/initialized");
        return null;
      case "tools/list":
        return ok({ tools: TOOLS });
      case "tools/call": {
        const toolName = String(params.name ?? "");
        const args = (params.arguments ?? {}) as Record<string, unknown>;
        logToolUse(toolName, args);
        let text: string;
        switch (toolName) {
          case "read_file": text = toolReadFile(args); break;
          case "write_file": text = toolWriteFile(args); break;
          case "list_directory": text = toolListDirectory(args); break;
          case "search_files": text = await toolSearchFiles(args); break;
          case "search_text": text = await toolSearchText(args); break;
          case "run_command": text = toolRunCommand(args); break;
          case "get_env": text = toolGetEnv(args); break;
          case "system_info": text = toolSystemInfo(); break;
          case "system_stat": text = toolSystemStat(); break;
          case "clipboard_sync": text = toolClipboardSync(args); break;
          case "create_app": text = toolCreateApp(args); break;
          case "list_apps": text = toolListApps(); break;
          case "edit_app": text = toolEditApp(args); break;
          case "open_app": text = toolOpenApp(args); break;
          default: return err(-32601, "Unknown tool: " + toolName);
        }
        return ok({ content: [{ type: "text", text }] });
      }
      case "ping":
        return ok({});
      default:
        return err(-32601, "Method not found: " + method);
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    log("error", "Error in " + method + ": " + message);
    return err(-32603, message);
  }
}

function json(res: ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  });
  res.end(body);
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const base = "http://localhost:" + PORT;
  const url = new URL(req.url ?? "/", base);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, { status: "ok", name: APP_NAME, version: VERSION, auth: Boolean(TOKEN), roots: ROOTS.length });
    return;
  }

  if (req.method === "GET" && url.pathname === "/logs") {
    json(res, 200, { lines: recentLogs.slice(-100) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/stats") {
    json(res, 200, statsPayload());
    return;
  }

  if (req.method === "GET" && url.pathname === "/console") {
    json(res, 200, { lines: recentConsole.slice(-100) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/tool-calls") {
    json(res, 200, { calls: recentToolCalls.slice(-25) });
    return;
  }

  if (url.pathname === "/mcp") {
    if (!isAuthorised(req, url)) {
      json(res, 401, { error: "Unauthorized: supply ?token= or Authorization: Bearer header" });
      return;
    }

    // SSE Transport Implementation
    if (req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      // Send initial endpoint event as per SSE standard
      const endpointUrl = `${base}/mcp`;
      res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);

      sseClient = res;
      req.on("close", () => {
        if (sseClient === res) sseClient = null;
      });
      return;
    }

    if (req.method === "POST") {
      let raw = "";
      for await (const chunk of req) raw += chunk;

      let body: Record<string, unknown>;
      try {
        body = JSON.parse(raw);
      } catch {
        json(res, 400, { error: "Invalid JSON" });
        return;
      }

      const result = await handleRPC(body);
      
      // In SSE transport, POST responses for non-notifications are sent back via JSON
      if (result === null) {
        res.writeHead(204);
        res.end();
        return;
      }

      // If we have an SSE client, we could also emit messages there if they were notifications,
      // but standard MCP SSE usually responds to the POST request directly for the specific call.
      json(res, 200, result);
      return;
    }

    json(res, 405, { error: "Method Not Allowed" });
    return;
  }

  json(res, 404, { error: "Not found" });
});

process.on("SIGINT", () => {
  process.exit(0);
});
process.on("SIGTERM", () => {
  process.exit(0);
});

server.listen(PORT, "127.0.0.1", () => {
  serverListening = true;
  emitConsole("stdout", "PokeClaw " + VERSION + " is running");
  emitConsole("stdout", "Local  : http://127.0.0.1:" + PORT + "/mcp");
  emitConsole("stdout", "Health : http://127.0.0.1:" + PORT + "/health");
  if (TOKEN) {
    emitConsole("stdout", "Auth   : token required  (?token=... or Authorization: Bearer ...)");
  } else {
    emitConsole("stdout", "Auth   : NONE — set POKECLAW_TOKEN to require a token");
  }
  emitConsole("stdout", "Roots  : " + ROOTS.join(", "));
  emitConsole("stdout", "Tools  : " + TOOLS.map((tool) => tool.name).join(", "));
  pushRecentLog("[" + timestamp() + "] INFO server started on 127.0.0.1:" + PORT);
  void notifyPokePlatform('server_started', {
    connection: statsPayload().connection,
  }).then((sent) => {
    startupNotificationSent = sent;
  });
  installStdinListener();
  emitConsole("stdout", "Waiting for Poke…");
});
