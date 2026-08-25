import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  activateWorkspace: vi.fn(),
  openTab: vi.fn(),
  workspaces: [
    { id: "workspace-managed", projectId: "project-1", repoId: "project-1", kind: "managed" },
    { id: "workspace-local", projectId: "project-1", repoId: "project-1", kind: "local" },
  ],
}));

vi.mock("@renderer/domains/workbench", () => ({
  activateWorkspace: mocked.activateWorkspace,
  openTab: mocked.openTab,
}));
vi.mock("@renderer/domains/workspace", () => ({
  selectFolderInFileTree: vi.fn(),
  workspaceStore: { getState: () => ({ workspaces: mocked.workspaces }) },
  resolveLocalWorkspaceIdForProject: (workspaces: typeof mocked.workspaces, projectId: string) =>
    workspaces.find((workspace) => workspace.kind === "local" && workspace.projectId === projectId)?.id ?? "",
}));

import {
  navigateToLocalTaskProject,
  navigateToLocalTaskWorkspace,
  openLocalTaskContextFile,
} from "./localTaskCommands";

describe("Local Task navigation commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.workspaces.splice(
      0,
      mocked.workspaces.length,
      { id: "workspace-managed", projectId: "project-1", repoId: "project-1", kind: "managed" },
      { id: "workspace-local", projectId: "project-1", repoId: "project-1", kind: "local" },
    );
  });

  it("opens an existing context document in a tab for the current workspace", () => {
    openLocalTaskContextFile("workspace-1", "task-1", "plan.md");

    expect(mocked.openTab).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      kind: "file",
      path: ".my-context/task-context/task-1/plan.md",
    });
  });

  it("activates the selected active workspace through canonical workbench navigation", () => {
    navigateToLocalTaskWorkspace("workspace-1", "project-1");

    expect(mocked.activateWorkspace).toHaveBeenCalledWith({ workspaceId: "workspace-1", projectId: "project-1" });
  });

  it("resolves and activates only the project's local primary workspace", () => {
    navigateToLocalTaskProject("project-1");

    expect(mocked.activateWorkspace).toHaveBeenCalledWith({ workspaceId: "workspace-local", projectId: "project-1" });
  });

  it("does not navigate when the project has no local primary workspace", () => {
    mocked.workspaces.splice(1, 1);
    navigateToLocalTaskProject("project-1");

    expect(mocked.activateWorkspace).not.toHaveBeenCalled();
  });
});
