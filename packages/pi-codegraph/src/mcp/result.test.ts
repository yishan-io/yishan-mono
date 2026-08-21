import { readFileSync, rmSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { boundedDiagnostic, formatCodeGraphResult, normalizeCodeGraphFiles } from "./result";

describe("CodeGraph MCP results", () => {
  it("normalizes absolute paths inside the project to root-relative POSIX paths", () => {
    expect(normalizeCodeGraphFiles("/project/src/a.ts\n/project/nested/b.ts\n/other/c.ts", "/project")).toBe(
      "src/a.ts\nnested/b.ts\n/other/c.ts",
    );
  });

  it("adds an actionable hint when a supplied file filter has no matches", () => {
    expect(normalizeCodeGraphFiles("No files matched pattern", "/project", { pattern: "*.rs" })).toBe(
      "No files matched pattern\n[No files matched the supplied filter. Try a broader path or pattern.]",
    );
  });

  it("adds an actionable hint for CodeGraph's no-files-found response", () => {
    expect(normalizeCodeGraphFiles("No files found matching the criteria.", "/project", { pattern: "*.rs" })).toBe(
      "No files found matching the criteria.\n[No files matched the supplied filter. Try a broader path or pattern.]",
    );
  });

  it("redacts bearer authorization and api-key command arguments", () => {
    expect(
      boundedDiagnostic(
        "Authorization: Bearer bearer-secret --api-key command-secret --api-key=equals-secret Authorization: Bearer=equals-bearer",
      ),
    ).toBe(
      "Authorization: Bearer [REDACTED] --api-key [REDACTED] --api-key=[REDACTED] Authorization: Bearer=[REDACTED]",
    );
  });

  it("truncates output by Pi byte and line limits and persists complete output", () => {
    const output = "one\ntwo\nthree\nfour";
    const formatted = formatCodeGraphResult(output, { maxLines: 2, maxBytes: 100 });
    expect(formatted.text).toContain("one\ntwo");
    expect(formatted.text).toContain("Full output:");
    expect(formatted.details?.fullOutputPath).toBeTruthy();
    expect(readFileSync(formatted.details?.fullOutputPath ?? "", "utf8")).toBe(output);
    rmSync(formatted.details?.fullOutputPath ?? "", { force: true });

    const bytes = formatCodeGraphResult("🙂🙂🙂", { maxLines: 10, maxBytes: 5 });
    expect(bytes.details?.truncation.truncatedBy).toBe("bytes");
    rmSync(bytes.details?.fullOutputPath ?? "", { force: true });
  });
});
