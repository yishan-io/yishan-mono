// @vitest-environment jsdom

import { SEMANTIC_COLOR_TOKENS } from "@yishan-io/design-tokens";
import { describe, expect, it, vi } from "vitest";
import type { GitLineChange } from "../../../model/gitGutterDiff";
import {
  GUTTER_ADDED_CLASS,
  GUTTER_DELETED_CLASS,
  GUTTER_MODIFIED_CLASS,
  changesToDecorations,
  getGutterClassName,
  getRulerColor,
} from "./gitGutterDecorations";

vi.mock("../../../infrastructure/monacoSetup", () => ({
  monaco: {
    editor: {
      OverviewRulerLane: { Full: 7 },
    },
  },
}));

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
      [change({ lineNumber: 3, kind: "added" }), change({ lineNumber: 7, kind: "modified" })],
      false,
    );

    const first = decorations[0]!;
    const second = decorations[1]!;
    expect(first.range.startLineNumber).toBe(3);
    expect(first.options.isWholeLine).toBe(true);
    expect(first.options.linesDecorationsClassName).toBe(GUTTER_ADDED_CLASS);
    expect((first.options as { overviewRulerColor?: string }).overviewRulerColor).toBe(
      SEMANTIC_COLOR_TOKENS.light.gitDiff.added,
    );
    expect(second.options.linesDecorationsClassName).toBe(GUTTER_MODIFIED_CLASS);
  });

  it("builds non-whole-line decorations for deleted changes", () => {
    const decorations = changesToDecorations([change({ lineNumber: 5, kind: "deleted" })], true);

    const decoration = decorations[0]!;
    expect(decoration.options.isWholeLine).toBe(false);
    expect(decoration.options.linesDecorationsClassName).toBe(GUTTER_DELETED_CLASS);
    expect((decoration.options as { overviewRulerColor?: string }).overviewRulerColor).toBe(
      SEMANTIC_COLOR_TOKENS.dark.gitDiff.deleted,
    );
  });
});
