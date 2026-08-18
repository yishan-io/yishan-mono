// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

// Lazy settings tabs load real feature modules under full-suite load; the
// default 5s per-test timeout is too tight for the first load.
vi.setConfig({ testTimeout: 30000 });
import { sessionStore } from "../../../../domains/session/state/sessionStore";
import { AppThemePreferenceProvider } from "../../../../domains/settings";
import {
  DISPLAY_SETTINGS_STORE_STORAGE_KEY,
  displaySettingsStore,
} from "../../../../domains/settings/state/displaySettingsStore";
import { SettingsView } from "./SettingsView";

vi.mock("react-i18next", () => ({
  initReactI18next: {
    type: "3rdParty",
    init: () => undefined,
  },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../../../helpers/platform", () => ({
  getRendererPlatform: () => "linux",
}));

vi.mock("../notifications/NotificationSettingsView", () => ({
  NotificationSettingsView: ({ focusItemId }: { focusItemId?: string | null }) => (
    <div data-testid="notification-settings-panel" data-focus-item-id={focusItemId ?? ""} />
  ),
}));

vi.mock("../cli/CLISettingsView", () => ({
  CLISettingsView: () => <div data-testid="agent-settings-panel" />,
}));

vi.mock("../terminal/TerminalSettingsView", () => ({
  TerminalSettingsView: () => <div data-testid="terminal-settings-panel" />,
}));

vi.mock("../daemon/DaemonSettingsView", () => ({
  DaemonSettingsView: () => <div data-testid="daemon-settings-panel" />,
}));

vi.mock("../computer-use/ComputerUseSettingsView", () => ({
  ComputerUseSettingsView: () => <div data-testid="computer-use-settings-panel" />,
}));

vi.mock("../workspace/GitWorkspaceSettingsView", () => ({
  GitWorkspaceSettingsView: () => <div data-testid="git-workspace-settings-panel" />,
}));

vi.mock("../keybindings/KeybindingsSettingsView", () => ({
  KeybindingsSettingsView: () => <div data-testid="keybindings-settings-panel" />,
}));

vi.mock("../account/MemberSettingsView", () => ({
  MemberSettingsView: () => <div data-testid="member-settings-panel" />,
}));

vi.mock("../agent-skills/SkillsSettingsView", () => ({
  SkillsSettingsView: () => <div data-testid="skills-settings-panel" />,
}));

