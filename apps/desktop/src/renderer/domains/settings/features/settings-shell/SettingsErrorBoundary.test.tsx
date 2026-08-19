// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsErrorBoundary } from "./SettingsErrorBoundary";

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("render boom");
  }
  return <div data-testid="healthy-content">OK</div>;
}

describe("SettingsErrorBoundary", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders children when no error occurs", () => {
    render(
      <SettingsErrorBoundary sectionLabel="Agent Settings">
        <ThrowingChild shouldThrow={false} />
      </SettingsErrorBoundary>,
    );

    expect(screen.getByTestId("healthy-content")).toBeTruthy();
  });

  it("renders fallback UI with section label and error message on render error", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <SettingsErrorBoundary sectionLabel="Agent Settings">
        <ThrowingChild shouldThrow={true} />
      </SettingsErrorBoundary>,
    );

    expect(screen.queryByTestId("healthy-content")).toBeNull();
    expect(screen.getByText(/Agent Settings/)).toBeTruthy();
    expect(screen.getByText("render boom")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();

    errorSpy.mockRestore();
  });

  it("recovers from error when retry is clicked and child no longer throws", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let shouldThrow = true;

    function ConditionalChild() {
      if (shouldThrow) {
        throw new Error("temporary error");
      }
      return <div data-testid="recovered-content">Recovered</div>;
    }

    render(
      <SettingsErrorBoundary sectionLabel="Agent Settings">
        <ConditionalChild />
      </SettingsErrorBoundary>,
    );

    expect(screen.getByText("temporary error")).toBeTruthy();

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(screen.getByTestId("recovered-content")).toBeTruthy();
    expect(screen.queryByText("temporary error")).toBeNull();

    errorSpy.mockRestore();
  });

  it("logs error with section label context to console", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <SettingsErrorBoundary sectionLabel="Agent Settings">
        <ThrowingChild shouldThrow={true} />
      </SettingsErrorBoundary>,
    );

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Agent Settings"),
      expect.any(Error),
      expect.anything(),
    );

    errorSpy.mockRestore();
  });
});
