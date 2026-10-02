import { err, ok, optString, needString, schemaFor, type ToolDefinition } from "./types";

/**
 * UI automation via the OS accessibility tree — see the UI, click elements
 * by identity instead of guessing pixels.
 *
 * macOS: System Events accessibility (osascript). Needs the terminal app in
 * System Settings → Privacy & Security → Accessibility.
 * Other platforms: not implemented yet (honest error, no fake behavior).
 */

export interface UiNode {
  i: number;
  role: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  path: string;
  kids: UiNode[];
}

export interface FlatNode extends UiNode {
  id: string;
  depth: number;
  clickable: boolean;
}

const CLICKABLE_ROLES = new Set([
  "button",
  "menu item",
  "menu button",
  "link",
  "checkbox",
  "radio button",
  "pop up button",
  "combo box",
  "text field",
  "secure text field",
  "text area",
  "scroll bar", // page steppers etc.
  "tab group",
  "row",
  "cell",
]);

export function isClickable(role: string): boolean {
  return CLICKABLE_ROLES.has(role.toLowerCase());
}

/** Flatten the nested snapshot tree (BFS) and assign stable ids e1, e2, … */
export function flattenSnapshot(roots: UiNode[]): FlatNode[] {
  const out: FlatNode[] = [];
  let n = 0;
  const queue: Array<{ node: UiNode; depth: number }> = roots.map((node) => ({ node, depth: 0 }));
  while (queue.length > 0) {
    const { node, depth } = queue.shift()!;
    n++;
    out.push({ ...node, id: `e${n}`, depth, clickable: isClickable(node.role) });
    for (const k of node.kids) queue.push({ node: k, depth: depth + 1 });
  }
  return out;
}

/** Human/LLM-readable tree. Clickable elements are marked so Poke knows what it can press. */
export function formatSnapshot(flat: FlatNode[], maxNodes = 300): string {
  const lines: string[] = [];
  for (const el of flat.slice(0, maxNodes)) {
    const indent = "  ".repeat(Math.min(el.depth, 8));
    const label = el.name ? ` "${el.name}"` : "";
    const geom = el.x >= 0 ? ` ${el.x},${el.y} ${el.w}x${el.h}` : "";
    const mark = el.clickable ? " [clickable]" : "";
    lines.push(`${indent}[${el.id}] ${el.role}${label}${geom}${mark}`);
  }
  if (flat.length > maxNodes) lines.push(`… (${flat.length - maxNodes} more elements)`);
  return lines.join("\n");
}

/** id -> AX path, kept from the last snapshot so ui_click can resolve e12 etc. */
const snapshotPaths = new Map<string, string>();

export function rememberSnapshot(flat: FlatNode[]): void {
  snapshotPaths.clear();
  for (const el of flat) snapshotPaths.set(el.id, el.path);
}

export function resolveTarget(target: string): string | null {
  return snapshotPaths.get(target) ?? null;
}

