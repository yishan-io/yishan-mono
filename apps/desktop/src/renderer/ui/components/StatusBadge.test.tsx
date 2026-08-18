// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatusBadge, type StatusBadgeIndicator } from "./StatusBadge";

afterEach(() => {
  cleanup();
});

describe("StatusBadge", () => {
  const indicators: StatusBadgeIndicator[] = [
    "success",
    "error",
    "warning",
    "info",
    "neutral",
    "done",
    "failed",
    "waiting_input",
  ];

  it.each(indicators)("supports '%s' indicator", (indicator) => {
    render(
      <StatusBadge
        indicator={indicator}
        testId="status-badge"
        icon={<span data-testid="status-badge-child">icon</span>}
      />,
    );

    expect(screen.getByTestId("status-badge").getAttribute("data-indicator")).toBe(indicator);
    expect(screen.getByTestId("status-badge-child")).toBeTruthy();
  });

  it("maps done indicator to success badge type", () => {
    render(<StatusBadge indicator="done" testId="status-badge" icon={<span>icon</span>} />);
    expect(screen.getByTestId("status-badge").getAttribute("data-badge-type")).toBe("success");
  });

  it("applies accessible image semantics when aria label is provided", () => {
    render(
      <StatusBadge indicator="success" ariaLabel="Task completed" testId="status-badge" icon={<span>icon</span>} />,
    );

    expect(screen.getByRole("img", { name: "Task completed" })).toBeTruthy();
  });
});
