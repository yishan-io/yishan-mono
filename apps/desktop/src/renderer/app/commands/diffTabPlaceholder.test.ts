import { describe, expect, it } from "vitest";
import { createDiffTabPlaceholder } from "./diffTabPlaceholder";

describe("createDiffTabPlaceholder (moves out of Model after P30)", () => {
  it("builds an added-file diff with only new content", () => {
    const { oldContent, newContent } = createDiffTabPlaceholder({
      path: "/repo/new.ts",
      kind: "added",
      additions: 3,
      deletions: 0,
    });

    expect(oldContent).toBe("");
    expect(newContent).toContain("// /repo/new.ts");
    expect(newContent).toContain('const addedLine1 = "new.ts line 1";');
    expect(newContent).toContain('const addedLine3 = "new.ts line 3";');
  });

  it("builds a deleted-file diff with only old content", () => {
    const { oldContent, newContent } = createDiffTabPlaceholder({
      path: "/repo/gone.ts",
      kind: "deleted",
      additions: 0,
      deletions: 2,
    });

    expect(oldContent).toContain('const removedLine1 = "gone.ts line 1";');
    expect(oldContent).toContain('const removedLine2 = "gone.ts line 2";');
    expect(newContent).toBe("");
  });

  it("builds a modified diff with both sides", () => {
    const { oldContent, newContent } = createDiffTabPlaceholder({
      path: "/repo/changed.ts",
      kind: "modified",
      additions: 2,
      deletions: 1,
    });

    expect(oldContent).toContain('const beforeLine1 = "changed.ts old 1";');
    expect(newContent).toContain('const afterLine1 = "changed.ts new 1";');
    expect(newContent).toContain('const afterLine2 = "changed.ts new 2";');
  });

  it("clamps line counts to the 1..12 range", () => {
    const zero = createDiffTabPlaceholder({ path: "/repo/a.ts", kind: "added", additions: 0, deletions: 0 });
    expect(zero.newContent).toContain('const addedLine1 = "a.ts line 1";');

    const huge = createDiffTabPlaceholder({ path: "/repo/b.ts", kind: "modified", additions: 999, deletions: 999 });
    expect(huge.oldContent).toContain('const beforeLine12 = "b.ts old 12";');
    expect(huge.oldContent).not.toContain("beforeLine13");
  });

  it("uses the file name (not the full path) in generated lines", () => {
    const { newContent } = createDiffTabPlaceholder({
      path: "/deep/nested/path/component.tsx",
      kind: "added",
      additions: 1,
      deletions: 0,
    });

    expect(newContent).toContain('"component.tsx line 1"');
  });
});
