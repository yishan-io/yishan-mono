// @vitest-environment jsdom
import { sessionStore } from "@renderer/domains/session";
import { tabStore, workbenchNavigationStore } from "@renderer/domains/workbench";
import { workspaceStore } from "@renderer/domains/workspace";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { projectStore } from "../state/projectStore";
import { deleteProject } from "./projectCommands";

const mocks = vi.hoisted(() => ({ requestJson: vi.fn(), request: vi.fn() }));
vi.mock("@renderer/api/restClient", () => ({ requestJson: mocks.requestJson }));
vi.mock("@renderer/rpc/client", () => ({ request: mocks.request, subscribeConnectionStatus: vi.fn(() => vi.fn()) }));
vi.mock("@renderer/events/desktopRpcEventBus", () => ({ subscribeDesktopRpcEvent: vi.fn(() => vi.fn()) }));
const initial = {
  project: projectStore.getState(),
  workspace: workspaceStore.getState(),
  session: sessionStore.getState(),
  tabs: tabStore.getState(),
  navigation: workbenchNavigationStore.getState(),
};
beforeEach(() => {
  vi.resetAllMocks();
  sessionStore.setState({ selectedOrganizationId: "org", currentUserId: "actor", daemonId: "host" });
  projectStore.setState({
    projects: [
      { id: "project", name: "Missing", path: "/missing" },
      { id: "other", name: "Other" },
    ],
  });
  workbenchNavigationStore.getState().setActiveProjectId("project");
  workbenchNavigationStore.getState().setActiveWorkspaceId("primary");
  workspaceStore.setState({ workspaces: [] });
  for (const [workspaceId, projectId] of [
    ["primary", "project"],
    ["child", "project"],
    ["unrelated", "other"],
  ] as const) {
    workspaceStore.getState().addWorkspace({
      projectId,
      workspaceId,
      name: workspaceId,
      sourceBranch: "main",
      branch: "main",
      worktreePath: "/missing",
    });
  }
  tabStore.setState({
    tabs: ["primary", "child", "unrelated"].map((workspaceId) => ({
      id: `tab-${workspaceId}`,
      workspaceId,
      title: workspaceId,
      pinned: false,
      kind: "file" as const,
      data: { path: "file.ts", isDirty: false, isTemporary: false },
    })),
    selectedTabId: "",
    selectedTabIdByWorkspaceId: {},
  });
});
afterEach(() => {
  projectStore.setState(initial.project, true);
  workspaceStore.setState(initial.workspace, true);
  sessionStore.setState(initial.session, true);
  tabStore.setState(initial.tabs, true);
  workbenchNavigationStore.setState(initial.navigation, true);
  localStorage.clear();
});
it("DELETEs stable IDs without a directory/RPC prerequisite, then removes only owned records and tabs", async () => {
  let finish!: () => void;
  mocks.requestJson.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const deleting = deleteProject("project");
  expect(mocks.requestJson).toHaveBeenCalledWith("/orgs/org/projects/project", { method: "DELETE" });
  expect(workspaceStore.getState().workspaces).toHaveLength(3);
  expect(projectStore.getState().projects).toHaveLength(2);
  finish();
  await deleting;
  expect(projectStore.getState().projects.map((project) => project.id)).toEqual(["other"]);
  expect(workspaceStore.getState().workspaces.map((workspace) => workspace.id)).toEqual(["unrelated"]);
  expect(tabStore.getState().tabs.map((tab) => tab.workspaceId)).toEqual(["unrelated"]);
  expect(mocks.request).not.toHaveBeenCalled();
});
it.each([
  ["project", "primary", "", ""],
  ["other", "unrelated", "other", "unrelated"],
  ["project", "unrelated", "", "unrelated"],
  ["other", "child", "other", ""],
])(
  "deletion reconciles active selection %s / %s without creating orphan tabs",
  async (activeProjectId, activeWorkspaceId, expectedProjectId, expectedWorkspaceId) => {
    let finish!: () => void;
    mocks.requestJson.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const deleting = deleteProject("project");
    workbenchNavigationStore.getState().setActiveProjectId(activeProjectId);
    workbenchNavigationStore.getState().setActiveWorkspaceId(activeWorkspaceId);
    finish();
    await deleting;
    expect(workbenchNavigationStore.getState().activeProjectId).toBe(expectedProjectId);
    expect(workbenchNavigationStore.getState().activeWorkspaceId).toBe(expectedWorkspaceId);
    expect(tabStore.getState().tabs.map((tab) => tab.workspaceId)).toEqual(["unrelated"]);
    expect(mocks.request).not.toHaveBeenCalled();
  },
);
it("retains all records on API rejection", async () => {
  mocks.requestJson.mockRejectedValueOnce(new Error("offline"));
  await expect(deleteProject("project")).rejects.toThrow("offline");
  expect(projectStore.getState().projects).toHaveLength(2);
  expect(workspaceStore.getState().workspaces).toHaveLength(3);
  expect(tabStore.getState().tabs).toHaveLength(3);
  expect(workbenchNavigationStore.getState().activeProjectId).toBe("project");
  expect(workbenchNavigationStore.getState().activeWorkspaceId).toBe("primary");
});
it.each(["", "   "])("rejects blank ID %j without local success", async (id) => {
  await expect(deleteProject(id)).rejects.toThrow();
  expect(mocks.requestJson).not.toHaveBeenCalled();
  expect(projectStore.getState().projects).toHaveLength(2);
});
it("rejects a missing organization", async () => {
  sessionStore.setState({ selectedOrganizationId: "" });
  await expect(deleteProject("project")).rejects.toThrow();
  expect(mocks.requestJson).not.toHaveBeenCalled();
  expect(projectStore.getState().projects).toHaveLength(2);
});
it.each(["currentUserId", "selectedOrganizationId", "daemonId"] as const)(
  "protects new scope after %s changes away and back",
  async (key) => {
    let finish!: () => void;
    mocks.requestJson.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const deleting = deleteProject("project");
    const original = sessionStore.getState()[key];
    sessionStore.setState({ [key]: "new-scope" });
    sessionStore.setState({ [key]: original });
    finish();
    await deleting;
    expect(projectStore.getState().projects).toHaveLength(2);
    expect(workspaceStore.getState().workspaces).toHaveLength(3);
    expect(workbenchNavigationStore.getState().activeProjectId).toBe("project");
    expect(workbenchNavigationStore.getState().activeWorkspaceId).toBe("primary");
    expect(mocks.request).not.toHaveBeenCalled();
  },
);
