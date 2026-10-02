import { describe, expect, test } from "bun:test";
import { applyBackspace } from "../src/tui/App";

describe("applyBackspace", () => {
  test("deletes the char before the cursor at end of input", () => {
    expect(applyBackspace("hello", 5)).toEqual({ input: "hell", cursor: 4 });
  });

  test("deletes the char before the cursor mid-input", () => {
    expect(applyBackspace("hello", 2)).toEqual({ input: "hllo", cursor: 1 });
  });

  test("does nothing when the cursor is at the start", () => {
    expect(applyBackspace("hello", 0)).toEqual({ input: "hello", cursor: 0 });
  });

  test("does nothing on empty input", () => {
    expect(applyBackspace("", 0)).toEqual({ input: "", cursor: 0 });
  });

  test("joins lines when deleting a newline", () => {
    expect(applyBackspace("ab\ncd", 3)).toEqual({ input: "abcd", cursor: 2 });
  });

  test("repeated application clears the whole input", () => {
    let state = { input: "abc", cursor: 3 };
    for (let i = 0; i < 5; i++) state = applyBackspace(state.input, state.cursor);
    expect(state).toEqual({ input: "", cursor: 0 });
  });
});
