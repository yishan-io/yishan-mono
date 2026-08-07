import { describe, expect, it } from "vitest";
import { normalizeMarkdown, shouldApplyExternalContent } from "./editorContentSync";

describe("normalizeMarkdown", () => {
  it("trims a single trailing newline", () => {
    expect(normalizeMarkdown("hello\n")).toBe("hello");
  });

  it("trims multiple trailing newlines", () => {
    expect(normalizeMarkdown("hello\n\n\n")).toBe("hello");
  });

  it("preserves content without trailing newlines", () => {
    expect(normalizeMarkdown("hello")).toBe("hello");
  });

  it("preserves internal newlines", () => {
    expect(normalizeMarkdown("line1\nline2")).toBe("line1\nline2");
  });

  it("returns empty string for newline-only input", () => {
    expect(normalizeMarkdown("\n")).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeMarkdown("")).toBe("");
  });

  it("collapses CRLF to LF before trimming", () => {
    expect(normalizeMarkdown("hello\r\nworld\r\n")).toBe("hello\nworld");
  });

  it("handles mixed CRLF and LF", () => {
    expect(normalizeMarkdown("line1\r\nline2\n\r\n")).toBe("line1\nline2");
  });

  it("handles CRLF-only content", () => {
    expect(normalizeMarkdown("\r\n")).toBe("");
  });
});

describe("shouldApplyExternalContent", () => {
  it("returns false when content is the same", () => {
    expect(shouldApplyExternalContent("# hello", "# hello")).toBe(false);
  });

  it("returns false when only trailing-newline differs in incoming", () => {
    expect(shouldApplyExternalContent("# hello", "# hello\n")).toBe(false);
  });

  it("returns false when only trailing-newline differs in emitted", () => {
    expect(shouldApplyExternalContent("# hello\n", "# hello")).toBe(false);
  });

  it("returns true when content genuinely differs", () => {
    expect(shouldApplyExternalContent("# hello", "# goodbye")).toBe(true);
  });

  it("returns false for both empty", () => {
    expect(shouldApplyExternalContent("", "")).toBe(false);
  });

  it("returns true when emitted is empty and incoming has content", () => {
    expect(shouldApplyExternalContent("", "# new")).toBe(true);
  });

  it("returns true when incoming is empty and emitted has content", () => {
    expect(shouldApplyExternalContent("# old", "")).toBe(true);
  });

  it("returns false when incoming uses CRLF but content matches", () => {
    expect(shouldApplyExternalContent("# hello\n", "# hello\r\n")).toBe(false);
  });

  it("returns false when emitted uses CRLF and incoming matches", () => {
    expect(shouldApplyExternalContent("# hello\r\n", "# hello\n")).toBe(false);
  });
});
