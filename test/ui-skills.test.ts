import { describe, expect, test } from "bun:test";
import {
  flattenSnapshot,
  formatSnapshot,
  isClickable,
  rememberSnapshot,
  resolveTarget,
  type UiNode,
} from "../src/tools/ui";
import { parseFrontmatter, loadSkills, skillsCatalogNote } from "../src/skills/loader";
import { captureCommand } from "../src/tools/screenshot";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const tree: UiNode[] = [
  {
    i: 1, role: "window", name: "App", x: 0, y: 0, w: 800, h: 600,
    path: 'window 1 of process "App"',
    kids: [
      {
        i: 1, role: "button", name: "Send", x: 700, y: 550, w: 80, h: 30,
        path: 'UI element 1 of window 1 of process "App"', kids: [],
      },
      {
        i: 2, role: "static text", name: "Hello", x: 10, y: 10, w: 100, h: 20,
        path: 'UI element 2 of window 1 of process "App"', kids: [],
      },
    ],
  },
];

describe("ui snapshot helpers", () => {
  test("isClickable marks actionable roles", () => {
    expect(isClickable("button")).toBe(true);
    expect(isClickable("menu item")).toBe(true);
    expect(isClickable("text field")).toBe(true);
    expect(isClickable("static text")).toBe(false);
    expect(isClickable("window")).toBe(false);
  });

  test("flattenSnapshot assigns stable ids in BFS order", () => {
    const flat = flattenSnapshot(tree);
    expect(flat.map((f) => f.id)).toEqual(["e1", "e2", "e3"]);
    expect(flat[0].depth).toBe(0);
    expect(flat[1].depth).toBe(1);
    expect(flat[1].clickable).toBe(true);
    expect(flat[2].clickable).toBe(false);
  });

  test("formatSnapshot renders tree with clickable marks", () => {
    const text = formatSnapshot(flattenSnapshot(tree));
    expect(text).toContain('[e1] window "App"');
    expect(text).toContain('[e2] button "Send" 700,550 80x30 [clickable]');
    expect(text).not.toContain('[e3] static text "Hello" 10,10 100x20 [clickable]');
  });

  test("rememberSnapshot/resolveTarget round-trips element paths", () => {
    rememberSnapshot(flattenSnapshot(tree));
    expect(resolveTarget("e2")).toBe('UI element 1 of window 1 of process "App"');
    expect(resolveTarget("e99")).toBeNull();
  });
});

describe("skills loader", () => {
  test("parseFrontmatter extracts name/description and strips the block", () => {
    const { fm, body } = parseFrontmatter('---\nname: pdf\ndescription: Work with PDF files.\n---\n# Hello\n');
    expect(fm.name).toBe("pdf");
    expect(fm.description).toBe("Work with PDF files.");
    expect(body).toBe("# Hello\n");
  });

  test("parseFrontmatter handles missing block", () => {
    const { fm, body } = parseFrontmatter("# Just markdown\n");
    expect(fm).toEqual({});
    expect(body).toBe("# Just markdown\n");
  });

  test("loadSkills finds SKILL.md folders, skips others", () => {
    const dir = join(tmpdir(), `pokeclaw-skills-test-${Date.now()}`);
    mkdirSync(join(dir, "pdf"), { recursive: true });
    writeFileSync(join(dir, "pdf", "SKILL.md"), '---\nname: pdf\ndescription: PDF stuff.\n---\n# PDF\n');
    mkdirSync(join(dir, "empty"), { recursive: true }); // no SKILL.md
    writeFileSync(join(dir, "notes.txt"), "not a skill");
    const skills = loadSkills([dir, join(dir, "does-not-exist")]);
    expect(skills.map((s) => s.name)).toEqual(["pdf"]);
    expect(skills[0].content).toBe("# PDF");
    rmSync(dir, { recursive: true, force: true });
  });

  test("skillsCatalogNote lists names with one-liners", () => {
    const note = skillsCatalogNote([
      { name: "pdf", description: "PDF stuff.", path: "/x", content: "" },
    ]);
    expect(note).toContain("- pdf: PDF stuff.");
    expect(note).toContain("load_skill");
    expect(skillsCatalogNote([])).toBe("");
  });
});

describe("screenshot capture commands", () => {
  test("macOS uses screencapture", () => {
    const cmd = captureCommand("darwin", "/tmp/x.png");
    expect(cmd?.[0]).toBe("screencapture");
    expect(cmd).toContain("/tmp/x.png");
  });

  test("linux picks a tool at runtime", () => {
    const cmd = captureCommand("linux", "/tmp/x.png");
    expect(cmd?.[0]).toBe("sh");
    expect(cmd?.[2]).toContain("grim");
  });

  test("windows uses powershell", () => {
    const cmd = captureCommand("win32", "C:\\t\\x.png");
    expect(cmd?.[0]).toBe("powershell");
  });

  test("unknown platform returns null", () => {
    expect(captureCommand("sunos" as NodeJS.Platform, "/tmp/x.png")).toBeNull();
  });
});
