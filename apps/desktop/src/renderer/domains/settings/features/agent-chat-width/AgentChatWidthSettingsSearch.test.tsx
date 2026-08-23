// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppThemePreferenceProvider } from "../../hooks/useThemePreference";
import { SettingsView } from "../settings-shell/SettingsView";

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

describe("AgentChatWidthSettings search", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("matches Agent Chat Width as a distinct Appearance search result", async () => {
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
      target: { value: "fixed" },
    });

    const agentChatWidthResults = await screen.findAllByRole("button", {
      name: /settings\.appearance\.agentChat\.title/,
    });
    expect(agentChatWidthResults).toHaveLength(1);

    const agentChatWidthResult = screen.getByRole("button", {
      name: /settings\.appearance\.agentChat\.title/,
    });
    expect(agentChatWidthResult.textContent).toContain("settings.items.appearance");

    fireEvent.click(agentChatWidthResult);

    expect(
      await screen.findByLabelText("settings.appearance.agentChat.width.label", {}, { timeout: 30000 }),
    ).toBeTruthy();
  });
});
