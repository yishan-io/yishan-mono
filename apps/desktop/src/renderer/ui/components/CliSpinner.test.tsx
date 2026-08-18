// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CliSpinner } from "./CliSpinner";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CliSpinner", () => {
  it("renders one custom color when provided", () => {
    render(<CliSpinner color="#10b981" />);

    expect(screen.getByTestId("cli-spinner").getAttribute("data-spinner-color")).toBe("#10b981");
  });

  it("cycles frame glyphs while animating", () => {
    vi.useFakeTimers();
    render(<CliSpinner />);

    expect(screen.getByTestId("cli-spinner").textContent).toBe("⠋");

    act(() => {
      vi.advanceTimersByTime(80);
    });

    expect(screen.getByTestId("cli-spinner").textContent).toBe("⠙");
  });

  it("switches colors when rainbow mode is enabled", () => {
    vi.useFakeTimers();
    render(<CliSpinner rainbow />);

    const firstColor = screen.getByTestId("cli-spinner").getAttribute("data-spinner-color");

    act(() => {
      vi.advanceTimersByTime(80);
    });

    const secondColor = screen.getByTestId("cli-spinner").getAttribute("data-spinner-color");
    expect(secondColor).not.toBe(firstColor);
  });
});
