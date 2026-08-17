// @vitest-environment jsdom

import { useMediaQuery } from "@mui/material";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CODE_THEME_FAMILIES, type CodeThemeFamilyId, resolveCodeTheme } from "../helpers/codeThemes";
import { editorSettingsStore } from "../features/settings/state/editorSettingsStore";
import { useCodeTheme } from "./useCodeTheme";
import { AppThemePreferenceProvider } from "./useThemePreference";

// Mock useMediaQuery to control system preference
vi.mock("@mui/material", async () => {
  const actual = await vi.importActual("@mui/material");
  return { ...actual, useMediaQuery: vi.fn(() => false) };
});

const mockUseMediaQuery = vi.mocked(useMediaQuery);

afterEach(() => {
  vi.clearAllMocks();
  // Reset useMediaQuery to default (no system dark preference = "light")
  mockUseMediaQuery.mockReturnValue(false);
});

describe("useCodeTheme", () => {
  beforeEach(() => {
    editorSettingsStore.setState({ codeThemePreference: "yishan" });
    mockUseMediaQuery.mockReturnValue(false);
  });

  it("resolves the yishan-light palette with the default system preference when the system prefers light", () => {
    // Default themePreference is "system" (useMediaQuery returns false = light)
    const { result } = renderHook(() => useCodeTheme(), {
      wrapper: AppThemePreferenceProvider,
    });

    expect(result.current.mode).toBe("light");
    expect(result.current.themeName).toBe("yishan-light");
    expect(result.current.palette.background).toBe("#ffffff");
  });

  it("resolves the yishan-dark palette when system prefers dark", () => {
    mockUseMediaQuery.mockReturnValue(true); // system dark

    const { result } = renderHook(() => useCodeTheme(), {
      wrapper: AppThemePreferenceProvider,
    });

    expect(result.current.mode).toBe("dark");
    expect(result.current.themeName).toBe("yishan-dark");
    expect(result.current.palette.background).toBe("#292e36");
  });

  it.each(CODE_THEME_FAMILIES.map((f) => [f.id, "light"] as const))(
    "resolves %s-light themeName and palette correctly",
    (familyId) => {
      mockUseMediaQuery.mockReturnValue(false); // ensure light
      editorSettingsStore.setState({ codeThemePreference: familyId });
      const { result } = renderHook(() => useCodeTheme(), {
        wrapper: AppThemePreferenceProvider,
      });

      expect(result.current.themeName).toBe(`${familyId}-light`);
      expect(result.current.palette).toEqual(resolveCodeTheme(familyId, "light"));
    },
  );

  it.each(CODE_THEME_FAMILIES.map((f) => [f.id, "dark"] as const))(
    "resolves %s-dark themeName and palette correctly",
    (familyId) => {
      mockUseMediaQuery.mockReturnValue(true); // ensure dark
      editorSettingsStore.setState({ codeThemePreference: familyId });
      const { result } = renderHook(() => useCodeTheme(), {
        wrapper: AppThemePreferenceProvider,
      });

      expect(result.current.themeName).toBe(`${familyId}-dark`);
      expect(result.current.palette).toEqual(resolveCodeTheme(familyId, "dark"));
    },
  );

  it("reacts to codeThemePreference changes", () => {
    mockUseMediaQuery.mockReturnValue(false); // light
    const { result, rerender } = renderHook(() => useCodeTheme(), {
      wrapper: AppThemePreferenceProvider,
    });

    expect(result.current.themeName).toBe("yishan-light");

    editorSettingsStore.setState({ codeThemePreference: "dracula" });
    rerender();

    expect(result.current.themeName).toBe("dracula-light");
  });

  it("reacts to themeMode changes", () => {
    mockUseMediaQuery.mockReturnValue(false); // light
    const { result, rerender } = renderHook(() => useCodeTheme(), {
      wrapper: AppThemePreferenceProvider,
    });
    expect(result.current.mode).toBe("light");

    mockUseMediaQuery.mockReturnValue(true);
    rerender();

    expect(result.current.mode).toBe("dark");
    expect(result.current.themeName).toBe("yishan-dark");
  });
});
