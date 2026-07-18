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

  it("accepts alias keys for option titles", () => {
    expect(normalizeAskOption({ label: "alpha" })).toEqual({ title: "alpha" });
    expect(normalizeAskOption({ text: "beta" })).toEqual({ title: "beta" });
    expect(normalizeAskOption({ value: "gamma" })).toEqual({ title: "gamma" });
    expect(normalizeAskOption({ name: "delta" })).toEqual({ title: "delta" });
    expect(normalizeAskOption({ option: "epsilon" })).toEqual({ title: "epsilon" });
  });

  it("rejects invalid options", () => {
    expect(normalizeAskOption(" ")).toBeNull();
    expect(normalizeAskOption({})).toBeNull();
  });
});

describe("normalizeAskOptions", () => {
  it("filters invalid options and preserves valid ones", () => {
    expect(normalizeAskOptions(["A", " ", { label: "B" }, {}])).toEqual([{ title: "A" }, { title: "B" }]);
  });
});

describe("normalizeAskToolParams", () => {
  it("preserves alias-style option objects for later normalization", () => {
    expect(
      normalizeAskToolParams({
        question: "Which option?",
        options: [{ label: "A" }, { text: "B" }],
      }),
    ).toEqual({
      question: "Which option?",
      options: [{ label: "A" }, { text: "B" }],
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
      options: ["A", { label: "B" }],
    });
  });
});
