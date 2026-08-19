import { describe, expect, it } from "vitest";
import { computeGitLineChanges } from "./gitGutterDiff";

describe("computeGitLineChanges", () => {
  it("returns empty array when content is identical", () => {
    const content = "line1\nline2\nline3";
    expect(computeGitLineChanges(content, content)).toEqual([]);
  });

  it("detects added lines at the end", () => {
    const oldContent = "line1\nline2";
    const newContent = "line1\nline2\nline3\nline4";
    const changes = computeGitLineChanges(oldContent, newContent);

    expect(changes).toContainEqual({ lineNumber: 3, kind: "added" });
    expect(changes).toContainEqual({ lineNumber: 4, kind: "added" });
  });

  it("detects added lines at the beginning", () => {
    const oldContent = "line1\nline2";
    const newContent = "new line\nline1\nline2";
    const changes = computeGitLineChanges(oldContent, newContent);

    expect(changes).toContainEqual({ lineNumber: 1, kind: "added" });
    expect(changes.filter((c) => c.kind === "added")).toHaveLength(1);
  });

  it("detects added lines in the middle", () => {
    const oldContent = "line1\nline3";
    const newContent = "line1\nline2\nline3";
    const changes = computeGitLineChanges(oldContent, newContent);

    expect(changes).toContainEqual({ lineNumber: 2, kind: "added" });
    expect(changes.filter((c) => c.kind === "added")).toHaveLength(1);
  });

  it("detects deleted lines", () => {
    const oldContent = "line1\nline2\nline3";
    const newContent = "line1\nline3";
    const changes = computeGitLineChanges(oldContent, newContent);

    const deletions = changes.filter((c) => c.kind === "deleted");
    expect(deletions.length).toBeGreaterThanOrEqual(1);
  });

  it("detects modified lines", () => {
    const oldContent = "line1\noriginal line\nline3";
    const newContent = "line1\nmodified line\nline3";
    const changes = computeGitLineChanges(oldContent, newContent);

    expect(changes).toContainEqual({ lineNumber: 2, kind: "modified" });
  });

  it("detects multiple modified lines", () => {
    const oldContent = "aaa\nbbb\nccc\nddd";
    const newContent = "aaa\nBBB\nCCC\nddd";
    const changes = computeGitLineChanges(oldContent, newContent);

    expect(changes).toContainEqual({ lineNumber: 2, kind: "modified" });
    expect(changes).toContainEqual({ lineNumber: 3, kind: "modified" });
  });

  it("handles completely different content", () => {
    const oldContent = "old1\nold2\nold3";
    const newContent = "new1\nnew2";
    const changes = computeGitLineChanges(oldContent, newContent);

    // Should have some changes (modified and/or deleted)
    expect(changes.length).toBeGreaterThan(0);
  });

  it("handles empty old content (new file)", () => {
    const oldContent = "";
    const newContent = "line1\nline2\nline3";
    const changes = computeGitLineChanges(oldContent, newContent);

    // All lines should be added
    const added = changes.filter((c) => c.kind === "added");
    expect(added.length).toBeGreaterThanOrEqual(2);
  });

  it("handles empty new content (file cleared)", () => {
    const oldContent = "line1\nline2\nline3";
    const newContent = "";
    const changes = computeGitLineChanges(oldContent, newContent);

    // Should detect deletions
    expect(changes.length).toBeGreaterThan(0);
  });

  it("handles single-line modifications", () => {
    const oldContent = "hello world";
    const newContent = "hello universe";
    const changes = computeGitLineChanges(oldContent, newContent);

    expect(changes).toContainEqual({ lineNumber: 1, kind: "modified" });
  });

  it("handles mixed additions and modifications", () => {
    const oldContent = "line1\nline2\nline3";
    const newContent = "line1\nmodified\nline3\nnew line";
    const changes = computeGitLineChanges(oldContent, newContent);

    const modified = changes.filter((c) => c.kind === "modified");
    const added = changes.filter((c) => c.kind === "added");
    expect(modified.length).toBeGreaterThanOrEqual(1);
    expect(added.length).toBeGreaterThanOrEqual(1);
  });

  it("returns 1-based line numbers", () => {
    const oldContent = "same\nold";
    const newContent = "same\nnew";
    const changes = computeGitLineChanges(oldContent, newContent);

    for (const change of changes) {
      expect(change.lineNumber).toBeGreaterThanOrEqual(1);
    }
  });

  it("handles trailing newline differences", () => {
    const oldContent = "line1\nline2\n";
    const newContent = "line1\nline2";
    const changes = computeGitLineChanges(oldContent, newContent);

    // Trailing newline difference should produce a change
    expect(changes.length).toBeGreaterThanOrEqual(1);
  });
});
