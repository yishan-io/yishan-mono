// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import { createOrganization } from "../../api";
import { RestApiError } from "../../api/restClient";
import { getSessionBootstrapData } from "../../features/session/commands/sessionCommands";
import { listOrgNodes } from "../../commands/nodeCommands";
import { getAuthStatus, getDaemonInfo, getDesktopAppVersion } from "../../commands/appCommands";
import { rendererQueryClient } from "../../queryClient";
import { sessionStore } from "../../features/session/model/sessionStore";
import { ApplicationRouterView, NotFoundRouteView } from "./ApplicationRouterView";

vi.mock("react-i18next", () => ({
  initReactI18next: {
    type: "3rdParty",
    init: () => undefined,
  },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../commands/appCommands", () => ({
  getAuthStatus: vi.fn(async () => ({ authenticated: false })),
  getDaemonInfo: vi.fn(async () => ({ daemonId: "daemon-1", version: "0.0.0", wsUrl: "ws://127.0.0.1:0" })),
  getDesktopAppVersion: vi.fn(async () => "0.0.0"),
}));

vi.mock("../../rpc/rpcTransport", () => ({
  getDaemonClient: vi.fn(async () => ({})),
}));

vi.mock("../../features/session/commands/sessionCommands", () => ({
  isAuthExpiredError: (error: unknown) => error instanceof RestApiError && error.status === 401,
  getSessionBootstrapData: vi.fn(async () => ({
    currentUser: {
      id: "user-1",
      email: "user@example.com",
      name: "User",
      avatarUrl: null,
      notificationPreferences: {
        schemaVersion: 1,
        enabled: true,
        osEnabled: true,
        soundEnabled: true,
        volume: 1,
        focusOnClick: true,
        enabledEventTypes: ["run-finished", "run-failed"],
        eventSounds: {
          "run-finished": "chime",
          "run-failed": "alert",
          "pending-question": "ping",
        },
      },
    },
    organizations: [
      {
        id: "org-1",
        name: "Organization",
      },
    ],
  })),
}));

vi.mock("../../commands/nodeCommands", () => ({
  listOrgNodes: vi.fn(async () => []),
}));

vi.mock("../../api", () => ({
  createOrganization: vi.fn(async () => ({ id: "org-2", name: "New Organization" })),
}));

vi.mock("../WorkspaceView", async () => {
  const reactModule = await import("react");

  return {
    WorkspaceView: () => {
      const [value, setValue] = reactModule.useState("");

      return (
        <label htmlFor="workspace-input">
          workspace-view
          <input
            id="workspace-input"
            data-testid="workspace-input"
            value={value}
            onChange={(event) => {
              setValue(event.currentTarget.value);
            }}
          />
        </label>
      );
    },
  };
});

vi.mock("../LoginView", () => ({
  LoginView: () => <div data-testid="login-view">login-view</div>,
}));

vi.mock("./AppBootstrapLoadingView", () => ({
  AppBootstrapLoadingView: () => <div data-testid="bootstrap-loading-view">bootstrap-loading</div>,
}));

vi.mock("./AppMenuView", () => ({
  AppMenuView: () => <div data-testid="app-menu-view" />,
}));

/** Exposes lightweight route controls for testing route transitions within one router instance. */
function RouterControls() {
  const navigate = useNavigate();

  return (
    <>
      <button type="button" onClick={() => navigate("/")}>
        to-repos
      </button>
      <button type="button" onClick={() => navigate("/settings")}>
        to-settings
      </button>
      <button type="button" onClick={() => navigate("/unknown")}>
        to-unknown
      </button>
    </>
  );
}

