import { execSync } from "child_process";
import { HOME } from "../config.js";
import { blocked, safePath } from "../security.js";

export function toolRunCommand(args: Record<string, unknown>): string {
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

export function toolGetEnv(args: Record<string, unknown>): string {
  if (!args.name) throw new Error("name is required");
  const val = process.env[String(args.name)];
  return val !== undefined ? val : "(not set)";
}

export function toolGit(args: Record<string, unknown>): string {
  if (!args.repo) throw new Error("repo is required");
  const repo = safePath(String(args.repo));
  const sub = String(args.subcommand ?? "status");
  const allowed = new Set(["status", "diff", "log", "branch", "show", "remote"]);
  if (!allowed.has(sub)) {
    throw new Error(`Unsupported git subcommand '${sub}'. Allowed: ${[...allowed].join(", ")}`);
  }
  const extra =
    sub === "status"
      ? "--short --branch"
      : sub === "log"
        ? "--oneline -20"
        : sub === "branch"
          ? "-a"
          : "";
  try {
    const out = execSync(`git ${sub} ${extra}`.trim(), {
      cwd: repo,
      encoding: "utf-8",
      timeout: 15_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return out.trim() || "(no output)";
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const combined = [err.stdout, err.stderr].filter(Boolean).join("\n").trim();
    throw new Error(combined || (err.message ?? "git failed"));
  }
}
