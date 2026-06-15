// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionStore } from "../store/sessionStore";
import { workspaceUiStore } from "../store/workspaceUiStore";
import { switchOrganization } from "./orgCommands";

const rpcMocks = vi.hoisted(() => ({
  setCurrentOrg: vi.fn(async () => undefined),
}));

vi.mock("../api", () => ({
  api: {
    org: {
      addMember: vi.fn(),
      cancelInvite: vi.fn(),
      leave: vi.fn(),
      removeMember: vi.fn(),
    },
  },
}));

vi.mock("../rpc/rpcTransport", () => ({
  getDaemonClient: vi.fn(async () => ({
    context: {
      setCurrentOrg: rpcMocks.setCurrentOrg,
    },
  })),
}));

const initialSessionStoreState = sessionStore.getState();
const initialWorkspaceUiStoreState = workspaceUiStore.getState();

afterEach(() => {
  sessionStore.setState(initialSessionStoreState, true);
  workspaceUiStore.setState(initialWorkspaceUiStoreState, true);
  vi.clearAllMocks();
});

describe("orgCommands", () => {
  it("closes any open workspace overlay when switching organizations", async () => {
    sessionStore.setState({
      authStatusResolved: true,
      currentUser: null,
      isAuthenticated: true,
      loaded: true,
      organizations: [
        { id: "org-1", name: "Org 1" },
        { id: "org-2", name: "Org 2" },
      ],
      selectedOrganizationId: "org-1",
    });
    workspaceUiStore.setState({ overlayPanel: "overview" });

    await switchOrganization("org-2");

    expect(workspaceUiStore.getState().overlayPanel).toBeNull();
    expect(sessionStore.getState().selectedOrganizationId).toBe("org-2");
    expect(rpcMocks.setCurrentOrg).toHaveBeenCalledWith("org-2");
  });
});
