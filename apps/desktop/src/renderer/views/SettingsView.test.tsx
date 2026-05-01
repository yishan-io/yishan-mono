// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppThemePreferenceProvider } from "../hooks/useThemePreference";
import { LAYOUT_STORE_STORAGE_KEY, layoutStore } from "../store/layoutStore";
import { sessionStore } from "../store/sessionStore";
import { SettingsView } from "./SettingsView";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../helpers/platform", () => ({
  getRendererPlatform: () => "linux",
}));

vi.mock("./settings/NotificationSettingsView", () => ({
  NotificationSettingsView: ({ focusItemId }: { focusItemId?: string | null }) => (
    <div data-testid="notification-settings-panel" data-focus-item-id={focusItemId ?? ""} />
  ),
}));

vi.mock("./settings/AgentSettingsView", () => ({
  AgentSettingsView: () => <div data-testid="agent-settings-panel" />,
}));

vi.mock("./settings/TerminalSettingsView", () => ({
  TerminalSettingsView: () => <div data-testid="terminal-settings-panel" />,
}));

vi.mock("./settings/DaemonSettingsView", () => ({
  DaemonSettingsView: () => <div data-testid="daemon-settings-panel" />,
}));

vi.mock("./settings/GitWorkspaceSettingsView", () => ({
  GitWorkspaceSettingsView: () => <div data-testid="git-workspace-settings-panel" />,
}));

