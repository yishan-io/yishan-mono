// @vitest-environment jsdom

import { SEMANTIC_COLOR_TOKENS } from "@yishan-io/design-tokens";
import { describe, expect, it } from "vitest";
import type { GitLineChange } from "../../../helpers/gitGutterDiff";
import {
  GUTTER_ADDED_CLASS,
  GUTTER_DELETED_CLASS,
  GUTTER_MODIFIED_CLASS,
  changesToDecorations,
  getGutterClassName,
  getRulerColor,
} from "./gitGutterDecorations";

function change(partial: Partial<GitLineChange> & { lineNumber: number; kind: GitLineChange["kind"] }): GitLineChange {
  return { ...partial };
}

describe("gitGutterDecorations model", () => {
  it("maps change kinds to gutter CSS classes", () => {
    expect(getGutterClassName("added")).toBe(GUTTER_ADDED_CLASS);
    expect(getGutterClassName("modified")).toBe(GUTTER_MODIFIED_CLASS);
    expect(getGutterClassName("deleted")).toBe(GUTTER_DELETED_CLASS);
  });

  it("selects light vs dark overview ruler colors", () => {
    expect(getRulerColor("added", false)).toBe(SEMANTIC_COLOR_TOKENS.light.gitDiff.added);
    expect(getRulerColor("added", true)).toBe(SEMANTIC_COLOR_TOKENS.dark.gitDiff.added);
    expect(getRulerColor("modified", false)).toBe(SEMANTIC_COLOR_TOKENS.light.gitDiff.modified);
    expect(getRulerColor("deleted", false)).toBe(SEMANTIC_COLOR_TOKENS.light.gitDiff.deleted);
  });

  it("builds whole-line decorations for added and modified changes with ruler metadata", () => {
    const decorations = changesToDecorations(
      [
        change({ lineNumber: 3, kind: "added" }),
        change({ lineNumber: 7, kind: "modified" }),
      ],
      false,
    );

    expect(decorations).toHaveLength(2);
    expect(decorations[0].range.startLineNumber).toBe(3);
    expect(decorations[0].options.isWholeLine).toBe(true);
    expect(decorations[0].options.linesDecorationsClassName).toBe(GUTTER_ADDED_CLASS);
    expect(decorations[0].options.overviewRulerColor).toBe(SEMANTIC_COLOR_TOKENS.light.gitDiff.added);
    expect(decorations[1].options.linesDecorationsClassName).toBe(GUTTER_MODIFIED_CLASS);
  });

  it("builds non-whole-line decorations for deleted changes", () => {
    const decorations = changesToDecorations([change({ lineNumber: 5, kind: "deleted" })], true);

    expect(decorations).toHaveLength(1);
    expect(decorations[0].options.isWholeLine).toBe(false);
    expect(decorations[0].options.linesDecorationsClassName).toBe(GUTTER_DELETED_CLASS);
    expect(decorations[0].options.overviewRulerColor).toBe(SEMANTIC_COLOR_TOKENS.dark.gitDiff.deleted);
  });
});
