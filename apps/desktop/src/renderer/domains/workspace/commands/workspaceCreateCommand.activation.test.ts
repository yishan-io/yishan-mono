// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { projectStore } from "@renderer/domains/project";
import { sessionStore } from "@renderer/domains/session";
import { tabStore, workbenchNavigationStore } from "@renderer/domains/workbench";
import { workspaceCreateProgressStore } from "../state/workspaceCreateProgressStore";
import { workspaceStore } from "../state/workspaceStore";
import { createWorkspace } from "./workspaceCreateCommand";

const daemonMocks = vi.hoisted(() => ({
  createWorkspace: vi.fn(),
}));

vi.mock("@renderer/rpc", () => ({
  subscribeConnectionStatus: vi.fn(() => vi.fn()),
}));

vi.mock("@renderer/events/desktopRpcEventBus", () => ({
  subscribeDesktopRpcEvent: vi.fn(() => vi.fn()),
}));

vi.mock("../daemon/daemonWorkspaceClient", () => ({
  subscribeDaemonConnectionStatus: vi.fn(() => vi.fn()),
  getWorkspaceRpc: () =>
    Promise.resolve({
      createWorkspace: daemonMocks.createWorkspace,
    }),
}));

vi.mock("../state/workspaceLifecycleNoticeStore", () => ({
  enqueueWorkspaceErrorNotice: vi.fn(),
  enqueueWorkspaceLifecycleWarnings: vi.fn(),
}));

const initialProjectStoreState = projectStore.getState();
const initialSessionStoreState = sessionStore.getState();
const initialTabStoreState = tabStore.getState();
const initialWorkbenchNavigationStoreState = workbenchNavigationStore.getState();
const initialWorkspaceCreateProgressStoreState = workspaceCreateProgressStore.getState();
const initialWorkspaceStoreState = workspaceStore.getState();

afterEach(() => {
  projectStore.setState(initialProjectStoreState, true);
  sessionStore.setState(initialSessionStoreState, true);
  tabStore.setState(initialTabStoreState, true);
  workbenchNavigationStore.setState(initialWorkbenchNavigationStoreState, true);
  workspaceCreateProgressStore.setState(initialWorkspaceCreateProgressStoreState, true);
  workspaceStore.setState(initialWorkspaceStoreState, true);
  vi.clearAllMocks();
});

describe("createWorkspace activation", () => {
  it("activates the created workspace and its project", async () => {
    const resolveTabForWorkspace = vi.fn();
    tabStore.setState({ resolveTabForWorkspace });
    sessionStore.setState({ selectedOrganizationId: "org-1" });
    projectStore.setState({
      projects: [
        {
          id: "project-created",
          key: "project-created",
          name: "Created project",
          path: "/tmp/project-created",
          localPath: "/tmp/project-created",
        },
      ],
    });
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-existing",
          projectId: "project-existing",
          repoId: "project-existing",
          name: "Existing workspace",
          title: "Existing workspace",
          summaryId: "workspace-existing",
          sourceBranch: "main",
          branch: "existing",
        },
      ],
    });
    workbenchNavigationStore.setState({
      activeWorkspaceId: "workspace-existing",
      activeProjectId: "project-existing",
    });
    daemonMocks.createWorkspace.mockResolvedValueOnce({ workspaceId: "workspace-created" });

    await createWorkspace({
      projectId: "project-created",
      name: "created",
      sourceBranch: "main",
      targetBranch: "created",
    });

    expect(workspaceStore.getState().workspaces).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "workspace-created", projectId: "project-created" })]),
    );
    expect(workbenchNavigationStore.getState()).toMatchObject({
      activeWorkspaceId: "workspace-created",
      activeProjectId: "project-created",
    });
    expect(resolveTabForWorkspace).toHaveBeenCalledWith("workspace-created");
  });
});
