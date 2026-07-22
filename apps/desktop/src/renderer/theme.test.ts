// @vitest-environment jsdom

import {
  IconButton as MuiIconButton,
  TextField as MuiTextField,
  ThemeProvider as MuiThemeProvider,
} from "@mui/material";
import { cleanup, render, screen } from "@testing-library/react";
import { createMuiThemeOptions } from "@yishan-io/design-tokens/v1/mui";
import { Fragment, createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createAppTheme } from "./theme";

afterEach(() => {
  cleanup();
});

describe("createAppTheme", () => {
  it("keeps compact control policy out of the shared token options", () => {
    const sharedOptions = createMuiThemeOptions("light");

    expect("defaultProps" in sharedOptions.components.MuiIconButton).toBe(false);
    expect("MuiTextField" in sharedOptions.components).toBe(false);
  });

  it.each(["light", "dark"] as const)("uses compact IconButton and TextField defaults in %s mode", (mode) => {
    const theme = createAppTheme(mode);

    expect(theme.components?.MuiIconButton?.defaultProps?.size).toBe("small");
    expect(theme.components?.MuiTextField?.defaultProps?.size).toBe("small");
  });

  it("allows explicit medium controls to override the compact defaults", () => {
    render(
      createElement(
        MuiThemeProvider,
        { theme: createAppTheme("light") },
        createElement(
          Fragment,
          null,
          createElement(MuiIconButton, { "aria-label": "compact icon" }),
          createElement(MuiIconButton, { size: "medium", "aria-label": "medium icon" }),
          createElement(MuiTextField, { "aria-label": "compact text" }),
          createElement(MuiTextField, { size: "medium", "aria-label": "medium text" }),
        ),
      ),
    );

    const [compactTextField, mediumTextField] = screen.getAllByRole("textbox");

    expect(screen.getByRole("button", { name: "compact icon" }).classList).toContain("MuiIconButton-sizeSmall");
    expect(screen.getByRole("button", { name: "medium icon" }).classList).not.toContain("MuiIconButton-sizeSmall");
    expect(compactTextField?.classList).toContain("MuiInputBase-inputSizeSmall");
    expect(mediumTextField?.classList).not.toContain("MuiInputBase-inputSizeSmall");
  });

  it("retains the token-owned IconButton root style override", () => {
    const theme = createAppTheme("light");

    expect(theme.components?.MuiIconButton?.styleOverrides?.root).toEqual(
      expect.objectContaining({ borderRadius: expect.any(Number) }),
    );
  });
});
