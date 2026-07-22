import { type DesignTokenThemeMode, SEMANTIC_COLOR_TOKENS } from "./index";

/** CSS custom properties mapped from the stable shared semantic color contract. */
export type CssThemeVariables = {
  "--yishan-color-background-app": string;
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
