// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildReadSummary, getToolDisplayPath } from "./diff";

describe("getToolDisplayPath", () => {
  it("returns rawPath as-is when no workspacePath", () => {
    expect(getToolDisplayPath("/tmp/project/src/foo.ts")).toBe("/tmp/project/src/foo.ts");
  });

  it("returns relative paths as-is", () => {
    expect(getToolDisplayPath("src/foo.ts", "/tmp/project")).toBe("src/foo.ts");
  });

  it("strips workspace prefix from absolute paths under workspace", () => {
    expect(getToolDisplayPath("/tmp/project/src/foo.ts", "/tmp/project")).toBe("src/foo.ts");
  });

  it("strips workspace prefix when workspace has trailing slash", () => {
    expect(getToolDisplayPath("/tmp/project/src/foo.ts", "/tmp/project/")).toBe("src/foo.ts");
  });

  it("returns absolute path as-is when outside workspace", () => {
    expect(getToolDisplayPath("/etc/foo.ts", "/tmp/project")).toBe("/etc/foo.ts");
  });

  it("returns absolute path as-is when prefix only partially matches", () => {
    expect(getToolDisplayPath("/tmp/projects/src/foo.ts", "/tmp/project")).toBe("/tmp/projects/src/foo.ts");
  });

  it("handles deep workspace paths", () => {
    expect(getToolDisplayPath("/home/user/work/yishan-mono/apps/cli/main.go", "/home/user/work/yishan-mono")).toBe(
      "apps/cli/main.go",
    );
  });

  it("returns '.' when rawPath equals workspace root", () => {
    expect(getToolDisplayPath("/tmp/project/", "/tmp/project")).toBe(".");
  });

  it("returns '.' when rawPath equals workspace root without trailing slash", () => {
    expect(getToolDisplayPath("/tmp/project", "/tmp/project")).toBe(".");
  });
});

describe("buildReadSummary", () => {
  it("returns pathLabel with workspace-relative path when under workspace", () => {
    const result = buildReadSummary("/tmp/project/src/foo.ts", undefined, undefined, "/tmp/project");
    expect(result.pathLabel).toBe("src/foo.ts");
    expect(result.lineRange).toBeNull();
  });

  it("returns pathLabel unchanged when outside workspace", () => {
    const result = buildReadSummary("/etc/foo.ts", undefined, undefined, "/tmp/project");
    expect(result.pathLabel).toBe("/etc/foo.ts");
    expect(result.lineRange).toBeNull();
  });

  it("includes line range with relative path when offset and limit provided", () => {
    const result = buildReadSummary("/tmp/project/src/foo.ts", 5, 10, "/tmp/project");
    expect(result.pathLabel).toBe("src/foo.ts:");
    expect(result.lineRange).toBe("5-14");
  });

  it("returns raw pathLabel when no workspacePath", () => {
    const result = buildReadSummary("/tmp/project/src/foo.ts", undefined, undefined);
    expect(result.pathLabel).toBe("/tmp/project/src/foo.ts");
    expect(result.lineRange).toBeNull();
  });
});
