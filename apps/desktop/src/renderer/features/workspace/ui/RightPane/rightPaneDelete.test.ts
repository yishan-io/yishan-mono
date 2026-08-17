import { describe, expect, it } from "vitest";
import { isDeletedPathDirectory, resolveTabIdsToCloseAfterDelete } from "../../../../features/files/ui/rightPaneDelete";

describe("isDeletedPathDirectory", () => {
  it("returns true for folder paths", () => {
    expect(isDeletedPathDirectory(["src/", "src/a.ts", "README.md"], "src")).toBe(true);
  });

  it("returns false for file paths", () => {
    expect(isDeletedPathDirectory(["src/", "src/a.ts", "README.md"], "README.md")).toBe(false);
  });
});

describe("resolveTabIdsToCloseAfterDelete", () => {
  const tabs = [
    {
      id: "file-src-a",
      workspaceId: "workspace-1",
      title: "a.ts",
      pinned: false,
      kind: "file" as const,
      data: {
        path: "src/a.ts",
        content: "",
        savedContent: "",
        isDirty: false,
        isTemporary: false,
      },
    },
    {
      id: "diff-src-b",
      workspaceId: "workspace-1",
      title: "b.ts",
      pinned: false,
      kind: "diff" as const,
      data: {
        path: "src/nested/b.ts",
        oldContent: "",
        newContent: "",
        isTemporary: false,
      },
    },
    {
      id: "file-readme",
      workspaceId: "workspace-1",
      title: "README.md",
      pinned: false,
      kind: "file" as const,
      data: {
        path: "README.md",
        content: "",
        savedContent: "",
        isDirty: false,
        isTemporary: false,
      },
    },
    {
      id: "file-other-workspace",
      workspaceId: "workspace-2",
      title: "a.ts",
      pinned: false,
      kind: "file" as const,
      data: {
        path: "src/a.ts",
        content: "",
        savedContent: "",
        isDirty: false,
        isTemporary: false,
      },
    },
  ];

  it("closes only matching file/diff tabs for deleted file", () => {
    const tabIds = resolveTabIdsToCloseAfterDelete(tabs, "README.md", false);
    expect(tabIds).toEqual(["file-readme"]);
  });

  it("closes descendant tabs for deleted directory", () => {
    const tabIds = resolveTabIdsToCloseAfterDelete(tabs, "src", true);
    expect(tabIds).toEqual(["file-src-a", "diff-src-b", "file-other-workspace"]);
  });
});
