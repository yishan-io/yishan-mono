import { describe, expect, it } from "vitest";
import { sortLocalTaskTagsSelectedFirst } from "./localTaskTagOptions";

describe("sortLocalTaskTagsSelectedFirst", () => {
  it("places selected options first while preserving each group's order", () => {
    const tags = [
      { id: "frontend", selected: false },
      { id: "backend", selected: true },
      { id: "design", selected: false },
      { id: "api", selected: true },
    ];

    expect(sortLocalTaskTagsSelectedFirst(tags, (tag) => tag.selected).map((tag) => tag.id)).toEqual([
      "backend",
      "api",
      "frontend",
      "design",
    ]);
    expect(tags.map((tag) => tag.id)).toEqual(["frontend", "backend", "design", "api"]);
  });
});
