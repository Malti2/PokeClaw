import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { DEFAULT_CONFIG } from "../src/config.js";
import { setActiveConfig } from "../src/runtime.js";
import {
  toolDeleteFile,
  toolEditFile,
  toolMoveFile,
  toolReadFile,
  toolWriteFile,
} from "../src/tools/files.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pokeclaw-test-"));
  setActiveConfig({ ...DEFAULT_CONFIG, roots: [dir] });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("edit_file", () => {
  it("replaces a unique substring", () => {
    const f = join(dir, "a.txt");
    writeFileSync(f, "hello world");
    toolEditFile({ path: f, old_string: "world", new_string: "poke" });
    expect(readFileSync(f, "utf-8")).toBe("hello poke");
  });

  it("errors when old_string is missing", () => {
    const f = join(dir, "a.txt");
    writeFileSync(f, "abc");
    expect(() => toolEditFile({ path: f, old_string: "zzz", new_string: "x" })).toThrow(
      /not found/,
    );
  });

  it("errors on non-unique without replace_all", () => {
    const f = join(dir, "a.txt");
    writeFileSync(f, "a a a");
    expect(() => toolEditFile({ path: f, old_string: "a", new_string: "b" })).toThrow(/not unique/);
  });

  it("replaces all with replace_all=true", () => {
    const f = join(dir, "a.txt");
    writeFileSync(f, "a a a");
    toolEditFile({ path: f, old_string: "a", new_string: "b", replace_all: true });
    expect(readFileSync(f, "utf-8")).toBe("b b b");
  });
});

describe("write/read/move/delete", () => {
  it("writes and reads back", () => {
    const f = join(dir, "sub", "b.txt");
    toolWriteFile({ path: f, content: "data" });
    expect(toolReadFile({ path: f })).toBe("data");
  });

  it("moves a file", () => {
    const a = join(dir, "a.txt");
    const b = join(dir, "b.txt");
    writeFileSync(a, "x");
    toolMoveFile({ from: a, to: b });
    expect(readFileSync(b, "utf-8")).toBe("x");
  });

  it("deletes a file", () => {
    const a = join(dir, "a.txt");
    writeFileSync(a, "x");
    toolDeleteFile({ path: a });
    expect(() => toolReadFile({ path: a })).toThrow();
  });

  it("refuses to delete a directory without recursive", () => {
    expect(() => toolDeleteFile({ path: dir })).toThrow(/recursive/);
  });
});
