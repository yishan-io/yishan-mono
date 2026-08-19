// @vitest-environment jsdom

import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithAppTheme } from "../../../../../testUtils/renderWithAppTheme";
import { createAppTheme } from "../../../../../theme";
import { THINKING_LEVELS } from "../../../providers/agentThinkingLevels";
import { THINKING_LEVEL_LABELS, ThinkingLevelControl } from "./ThinkingLevelControl";

const ACTIVE_BAR_COUNTS: Record<string, number> = {
  off: 0,
  minimal: 1,
  low: 2,
  medium: 3,
  high: 4,
  xhigh: 5,
  max: 6,
};
const BAR_COUNT = 6;
const BAR_HEIGHTS = [4, 6, 8, 10, 12, 14];
const appTheme = createAppTheme("dark");

function getComputedBackgroundColor(color: string): string {
  const colorReference = document.createElement("div");
  colorReference.style.backgroundColor = color;
  document.body.append(colorReference);
  const computedColor = getComputedStyle(colorReference).backgroundColor;
  colorReference.remove();

  return computedColor;
}

afterEach(() => {
  cleanup();
});

describe("ThinkingLevelControl", () => {
  it.each(Object.entries(ACTIVE_BAR_COUNTS))(
    "shows the expected active bars for %s",
    (thinkingLevel, activeBarCount) => {
      renderWithAppTheme(<ThinkingLevelControl thinkingLevel={thinkingLevel} onSelect={vi.fn()} />);

      const thinkingLevelLabel = THINKING_LEVEL_LABELS[thinkingLevel] ?? "Off";
      expect(screen.getByRole("button", { name: `Thinking level: ${thinkingLevelLabel}` })).toBeTruthy();
      expect(screen.getByText(thinkingLevelLabel)).toBeTruthy();

      for (let barIndex = 1; barIndex <= BAR_COUNT; barIndex += 1) {
        expect(screen.getByTestId(`thinking-level-bar-${barIndex}`).getAttribute("data-active")).toBe(
          String(barIndex <= activeBarCount),
        );
      }
    },
  );

  it("provides a 24px minimum pointer target", () => {
    renderWithAppTheme(<ThinkingLevelControl thinkingLevel="medium" onSelect={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Thinking level: Medium" });
    const buttonStyles = getComputedStyle(button);

    expect(Number.parseFloat(buttonStyles.minWidth)).toBeGreaterThanOrEqual(24);
    expect(Number.parseFloat(buttonStyles.minHeight)).toBeGreaterThanOrEqual(24);
  });

  it("uses ascending heights and theme colors for active and inactive bars", () => {
    renderWithAppTheme(<ThinkingLevelControl thinkingLevel="medium" onSelect={vi.fn()} />);

    const activeColor = getComputedBackgroundColor(appTheme.palette.text.secondary);
    const inactiveColor = getComputedBackgroundColor(appTheme.palette.action.disabledBackground);

    for (let barIndex = 0; barIndex < BAR_COUNT; barIndex += 1) {
      const bar = screen.getByTestId(`thinking-level-bar-${barIndex + 1}`);

      expect(getComputedStyle(bar).height).toBe(`${BAR_HEIGHTS[barIndex]}px`);
      expect(getComputedStyle(bar).backgroundColor).toBe(barIndex < 3 ? activeColor : inactiveColor);

      if (barIndex > 0) {
        const precedingBar = screen.getByTestId(`thinking-level-bar-${barIndex}`);
        expect(Number.parseFloat(getComputedStyle(bar).height)).toBeGreaterThan(
          Number.parseFloat(getComputedStyle(precedingBar).height),
        );
      }
    }
  });

  it("falls back to off for an unknown level", () => {
    renderWithAppTheme(<ThinkingLevelControl thinkingLevel="unexpected" onSelect={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Thinking level: Off" })).toBeTruthy();
    expect(screen.getAllByTestId(/thinking-level-bar-/)).toHaveLength(BAR_COUNT);
    expect(screen.getAllByTestId(/thinking-level-bar-/).every((bar) => bar.dataset.active === "false")).toBe(true);
  });

  it("opens a menu listing every level and selects the chosen one", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderWithAppTheme(<ThinkingLevelControl thinkingLevel="medium" onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: "Thinking level: Medium" }));

    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(THINKING_LEVELS.length);
    for (const level of THINKING_LEVELS) {
      expect(within(menu).getByText(THINKING_LEVEL_LABELS[level] ?? level)).toBeTruthy();
    }

    await user.click(within(menu).getByText("High"));
    expect(onSelect).toHaveBeenCalledWith("high");
  });

  it("hides levels the model does not support", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderWithAppTheme(
      <ThinkingLevelControl thinkingLevel="off" onSelect={onSelect} supportedLevels={["off", "high", "max"]} />,
    );

    await user.click(screen.getByRole("button", { name: "Thinking level: Off" }));
    const menu = await screen.findByRole("menu");

    expect(within(menu).queryByText("Medium")).toBeNull();
    expect(within(menu).queryByText("Minimal")).toBeNull();
    expect(within(menu).queryByText("Low")).toBeNull();
    expect(within(menu).getByText("Off")).toBeTruthy();
    expect(within(menu).getByText("High")).toBeTruthy();
    expect(within(menu).getByText("Max")).toBeTruthy();

    await user.click(within(menu).getByText("High"));
    expect(onSelect).toHaveBeenCalledWith("high");
  });

  it("selects through native keyboard activation", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderWithAppTheme(<ThinkingLevelControl thinkingLevel="medium" onSelect={onSelect} />);
    const button = screen.getByRole("button", { name: "Thinking level: Medium" });

    button.focus();
    expect(document.activeElement).toBe(button);
    await user.keyboard("{Enter}");

    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByText("Off"));
    expect(onSelect).toHaveBeenCalledWith("off");
  });
});
