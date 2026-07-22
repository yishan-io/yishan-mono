// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScheduledJobRunStatusIcon } from "./ScheduledJobRunStatusIcon";

vi.mock("@mui/material", () => ({
  Box: ({ sx, children, ...props }: { sx: { color?: string }; children: React.ReactNode }) => (
    <span {...props} data-color={sx.color}>
      {children}
    </span>
  ),
}));

vi.mock("react-icons/lu", () => ({
  LuCircleCheck: ({ size }: { size: number }) => <svg data-testid="check-icon" data-size={size} />,
  LuCircleX: ({ size }: { size: number }) => <svg data-testid="x-icon" data-size={size} />,
  LuClock: ({ size }: { size: number }) => <svg data-testid="clock-icon" data-size={size} />,
  LuRefreshCw: ({ size }: { size: number }) => <svg data-testid="refresh-icon" data-size={size} />,
}));

afterEach(cleanup);

describe("ScheduledJobRunStatusIcon", () => {
  it.each([
    ["succeeded", "success.main", "check-icon"],
    ["failed", "error.main", "x-icon"],
    ["running", "warning.main", "refresh-icon"],
    ["pending", "text.disabled", "clock-icon"],
    ["skipped_offline", "text.disabled", "clock-icon"],
  ] as const)("maps %s to its color and icon", (status, color, iconTestId) => {
    render(<ScheduledJobRunStatusIcon status={status} size={17} />);

    expect(screen.getByTestId("scheduled-job-run-status-icon").getAttribute("data-color")).toBe(color);
    expect(screen.getByTestId(iconTestId).getAttribute("data-size")).toBe("17");
  });

  it("renders nothing for a missing last-run status", () => {
    const { container } = render(<ScheduledJobRunStatusIcon status={null} size={17} />);

    expect(container.innerHTML).toBe("");
  });
});
