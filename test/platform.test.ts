import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bashTool, shellForPlatform } from "../src/tools/bash";
import { globTool, toMatchPath } from "../src/tools/glob";

describe("cross-platform compatibility", () => {
  test("shellForPlatform picks the right shell per OS", () => {
    expect(shellForPlatform("win32")).toEqual(["cmd.exe", "/d", "/s", "/c"]);
    expect(shellForPlatform("darwin")).toEqual(["bash", "-c"]);
    expect(shellForPlatform("linux")).toEqual(["bash", "-c"]);
    // Default follows the current platform and always yields a usable argv.
    expect(shellForPlatform().length).toBeGreaterThan(0);
  });

  test("bash tool runs a trivial command on this platform", async () => {
    // `echo` exists in both bash and cmd.exe.
    const result = await bashTool.handler(
      { command: "echo hello-platform" },
      { cwd: process.cwd() },
    );
    expect(result.isError ?? false).toBe(false);
    expect(result.output).toContain("exit code: 0");
    expect(result.output).toContain("hello-platform");
  });

  test("bash tool reports a failing command without throwing", async () => {
    const result = await bashTool.handler(
      { command: "exit 3" },
      { cwd: process.cwd() },
    );
    expect(result.isError ?? false).toBe(false);
    expect(result.output).toContain("exit code: 3");
  });

  test("toMatchPath normalizes Windows separators", () => {
    expect(toMatchPath("src\\a\\b.ts")).toBe("src/a/b.ts");
    expect(toMatchPath("src/a/b.ts")).toBe("src/a/b.ts");
    expect(toMatchPath("C:\\Users\\x\\f.ts")).toBe("C:/Users/x/f.ts");
  });

  test("glob finds nested files via the handler", async () => {
    const root = await mkdtemp(join(tmpdir(), "pokeclaw-glob-"));
    try {
      await mkdir(join(root, "src", "deep"), { recursive: true });
      await writeFile(join(root, "src", "deep", "a.ts"), "x");
      await writeFile(join(root, "src", "b.ts"), "y");
      await writeFile(join(root, "top.md"), "z");

      const result = await globTool.handler(
        { pattern: "src/**/*.ts", path: root },
        { cwd: root },
      );
      expect(result.isError ?? false).toBe(false);
      // Normalized to forward slashes on every platform.
      expect(result.output).toContain("src/deep/a.ts");
      expect(result.output).toContain("src/b.ts");
      expect(result.output).not.toContain("top.md");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