describe("SettingsView", () => {
  afterEach(() => {
    window.localStorage.removeItem(DISPLAY_SETTINGS_STORE_STORAGE_KEY);
    displaySettingsStore.setState({
      themePreference: "system",
      markdownPreviewFontSize: "medium",
      markdownPreviewWidth: "readable",
      isMarkdownOutlineVisible: false,
    });
    sessionStore.setState({ currentUser: null, organizations: [], selectedOrganizationId: undefined, loaded: false });
    cleanup();
    vi.clearAllMocks();
  });

  it("renders notification panel when notifications tab is selected", async () => {
    render(
      <AppThemePreferenceProvider>
        <MemoryRouter initialEntries={["/settings?tab=notifications"]}>
          <Routes>
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </MemoryRouter>
      </AppThemePreferenceProvider>,
    );

    expect(await screen.findByTestId("notification-settings-panel", {}, { timeout: 30000 })).toBeTruthy();
  });

  it("navigates back to workspace view from settings back button", async () => {
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

  it("searches and selects one notification setting item", async () => {
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

    fireEvent.click(await screen.findByRole("button", { name: /org\.settings\.notifications\.focusOnClick/ }));

    expect(
      (await screen.findByTestId("notification-settings-panel", {}, { timeout: 30000 })).getAttribute(
        "data-focus-item-id",
      ),
    ).toBe("focus-on-click");
  });

  it("shows empty-state text when search has no matching items", async () => {
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

  it("renders appearance theme cards and triggers preference change", async () => {
    render(
      <AppThemePreferenceProvider>
        <MemoryRouter initialEntries={["/settings?tab=appearance"]}>
          <Routes>
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </MemoryRouter>
      </AppThemePreferenceProvider>,
    );

    expect(await screen.findByTestId("settings-theme-option-light", {}, { timeout: 30000 })).toBeTruthy();
    expect(screen.getByTestId("settings-theme-option-dark")).toBeTruthy();
    expect(screen.getByTestId("settings-theme-option-system").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("settings-theme-option-dark"));

    expect(window.localStorage.getItem(DISPLAY_SETTINGS_STORE_STORAGE_KEY)).toContain('"themePreference":"dark"');
  });

  it("persists markdown preview font size and preview width", async () => {
    render(
      <AppThemePreferenceProvider>
        <MemoryRouter initialEntries={["/settings?tab=appearance"]}>
          <Routes>
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </MemoryRouter>
      </AppThemePreferenceProvider>,
    );

    fireEvent.mouseDown(
      await screen.findByLabelText("settings.appearance.markdown.previewFontSize.label", {}, { timeout: 30000 }),
    );
    fireEvent.click(screen.getByRole("option", { name: "settings.appearance.markdown.previewFontSize.options.large" }));

    fireEvent.mouseDown(
      await screen.findByLabelText("settings.appearance.markdown.previewWidth.label", {}, { timeout: 30000 }),
    );
    fireEvent.click(screen.getByRole("option", { name: "settings.appearance.markdown.previewWidth.options.full" }));

    expect(window.localStorage.getItem(DISPLAY_SETTINGS_STORE_STORAGE_KEY)).toContain(
      '"markdownPreviewFontSize":"large"',
    );
    expect(window.localStorage.getItem(DISPLAY_SETTINGS_STORE_STORAGE_KEY)).toContain('"markdownPreviewWidth":"full"');
  });

  it("persists markdown outline visibility", async () => {
    render(
      <AppThemePreferenceProvider>
        <MemoryRouter initialEntries={["/settings?tab=appearance"]}>
          <Routes>
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </MemoryRouter>
      </AppThemePreferenceProvider>,
    );

    fireEvent.click(
      await screen.findByLabelText("settings.appearance.markdown.outlineVisible.label", {}, { timeout: 30000 }),
    );

    expect(window.localStorage.getItem(DISPLAY_SETTINGS_STORE_STORAGE_KEY)).toContain(
      '"isMarkdownOutlineVisible":true',
    );
  });

  it("matches appearance theme settings in search and opens appearance tab", async () => {
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

    fireEvent.click(await screen.findByRole("button", { name: /settings\.appearance\.theme\.title/ }));

    expect(await screen.findByTestId("settings-theme-option-dark", {}, { timeout: 30000 })).toBeTruthy();
  });

  it("renders terminal panel when terminal tab is selected", async () => {
    render(
      <AppThemePreferenceProvider>
        <MemoryRouter initialEntries={["/settings?tab=terminal"]}>
          <Routes>
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </MemoryRouter>
      </AppThemePreferenceProvider>,
    );

    expect(await screen.findByTestId("terminal-settings-panel", {}, { timeout: 30000 })).toBeTruthy();
  });

  it("renders daemon panel when daemon tab is selected", async () => {
    render(
      <AppThemePreferenceProvider>
        <MemoryRouter initialEntries={["/settings?tab=daemon"]}>
          <Routes>
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </MemoryRouter>
      </AppThemePreferenceProvider>,
    );

    expect(await screen.findByTestId("daemon-settings-panel", {}, { timeout: 30000 })).toBeTruthy();
  });

  it("renders members panel when members tab is selected", async () => {
    render(
      <AppThemePreferenceProvider>
        <MemoryRouter initialEntries={["/settings?tab=members"]}>
          <Routes>
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </MemoryRouter>
      </AppThemePreferenceProvider>,
    );

    expect(await screen.findByTestId("member-settings-panel", {}, { timeout: 30000 })).toBeTruthy();
  });

  it("matches member settings in search and opens members tab", async () => {
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
      target: { value: "role" },
    });

    fireEvent.click(await screen.findByRole("button", { name: /settings\.members\.title/ }));

    expect(await screen.findByTestId("member-settings-panel", {}, { timeout: 30000 })).toBeTruthy();
  });

  it("matches daemon settings in search and opens daemon tab", async () => {
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

    fireEvent.click(await screen.findByRole("button", { name: /settings\.daemon\.title/ }));

    expect(await screen.findByTestId("daemon-settings-panel", {}, { timeout: 30000 })).toBeTruthy();
  });

  it("renders computer use panel when computerUse tab is selected", async () => {
    render(
      <AppThemePreferenceProvider>
        <MemoryRouter initialEntries={["/settings?tab=computerUse"]}>
          <Routes>
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </MemoryRouter>
      </AppThemePreferenceProvider>,
    );

    expect(await screen.findByTestId("computer-use-settings-panel", {}, { timeout: 30000 })).toBeTruthy();
  });

  it("renders git workspace settings panel when workspace tab is selected", async () => {
    render(
      <AppThemePreferenceProvider>
        <MemoryRouter initialEntries={["/settings?tab=workspace"]}>
          <Routes>
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </MemoryRouter>
      </AppThemePreferenceProvider>,
    );

    expect(await screen.findByTestId("git-workspace-settings-panel", {}, { timeout: 30000 })).toBeTruthy();
  });

  it("renders the agents section when the cli tab is selected", async () => {
    render(
      <AppThemePreferenceProvider>
        <MemoryRouter initialEntries={["/settings?tab=cli"]}>
          <Routes>
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </MemoryRouter>
      </AppThemePreferenceProvider>,
    );

    expect(await screen.findByTestId("agent-settings-panel", {}, { timeout: 30000 })).toBeTruthy();
  });

  it("renders skills panel when the customize tab deep-links to skills", async () => {
    render(
      <AppThemePreferenceProvider>
        <MemoryRouter initialEntries={["/settings?tab=customize&focus=skills"]}>
          <Routes>
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </MemoryRouter>
      </AppThemePreferenceProvider>,
    );

    expect(await screen.findByTestId("skills-settings-panel", {}, { timeout: 30000 })).toBeTruthy();
  });

  it("renders current user profile details on account tab", async () => {
    sessionStore.setState({
      currentUser: {
        id: "user-1",
        email: "user@example.com",
        name: "Test User",
        avatarUrl: "https://example.com/avatar.png",
      },
      organizations: [
        {
          id: "org-1",
          name: "Acme Org",
          plan: "pro",
          members: [{ userId: "user-1", role: "admin" }],
          voiceUsage: { quotaMinutes: 300, usedSeconds: 120, remainingSeconds: 17_880 },
        },
      ],
      selectedOrganizationId: "org-1",
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

    expect(await screen.findByText("settings.account.title", {}, { timeout: 30000 })).toBeTruthy();
    expect(screen.getAllByText("Test User").length).toBeGreaterThan(0);
    expect(screen.getAllByText("user@example.com").length).toBeGreaterThan(0);
    expect(screen.getByText("user-1")).toBeTruthy();
    expect(screen.getByText("Acme Org")).toBeTruthy();
    expect(screen.getByText("Pro")).toBeTruthy();
    expect(screen.getByText("admin")).toBeTruthy();
    expect(screen.getByText("settings.account.organization.title")).toBeTruthy();
    expect(screen.getByText("settings.account.usage.title")).toBeTruthy();
    expect(screen.getByText("settings.account.usage.voiceInput")).toBeTruthy();
    expect(screen.getByText("settings.account.usage.summary")).toBeTruthy();
  });

  it("renders account profile view by default", async () => {
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

    expect(await screen.findByText("settings.account.title", {}, { timeout: 30000 })).toBeTruthy();
    expect(screen.getAllByText("Test User").length).toBeGreaterThan(0);
  });

  it("renders account loading state safely", async () => {
    render(
      <AppThemePreferenceProvider>
        <MemoryRouter initialEntries={["/settings?tab=account"]}>
          <Routes>
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </MemoryRouter>
      </AppThemePreferenceProvider>,
    );

    expect(await screen.findByText("settings.account.loading", {}, { timeout: 30000 })).toBeTruthy();
  });

  it("renders missing account profile state safely", async () => {
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

    expect(await screen.findByText("settings.account.empty", {}, { timeout: 30000 })).toBeTruthy();
  });

  it("matches agent settings in search and opens the cli tab", async () => {
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

    fireEvent.click(await screen.findByRole("button", { name: /settings\.agents\.items\.codex/ }));

    expect(await screen.findByTestId("agent-settings-panel", {}, { timeout: 30000 })).toBeTruthy();
  });

  it("renders keybindings panel when keybindings tab is selected", async () => {
    render(
      <AppThemePreferenceProvider>
        <MemoryRouter initialEntries={["/settings?tab=keybindings"]}>
          <Routes>
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </MemoryRouter>
      </AppThemePreferenceProvider>,
    );

    expect(await screen.findByTestId("keybindings-settings-panel", {}, { timeout: 30000 })).toBeTruthy();
  });
});
