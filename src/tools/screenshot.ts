import { err, ok, optString, schemaFor, type ToolDefinition, type ToolImage } from "./types";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB cap on the PNG we hand to Poke

/**
 * Platform capture commands. Each writes a PNG to the given path.
 * Exported for tests: pass a platform override to check other OSes.
 */
export function captureCommand(
  platform: NodeJS.Platform,
  outPath: string,
): string[] | null {
  if (platform === "darwin") {
    return ["screencapture", "-x", "-t", "png", outPath];
  }
  if (platform === "win32") {
    // PowerShell: capture the primary screen via System.Drawing.
    const ps = [
      "Add-Type -AssemblyName System.Windows.Forms;",
      "Add-Type -AssemblyName System.Drawing;",
      "$b = New-Object System.Drawing.Bitmap(",
      "[System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width,",
      "[System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height);",
      "$g = [System.Drawing.Graphics]::FromImage($b);",
      "$g.CopyFromScreen(0, 0, 0, 0, $b.Size);",
      `$b.Save('${outPath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png);`,
    ].join(" ");
    return ["powershell", "-NoProfile", "-Command", ps];
  }
  if (platform === "linux") {
    // Wayland first, then X11 fallbacks. The shell picks the first available.
    return [
      "sh",
      "-c",
      `if command -v grim >/dev/null; then grim "${outPath}"; ` +
        `elif command -v gnome-screenshot >/dev/null; then gnome-screenshot -f "${outPath}"; ` +
        `elif command -v scrot >/dev/null; then scrot "${outPath}"; ` +
        `elif command -v import >/dev/null; then import -window root "${outPath}"; ` +
        `else echo "NO_CAPTURE_TOOL" >&2; exit 3; fi`,
    ];
  }
  return null;
}

/**
 * Capture the screen and return it as a PNG image block so Poke can see it.
 * Marked "write" permission: screen content is sensitive, so in "ask" mode
 * the user gets a prompt before Poke looks at the screen.
 */
export const screenshotTool: ToolDefinition = {
  name: "screenshot",
  description:
    "Capture the current screen as a PNG image and return it so you can see what's on the display. " +
    "Use it to inspect UI state, verify something visually, or read content that isn't available as text. " +
    "The image is attached to the tool result.",
  inputSchema: schemaFor(
    {
      note: {
        type: "string",
        description: "Optional note about why the screenshot is taken (shown to the user).",
      },
    },
    [],
  ),
  permission: "write",
  handler: async (args) => {
    const note = optString(args, "note");
    const platform = process.platform;
    const outPath = join(tmpdir(), `pokeclaw-screenshot-${Date.now()}.png`);
    const cmd = captureCommand(platform, outPath);
    if (!cmd) {
      return err(`Screenshots are not supported on this platform (${platform}).`);
    }

    let proc: ReturnType<typeof Bun.spawn>;
    try {
      proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
    } catch (e) {
      return err(`Failed to start screen capture: ${e instanceof Error ? e.message : String(e)}`);
    }
    const stderr = await (proc.stderr && typeof proc.stderr !== "number"
      ? new Response(proc.stderr).text().catch(() => "")
      : "");
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      await unlink(outPath).catch(() => {});
      if (stderr.includes("NO_CAPTURE_TOOL")) {
        return err(
          "No screen capture tool found on Linux. Install one of: grim (Wayland), gnome-screenshot, scrot, or imagemagick (X11).",
        );
      }
      return err(`Screen capture failed (exit ${exitCode}): ${stderr.trim() || "no details"}`);
    }

    let buf: Buffer;
    try {
      buf = await readFile(outPath);
    } catch (e) {
      return err(`Capture ran but the PNG is unreadable: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await unlink(outPath).catch(() => {});
    }
    if (buf.length === 0) return err("Screen capture produced an empty image.");
    if (buf.length > MAX_BYTES) {
      return err(
        `Screenshot is ${(buf.length / 1024 / 1024).toFixed(1)} MB, over the ${MAX_BYTES / 1024 / 1024} MB limit.`,
      );
    }

    const images: ToolImage[] = [{ data: buf.toString("base64"), mimeType: "image/png" }];
    const prefix = note ? `Note: ${note}\n` : "";
    return {
      ...ok(`${prefix}Screenshot captured (${(buf.length / 1024).toFixed(0)} KB PNG). The image is attached to this result.`),
      images,
    };
  },
};
