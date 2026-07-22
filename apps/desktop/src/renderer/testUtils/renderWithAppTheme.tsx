import { ThemeProvider } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { type AppThemeMode, createAppTheme } from "@renderer/theme";
import type { RenderOptions } from "@testing-library/react";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

export type RenderWithAppThemeOptions = Omit<RenderOptions, "wrapper"> &
  ({ mode?: AppThemeMode; theme?: never } | { mode?: never; theme: Theme });

/** Renders UI with a stable desktop app theme provider for the initial render and rerenders. */
export function renderWithAppTheme(ui: ReactElement, options: RenderWithAppThemeOptions = {}) {
  const { mode = "dark", theme, ...renderOptions } = options;
  const appTheme = theme ?? createAppTheme(mode);

  return render(ui, {
    ...renderOptions,
    wrapper: ({ children }) => <ThemeProvider theme={appTheme}>{children}</ThemeProvider>,
  });
}
