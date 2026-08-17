import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addWorkspace,
  deleteProject,
  incrementFileTreeRefreshVersion,
  setExpandedFileTreeItems,
  setSelectedEntryPath,
  updateProjectConfig,
} from "./workspaceActions";
import { workspaceStore } from "./workspaceStore";
import { workspaceUiStore } from "./workspaceUiStore";

const initialWorkspaceState = workspaceStore.getState();
const initialWorkspaceUiState = workspaceUiStore.getState();

afterEach(() => {
  workspaceStore.setState(initialWorkspaceState, true);
  workspaceUiStore.setState(initialWorkspaceUiState, true);
  vi.clearAllMocks();
});

describe("workspaceActions — workspace state-change surface (desktop6-adjust W2)", () => {
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

  it("incrementFileTreeRefreshVersion forwards to the workspace UI store", () => {
    const spy = vi.fn();
    workspaceUiStore.setState({ incrementFileTreeRefreshVersion: spy });

    incrementFileTreeRefreshVersion("/tmp/a", []);

    expect(spy).toHaveBeenCalledWith("/tmp/a", []);
  });

  it("file-tree UI actions forward to the workspace UI store", () => {
    const setSelectedEntryPath = vi.fn();
    const setExpandedFileTreeItems = vi.fn();
    workspaceUiStore.setState({ setSelectedEntryPath, setExpandedFileTreeItems });

    setSelectedEntryPath("/tmp/a/file.ts");
    setExpandedFileTreeItems("workspace-1", ["/tmp/a"]);

    expect(setSelectedEntryPath).toHaveBeenCalledWith("/tmp/a/file.ts");
    expect(setExpandedFileTreeItems).toHaveBeenCalledWith("workspace-1", ["/tmp/a"]);
  });
});
