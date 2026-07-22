// @vitest-environment jsdom

import { Typography } from "@mui/material";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatusIndicator } from "./StatusIndicator";

afterEach(() => {
  cleanup();
});

describe("StatusIndicator", () => {
  it("uses the secondary label color for disabled statuses by default", () => {
    render(
      <>
        <StatusIndicator label="Disabled" color="disabled" />
        <Typography data-testid="secondary-label" color="text.secondary" />
      </>,
    );

    expect(getComputedStyle(screen.getByText("Disabled")).color).toBe(
      getComputedStyle(screen.getByTestId("secondary-label")).color,
    );
  });

  it("supports compact dot, gap, and label color overrides", () => {
    render(
      <>
        <StatusIndicator label="Paused" color="disabled" dotSize={7} gap={0.5} labelColor="text.secondary" />
        <Typography data-testid="secondary-label" color="text.secondary" />
      </>,
    );

    const label = screen.getByText("Paused");
    const indicator = label.parentElement;
    expect(indicator).not.toBeNull();
    if (indicator === null) {
      return;
    }

    const dot = indicator.firstElementChild;
    expect(dot).not.toBeNull();
    if (dot === null) {
      return;
    }

    expect(getComputedStyle(dot).width).toBe("7px");
    expect(getComputedStyle(dot).height).toBe("7px");
    expect(getComputedStyle(indicator).gap).toBe("4px");
    expect(getComputedStyle(label).color).toBe(getComputedStyle(screen.getByTestId("secondary-label")).color);
  });
});
