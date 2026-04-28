import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetFileSearchProvider, searchFiles, setFileSearchProvider } from "./fileSearch";

describe("searchFiles", () => {
  beforeEach(() => {
    resetFileSearchProvider();
  });

  it("prefers filename matches over path-only matches", () => {
    const results = searchFiles(
      ["packages/logger/src/file-search.ts", "src/features/search/index.ts", "docs/search-notes.md"],
      "sear",
    );

    expect(results.map((result) => result.path)).toEqual([
      "docs/search-notes.md",
      "packages/logger/src/file-search.ts",
      "src/features/search/index.ts",
    ]);
  });

  it("supports fuzzy subsequence matching on filenames", () => {
    const results = searchFiles(["src/components/FileManagerView.tsx", "src/views/TerminalView.tsx"], "fmv");

    expect(results).toHaveLength(1);
    expect(results[0]?.path).toBe("src/components/FileManagerView.tsx");
    expect(results[0]?.highlightedPathIndexes.length).toBe(3);
  });

  it("matches directory names with trailing slashes", () => {
    const results = searchFiles(["cmd/", "src/components/Button.tsx"], "cmd");

    expect(results).toHaveLength(1);
    expect(results[0]?.path).toBe("cmd/");
    expect(results[0]?.highlightedPathIndexes).toEqual([0, 1, 2]);
  });

  it("matches query against path segments when filename does not match", () => {
    const results = searchFiles(["apps/desktop/src/renderer/views/workspace/RightPane/RightPaneView.tsx"], "rendr");

    expect(results).toHaveLength(1);
    expect(results[0]?.path).toContain("renderer");
    expect(results[0]?.highlightedPathIndexes).toHaveLength(5);
  });

  it("matches space-separated query terms against the full file path", () => {
    const results = searchFiles(
      ["apps/desktop/src/renderer/views/workspace/RightPane/RightPaneView.tsx", "src/views/TerminalView.tsx"],
      "renderer rightpane",
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.path).toBe("apps/desktop/src/renderer/views/workspace/RightPane/RightPaneView.tsx");
    expect(results[0]?.highlightedPathIndexes).toHaveLength("rendererrightpane".length);
  });

  it("returns all files for empty query ordered by path length then alphabetically", () => {
    const results = searchFiles(["z.ts", "src/a.ts", "a.ts"], "  ");

    expect(results.map((result) => result.path)).toEqual(["a.ts", "z.ts", "src/a.ts"]);
  });

  it("delegates to an injected provider for future backend integration", () => {
    const providerSearchFiles = vi
      .fn()
      .mockReturnValue([{ path: "backend/result.ts", score: 1234, highlightedPathIndexes: [0, 1] }]);
    setFileSearchProvider({ searchFiles: providerSearchFiles });

    const results = searchFiles(["src/a.ts"], "a");

    expect(providerSearchFiles).toHaveBeenCalledWith(["src/a.ts"], "a");
    expect(results).toEqual([{ path: "backend/result.ts", score: 1234, highlightedPathIndexes: [0, 1] }]);
  });
});
