// @vitest-environment jsdom

import { ThemeProvider, createTheme, hexToRgb } from "@mui/material";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ModelPickerRow } from "./ModelPickerRow";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

it("visibly focuses each sibling action with ripples disabled and reveals default actions within the row", async () => {
  const user = userEvent.setup();
  const theme = createTheme({ components: { MuiButtonBase: { defaultProps: { disableRipple: true } } } });
  render(
    <ThemeProvider theme={theme}>
      <ModelPickerRow
        option={{ id: "model", name: "Model", providerId: "gateway", providerName: "Gateway" }}
        selected
        isDefault={false}
        onSelect={vi.fn()}
        onSetDefault={vi.fn()}
      />
    </ThemeProvider>,
  );
  for (const button of screen.getAllByRole("button")) {
    await user.tab();
    expect(document.activeElement).toBe(button);
    // Simulate MUI's keyboard-focus class: JSDOM does not reliably track :focus-visible across siblings.
    button.classList.add("Mui-focusVisible");
    const style = getComputedStyle(button);
    expect(style.outline).toBe("2px solid");
    expect(style.outlineColor).toBe(hexToRgb(theme.palette.primary.main));
    expect(style.outlineOffset).toBe("-2px");
  }
  // JSDOM does not evaluate :focus-within; verify the emitted visibility rule.
  const rules = Array.from(document.styleSheets).flatMap((sheet) => Array.from(sheet.cssRules));
  expect(
    rules.some(
      (rule) => rule.cssText.includes(":focus-within .model-default-action") && rule.cssText.includes("opacity: 1"),
    ),
  ).toBe(true);
});
