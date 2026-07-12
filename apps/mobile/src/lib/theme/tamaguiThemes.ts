import { defaultThemes } from "@tamagui/themes/v5";
import { COLOR_PRIMITIVES, type DesignTokenThemeMode, SEMANTIC_COLOR_TOKENS } from "@yishan-io/design-tokens/v1";

/**
 * Owns the mobile overlay that maps shared design-token semantics onto Tamagui theme slots.
 * Shared token truth stays in `@yishan-io/design-tokens`; mobile-only slot mapping lives here.
 */
function withAlpha(hexColor: string, alpha: number): string {
  const normalizedHex = hexColor.replace("#", "");
  if (normalizedHex.length !== 6) {
    return hexColor;
  }

  const red = Number.parseInt(normalizedHex.slice(0, 2), 16);
  const green = Number.parseInt(normalizedHex.slice(2, 4), 16);
  const blue = Number.parseInt(normalizedHex.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function createAppTheme(mode: DesignTokenThemeMode): typeof defaultThemes.light {
  const semantics = SEMANTIC_COLOR_TOKENS[mode];
  const baseTheme = mode === "dark" ? defaultThemes.dark : defaultThemes.light;
  const isDark = mode === "dark";

  return {
    ...baseTheme,
    background: semantics.background.surface,
    backgroundFocus: semantics.action.selected,
    backgroundHover: semantics.action.hover,
    backgroundPress: semantics.action.selected,
    borderColor: semantics.border.default,
    borderColorHover: isDark ? semantics.border.editor : semantics.border.default,
    borderColorPress: semantics.border.default,
    color: semantics.text.primary,
    color11: semantics.text.secondary,
    gray2: semantics.background.app,
    gray3: isDark ? semantics.background.activeLine : semantics.action.selected,
    gray4: semantics.border.default,
    gray5: semantics.border.editor,
    gray8: isDark ? COLOR_PRIMITIVES.neutral.gray700 : COLOR_PRIMITIVES.neutral.mist200,
    gray10: isDark ? COLOR_PRIMITIVES.neutral.gray500 : COLOR_PRIMITIVES.neutral.ink300,
    gray11: semantics.text.secondary,
    green3: withAlpha(semantics.primary, isDark ? 0.14 : 0.1),
    green8: semantics.primary,
    green10: semantics.primary,
    green11: semantics.primary,
  };
}

export function getThemeBackgroundAppColor(mode: DesignTokenThemeMode) {
  return SEMANTIC_COLOR_TOKENS[mode].background.app;
}

export const appThemes = {
  ...defaultThemes,
  dark: createAppTheme("dark"),
  light: createAppTheme("light"),
} as const;
