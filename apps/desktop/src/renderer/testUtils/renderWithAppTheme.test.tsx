// @vitest-environment jsdom

import { createTheme, useTheme } from "@mui/material/styles";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithAppTheme } from "./renderWithAppTheme";

function ThemeProbe() {
  const theme = useTheme();

  return <output data-testid="theme-probe">{`${theme.palette.mode}:${theme.palette.primary.main}`}</output>;
}

afterEach(cleanup);

describe("renderWithAppTheme", () => {
  it("uses and retains the default dark theme when rerendering", () => {
    const { rerender } = renderWithAppTheme(<ThemeProbe />);

    expect(screen.getByTestId("theme-probe").textContent?.startsWith("dark:")).toBe(true);

    rerender(<ThemeProbe />);

    expect(screen.getByTestId("theme-probe").textContent?.startsWith("dark:")).toBe(true);
  });

  it("uses and retains an explicit light theme mode when rerendering", () => {
    const { rerender } = renderWithAppTheme(<ThemeProbe />, { mode: "light" });

    expect(screen.getByTestId("theme-probe").textContent?.startsWith("light:")).toBe(true);

    rerender(<ThemeProbe />);

    expect(screen.getByTestId("theme-probe").textContent?.startsWith("light:")).toBe(true);
  });

  it("uses and retains a caller-supplied theme when rerendering", () => {
    const customTheme = createTheme({ palette: { mode: "dark", primary: { main: "#123456" } } });
    const { rerender } = renderWithAppTheme(<ThemeProbe />, { theme: customTheme });

    expect(screen.getByTestId("theme-probe").textContent).toBe("dark:#123456");

    rerender(<ThemeProbe />);

    expect(screen.getByTestId("theme-probe").textContent).toBe("dark:#123456");
  });
});