describe("SettingsView", () => {
  afterEach(() => {
    window.localStorage.removeItem(LAYOUT_STORE_STORAGE_KEY);
    layoutStore.setState({ themePreference: "system" });
    sessionStore.setState({ currentUser: null, organizations: [], selectedOrganizationId: undefined, loaded: false });
    cleanup();
    vi.clearAllMocks();
  });

  it("renders notification panel when notifications tab is selected", () => {
    render(
      <AppThemePreferenceProvider>
        <MemoryRouter initialEntries={["/settings?tab=notifications"]}>
          <Routes>
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </MemoryRouter>
      </AppThemePreferenceProvider>,
    );

    expect(screen.getByTestId("notification-settings-panel")).toBeTruthy();
  });

  it("navigates back to workspace view from settings back button", () => {
    render(
      <AppThemePreferenceProvider>
        <MemoryRouter initialEntries={["/settings?tab=notifications"]}>
          <Routes>
            <Route path="/settings" element={<SettingsView />} />
            <Route path="/" element={<div data-testid="repos-view" />} />
          </Routes>
        </MemoryRouter>
      </AppThemePreferenceProvider>,
    );

    fireEvent.click(screen.getByTestId("settings-back-button"));

    expect(screen.getByTestId("repos-view")).toBeTruthy();
  });

  it("searches and selects one notification setting item", () => {
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
      target: { value: "focus" },
    });

    fireEvent.click(screen.getByRole("button", { name: /org\.settings\.notifications\.focusOnClick/ }));

    expect(screen.getByTestId("notification-settings-panel").getAttribute("data-focus-item-id")).toBe("focus-on-click");
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

  it("renders appearance theme cards and triggers preference change", () => {
    render(
      <AppThemePreferenceProvider>
        <MemoryRouter initialEntries={["/settings?tab=appearance"]}>
          <Routes>
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </MemoryRouter>
      </AppThemePreferenceProvider>,
    );

    expect(screen.getByTestId("settings-theme-option-light")).toBeTruthy();
    expect(screen.getByTestId("settings-theme-option-dark")).toBeTruthy();
    expect(screen.getByTestId("settings-theme-option-system").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("settings-theme-option-dark"));

    expect(window.localStorage.getItem(LAYOUT_STORE_STORAGE_KEY)).toContain('"themePreference":"dark"');
  });

  it("matches appearance theme settings in search and opens appearance tab", () => {
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
      target: { value: "dark" },
    });

    fireEvent.click(screen.getByRole("button", { name: /settings\.appearance\.theme\.title/ }));

    expect(screen.getByTestId("settings-theme-option-dark")).toBeTruthy();
  });

  it("renders terminal panel when terminal tab is selected", () => {
    render(
      <AppThemePreferenceProvider>
        <MemoryRouter initialEntries={["/settings?tab=terminal"]}>
          <Routes>
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </MemoryRouter>
      </AppThemePreferenceProvider>,
    );

    expect(screen.getByTestId("terminal-settings-panel")).toBeTruthy();
  });

  it("renders daemon panel when daemon tab is selected", () => {
    render(
      <AppThemePreferenceProvider>
        <MemoryRouter initialEntries={["/settings?tab=daemon"]}>
          <Routes>
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </MemoryRouter>
      </AppThemePreferenceProvider>,
    );

    expect(screen.getByTestId("daemon-settings-panel")).toBeTruthy();
  });

  it("matches daemon settings in search and opens daemon tab", () => {
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
      target: { value: "websocket" },
    });

    fireEvent.click(screen.getByRole("button", { name: /settings\.daemon\.title/ }));

    expect(screen.getByTestId("daemon-settings-panel")).toBeTruthy();
  });

  it("renders git workspace settings panel when workspace tab is selected", () => {
    render(
      <AppThemePreferenceProvider>
        <MemoryRouter initialEntries={["/settings?tab=workspace"]}>
          <Routes>
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </MemoryRouter>
      </AppThemePreferenceProvider>,
    );

    expect(screen.getByTestId("git-workspace-settings-panel")).toBeTruthy();
  });

  it("renders agent panel when agents tab is selected", () => {
    render(
      <AppThemePreferenceProvider>
        <MemoryRouter initialEntries={["/settings?tab=agents"]}>
          <Routes>
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </MemoryRouter>
      </AppThemePreferenceProvider>,
    );

    expect(screen.getByTestId("agent-settings-panel")).toBeTruthy();
  });

  it("renders current user profile details on account tab", () => {
    sessionStore.setState({
      currentUser: {
        id: "user-1",
        email: "user@example.com",
        name: "Test User",
        avatarUrl: "https://example.com/avatar.png",
      },
      organizations: [],
      selectedOrganizationId: undefined,
      loaded: true,
    });

    render(
      <AppThemePreferenceProvider>
        <MemoryRouter initialEntries={["/settings?tab=account"]}>
          <Routes>
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </MemoryRouter>
      </AppThemePreferenceProvider>,
    );

    expect(screen.getByText("settings.account.title")).toBeTruthy();
    expect(screen.getAllByText("Test User").length).toBeGreaterThan(0);
    expect(screen.getAllByText("user@example.com").length).toBeGreaterThan(0);
    expect(screen.getByText("user-1")).toBeTruthy();
  });

  it("renders account profile view by default", () => {
    sessionStore.setState({
      currentUser: {
        id: "user-1",
        email: "user@example.com",
        name: "Test User",
        avatarUrl: null,
      },
      organizations: [],
      selectedOrganizationId: undefined,
      loaded: true,
    });

    render(
      <AppThemePreferenceProvider>
        <MemoryRouter initialEntries={["/settings"]}>
          <Routes>
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </MemoryRouter>
      </AppThemePreferenceProvider>,
    );

    expect(screen.getByText("settings.account.title")).toBeTruthy();
    expect(screen.getAllByText("Test User").length).toBeGreaterThan(0);
  });

  it("renders account loading state safely", () => {
    render(
      <AppThemePreferenceProvider>
        <MemoryRouter initialEntries={["/settings?tab=account"]}>
          <Routes>
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </MemoryRouter>
      </AppThemePreferenceProvider>,
    );

    expect(screen.getByText("settings.account.loading")).toBeTruthy();
  });

  it("renders missing account profile state safely", () => {
    sessionStore.setState({ currentUser: null, organizations: [], selectedOrganizationId: undefined, loaded: true });

    render(
      <AppThemePreferenceProvider>
        <MemoryRouter initialEntries={["/settings?tab=account"]}>
          <Routes>
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </MemoryRouter>
      </AppThemePreferenceProvider>,
    );

    expect(screen.getByText("settings.account.empty")).toBeTruthy();
  });

  it("matches agent settings in search and opens agents tab", () => {
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
      target: { value: "codex" },
    });

    fireEvent.click(screen.getByRole("button", { name: /settings\.agents\.items\.codex/ }));

    expect(screen.getByTestId("agent-settings-panel")).toBeTruthy();
  });
});
