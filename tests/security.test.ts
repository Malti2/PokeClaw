import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, type PokeClawConfig } from "../src/config.js";
import { setActiveConfig } from "../src/runtime.js";
import { blocked, isAllowlisted, policyDecision, safePath } from "../src/security.js";

function cfg(overrides: Partial<PokeClawConfig>): PokeClawConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

describe("safePath", () => {
  beforeEach(() => setActiveConfig(cfg({ roots: ["/home/user/project"] })));

  it("allows paths inside a root", () => {
    expect(safePath("/home/user/project/src/a.ts")).toBe("/home/user/project/src/a.ts");
  });

  it("allows the root itself", () => {
    expect(safePath("/home/user/project")).toBe("/home/user/project");
  });

  it("rejects paths outside roots", () => {
    expect(() => safePath("/etc/passwd")).toThrow(/Access denied/);
  });

  it("rejects a sibling directory with a shared prefix", () => {
    expect(() => safePath("/home/user/project-secrets/x")).toThrow(/Access denied/);
  });

  it("rejects traversal escaping the root", () => {
    expect(() => safePath("/home/user/project/../../etc/passwd")).toThrow(/Access denied/);
  });
});

describe("blocked", () => {
  it.each([
    "rm -rf /",
    "rm -fr /",
    "sudo rm -rf ~",
    "dd if=/dev/zero of=/dev/sda",
    "mkfs.ext4 /dev/sda1",
    ":(){ :|:& };:",
  ])("blocks dangerous command: %s", (cmd) => {
    expect(blocked(cmd)).toBe(true);
  });

  it.each(["ls -la", "git status", "npm run build", "rm ./tmp/file.txt"])(
    "allows safe command: %s",
    (cmd) => {
      expect(blocked(cmd)).toBe(false);
    },
  );
});

describe("policyDecision", () => {
  it("allows everything under full policy", () => {
    setActiveConfig(cfg({ policy: "full" }));
    expect(policyDecision("write_file")).toEqual({ allowed: true, needsApproval: false });
    expect(policyDecision("run_command", "ls")).toEqual({ allowed: true, needsApproval: false });
  });

  it("blocks mutating tools under readonly policy but allows reads", () => {
    setActiveConfig(cfg({ policy: "readonly" }));
    expect(policyDecision("write_file").allowed).toBe(false);
    expect(policyDecision("delete_file").allowed).toBe(false);
    expect(policyDecision("read_file").allowed).toBe(true);
    expect(policyDecision("system_info").allowed).toBe(true);
  });

  it("requires approval for mutating tools under approval policy", () => {
    setActiveConfig(cfg({ policy: "approval" }));
    expect(policyDecision("write_file")).toEqual({ allowed: true, needsApproval: true });
    expect(policyDecision("read_file")).toEqual({ allowed: true, needsApproval: false });
  });

  it("skips approval for allowlisted commands", () => {
    setActiveConfig(cfg({ policy: "approval", commandAllowlist: ["git"] }));
    expect(policyDecision("run_command", "git status").needsApproval).toBe(false);
    expect(policyDecision("run_command", "rm x").needsApproval).toBe(true);
  });
});

describe("isAllowlisted", () => {
  it("matches on the leading token only", () => {
    setActiveConfig(cfg({ commandAllowlist: ["git"] }));
    expect(isAllowlisted("git push")).toBe(true);
    expect(isAllowlisted("gitfoo")).toBe(false);
    expect(isAllowlisted("echo git")).toBe(false);
  });
});
