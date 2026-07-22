// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScheduledJobStatusIndicator } from "./ScheduledJobStatusIndicator";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../../components/StatusIndicator", () => ({
  StatusIndicator: ({
    label,
    color,
    dotSize,
    gap,
    labelColor,
  }: { label: string; color: string; dotSize: number; gap: number; labelColor: string }) => (
    <output
      data-testid="status-indicator"
      data-color={color}
      data-dot-size={dotSize}
      data-gap={gap}
      data-label-color={labelColor}
    >
      {label}
    </output>
  ),
}));

afterEach(cleanup);

describe("ScheduledJobStatusIndicator", () => {
  it.each([
    ["active", "success"],
    ["paused", "disabled"],
    ["disabled", "disabled"],
  ] as const)("maps %s to %s in the detail variant", (status, color) => {
    render(<ScheduledJobStatusIndicator status={status} />);

    const indicator = screen.getByTestId("status-indicator");
    expect(indicator.textContent).toBe(`scheduledJob.status.${status}`);
    expect(indicator.getAttribute("data-color")).toBe(color);
    expect(indicator.getAttribute("data-dot-size")).toBe("8");
    expect(indicator.getAttribute("data-gap")).toBe("0.75");
    expect(indicator.getAttribute("data-label-color")).toBe("text.primary");
  });

  it.each(["active", "paused", "disabled"] as const)("uses compact presentation for %s", (status) => {
    render(<ScheduledJobStatusIndicator status={status} variant="compact" />);

    const indicator = screen.getByTestId("status-indicator");
    expect(indicator.getAttribute("data-dot-size")).toBe("7");
    expect(indicator.getAttribute("data-gap")).toBe("0.5");
    expect(indicator.getAttribute("data-label-color")).toBe("text.secondary");
  });
});
