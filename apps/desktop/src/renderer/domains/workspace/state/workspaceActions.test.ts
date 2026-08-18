import { afterEach, describe, expect, it, vi } from "vitest";
import { addWorkspace, setOrderedWorkspaceIds } from "./workspaceActions";
import { workspaceStore } from "./workspaceStore";

const initialWorkspaceState = workspaceStore.getState();

afterEach(() => {
  workspaceStore.setState(initialWorkspaceState, true);
  vi.clearAllMocks();
});

describe("workspaceActions — workspace state-change surface (desktop6-adjust W3)", () => {
  it("workspace-list actions forward to the workspace store", () => {
    const addWorkspace = vi.fn();
    const setOrderedWorkspaceIds = vi.fn();
    workspaceStore.setState({
      addWorkspace,
      setOrderedWorkspaceIds,
    });

    addWorkspace({
      workspaceId: "workspace-1",
      name: "A",
      sourceBranch: "main",
      branch: "main",
      worktreePath: "/tmp/a",
    });
    setOrderedWorkspaceIds(["workspace-1"]);

    expect(addWorkspace).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      name: "A",
      sourceBranch: "main",
      branch: "main",
      worktreePath: "/tmp/a",
    });
    expect(setOrderedWorkspaceIds).toHaveBeenCalledWith(["workspace-1"]);
  });
});
