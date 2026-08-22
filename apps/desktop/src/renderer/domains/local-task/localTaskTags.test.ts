import { describe, expect, it } from "vitest";
import {
  MAX_LOCAL_TASK_TAGS,
  MAX_LOCAL_TASK_TAG_CODE_POINTS,
  getLocalTaskTagsValidationError,
  normalizeLocalTaskTag,
} from "./localTaskTags";

describe("Local Task tag UX validation", () => {
  it("trims and NFC-normalizes display text without changing its spelling", () => {
    expect(normalizeLocalTaskTag("  Cafe\u0301  ")).toBe("Café");
    expect(normalizeLocalTaskTag("  Straße  ")).toBe("Straße");
  });

  it.each([
    ["empty", ["  "], "Tags cannot be empty."],
    [
      "over the tag limit",
      Array.from({ length: MAX_LOCAL_TASK_TAGS + 1 }, (_, index) => `tag-${index}`),
      `A task can have at most ${MAX_LOCAL_TASK_TAGS} tags.`,
    ],
    [
      "over the code-point limit",
      ["a".repeat(MAX_LOCAL_TASK_TAG_CODE_POINTS + 1)],
      `Tags can contain at most ${MAX_LOCAL_TASK_TAG_CODE_POINTS} characters.`,
    ],
    ["basic case duplicate", ["Desktop", " desktop "], "Tags must be unique."],
  ])("rejects %s", (_name, tags, expectedError) => {
    expect(getLocalTaskTagsValidationError(tags)).toBe(expectedError);
  });

  it("does not reproduce daemon Unicode case folding", () => {
    expect(getLocalTaskTagsValidationError(["Straße", "STRASSE"])).toBeNull();
  });

  it("accepts a tag at the Unicode code-point limit", () => {
    expect(getLocalTaskTagsValidationError(["🧪".repeat(MAX_LOCAL_TASK_TAG_CODE_POINTS)])).toBeNull();
  });
});
