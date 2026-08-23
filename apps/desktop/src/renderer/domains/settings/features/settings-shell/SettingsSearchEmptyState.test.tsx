// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppThemePreferenceProvider } from "../../hooks/useThemePreference";
import { SettingsView } from "./SettingsView";

// Lazy settings tabs load real feature modules under full-suite load; the
// default 5s per-test timeout is too tight for the first load.
vi.setConfig({ testTimeout: 30000 });

vi.mock("react-i18next", () => ({
  initReactI18next: {
    type: "3rdParty",
    init: () => undefined,
  },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@renderer/platform/platform", () => ({
  getRendererPlatform: () => "linux",
}));

vi.mock("@renderer/domains/notification/features/configure-notifications/NotificationSettingsView", () => ({
  NotificationSettingsView: () => <div data-testid="notification-settings-panel" />,
}));

describe("SettingsView search", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows empty-state text when search has no matching items", () => {
    render(
      <AppThemePreferenceProvider>
        <MemoryRouter initialEntries={["/settings?tab=notifications"]}>
          <Routes>
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </MemoryRouter>
      </AppThemePreferenceProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText("settings.searchPlaceholder"), {
      target: { value: "does-not-exist" },
    });

    expect(screen.getByText("settings.searchNoResults")).toBeTruthy();
  });
});
