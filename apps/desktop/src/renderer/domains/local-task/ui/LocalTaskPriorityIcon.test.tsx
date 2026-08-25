// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocalTaskPriorityIcon } from "./LocalTaskPriorityIcon";

describe("LocalTaskPriorityIcon", () => {
  it.each([
    ["low", 1],
    ["medium", 2],
    ["high", 3],
  ] as const)("renders %s with %i active signal bars", (priority, activeBarCount) => {
    render(<LocalTaskPriorityIcon priority={priority} aria-label={`Priority: ${priority}`} />);

    const icon = screen.getByLabelText(`Priority: ${priority}`);
    expect(icon.getAttribute("data-priority")).toBe(priority);
    expect(icon.querySelectorAll("[data-active='true']")).toHaveLength(activeBarCount);
    expect(icon.querySelectorAll("[data-active='false']")).toHaveLength(3 - activeBarCount);
  });
});
