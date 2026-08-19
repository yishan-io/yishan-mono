// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { extractMarkdownOutline } from "./markdownOutlineTree";

function makeContainer(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

describe("extractMarkdownOutline", () => {
  it("returns an empty result when no headings exist", () => {
    const container = makeContainer("<p>hello</p>");
    const outline = extractMarkdownOutline(container);

    expect(outline.items).toEqual([]);
    expect(outline.entries).toEqual([]);
  });

  it("builds a nested heading hierarchy", () => {
    const container = makeContainer(`
      <h1>Intro</h1>
      <h2>Setup</h2>
      <h3>Install</h3>
      <h2>Usage</h2>
    `);

    const outline = extractMarkdownOutline(container);

    expect(outline.items).toEqual([
      {
        id: "intro",
        title: "Intro",
        level: 1,
        children: [
          {
            id: "setup",
            title: "Setup",
            level: 2,
            children: [
              {
                id: "install",
                title: "Install",
                level: 3,
                children: [],
              },
            ],
          },
          {
            id: "usage",
            title: "Usage",
            level: 2,
            children: [],
          },
        ],
      },
    ]);
  });

  it("assigns deterministic unique IDs for duplicate headings", () => {
    const container = makeContainer(`
      <h2>Overview</h2>
      <h2>Overview</h2>
      <h2>Overview</h2>
    `);

    const outline = extractMarkdownOutline(container);

    expect(outline.entries.map((entry) => entry.id)).toEqual(["overview", "overview-2", "overview-3"]);
    expect(Array.from(container.querySelectorAll("h2")).map((heading) => heading.id)).toEqual([
      "overview",
      "overview-2",
      "overview-3",
    ]);
  });

  it("nests skipped heading levels under the nearest shallower parent", () => {
    const container = makeContainer(`
      <h1>Root</h1>
      <h3>Deep Child</h3>
      <h2>Sibling</h2>
    `);

    const outline = extractMarkdownOutline(container);

    expect(outline.items).toEqual([
      {
        id: "root",
        title: "Root",
        level: 1,
        children: [
          {
            id: "deep-child",
            title: "Deep Child",
            level: 3,
            children: [],
          },
          {
            id: "sibling",
            title: "Sibling",
            level: 2,
            children: [],
          },
        ],
      },
    ]);
  });

  it("preserves existing IDs while deconflicting duplicates", () => {
    const container = makeContainer(`
      <h2 id="custom-id">Alpha</h2>
      <h2 id="custom-id">Beta</h2>
    `);

    const outline = extractMarkdownOutline(container);

    expect(outline.entries.map((entry) => entry.id)).toEqual(["custom-id", "custom-id-2"]);
    expect(Array.from(container.querySelectorAll("h2")).map((heading) => heading.id)).toEqual([
      "custom-id",
      "custom-id-2",
    ]);
  });
});
