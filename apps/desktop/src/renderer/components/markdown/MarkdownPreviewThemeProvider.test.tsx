// @vitest-environment jsdom

import { ThemeProvider, useTheme } from "@mui/material/styles";
import { layoutStore } from "@renderer/store/settings/layoutStore";
import { createAppTheme } from "@renderer/theme";
import { cleanup, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MarkdownPreviewThemeProvider } from "./MarkdownPreviewThemeProvider";

function ThemeModeProbe({ testId }: { testId: string }) {
  const theme = useTheme();

  return <div data-testid={testId}>{theme.palette.mode}</div>;
}

describe("MarkdownPreviewThemeProvider", () => {
  afterEach(() => {
    layoutStore.setState({ markdownThemePreference: "inherit" });
    cleanup();
  });

  it("inherits the outer app theme by default", () => {
    render(
      <ThemeProvider theme={createAppTheme("dark")}>
        <MarkdownPreviewThemeProvider>
          <ThemeModeProbe testId="preview-theme-mode" />
        </MarkdownPreviewThemeProvider>
      </ThemeProvider>,
    );

    expect(screen.getByTestId("preview-theme-mode").textContent).toBe("dark");
  });

  it("updates only the preview subtree when the markdown theme preference changes", () => {
    render(
      <ThemeProvider theme={createAppTheme("dark")}>
        <ThemeModeProbe testId="app-theme-mode" />
        <MarkdownPreviewThemeProvider>
          <ThemeModeProbe testId="preview-theme-mode" />
        </MarkdownPreviewThemeProvider>
      </ThemeProvider>,
    );

    expect(screen.getByTestId("app-theme-mode").textContent).toBe("dark");
    expect(screen.getByTestId("preview-theme-mode").textContent).toBe("dark");

    act(() => {
      layoutStore.getState().setMarkdownThemePreference("light");
    });

    expect(screen.getByTestId("app-theme-mode").textContent).toBe("dark");
    expect(screen.getByTestId("preview-theme-mode").textContent).toBe("light");
  });
});
