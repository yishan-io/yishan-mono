import { afterEach, describe, expect, it, vi } from "vitest";
import { workspaceStore } from "./workspaceStore";
import { workspaceUiStore } from "./workspaceUiStore";
import {
  addWorkspace,
  deleteProject,
  incrementFileTreeRefreshVersion,
  setSelectedProjectId,
  setSelectedWorkspaceId,
  updateProjectConfig,
} from "./workspaceActions";

const initialWorkspaceState = workspaceStore.getState();
const initialWorkspaceUiState = workspaceUiStore.getState();

afterEach(() => {
  workspaceStore.setState(initialWorkspaceState, true);
  workspaceUiStore.setState(initialWorkspaceUiState, true);
  vi.clearAllMocks();
});

describe("workspaceActions — workspace state-change surface extension (Phase 17)", () => {
  it("selection and workspace-list actions forward to the workspace store", () => {
    const setSelectedProjectId = vi.fn();
    const setSelectedWorkspaceId = vi.fn();
    const addWorkspace = vi.fn();
    const deleteProject = vi.fn();
    const updateProjectConfig = vi.fn();
    workspaceStore.setState({ setSelectedProjectId, setSelectedWorkspaceId, addWorkspace, deleteProject, updateProjectConfig });

    setSelectedProjectId("project-1");
    setSelectedWorkspaceId("workspace-1");
    addWorkspace({ workspaceId: "workspace-1", name: "A", sourceBranch: "main", branch: "main", worktreePath: "/tmp/a" });
    deleteProject("project-1");
    updateProjectConfig("project-1", { contextEnabled: true });

    expect(setSelectedProjectId).toHaveBeenCalledWith("project-1");
    expect(setSelectedWorkspaceId).toHaveBeenCalledWith("workspace-1");
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

  it("incrementFileTreeRefreshVersion forwards to the workspace UI store", () => {
    const spy = vi.fn();
    workspaceUiStore.setState({ incrementFileTreeRefreshVersion: spy });

    incrementFileTreeRefreshVersion("/tmp/a", []);

    expect(spy).toHaveBeenCalledWith("/tmp/a", []);
  });
});
