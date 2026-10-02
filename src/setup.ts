import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type DependencyId = "bun" | "git" | "project-deps" | "rg";

export interface DependencyStatus {
  id: DependencyId;
  label: string;
  required: boolean;
  ok: boolean;
  detail: string;
}

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

async function commandExists(cmd: string): Promise<boolean> {
  try {
    const proc = Bun.spawn([cmd, "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

/** Check everything pokeclaw needs at runtime. */
export async function checkDependencies(): Promise<DependencyStatus[]> {
  const bunVersion =
    typeof process.versions.bun === "string" ? process.versions.bun : null;
  const gitOk = await commandExists("git");
  const rgOk = await commandExists("rg");
  const depsOk = existsSync(join(PROJECT_ROOT, "node_modules"));

  return [
    {
      id: "bun",
      label: "Bun runtime",
      required: true,
      ok: bunVersion !== null,
      detail: bunVersion ? `v${bunVersion}` : "not running under Bun",
    },
    {
      id: "git",
      label: "git (for cloning / updates)",
      required: false,
      ok: gitOk,
      detail: gitOk ? "found" : "not found on PATH",
    },
    {
      id: "project-deps",
      label: "project dependencies (node_modules)",
      required: true,
      ok: depsOk,
      detail: depsOk ? "installed" : "missing — run `bun install`",
    },
    {
      id: "rg",
      label: "ripgrep (optional, speeds up grep)",
      required: false,
      ok: rgOk,
      detail: rgOk ? "found" : "not found — grep falls back to a built-in scan",
    },
  ];
}

/**
 * Build the OS-specific command that installs git.
 * Exported for tests; returns null when there is no automated route.
 */
export function gitInstallCommand(
  platform: NodeJS.Platform = process.platform,
): string[] | null {
  if (platform === "win32") {
    return [
      "powershell",
      "-NoProfile",
      "-Command",
      "winget install --id Git.Git -e --source winget",
    ];
  }
  if (platform === "darwin") {
    // macOS: Homebrew when available, otherwise Apple's CLI tools installer
    // (opens a GUI dialog).
    return ["sh", "-c", "command -v brew >/dev/null && brew install git || xcode-select --install"];
  }
  // Linux: pick the distro package manager.
  return [
    "sh",
    "-c",
    [
      "if command -v apt-get >/dev/null; then sudo apt-get update && sudo apt-get install -y git;",
      "elif command -v dnf >/dev/null; then sudo dnf install -y git;",
      "elif command -v pacman >/dev/null; then sudo pacman -S --noconfirm git;",
      "elif command -v zypper >/dev/null; then sudo zypper install -y git;",
      "elif command -v apk >/dev/null; then sudo apk add git;",
      "else echo 'No supported package manager found. Install git manually.' >&2; exit 1; fi",
    ].join(" "),
  ];
}

async function askYesNo(question: string): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question(`${question} [Y/n] `)).trim().toLowerCase();
    return answer === "" || answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

/** Install project dependencies (bun install) in the project root. */
export async function installProjectDeps(): Promise<boolean> {
  const proc = Bun.spawn(["bun", "install"], {
    cwd: PROJECT_ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  await proc.exited;
  return proc.exitCode === 0;
}

/** Try to install git with the OS-specific installer (stdio inherited). */
export async function installGit(): Promise<boolean> {
  const cmd = gitInstallCommand();
  if (!cmd) return false;
  const proc = Bun.spawn(cmd, { stdout: "inherit", stderr: "inherit" });
  await proc.exited;
  // winget/xcode-select may need a new shell before git is on PATH.
  return (await commandExists("git")) || proc.exitCode === 0;
}

/**
 * Interactive `pokeclaw setup`: report dependency status and offer to
 * install whatever is missing. Returns true when all required deps are OK.
 */
export async function runSetup(): Promise<boolean> {
  const interactive = Boolean(process.stdin.isTTY);
  const statuses = await checkDependencies();

  console.log("Dependencies:");
  for (const s of statuses) {
    const mark = s.ok ? "✓" : s.required ? "✗" : "○";
    console.log(`  ${mark} ${s.label}: ${s.detail}`);
  }
  console.log("");

  let allRequiredOk = true;

  const git = statuses.find((s) => s.id === "git")!;
  if (!git.ok && interactive) {
    if (await askYesNo("git is missing. Install it now?")) {
      console.log("Installing git (this may ask for confirmation / a password)…");
      const ok = await installGit();
      console.log(ok ? "git installed." : "git install did not complete. You may need a new terminal window for PATH changes.");
      if (!ok) allRequiredOk = false;
    }
  }

  const deps = statuses.find((s) => s.id === "project-deps")!;
  if (!deps.ok) {
    if (interactive && (await askYesNo("Project dependencies are missing. Run `bun install` now?"))) {
      const ok = await installProjectDeps();
      console.log(ok ? "Dependencies installed." : "bun install failed.");
      if (!ok) allRequiredOk = false;
    } else if (!interactive) {
      allRequiredOk = false;
    }
  }

  const bun = statuses.find((s) => s.id === "bun")!;
  if (!bun.ok) allRequiredOk = false;

  if (allRequiredOk) console.log("All required dependencies are ready.");
  return allRequiredOk;
}
