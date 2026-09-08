// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { findMentionRange, renderComposerHtml } from "./richComposerText";

describe("findMentionRange", () => {
  it("returns a range for a bare @ token", () => {
    expect(findMentionRange("@", 1)).toEqual({ start: 0, end: 1, query: "" });
  });

  it("returns a range with the query after the @", () => {
    expect(findMentionRange("look at @src/foo.ts", 19)).toEqual({ start: 8, end: 19, query: "src/foo.ts" });
  });

  it("returns a range when the caret sits mid-token, extending the end to the full token", () => {
    expect(findMentionRange("@src/foo.ts", 7)).toEqual({ start: 0, end: 11, query: "src/fo" });
  });

  it("extends the range end past the caret but not past the mention charset", () => {
    expect(findMentionRange("see @src/foo.ts!", 11)).toEqual({ start: 4, end: 15, query: "src/fo" });
  });

  it("returns a range when the token follows a newline", () => {
    expect(findMentionRange("first\n@src", 10)).toEqual({ start: 6, end: 10, query: "src" });
  });

  it("does not match a token that does not start with @", () => {
    expect(findMentionRange("hello@world", 11)).toBeNull();
  });

  it("does not match @ appearing mid-word", () => {
    expect(findMentionRange("user@example.com", 16)).toBeNull();
  });

  it("does not match a token containing characters outside the mention charset", () => {
    expect(findMentionRange("@src/foo!bar", 12)).toBeNull();
  });

  it("does not match when the caret token is a plain word after the @ token", () => {
    expect(findMentionRange("check @src now", 13)).toBeNull();
  });

  it("returns null for an empty value", () => {
    expect(findMentionRange("", 0)).toBeNull();
  });

  it("returns null when the caret offset is out of bounds", () => {
    expect(findMentionRange("@src", 0)).toBeNull();
    expect(findMentionRange("@src", 10)).toBeNull();
  });
});

describe("renderComposerHtml", () => {
  it("preserves ordinary quotes and escapes URL href attributes independently", () => {
    const text = `He said "ready" <img src=x onerror=alert(1)> https://example.com/?q="quoted"&next='value'`;
    const container = document.createElement("div");
    container.innerHTML = renderComposerHtml(text);

    const link = container.querySelector("a");
    expect(container.textContent).toBe(text);
    expect(link?.getAttribute("href")).toBe(`https://example.com/?q="quoted"&next='value'`);
    expect(link?.getAttribute("onclick")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).toContain('He said "ready"');
  });
});
