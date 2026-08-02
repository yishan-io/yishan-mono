import type { ResolvedServer } from "@pi-lsp/types";
import { describe, expect, it } from "vitest";
import {
  buildReadSummary,
  getLspFixStatusColor,
  getToolDisplayPath,
  parseLspDiagnosticsSummary,
  parseLspFixSummary,
  parseWorkspaceListCount,
} from "./helpers";

describe("parseWorkspaceListCount", () => {
  it("returns null for empty string", () => {
    expect(parseWorkspaceListCount("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(parseWorkspaceListCount("   \n  ")).toBeNull();
  });

  it("returns 0 for the no-workspaces plain-text response", () => {
    expect(parseWorkspaceListCount("No workspaces are currently open.")).toBe(0);
  });

  it("returns 0 for the no-workspaces response with a leading newline", () => {
    expect(parseWorkspaceListCount("\nNo workspaces are currently open.")).toBe(0);
  });

  it("returns the array length for a valid JSON workspace array", () => {
    const content = JSON.stringify([
      { id: "ws-1", path: "/tmp/ws1" },
      { id: "ws-2", path: "/tmp/ws2" },
      { id: "ws-3", path: "/tmp/ws3" },
    ]);
    expect(parseWorkspaceListCount(content)).toBe(3);
  });

  it("returns 0 for an empty JSON array", () => {
    expect(parseWorkspaceListCount("[]")).toBe(0);
  });

  it("returns null for valid JSON that is not an array", () => {
    expect(parseWorkspaceListCount('{"workspaces": []}')).toBeNull();
  });

  it("returns null for unparseable JSON that is not the no-workspaces message", () => {
    expect(parseWorkspaceListCount("failed to list workspaces: connection refused")).toBeNull();
  });
});

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

describe("parseLspDiagnosticsSummary", () => {
  it("returns null for empty text", () => {
    expect(parseLspDiagnosticsSummary("")).toBeNull();
  });

  it("parses a single-server diagnostics header", () => {
    const summary = parseLspDiagnosticsSummary(
      "biome LSP diagnostics: 3 diagnostic(s) across 2 file(s).\n\nsrc/a.ts:1:1: error: message",
    );
    expect(summary).toEqual({ servers: ["biome"], totalDiagnostics: 3, totalFiles: 2 });
  });

  it("parses multiple server sections", () => {
    const summary = parseLspDiagnosticsSummary(
      [
        "biome diagnostics",
        "",
        "biome LSP diagnostics: 3 diagnostic(s) across 2 file(s).",
        "",
        "---",
        "",
        "gopls diagnostics",
        "",
        "gopls LSP diagnostics: 1 diagnostic(s) across 1 file(s).",
      ].join("\n"),
    );
    expect(summary).toEqual({
      servers: ["biome", "gopls"],
      totalDiagnostics: 4,
      totalFiles: 3,
    });
  });

  it("parses a zero-diagnostic run", () => {
    expect(parseLspDiagnosticsSummary("biome LSP diagnostics: 0 diagnostic(s) across 2 file(s).")).toEqual({
      servers: ["biome"],
      totalDiagnostics: 0,
      totalFiles: 2,
    });
  });

  it("returns null when no header line exists", () => {
    expect(parseLspDiagnosticsSummary("Skipped unavailable default LSP server(s): rust-analyzer.")).toBeNull();
  });
});

describe("parseLspFixSummary", () => {
  it("returns null for empty text", () => {
    expect(parseLspFixSummary("")).toBeNull();
  });

  it("parses an updated outcome", () => {
    expect(parseLspFixSummary("biome LSP fix updated src/a.ts.")).toEqual({
      server: "biome",
      status: "updated",
      path: "src/a.ts",
    });
  });

  it("parses a computed-changes outcome", () => {
    expect(parseLspFixSummary("gopls LSP fix computed changes for main.go.")).toEqual({
      server: "gopls",
      status: "computed",
      path: "main.go",
    });
  });

  it("parses an unchanged outcome", () => {
    expect(parseLspFixSummary("biome LSP fix left unchanged src/app.test.ts.")).toEqual({
      server: "biome",
      status: "unchanged",
      path: "src/app.test.ts",
    });
  });

  it("returns null for unrelated text", () => {
    expect(parseLspFixSummary("biome LSP returned overlapping edits; use a narrower kind.")).toBeNull();
  });
});

describe("getLspFixStatusColor", () => {
  it("maps outcomes to colors", () => {
    expect(getLspFixStatusColor("updated")).toBe("success.main");
    expect(getLspFixStatusColor("computed")).toBe("info.main");
    expect(getLspFixStatusColor("unchanged")).toBe("text.secondary");
  });
});

describe("LSP parsers against the real extension formatters", () => {
  it("parses formatDiagnostics output", async () => {
    const { formatDiagnostics } = await import("@pi-lsp/tools/result");
    const server: ResolvedServer = {
      name: "biome",
      isDefault: false,
      command: { command: "biome", args: ["lsp-proxy"] },
      missingCommandHint: "install biome",
      extensions: [".ts"],
      skipDirectories: new Set<string>(),
      isSupportedFile: () => false,
      languageIdFor: () => "typescript",
    };
    const text = formatDiagnostics(server, [
      {
        path: "src/a.ts",
        uri: "file:///root/src/a.ts",
        diagnostics: [
          {
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
            severity: 1,
            message: "first",
          },
          {
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 1 } },
            severity: 2,
            message: "second",
          },
        ],
      },
      { path: "src/b.ts", uri: "file:///root/src/b.ts", diagnostics: [] },
    ]);

    expect(parseLspDiagnosticsSummary(text)).toEqual({
      servers: ["biome"],
      totalDiagnostics: 2,
      totalFiles: 2,
    });
  });

  it("parses formatEditSummary output", async () => {
    const { formatEditSummary } = await import("@pi-lsp/tools/result");
    const text = formatEditSummary("biome", "/root", "/root/src/a.ts", true, false, "const a = 1;");

    expect(parseLspFixSummary(text)).toEqual({
      server: "biome",
      status: "computed",
      path: "src/a.ts",
    });
  });
});
