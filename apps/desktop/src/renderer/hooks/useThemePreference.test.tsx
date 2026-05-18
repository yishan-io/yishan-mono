// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LAYOUT_STORE_STORAGE_KEY, layoutStore } from "../store/settings/layoutStore";
import { AppThemePreferenceProvider, useThemePreference } from "./useThemePreference";

vi.mock("@mui/material", async () => {
  const actual = await vi.importActual<typeof import("@mui/material")>("@mui/material");
  return {
    ...actual,
    useMediaQuery: vi.fn(() => false),
  };
});

/** Renders current app theme state and a control to switch to dark preference. */
function ThemePreferenceProbe() {
  const { themePreference, themeMode, setThemePreference } = useThemePreference();

  return (
    <>
      <div data-testid="theme-preference">{themePreference}</div>
      <div data-testid="theme-mode">{themeMode}</div>
      <button
        type="button"
        onClick={() => {
          setThemePreference("dark");
        }}
      >
        set-dark
      </button>
    </>
  );
}

describe("useThemePreference", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.removeItem(LAYOUT_STORE_STORAGE_KEY);
    layoutStore.setState({ themePreference: "system" });
  });

  it("reads persisted preference and resolves mode", () => {
    window.localStorage.setItem(
      LAYOUT_STORE_STORAGE_KEY,
      JSON.stringify({
        state: {
          leftWidth: 320,
          rightWidth: 400,
          themePreference: "dark",
        },
        version: 0,
      }),
    );
    void layoutStore.persist.rehydrate();

    render(
      <AppThemePreferenceProvider>
        <ThemePreferenceProbe />
      </AppThemePreferenceProvider>,
    );

    expect(screen.getByTestId("theme-preference").textContent).toBe("dark");
    expect(screen.getByTestId("theme-mode").textContent).toBe("dark");
  });

  it("updates context state and persists preference changes", () => {
    void layoutStore.persist.rehydrate();
    render(
      <AppThemePreferenceProvider>
        <ThemePreferenceProbe />
      </AppThemePreferenceProvider>,
    );

    act(() => {
      fireEvent.click(screen.getByText("set-dark"));
    });

    expect(screen.getByTestId("theme-preference").textContent).toBe("dark");
    expect(window.localStorage.getItem(LAYOUT_STORE_STORAGE_KEY)).toContain('"themePreference":"dark"');
  });
});