const SNAPSHOT_SCRIPT = `
on esc(t)
  set t to my rep(t, "\\"", "\\\\\\"")
  set t to my rep(t, (ASCII character 10), "\\\\n")
  return t
end esc

on rep(t, a, b)
  set {od, AppleScript's text item delimiters} to {AppleScript's text item delimiters, a}
  set parts to text items of t
  set AppleScript's text item delimiters to b
  set t2 to parts as string
  set AppleScript's text item delimiters to od
  return t2
end rep

on walkEl(el, path, depth)
  if depth > 6 then return ""
  set chunks to {}
  try
    set kids to UI elements of el
  on error
    return ""
  end try
  set i to 0
  repeat with k in kids
    set i to i + 1
    if i > 150 then exit repeat
    set childPath to ("UI element " & i & " of " & path)
    set r to ""
    try
      set r to (role of k) as string
    end try
    set nm to ""
    try
      set nm to (name of k) as string
    end try
    set px to -1
    set py to -1
    set pw to -1
    set ph to -1
    try
      set pos to position of k
      set px to item 1 of pos
      set py to item 2 of pos
    end try
    try
      set sz to size of k
      set pw to item 1 of sz
      set ph to item 2 of sz
    end try
    set kidsJson to my walkEl(k, childPath, depth + 1)
    set end of chunks to ("{\\"i\\":" & i & ",\\"role\\":\\"" & my esc(r) & "\\",\\"name\\":\\"" & my esc(nm) & "\\",\\"x\\":" & px & ",\\"y\\":" & py & ",\\"w\\":" & pw & ",\\"h\\":" & ph & ",\\"path\\":\\"" & my esc(childPath) & "\\",\\"kids\\":[" & kidsJson & "]}")
  end repeat
  set {od, AppleScript's text item delimiters} to {AppleScript's text item delimiters, ","}
  set s to chunks as string
  set AppleScript's text item delimiters to od
  return s
end walkEl

tell application "System Events"
  try
    set frontProc to first process whose frontmost is true
  on error
    return "{\\"error\\":\\"no frontmost process found\\"}"
  end try
  set procName to name of frontProc
  return "[" & my walkEl(frontProc, ("process \\"" & my esc(procName) & "\\""), 0) & "]"
end tell
`;

async function runOsascript(script: string, timeoutMs = 30_000): Promise<{ ok: boolean; out: string }> {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(["osascript", "-e", script], { stdout: "pipe", stderr: "pipe" });
  } catch (e) {
    return { ok: false, out: e instanceof Error ? e.message : String(e) };
  }
  const killer = setTimeout(() => {
    try {
      if (proc.exitCode === null) proc.kill();
    } catch { /* already gone */ }
  }, timeoutMs);
  try {
    const [stdout, stderr] = await Promise.all([
      proc.stdout && typeof proc.stdout !== "number"
        ? new Response(proc.stdout).text().catch(() => "")
        : Promise.resolve(""),
      proc.stderr && typeof proc.stderr !== "number"
        ? new Response(proc.stderr).text().catch(() => "")
        : Promise.resolve(""),
    ]);
    const code = await proc.exited;
    if (code !== 0) {
      const hint = /accessibility|assistive|permission/i.test(stderr)
        ? " Grant Accessibility access: System Settings → Privacy & Security → Accessibility → enable your terminal."
        : "";
      return { ok: false, out: `osascript failed (exit ${code}): ${stderr.trim()}${hint}` };
    }
    return { ok: true, out: stdout.trim() };
  } finally {
    clearTimeout(killer);
  }
}

function escApplescriptString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export const uiSnapshotTool: ToolDefinition = {
  name: "ui_snapshot",
  description:
    "See the current UI as an accessibility tree: every visible element with an id like [e12], its role, name and position. " +
    "Clickable elements are marked [clickable]. Use ui_click with an element id to press it — never guess pixel coordinates. " +
    "macOS only.",
  inputSchema: schemaFor({}, []),
  permission: "write", // screen content is sensitive: prompt in ask mode
  handler: async () => {
    if (process.platform !== "darwin") {
      return err(`ui_snapshot is currently macOS-only (this machine: ${process.platform}).`);
    }
    const res = await runOsascript(SNAPSHOT_SCRIPT);
    if (!res.ok) return err(res.out);
    let roots: UiNode[];
    try {
      const parsed: unknown = JSON.parse(res.out);
      if (parsed && typeof parsed === "object" && "error" in (parsed as Record<string, unknown>)) {
        return err(`UI snapshot failed: ${String((parsed as Record<string, unknown>).error)}`);
      }
      if (!Array.isArray(parsed)) return err("UI snapshot returned unexpected data.");
      roots = parsed as UiNode[];
    } catch (e) {
      return err(`Could not parse UI snapshot: ${e instanceof Error ? e.message : String(e)}`);
    }
    const flat = flattenSnapshot(roots);
    rememberSnapshot(flat);
    const clickable = flat.filter((f) => f.clickable).length;
    return ok(
      `UI snapshot: ${flat.length} elements (${clickable} clickable). Element ids (e.g. e12) work with ui_click.\n\n${formatSnapshot(flat)}`,
    );
  },
};

