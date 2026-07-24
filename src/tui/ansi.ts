/** Minimal, dependency-free ANSI helpers shared by the CLI and the TUI. */

const useColor = (): boolean => {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stdout.isTTY);
};

const wrap = (open: number, close: number) => (s: string) =>
  useColor() ? `\u001b[${open}m${s}\u001b[${close}m` : s;

export const bold = wrap(1, 22);
export const dim = wrap(2, 22);
export const red = wrap(31, 39);
export const green = wrap(32, 39);
export const yellow = wrap(33, 39);
export const blue = wrap(34, 39);
export const magenta = wrap(35, 39);
export const cyan = wrap(36, 39);
export const gray = wrap(90, 39);

/** Strip ANSI escape codes (used for width calculations). */
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001b\[[0-9;]*m/g;
export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

/** Visible length of a string, ignoring ANSI codes. */
export function visibleLength(s: string): number {
  return stripAnsi(s).length;
}

/** Truncate to a visible width, appending an ellipsis when cut. */
export function truncate(s: string, width: number): string {
  const plain = stripAnsi(s);
  if (plain.length <= width) return s;
  if (width <= 1) return plain.slice(0, Math.max(0, width));
  return plain.slice(0, width - 1) + "…";
}

/** Pad a string to a visible width (ANSI-aware). */
export function padEnd(s: string, width: number): string {
  const len = visibleLength(s);
  return len >= width ? s : s + " ".repeat(width - len);
}

// Cursor / screen control
export const CLEAR_SCREEN = "\u001b[2J\u001b[3J\u001b[H";
export const HIDE_CURSOR = "\u001b[?25l";
export const SHOW_CURSOR = "\u001b[?25h";
export const ALT_SCREEN_ON = "\u001b[?1049h";
export const ALT_SCREEN_OFF = "\u001b[?1049l";
export const moveTo = (row: number, col: number) => `\u001b[${row};${col}H`;
