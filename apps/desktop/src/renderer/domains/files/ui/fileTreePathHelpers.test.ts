import { describe, expect, it } from "vitest";
import {
  buildMoveUndoEntries,
  normalizeRelativePath,
  resolvePreferredImportedPath,
} from "../features/file-manager/fileTreePathHelpers";

describe("normalizeRelativePath", () => {
  it("normalizes separators and surrounding slashes", () => {
    expect(normalizeRelativePath("\\src\\a.ts/")).toBe("src/a.ts");
  });
});

describe("buildMoveUndoEntries", () => {
  it("records move undo entries using indexed duplicate names when needed", () => {
    const repoFiles = ["src/a.ts", "dest/", "dest/a.ts"];

    const entries = buildMoveUndoEntries(repoFiles, ["src/a.ts"], "dest");

    expect(entries).toEqual([
      {
        fromPath: "src/a.ts",
        toPath: "dest/a-1.ts",
      },
    ]);
  });

  it("skips moves that stay in the same parent directory", () => {
    const repoFiles = ["src/a.ts", "src/b.ts"];

    const entries = buildMoveUndoEntries(repoFiles, ["src/a.ts"], "src");

    expect(entries).toEqual([]);
  });
});

describe("resolvePreferredImportedPath", () => {
  it("prefers the imported source-name match in destination", () => {
    const previousRepoFiles = ["src/a.ts", "src/"];
    const nextRepoFiles = ["src/a.ts", "src/", "src/a-1.ts", "src/new.md"];

    const preferredPath = resolvePreferredImportedPath(previousRepoFiles, nextRepoFiles, "src", ["a.ts"]);

    expect(preferredPath).toBe("src/a-1.ts");
  });

  it("returns null when no new path was added", () => {
    const previousRepoFiles = ["src/a.ts"];
    const nextRepoFiles = ["src/a.ts"];

    const preferredPath = resolvePreferredImportedPath(previousRepoFiles, nextRepoFiles, "", ["a.ts"]);

    expect(preferredPath).toBeNull();
  });
});