/** Renders the application router inside one memory router for route-state tests. */
function renderApplicationRouter(initialEntry = "/") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <RouterControls />
      <Routes>
        <Route path="/" element={<ApplicationRouterView />}>
          <Route index element={null} />
          <Route path="settings" element={<div data-testid="settings-overlay">settings-overlay</div>} />
        </Route>
        <Route path="*" element={<NotFoundRouteView />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ApplicationRouterView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    rendererQueryClient.clear();
    sessionStore.setState({ isAuthenticated: false, authStatusResolved: true });
    sessionStore.getState().clearSessionData();
    vi.mocked(getAuthStatus).mockResolvedValue({ authenticated: false });
    vi.mocked(getDaemonInfo).mockResolvedValue({ daemonId: "daemon-1", version: "0.0.0", wsUrl: "ws://127.0.0.1:0" });
    vi.mocked(getDesktopAppVersion).mockResolvedValue("0.0.0");
    vi.mocked(getSessionBootstrapData).mockResolvedValue({
      currentUser: {
        id: "user-1",
        email: "user@example.com",
        name: "User",
        avatarUrl: null,
        notificationPreferences: {
          schemaVersion: 1,
          enabled: true,
          osEnabled: true,
          soundEnabled: true,
          volume: 1,
          focusOnClick: true,
          enabledEventTypes: ["run-finished", "run-failed"],
          eventSounds: {
            "run-finished": "chime",
            "run-failed": "alert",
            "pending-question": "ping",
          },
        },
      },
      organizations: [
        {
          id: "org-1",
          name: "Organization",
        },
      ],
    });
    vi.mocked(listOrgNodes).mockResolvedValue([]);
    vi.mocked(createOrganization).mockResolvedValue({ id: "org-2", name: "New Organization" });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders login view on / route while user is not authenticated", () => {
    renderApplicationRouter("/");

    expect(screen.getByTestId("login-view")).toBeTruthy();
    expect(screen.queryByTestId("workspace-input")).toBeNull();
  });

  it("renders workspace view on / route after user is authenticated", async () => {
    sessionStore.setState({ isAuthenticated: true, authStatusResolved: true });
    renderApplicationRouter("/");

    expect(await screen.findByTestId("workspace-input")).toBeTruthy();
    expect(screen.queryByTestId("settings-overlay")).toBeNull();
  });

  it("renders first organization setup when authenticated user has no organizations", async () => {
    sessionStore.setState({ isAuthenticated: true, authStatusResolved: true });
    vi.mocked(getSessionBootstrapData).mockResolvedValueOnce({
      currentUser: {
        id: "user-1",
        email: "user@example.com",
        name: "User",
        avatarUrl: null,
        notificationPreferences: {
          schemaVersion: 1,
          enabled: true,
          osEnabled: true,
          soundEnabled: true,
          volume: 1,
          focusOnClick: true,
          enabledEventTypes: ["run-finished", "run-failed"],
          eventSounds: {
            "run-finished": "chime",
            "run-failed": "alert",
            "pending-question": "ping",
          },
        },
      },
      organizations: [],
    });

    renderApplicationRouter("/");

    expect(await screen.findByText("onboarding.firstOrganization.title")).toBeTruthy();
    expect(screen.queryByTestId("workspace-input")).toBeNull();
    expect(listOrgNodes).not.toHaveBeenCalled();
  });

  it("creates first organization and enters workspace", async () => {
    sessionStore.setState({ isAuthenticated: true, authStatusResolved: true });
    vi.mocked(getSessionBootstrapData).mockResolvedValueOnce({
      currentUser: {
        id: "user-1",
        email: "user@example.com",
        name: "User",
        avatarUrl: null,
        notificationPreferences: {
          schemaVersion: 1,
          enabled: true,
          osEnabled: true,
          soundEnabled: true,
          volume: 1,
          focusOnClick: true,
          enabledEventTypes: ["run-finished", "run-failed"],
          eventSounds: {
            "run-finished": "chime",
            "run-failed": "alert",
            "pending-question": "ping",
          },
        },
      },
      organizations: [],
    });

    renderApplicationRouter("/");

    const input = (await screen.findByRole("textbox", { name: "org.menu.newOrganizationPrompt" })) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Acme" } });
    fireEvent.click(screen.getByRole("button", { name: "onboarding.firstOrganization.submit" }));

    expect(await screen.findByTestId("workspace-input")).toBeTruthy();
    expect(createOrganization).toHaveBeenCalledWith("Acme");
  });

  it("uses created organization directly from create response without extra list call", async () => {
    sessionStore.setState({ isAuthenticated: true, authStatusResolved: true });
    vi.mocked(getSessionBootstrapData).mockResolvedValueOnce({
      currentUser: {
        id: "user-1",
        email: "user@example.com",
        name: "User",
        avatarUrl: null,
        notificationPreferences: {
          schemaVersion: 1,
          enabled: true,
          osEnabled: true,
          soundEnabled: true,
          volume: 1,
          focusOnClick: true,
          enabledEventTypes: ["run-finished", "run-failed"],
          eventSounds: {
            "run-finished": "chime",
            "run-failed": "alert",
            "pending-question": "ping",
          },
        },
      },
      organizations: [],
    });

    renderApplicationRouter("/");

    const input = (await screen.findByRole("textbox", { name: "org.menu.newOrganizationPrompt" })) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Acme" } });
    fireEvent.click(screen.getByRole("button", { name: "onboarding.firstOrganization.submit" }));

    expect(await screen.findByTestId("workspace-input")).toBeTruthy();
    expect(createOrganization).toHaveBeenCalledWith("Acme");

    // Session store should contain exactly the created organization from the
    // create response — no separate list call needed.
    const { organizations, selectedOrganizationId } = sessionStore.getState();
    expect(organizations).toEqual([{ id: "org-2", name: "New Organization" }]);
    expect(selectedOrganizationId).toBe("org-2");
  });

  it("invalidates session-bootstrap cache after org creation", async () => {
    sessionStore.setState({ isAuthenticated: true, authStatusResolved: true });
    vi.mocked(getSessionBootstrapData).mockResolvedValueOnce({
      currentUser: {
        id: "user-1",
        email: "user@example.com",
        name: "User",
        avatarUrl: null,
        notificationPreferences: {
          schemaVersion: 1,
          enabled: true,
          osEnabled: true,
          soundEnabled: true,
          volume: 1,
          focusOnClick: true,
          enabledEventTypes: ["run-finished", "run-failed"],
          eventSounds: {
            "run-finished": "chime",
            "run-failed": "alert",
            "pending-question": "ping",
          },
        },
      },
      organizations: [],
    });

    renderApplicationRouter("/");

    const input = (await screen.findByRole("textbox", { name: "org.menu.newOrganizationPrompt" })) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Acme" } });
    fireEvent.click(screen.getByRole("button", { name: "onboarding.firstOrganization.submit" }));

    await screen.findByTestId("workspace-input");

    // After org creation, the stale session-bootstrap query should be invalidated
    // so that any subsequent re-fetch returns fresh data.
    const queryState = rendererQueryClient.getQueryState(["session-bootstrap"]);
    expect(queryState?.isInvalidated).toBe(true);
  });

  it("does not flash bootstrap loading view when transitioning from org creation to workspace", async () => {
    sessionStore.setState({ isAuthenticated: true, authStatusResolved: true });
    vi.mocked(getSessionBootstrapData).mockResolvedValueOnce({
      currentUser: {
        id: "user-1",
        email: "user@example.com",
        name: "User",
        avatarUrl: null,
        notificationPreferences: {
          schemaVersion: 1,
          enabled: true,
          osEnabled: true,
          soundEnabled: true,
          volume: 1,
          focusOnClick: true,
          enabledEventTypes: ["run-finished", "run-failed"],
          eventSounds: {
            "run-finished": "chime",
            "run-failed": "alert",
            "pending-question": "ping",
          },
        },
      },
      organizations: [],
    });

    renderApplicationRouter("/");

    const input = (await screen.findByRole("textbox", { name: "org.menu.newOrganizationPrompt" })) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Acme" } });
    fireEvent.click(screen.getByRole("button", { name: "onboarding.firstOrganization.submit" }));

    // After org creation, workspace view should appear without the bootstrap
    // loading view flashing in between.
    await screen.findByTestId("workspace-input");
    expect(screen.queryByTestId("bootstrap-loading-view")).toBeNull();
  });

  it("keeps workspace mounted while showing settings overlay", async () => {
    sessionStore.setState({ isAuthenticated: true, authStatusResolved: true });
    renderApplicationRouter("/");

    const input = (await screen.findByTestId("workspace-input")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "sticky-state" } });
    fireEvent.click(screen.getByText("to-settings"));

    expect(screen.getByTestId("settings-overlay")).toBeTruthy();
    expect((screen.getByTestId("workspace-input") as HTMLInputElement).value).toBe("sticky-state");

    fireEvent.click(screen.getByText("to-repos"));

    expect(screen.queryByTestId("settings-overlay")).toBeNull();
    expect((screen.getByTestId("workspace-input") as HTMLInputElement).value).toBe("sticky-state");
  });

  it("shows settings overlay with keybindings tab while preserving workspace state", async () => {
    sessionStore.setState({ isAuthenticated: true, authStatusResolved: true });
    renderApplicationRouter("/");

    fireEvent.click(screen.getByText("to-settings"));

    expect(await screen.findByTestId("settings-overlay")).toBeTruthy();
  });

  it("shows not-found state for unknown routes and allows returning", async () => {
    sessionStore.setState({ isAuthenticated: true, authStatusResolved: true });
    renderApplicationRouter("/unknown");

    expect(screen.getByText("routing.notFound.title")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "routing.notFound.backToWorkspace" }));

    expect(await screen.findByTestId("workspace-input")).toBeTruthy();
    expect(screen.queryByText("routing.notFound.title")).toBeNull();
  });

  it("resolves auth status through CLI command before showing authenticated app", async () => {
    sessionStore.setState({ isAuthenticated: false, authStatusResolved: false });
    vi.mocked(getAuthStatus).mockResolvedValueOnce({ authenticated: true });

    renderApplicationRouter("/");

    expect(await screen.findByTestId("workspace-input")).toBeTruthy();
  });

  it("returns to login view when session bootstrap fails with 401", async () => {
    sessionStore.setState({ isAuthenticated: true, authStatusResolved: true });
    vi.mocked(getSessionBootstrapData).mockRejectedValue(new RestApiError("Unauthorized", 401));

    renderApplicationRouter("/");

    expect(await screen.findByTestId("login-view")).toBeTruthy();
    expect(screen.queryByTestId("bootstrap-loading-view")).toBeNull();
    expect(screen.queryByTestId("workspace-input")).toBeNull();
  });

  it("clears query cache and resets org selection when persisted user differs from fetched session user", async () => {
    sessionStore.setState({
      isAuthenticated: true,
      authStatusResolved: true,
      currentUserId: "user-legacy",
      selectedOrganizationId: "org-legacy",
    });
    // Cache from the previous account must be dropped on switch.
    rendererQueryClient.setQueryData(["org-nodes", "org-legacy"], [{ id: "node-legacy" }]);
    rendererQueryClient.setQueryData(["some-query"], { data: "stale" });

    renderApplicationRouter("/");

    expect(await screen.findByTestId("workspace-input")).toBeTruthy();

    expect(rendererQueryClient.getQueryData(["org-nodes", "org-legacy"])).toBeUndefined();
    expect(rendererQueryClient.getQueryData(["some-query"])).toBeUndefined();
    expect(listOrgNodes).not.toHaveBeenCalledWith("org-legacy");
    expect(sessionStore.getState().currentUserId).toBe("user-1");
    expect(sessionStore.getState().currentUser?.id).toBe("user-1");
    // The previous user's org selection is dropped; the new session selects
    // from its own org list.
    expect(sessionStore.getState().selectedOrganizationId).toBe("org-1");
  });

  it("re-fetches and resets when persisted user id changes while a session is loaded", async () => {
    // A session is already loaded (renderer running as user-1).
    sessionStore.getState().setSessionData({
      currentUser: { id: "user-1", email: "a@example.com", name: "A", avatarUrl: null },
      organizations: [{ id: "org-1", name: "Org A" }],
      selectedOrganizationId: "org-1",
    });
    // The persisted account anchor changed while the session stayed loaded —
    // e.g. zustand persist propagating a login made in another window via the
    // localStorage storage event (the renderer's own logout clears the whole
    // store, so this path is about an anchor update that bypasses it).
    sessionStore.setState({ currentUserId: "user-2", isAuthenticated: true, authStatusResolved: true });
    vi.mocked(getSessionBootstrapData).mockResolvedValueOnce({
      currentUser: {
        id: "user-2",
        email: "b@example.com",
        name: "B",
        avatarUrl: null,
        notificationPreferences: {
          schemaVersion: 1,
          enabled: true,
          osEnabled: true,
          soundEnabled: true,
          volume: 1,
          focusOnClick: true,
          enabledEventTypes: ["run-finished", "run-failed"],
          eventSounds: {
            "run-finished": "chime",
            "run-failed": "alert",
            "pending-question": "ping",
          },
        },
      },
      organizations: [{ id: "org-2", name: "Org B" }],
    });

    renderApplicationRouter("/");

    expect(await screen.findByTestId("workspace-input")).toBeTruthy();

    // The loaded session was replaced with the new account's data — without
    // the account-switch detection the stale user-1 session would have been
    // kept because the session was already loaded.
    expect(getSessionBootstrapData).toHaveBeenCalled();
    expect(sessionStore.getState().currentUserId).toBe("user-2");
    expect(sessionStore.getState().currentUser?.id).toBe("user-2");
    expect(sessionStore.getState().selectedOrganizationId).toBe("org-2");
    expect(rendererQueryClient.getQueryData(["session-bootstrap"])).toBeUndefined();
  });
});
