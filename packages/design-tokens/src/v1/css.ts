import { type DesignTokenThemeMode, SEMANTIC_COLOR_TOKENS } from "./index";

/** CSS custom properties mapped from the stable shared semantic color contract. */
export type CssThemeVariables = {
  "--yishan-color-background-app": string;
  "--yishan-color-action-selected": string;
  "--yishan-color-action-hover": string;
};

/** Builds CSS custom properties for a selected semantic theme mode without mutating the DOM. */
export function createCssThemeVariables(mode: DesignTokenThemeMode): CssThemeVariables {
  const semanticColors = SEMANTIC_COLOR_TOKENS[mode];

  return {
    "--yishan-color-background-app": semanticColors.background.app,
    "--yishan-color-action-selected": semanticColors.action.selected,
    "--yishan-color-action-hover": semanticColors.action.hover,
  };
}
