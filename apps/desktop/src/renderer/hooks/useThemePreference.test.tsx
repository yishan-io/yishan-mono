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

/** Renders current app theme state and controls to switch theme preference. */
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
      <button
        type="button"
        onClick={() => {
          setThemePreference("light");
        }}
      >
        set-light
      </button>
    </>
  );
}

describe("useThemePreference", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.removeItem(LAYOUT_STORE_STORAGE_KEY);
    layoutStore.setState({ themePreference: "system" });
    document.documentElement.removeAttribute("data-app-theme-mode");
    document.documentElement.style.colorScheme = "";
    document.documentElement.style.removeProperty("--yishan-color-background-app");
    document.documentElement.style.removeProperty("--yishan-color-action-selected");
    document.documentElement.style.removeProperty("--yishan-color-action-hover");
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

  it("updates root theme properties across light, dark, and light transitions", () => {
    void layoutStore.persist.rehydrate();
    render(
      <AppThemePreferenceProvider>
        <ThemePreferenceProbe />
      </AppThemePreferenceProvider>,
    );

    expect(document.documentElement.getAttribute("data-app-theme-mode")).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(document.documentElement.style.getPropertyValue("--yishan-color-background-app")).toBe("#f7f8fa");
    expect(document.documentElement.style.getPropertyValue("--yishan-color-action-selected")).toBe("#eceff3");
    expect(document.documentElement.style.getPropertyValue("--yishan-color-action-hover")).toBe("#f3f4f6");

    act(() => {
      fireEvent.click(screen.getByText("set-dark"));
    });

    expect(document.documentElement.getAttribute("data-app-theme-mode")).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(document.documentElement.style.getPropertyValue("--yishan-color-background-app")).toBe("#2b3038");
    expect(document.documentElement.style.getPropertyValue("--yishan-color-action-selected")).toBe(
      "rgba(221, 226, 233, 0.08)",
    );
    expect(document.documentElement.style.getPropertyValue("--yishan-color-action-hover")).toBe(
      "rgba(221, 226, 233, 0.12)",
    );

    act(() => {
      fireEvent.click(screen.getByText("set-light"));
    });

    expect(document.documentElement.getAttribute("data-app-theme-mode")).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(document.documentElement.style.getPropertyValue("--yishan-color-background-app")).toBe("#f7f8fa");
    expect(document.documentElement.style.getPropertyValue("--yishan-color-action-selected")).toBe("#eceff3");
    expect(document.documentElement.style.getPropertyValue("--yishan-color-action-hover")).toBe("#f3f4f6");
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
