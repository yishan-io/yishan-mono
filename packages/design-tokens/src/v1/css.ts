import { type DesignTokenThemeMode, SEMANTIC_COLOR_TOKENS } from "./index";

/** CSS custom properties mapped from the stable shared semantic color contract. */
export type CssThemeVariables = {
  "--yishan-color-background-app": string;
  "--yishan-color-background-editor": string;
  "--yishan-color-background-surface": string;
  "--yishan-color-border-default": string;
  "--yishan-color-text-secondary": string;
  "--yishan-color-editor-foreground": string;
  "--yishan-color-editor-line-number": string;
  "--yishan-color-editor-cursor": string;
  "--yishan-color-editor-gutter": string;
  "--yishan-color-syntax-comment": string;
  "--yishan-color-syntax-keyword": string;
  "--yishan-color-syntax-string": string;
  "--yishan-color-syntax-number": string;
  "--yishan-color-syntax-constant": string;
  "--yishan-color-syntax-function": string;
  "--yishan-color-syntax-type": string;
  "--yishan-color-syntax-tag": string;
  "--yishan-color-syntax-attribute": string;
  "--yishan-color-syntax-operator": string;
  "--yishan-color-syntax-delimiter": string;
  "--yishan-color-syntax-variable": string;
  "--yishan-color-action-selected": string;
  "--yishan-color-action-hover": string;
  "--yishan-color-git-diff-added": string;
  "--yishan-color-git-diff-modified": string;
  "--yishan-color-git-diff-deleted": string;
  "--yishan-color-git-inline-added-foreground": string;
  "--yishan-color-git-inline-added-background": string;
  "--yishan-color-git-inline-deleted-foreground": string;
  "--yishan-color-git-inline-deleted-background": string;
  "--yishan-color-git-pierre-fallback-added": string;
  "--yishan-color-git-pierre-fallback-deleted": string;
};

/** Builds CSS custom properties for a selected semantic theme mode without mutating the DOM. */
export function createCssThemeVariables(mode: DesignTokenThemeMode): CssThemeVariables {
  const semanticColors = SEMANTIC_COLOR_TOKENS[mode];

  return {
    "--yishan-color-background-app": semanticColors.background.app,
    "--yishan-color-background-editor": semanticColors.background.editor,
    "--yishan-color-background-surface": semanticColors.background.surface,
    "--yishan-color-border-default": semanticColors.border.default,
    "--yishan-color-text-secondary": semanticColors.text.secondary,
    "--yishan-color-editor-foreground": semanticColors.editor.foreground,
    "--yishan-color-editor-line-number": semanticColors.editor.lineNumber,
    "--yishan-color-editor-cursor": semanticColors.editor.cursor,
    "--yishan-color-editor-gutter": semanticColors.editor.gutter,
    "--yishan-color-syntax-comment": semanticColors.syntax.comment,
    "--yishan-color-syntax-keyword": semanticColors.syntax.keyword,
    "--yishan-color-syntax-string": semanticColors.syntax.string,
    "--yishan-color-syntax-number": semanticColors.syntax.number,
    "--yishan-color-syntax-constant": semanticColors.syntax.constant,
    "--yishan-color-syntax-function": semanticColors.syntax.function,
    "--yishan-color-syntax-type": semanticColors.syntax.type,
    "--yishan-color-syntax-tag": semanticColors.syntax.tag,
    "--yishan-color-syntax-attribute": semanticColors.syntax.attribute,
    "--yishan-color-syntax-operator": semanticColors.syntax.operator,
    "--yishan-color-syntax-delimiter": semanticColors.syntax.delimiter,
    "--yishan-color-syntax-variable": semanticColors.syntax.variable,
    "--yishan-color-action-selected": semanticColors.action.selected,
    "--yishan-color-action-hover": semanticColors.action.hover,
    "--yishan-color-git-diff-added": semanticColors.gitDiff.added,
    "--yishan-color-git-diff-modified": semanticColors.gitDiff.modified,
    "--yishan-color-git-diff-deleted": semanticColors.gitDiff.deleted,
    "--yishan-color-git-inline-added-foreground": semanticColors.gitDiff.inline.added.foreground,
    "--yishan-color-git-inline-added-background": semanticColors.gitDiff.inline.added.background,
    "--yishan-color-git-inline-deleted-foreground": semanticColors.gitDiff.inline.deleted.foreground,
    "--yishan-color-git-inline-deleted-background": semanticColors.gitDiff.inline.deleted.background,
    "--yishan-color-git-pierre-fallback-added": semanticColors.gitDiff.pierreFallback.added,
    "--yishan-color-git-pierre-fallback-deleted": semanticColors.gitDiff.pierreFallback.deleted,
  };
}
