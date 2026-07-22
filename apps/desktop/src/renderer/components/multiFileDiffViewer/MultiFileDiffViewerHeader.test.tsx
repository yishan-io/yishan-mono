import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("MultiFileDiffViewerHeader git status fallback chain", () => {
  it("uses Pierre bases before the shared legacy fallbacks", () => {
    const source = readFileSync(new URL("./MultiFileDiffViewerHeader.tsx", import.meta.url), "utf8");

    expect(source).toContain("var(--diffs-addition-base, var(--yishan-color-git-pierre-fallback-added))");
    expect(source).toContain("var(--diffs-deletion-base, var(--yishan-color-git-pierre-fallback-deleted))");
    expect(source).not.toContain("var(--diffs-addition-base, #0dbe4e)");
    expect(source).not.toContain("var(--diffs-deletion-base, #ff2e3f)");
  });
});
