// @vitest-environment jsdom

import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RestApiError } from "../../api/restClient";
import { getAuthStatus, getDaemonInfo, getDesktopAppVersion } from "../../app/commands/appCommands";
import { listOrgNodes } from "../../features/node/commands/nodeCommands";
import { getSessionBootstrapData } from "../../features/session/commands/sessionCommands";
import { sessionStore } from "../../features/session/model/sessionStore";
import { rendererQueryClient } from "../../queryClient";
import { useSessionBootstrap } from "./sessionBootstrap";

vi.mock("../../app/commands/appCommands", () => ({
  getAuthStatus: vi.fn(async () => ({ authenticated: false })),
  getDaemonInfo: vi.fn(async () => ({ daemonId: "daemon-1", version: "0.0.0", wsUrl: "ws://127.0.0.1:0" })),
  getDesktopAppVersion: vi.fn(async () => "0.0.0"),
}));

vi.mock("../../rpc/rpcTransport", () => ({
  getDaemonClient: vi.fn(async () => ({})),
  subscribeDesktopRpcEvent: vi.fn(() => () => {}),
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

vi.mock("../../features/node/commands/nodeCommands", () => ({
  listOrgNodes: vi.fn(async () => []),
}));

describe("useSessionBootstrap", () => {
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
  });

  afterEach(() => {
    cleanup();
  });

  it("loads daemon identity on mount", async () => {
    renderHook(() => useSessionBootstrap());

    await waitFor(() => {
      expect(sessionStore.getState().appVersion).toBe("0.0.0");
      expect(sessionStore.getState().daemonId).toBe("daemon-1");
      expect(sessionStore.getState().daemonVersion).toBe("0.0.0");
    });
  });

  it("resolves auth status through the CLI command", async () => {
    sessionStore.setState({ isAuthenticated: false, authStatusResolved: false });
    vi.mocked(getAuthStatus).mockResolvedValueOnce({ authenticated: true });

    const { result } = renderHook(() => useSessionBootstrap());

    await waitFor(() => {
      expect(result.current.authStatusResolved).toBe(true);
      expect(sessionStore.getState().isAuthenticated).toBe(true);
    });
  });

  it("transitions back to unauthenticated when session bootstrap fails with 401", async () => {
    sessionStore.setState({ isAuthenticated: true, authStatusResolved: true });
    vi.mocked(getSessionBootstrapData).mockRejectedValue(new RestApiError("Unauthorized", 401));

    const { result } = renderHook(() => useSessionBootstrap());

    await waitFor(() => {
      expect(sessionStore.getState().isAuthenticated).toBe(false);
      expect(sessionStore.getState().authStatusResolved).toBe(true);
    });
    expect(sessionStore.getState().currentUser).toBeNull();
    expect(result.current.bootstrapReady).toBe(false);
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

    const { result } = renderHook(() => useSessionBootstrap());

    await waitFor(() => {
      expect(result.current.bootstrapReady).toBe(true);
    });

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

    const { result } = renderHook(() => useSessionBootstrap());

    await waitFor(() => {
      expect(sessionStore.getState().currentUserId).toBe("user-2");
      expect(result.current.bootstrapReady).toBe(true);
    });

    // The loaded session was replaced with the new account's data — without
    // the account-switch detection the stale user-1 session would have been
    // kept because the session was already loaded.
    expect(getSessionBootstrapData).toHaveBeenCalled();
    expect(sessionStore.getState().currentUser?.id).toBe("user-2");
    expect(sessionStore.getState().selectedOrganizationId).toBe("org-2");
    expect(rendererQueryClient.getQueryData(["session-bootstrap"])).toBeUndefined();
  });
});
