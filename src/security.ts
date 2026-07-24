import { resolve } from "path";
import { HOME } from "./config.js";
import { getConfig } from "./runtime.js";

/**
 * Resolve a user-supplied path and ensure it lives inside an allowed root.
 * Throws when the path escapes the configured roots.
 */
export function safePath(raw: string): string {
  const p = resolve(raw.replace(/^~/, HOME));
  const roots = getConfig().roots;
  const allowed = roots.some((root) => {
    const r = resolve(root);
    return p === r || p.startsWith(r + "/");
  });
  if (!allowed) {
    throw new Error(`Access denied: '${p}' is outside allowed roots (${roots.join(", ")})`);
  }
  return p;
}

const BLOCK: RegExp[] = [
  /\brm\s+-[a-z]*r[a-z]*f?\b[^|;&]*\s\//,
  /\brm\s+-[a-z]*f[a-z]*r?\b[^|;&]*\s\//,
  /\bsudo\s+rm\b/,
  /:\s*\(\s*\)\s*\{.*\}/,
  /\bmkfs\b/,
  /\bdd\b[^|;&]*\bif=/,
  />\s*\/dev\/sd[a-z]/,
  /\bchmod\s+-[a-z]*R[a-z]*\s+0*\s+\//,
];

/** True when a command matches a known-dangerous pattern. */
export function blocked(cmd: string): boolean {
  return BLOCK.some((re) => re.test(cmd));
}

/** Whether a command's leading token is on the configured allowlist. */
export function isAllowlisted(cmd: string): boolean {
  const first = cmd.trim().split(/\s+/, 1)[0] ?? "";
  return getConfig().commandAllowlist.includes(first);
}

export interface PolicyDecision {
  allowed: boolean;
  needsApproval: boolean;
  reason?: string;
}

/**
 * Decide whether a mutating or command tool may run under the active policy.
 *  - full:     always allowed
 *  - readonly: mutating tools rejected
 *  - approval: allowed only after interactive approval (unless allowlisted)
 */
export function policyDecision(tool: string, command?: string): PolicyDecision {
  const { policy } = getConfig();
  const mutating = MUTATING_TOOLS.has(tool);
  if (!mutating) return { allowed: true, needsApproval: false };

  if (policy === "full") return { allowed: true, needsApproval: false };
  if (policy === "readonly") {
    return {
      allowed: false,
      needsApproval: false,
      reason: `Blocked: policy is read-only, '${tool}' is not permitted`,
    };
  }
  // approval
  if (tool === "run_command" && command && isAllowlisted(command)) {
    return { allowed: true, needsApproval: false };
  }
  return { allowed: true, needsApproval: true };
}

export const MUTATING_TOOLS = new Set<string>([
  "write_file",
  "edit_file",
  "delete_file",
  "move_file",
  "run_command",
  "create_app",
  "edit_app",
  "open_app",
]);

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
