import { afterEach, describe, expect, it } from "vitest";
import { selectWorkspaces } from "./workspaceSelectors";
import { workspaceStore } from "./workspaceStore";

const initialWorkspaceStoreState = workspaceStore.getState();

afterEach(() => {
  workspaceStore.setState(initialWorkspaceStoreState, true);
});

describe("workspaceSelectors — Workspace state public read surface (Phase 17)", () => {
  it("selectWorkspaces reads the workspace list", () => {
    const workspaces = [
      {
        id: "workspace-1",
        repoId: "repo-1",
        name: "A",
        title: "A",
        summaryId: "",
        branch: "main",
        sourceBranch: "main",
        worktreePath: "/tmp/a",
      },
    ];
    workspaceStore.setState({ workspaces });

    expect(selectWorkspaces()).toEqual(workspaces);
  });
});
