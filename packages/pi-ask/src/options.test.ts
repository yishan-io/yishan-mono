import { describe, expect, it } from "vitest";

import { normalizeAskOption, normalizeAskOptions, normalizeAskToolParams } from "./options";

describe("normalizeAskOption", () => {
  it("normalizes plain string options", () => {
    expect(normalizeAskOption(" staging ")).toEqual({ title: "staging" });
  });

  it("normalizes object options with title and description", () => {
    expect(normalizeAskOption({ title: "production", description: "Customer-facing" })).toEqual({
      title: "production",
      description: "Customer-facing",
    });
  });

  it("rejects object options without a title", () => {
    expect(normalizeAskOption({ label: "alpha" })).toBeNull();
    expect(normalizeAskOption({ text: "beta" })).toBeNull();
  });

  it("rejects invalid options", () => {
    expect(normalizeAskOption(" ")).toBeNull();
    expect(normalizeAskOption({})).toBeNull();
  });
});

describe("normalizeAskOptions", () => {
  it("filters invalid options and preserves valid ones", () => {
    expect(normalizeAskOptions(["A", " ", { title: "B" }, {}])).toEqual([{ title: "A" }, { title: "B" }]);
  });
});

describe("normalizeAskToolParams", () => {
  it("keeps canonical option objects", () => {
    expect(
      normalizeAskToolParams({
        question: "Which option?",
        options: [{ title: "A" }, { title: "B", description: "Second" }],
      }),
    ).toEqual({
      question: "Which option?",
      options: [{ title: "A" }, { title: "B", description: "Second" }],
    });
  });

  it("filters obviously invalid non-object option values", () => {
    expect(
      normalizeAskToolParams({
        question: "Which option?",
        options: ["A", 1, null, { label: "B" }],
      }),
    ).toEqual({
      question: "Which option?",
      options: ["A"],
    });
  });
});
