import { describe, expect, it } from "vitest";
import type { FileDiffEntry } from "../../store/types";
import {
  createCodeViewItems,
  createFileMetaByPath,
  createInitialCollapsedKeys,
  getChangeKindLabel,
  getDiffTotals,
} from "./multiFileDiffViewerHelpers";

const files: FileDiffEntry[] = [
  {
    path: "src/added.ts",
    oldContent: "",
    newContent: "const added = true;\n",
    additions: 1,
    deletions: 0,
    changeKind: "added",
  },
  {
    path: "src/deleted.ts",
    oldContent: "const removed = true;\n",
    newContent: "",
    additions: 0,
    deletions: 1,
    changeKind: "deleted",
  },
  {
    path: "src/renamed.ts",
    oldContent: "const renamed = true;\n",
    newContent: "const renamed = true;\n",
    additions: 2,
    deletions: 3,
    changeKind: "renamed",
  },
];

describe("multiFileDiffViewerHelpers", () => {
  it("initially collapses deleted files only", () => {
    expect(Array.from(createInitialCollapsedKeys(files))).toEqual(["src/deleted.ts"]);
  });

  it("builds file metadata by path", () => {
    expect(createFileMetaByPath(files).get("src/renamed.ts")).toEqual({
      additions: 2,
      deletions: 3,
      changeKind: "renamed",
    });
  });

  it("builds code view items with stable ids and deleted-file collapse", () => {
    expect(createCodeViewItems(files)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "src/added.ts",
          type: "diff",
          collapsed: false,
          version: 0,
          fileDiff: expect.objectContaining({ name: "src/added.ts" }),
        }),
        expect.objectContaining({
          id: "src/deleted.ts",
          type: "diff",
          collapsed: true,
          version: 0,
          fileDiff: expect.objectContaining({ name: "src/deleted.ts" }),
        }),
      ]),
    );
  });

  it("sums additions and deletions across files", () => {
    expect(getDiffTotals(files)).toEqual({ additions: 3, deletions: 4 });
  });

  it("maps change kinds to header labels", () => {
    expect(getChangeKindLabel("added")).toBe("Added");
    expect(getChangeKindLabel("deleted")).toBe("Deleted");
    expect(getChangeKindLabel("renamed")).toBe("Renamed");
    expect(getChangeKindLabel("modified")).toBe("");
    expect(getChangeKindLabel(undefined)).toBe("");
  });
});
