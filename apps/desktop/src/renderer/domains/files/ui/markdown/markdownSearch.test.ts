// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { clearHighlights, highlightMatches, setActiveMatch } from "./markdownSearch";

function makeContainer(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

describe("highlightMatches", () => {
  it("returns 0 and inserts no marks for an empty query", () => {
    const container = makeContainer("<p>hello world</p>");
    const count = highlightMatches(container, "");
    expect(count).toBe(0);
    expect(container.querySelectorAll("mark.md-find-highlight")).toHaveLength(0);
  });

  it("returns 0 and inserts no marks when there is no match", () => {
    const container = makeContainer("<p>hello world</p>");
    const count = highlightMatches(container, "xyz");
    expect(count).toBe(0);
    expect(container.querySelectorAll("mark.md-find-highlight")).toHaveLength(0);
  });

  it("wraps a single match in a <mark> and returns 1", () => {
    const container = makeContainer("<p>hello world</p>");
    const count = highlightMatches(container, "world");
    expect(count).toBe(1);
    const marks = container.querySelectorAll("mark.md-find-highlight");
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe("world");
  });

  it("wraps multiple matches across text nodes", () => {
    const container = makeContainer("<p>foo bar foo</p>");
    const count = highlightMatches(container, "foo");
    expect(count).toBe(2);
    expect(container.querySelectorAll("mark.md-find-highlight")).toHaveLength(2);
  });

  it("matches case-insensitively", () => {
    const container = makeContainer("<p>Hello HELLO hello</p>");
    const count = highlightMatches(container, "hello");
    expect(count).toBe(3);
    const marks = container.querySelectorAll("mark.md-find-highlight");
    expect(marks).toHaveLength(3);
    // Original casing preserved inside the mark
    expect(marks[0]?.textContent).toBe("Hello");
    expect(marks[1]?.textContent).toBe("HELLO");
    expect(marks[2]?.textContent).toBe("hello");
  });

  it("matches across sibling elements", () => {
    const container = makeContainer("<p>find me</p><p>also find me here</p>");
    const count = highlightMatches(container, "find");
    expect(count).toBe(2);
  });

  it("is idempotent — calling twice does not double-wrap", () => {
    const container = makeContainer("<p>hello world</p>");
    highlightMatches(container, "hello");
    const count2 = highlightMatches(container, "hello");
    expect(count2).toBe(1);
    expect(container.querySelectorAll("mark.md-find-highlight")).toHaveLength(1);
  });
});

describe("clearHighlights", () => {
  it("removes all marks and restores text", () => {
    const container = makeContainer("<p>hello world</p>");
    highlightMatches(container, "hello");
    clearHighlights(container);
    expect(container.querySelectorAll("mark.md-find-highlight")).toHaveLength(0);
    expect(container.textContent).toBe("hello world");
  });

  it("is a no-op when there are no marks", () => {
    const container = makeContainer("<p>hello world</p>");
    expect(() => clearHighlights(container)).not.toThrow();
    expect(container.textContent).toBe("hello world");
  });
});

describe("setActiveMatch", () => {
  it("adds active class to the correct mark and removes it from others", () => {
    const container = makeContainer("<p>a a a</p>");
    highlightMatches(container, "a");
    setActiveMatch(container, 1);
    const marks = Array.from(container.querySelectorAll("mark.md-find-highlight"));
    expect(marks[0]?.classList.contains("md-find-highlight-active")).toBe(false);
    expect(marks[1]?.classList.contains("md-find-highlight-active")).toBe(true);
    expect(marks[2]?.classList.contains("md-find-highlight-active")).toBe(false);
  });

  it("is a no-op when there are no marks", () => {
    const container = makeContainer("<p>hello</p>");
    expect(() => setActiveMatch(container, 0)).not.toThrow();
  });
});
