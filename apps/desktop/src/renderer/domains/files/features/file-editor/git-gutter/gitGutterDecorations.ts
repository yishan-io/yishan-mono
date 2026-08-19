import { SEMANTIC_COLOR_TOKENS } from "@yishan-io/design-tokens";
import type { GitLineChange, GitLineChangeKind } from "../../../features/file-editor/git-gutter/gitGutterDiff";
import { monaco } from "../../../features/file-editor/monacoSetup";

// CSS class names injected for gutter decorations.
// These are defined in style.css and matched by Monaco's margin decoration class mechanism.
export const GUTTER_ADDED_CLASS = "git-gutter-added";
export const GUTTER_MODIFIED_CLASS = "git-gutter-modified";
export const GUTTER_DELETED_CLASS = "git-gutter-deleted";
export const GIT_GUTTER_DIFF_DEBOUNCE_MS = 150;
export const MAX_LIVE_GUTTER_DIFF_LINES = 5000;

// Overview ruler colors — match the CSS gutter colors in style.css (light and dark variants).
const RULER_ADDED_LIGHT = SEMANTIC_COLOR_TOKENS.light.gitDiff.added;
const RULER_MODIFIED_LIGHT = SEMANTIC_COLOR_TOKENS.light.gitDiff.modified;
const RULER_DELETED_LIGHT = SEMANTIC_COLOR_TOKENS.light.gitDiff.deleted;
const RULER_ADDED_DARK = SEMANTIC_COLOR_TOKENS.dark.gitDiff.added;
const RULER_MODIFIED_DARK = SEMANTIC_COLOR_TOKENS.dark.gitDiff.modified;
const RULER_DELETED_DARK = SEMANTIC_COLOR_TOKENS.dark.gitDiff.deleted;

export function getGutterClassName(kind: GitLineChange["kind"]): string {
  switch (kind) {
    case "added":
      return GUTTER_ADDED_CLASS;
    case "modified":
      return GUTTER_MODIFIED_CLASS;
    case "deleted":
      return GUTTER_DELETED_CLASS;
  }
}

export function getRulerColor(kind: GitLineChangeKind, isDark: boolean): string {
  switch (kind) {
    case "added":
      return isDark ? RULER_ADDED_DARK : RULER_ADDED_LIGHT;
    case "modified":
      return isDark ? RULER_MODIFIED_DARK : RULER_MODIFIED_LIGHT;
    case "deleted":
      return isDark ? RULER_DELETED_DARK : RULER_DELETED_LIGHT;
  }
}

/**
 * Converts computed line changes to Monaco model decoration options.
 * Each decoration also carries overview ruler metadata so diff positions
 * are visible on the right-rail scrollbar without scrolling.
 */
export function changesToDecorations(changes: GitLineChange[], isDark: boolean): monaco.editor.IModelDeltaDecoration[] {
  return changes.map((change) => {
    const className = getGutterClassName(change.kind);
    const rulerColor = getRulerColor(change.kind, isDark);

    if (change.kind === "deleted") {
      return {
        range: {
          startLineNumber: change.lineNumber,
          startColumn: 1,
          endLineNumber: change.lineNumber,
          endColumn: 1,
        },
        options: {
          isWholeLine: false,
          linesDecorationsClassName: className,
          overviewRulerColor: rulerColor,
          overviewRulerLane: monaco.editor.OverviewRulerLane.Full,
        },
      };
    }

    return {
      range: {
        startLineNumber: change.lineNumber,
        startColumn: 1,
        endLineNumber: change.lineNumber,
        endColumn: 1,
      },
      options: {
        isWholeLine: true,
        linesDecorationsClassName: className,
        overviewRulerColor: rulerColor,
        overviewRulerLane: monaco.editor.OverviewRulerLane.Full,
      },
    };
  });
}
