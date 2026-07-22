// @vitest-environment jsdom

import { cleanup } from "@testing-library/react";
import { COLOR_PRIMITIVES } from "@yishan-io/design-tokens";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithAppTheme } from "../../../testUtils/renderWithAppTheme";
import { createAppTheme } from "../../../theme";
import { ToolSummaryPanel } from "./ToolCardShell";

function getComputedColor(color: string): string {
  const colorProbe = document.createElement("div");
  colorProbe.style.backgroundColor = color;
  document.body.appendChild(colorProbe);

  const computedColor = getComputedStyle(colorProbe).backgroundColor;
  colorProbe.remove();

  return computedColor;
}

afterEach(cleanup);

describe("ToolSummaryPanel", () => {
  it.each(["light", "dark"] as const)("uses the %s theme summary surface color", (mode) => {
    const theme = createAppTheme(mode);
    const expectedPaletteColor = mode === "light" ? theme.palette.action.hover : COLOR_PRIMITIVES.neutral.gray950;
    const { container } = renderWithAppTheme(<ToolSummaryPanel>Summary</ToolSummaryPanel>, { theme });
    const summaryPanel = container.firstElementChild;

    expect(summaryPanel).not.toBeNull();
    if (summaryPanel === null) {
      throw new Error("Tool summary panel was not rendered");
    }

    expect(getComputedStyle(summaryPanel).backgroundColor).toBe(getComputedColor(expectedPaletteColor));
  });
});
