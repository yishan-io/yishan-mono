import { describe, expect, test } from "vitest";

import { applyEdits, collectEditsForUri, hasConflictingEdits, offsetToPosition } from "./textEdits";

describe("text edit helpers", () => {
  test("converts offsets to positions", () => {
    expect(offsetToPosition("one\ntwo\nthree", 5)).toEqual({ line: 1, character: 1 });
    expect(offsetToPosition("abc", 99)).toEqual({ line: 0, character: 3 });
  });

  test("applies edits in reverse order", () => {
    const text = "one\ntwo\nthree";
    expect(
      applyEdits(text, [
        {
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
          newText: "ONE",
        },
        {
          range: { start: { line: 2, character: 5 }, end: { line: 2, character: 5 } },
          newText: "!",
        },
      ]),
    ).toBe("ONE\ntwo\nthree!");
  });

  test("detects overlapping edits", () => {
    const text = "one\ntwo\nthree";
    expect(
      hasConflictingEdits(text, [
        { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 2 } }, newText: "" },
        { range: { start: { line: 0, character: 1 }, end: { line: 0, character: 3 } }, newText: "" },
      ]),
    ).toBe(true);
    // Two insertions at the same spot never conflict.
    expect(
      hasConflictingEdits(text, [
        { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "a" },
        { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "b" },
      ]),
    ).toBe(false);
  });

  test("collects edits for a uri from both workspace-edit shapes", () => {
    const edit = {
      changes: {
        "file:///a.ts": [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "x" }],
      },
    };
    expect(collectEditsForUri(edit, "file:///a.ts")).toHaveLength(1);
    expect(collectEditsForUri(edit, "file:///b.ts")).toEqual([]);
    expect(
      collectEditsForUri(
        {
          documentChanges: [
            { textDocument: { uri: "file:///a.ts" }, edits: edit.changes["file:///a.ts"] },
            { textDocument: { uri: "file:///b.ts" }, edits: [] },
          ],
        },
        "file:///a.ts",
      ),
    ).toHaveLength(1);
    expect(collectEditsForUri(undefined, "file:///a.ts")).toEqual([]);
  });
});
