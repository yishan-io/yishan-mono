// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionStore } from "../../../domains/session/state/sessionStore";
import { AppMenuView } from "./AppMenuView";

vi.mock("react-i18next", () => ({
  initReactI18next: {
    type: "3rdParty",
    init: () => undefined,
  },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const { setThemePreference, openExternalUrl, switchOrganization, logout } = vi.hoisted(() => ({
  setThemePreference: vi.fn(),
  openExternalUrl: vi.fn(async () => undefined),
  switchOrganization: vi.fn(async () => undefined),
  logout: vi.fn(async () => undefined),
}));

vi.mock("../../../domains/settings/hooks/useThemePreference", () => ({
  useThemePreference: () => ({
    themePreference: "system",
    setThemePreference,
  }),
}));

vi.mock("../../../commands/useCommands", () => {
  const commandSurface = () => ({
    openExternalUrl,
    switchOrganization,
    logout,
  });
  return {
    useAppCommands: commandSurface,
    useSessionCommands: commandSurface,
    useWorkspaceCommands: commandSurface,
    useAgentCommands: commandSurface,
    useGitCommands: commandSurface,
    useNodeCommands: commandSurface,
    useNotificationCommands: commandSurface,
    useOrganizationCommands: commandSurface,
    useOverviewCommands: commandSurface,
    useScheduledJobCommands: commandSurface,
    useFileCommands: commandSurface,
    useProjectCommands: commandSurface,
    useWorkbenchCommands: commandSurface,
    useTerminalCommands: commandSurface,
    useSettingsCommands: commandSurface,
  };
});

vi.mock("@renderer/platform/platform", () => ({
  getRendererPlatform: () => "darwin",
}));

vi.mock("../../../shortcuts/shortcutDisplay", () => ({
  getShortcutDisplayLabelById: () => "⌘+K",
}));

vi.mock("../../../domains/organization/features/create-organization/CreateOrganizationDialogView", () => ({
  CreateOrganizationDialogView: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-organization-dialog">create-organization-dialog</div> : null,
}));

/** Exposes route changes to exercise AppMenuView location-driven close behavior. */
function RouterControls() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => {
        navigate("/settings");
      }}
    >
      go-settings
    </button>
  );
}

/** Renders AppMenuView inside a memory router for focused behavior tests. */
function renderAppMenuView() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <RouterControls />
      <Routes>
        <Route path="/" element={<AppMenuView />} />
        <Route path="/settings" element={<AppMenuView />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppMenuView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStore.setState({
      currentUser: {
        id: "user-1",
        email: "user@example.com",
        name: "User Example",
        avatarUrl: null,
      },
      organizations: [
        { id: "org-1", name: "Organization One" },
        { id: "org-2", name: "Organization Two" },
      ],
      selectedOrganizationId: "org-1",
      loaded: true,
      isAuthenticated: true,
      authStatusResolved: true,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("closes the main menu when the route changes", async () => {
    renderAppMenuView();

    fireEvent.click(screen.getByRole("button", { name: "org.menu.trigger" }));
    expect(screen.getByRole("button", { name: "org.menu.settings" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "go-settings" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "org.menu.settings" })).toBeNull();
    });
  });

  it("opens the create organization dialog from the organization submenu", async () => {
    renderAppMenuView();

    fireEvent.click(screen.getByRole("button", { name: "org.menu.trigger" }));
    fireEvent.click(screen.getByRole("button", { name: "org.menu.organizations" }));
    fireEvent.click(screen.getByRole("button", { name: "org.menu.newOrganization" }));

    expect(await screen.findByTestId("create-organization-dialog")).toBeTruthy();
  });

  it("closes both menus without switching when the selected organization is clicked", async () => {
    renderAppMenuView();

    fireEvent.click(screen.getByRole("button", { name: "org.menu.trigger" }));
    fireEvent.click(screen.getByRole("button", { name: "org.menu.organizations" }));
    fireEvent.click(screen.getByRole("button", { name: "Organization One" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "org.menu.settings" })).toBeNull();
    });
    expect(switchOrganization).not.toHaveBeenCalled();
  });
});