export const uiClickTool: ToolDefinition = {
  name: "ui_click",
  description:
    "Click a UI element by its id from ui_snapshot (e.g. \"e12\") — resolved through the accessibility tree, no pixel guessing. " +
    "Alternatively pass \"x,y\" screen coordinates (needs the `cliclick` tool: brew install cliclick). macOS only.",
  inputSchema: schemaFor(
    {
      target: { type: "string", description: 'Element id from ui_snapshot (e.g. "e12") or "x,y" coordinates.' },
      double: { type: "string", description: 'Set to "true" for a double click. Default "false".' },
    },
    ["target"],
  ),
  permission: "write",
  handler: async (args) => {
    if (process.platform !== "darwin") {
      return err(`ui_click is currently macOS-only (this machine: ${process.platform}).`);
    }
    const target = needString(args, "target").trim();
    const double = optString(args, "double") === "true";

    const axPath = resolveTarget(target);
    if (axPath) {
      // Precise: click the element itself through the accessibility tree.
      const action = double ? "perform action \"AXPress\" of" : "click";
      let res = await runOsascript(`tell application "System Events" to ${action} ${axPath}`);
      if (!res.ok && !double) {
        // Some elements only respond to AXPress.
        res = await runOsascript(`tell application "System Events" to perform action "AXPress" of ${axPath}`);
      }
      if (!res.ok) return err(`Click on ${target} failed: ${res.out}`);
      return ok(`Clicked ${target}${double ? " (double)" : ""}.`);
    }

    const m = target.match(/^(-?\d+)\s*,\s*(-?\d+)$/);
    if (!m) {
      return err(
        `Unknown target "${target}". Take a fresh ui_snapshot first and use an element id like "e12", or pass "x,y" coordinates.`,
      );
    }
    const res = await runOsascript(`tell application "System Events"
      try
        do shell script "command -v cliclick"
      on error
        return "MISSING_CLICLICK"
      end try
    end tell`);
    if (!res.ok || res.out.includes("MISSING_CLICLICK")) {
      return err("Coordinate clicks need cliclick: brew install cliclick. Or click an element id from ui_snapshot instead.");
    }
    const [, x, y] = m;
    const click = await runOsascript(`do shell script "cliclick ${double ? "dc" : "c"}:${x},${y}"`);
    if (!click.ok) return err(`Coordinate click failed: ${click.out}`);
    return ok(`Clicked at ${x},${y}${double ? " (double)" : ""}.`);
  },
};

export const uiTypeTool: ToolDefinition = {
  name: "ui_type",
  description:
    "Type text into the currently focused UI element (click the field first with ui_click). " +
    "Optionally press Return afterwards. macOS only.",
  inputSchema: schemaFor(
    {
      text: { type: "string", description: "The text to type." },
      submit: { type: "string", description: 'Set to "true" to press Return after typing. Default "false".' },
    },
    ["text"],
  ),
  permission: "write",
  handler: async (args) => {
    if (process.platform !== "darwin") {
      return err(`ui_type is currently macOS-only (this machine: ${process.platform}).`);
    }
    const text = needString(args, "text");
    const submit = optString(args, "submit") === "true";
    const script =
      `tell application "System Events" to keystroke "${escApplescriptString(text)}"` +
      (submit ? '\ntell application "System Events" to key code 36' : "");
    const res = await runOsascript(script);
    if (!res.ok) return err(`Typing failed: ${res.out}`);
    return ok(`Typed ${text.length} characters${submit ? " and pressed Return" : ""}.`);
  },
};
