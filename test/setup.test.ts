import { describe, expect, test } from "bun:test";
import { checkDependencies, gitInstallCommand } from "../src/setup";

describe("setup dependency logic", () => {
  test("gitInstallCommand is OS-aware", () => {
    const win = gitInstallCommand("win32")!;
    expect(win[0]).toBe("powershell");
    expect(win.join(" ")).toMatch(/winget/);

    const mac = gitInstallCommand("darwin")!.join(" ");
    expect(mac).toMatch(/brew install git/);
    expect(mac).toMatch(/xcode-select/);

    const linux = gitInstallCommand("linux")!.join(" ");
    expect(linux).toMatch(/apt-get/);
    expect(linux).toMatch(/sudo/);
  });

  test("checkDependencies reports bun when running under bun", async () => {
    const statuses = await checkDependencies();
    const bun = statuses.find((s) => s.id === "bun")!;
    expect(bun.ok).toBe(true);
    expect(bun.required).toBe(true);
    expect(bun.detail).toMatch(/^v\d/);

    // Every entry has the expected shape.
    for (const s of statuses) {
      expect(typeof s.label).toBe("string");
      expect(typeof s.ok).toBe("boolean");
      expect(typeof s.detail).toBe("string");
    }
  });
});
