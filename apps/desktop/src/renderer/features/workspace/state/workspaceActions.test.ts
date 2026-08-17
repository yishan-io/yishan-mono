import { afterEach, describe, expect, it, vi } from "vitest";
import { addWorkspace, deleteProject, updateProjectConfig } from "./workspaceActions";
import { workspaceStore } from "./workspaceStore";

const initialWorkspaceState = workspaceStore.getState();

afterEach(() => {
  workspaceStore.setState(initialWorkspaceState, true);
  vi.clearAllMocks();
});

describe("workspaceActions — workspace state-change surface (desktop6-adjust W3)", () => {
  it("workspace-list actions forward to the workspace store", () => {
    const addWorkspace = vi.fn();
    const deleteProject = vi.fn();
    const updateProjectConfig = vi.fn();
    workspaceStore.setState({
      addWorkspace,
      deleteProject,
      updateProjectConfig,
    });

    addWorkspace({
      workspaceId: "workspace-1",
      name: "A",
      sourceBranch: "main",
      branch: "main",
      worktreePath: "/tmp/a",
    });
    deleteProject("project-1");
    updateProjectConfig("project-1", { contextEnabled: true });

    expect(addWorkspace).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      name: "A",
      sourceBranch: "main",
      branch: "main",
      worktreePath: "/tmp/a",
    });
    expect(deleteProject).toHaveBeenCalledWith("project-1");
    expect(updateProjectConfig).toHaveBeenCalledWith("project-1", { contextEnabled: true });
  });
});
