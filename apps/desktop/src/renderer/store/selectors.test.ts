// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { projectStore } from "../features/project/model/projectStore";
import { workspaceProjectionStore } from "../features/workspace/model/workspaceProjectionStore";
import {
  selectWorkspacePaneVisibility,
  selectLastUsedExternalAppId,
  selectProjectTree,
  selectSelectedWorkspaceWithProject,
  selectWorkspaceProjection,
} from "./selectors";
import { workspaceStore } from "./workspaceStore";

describe("composed selectors", () => {
  it("joins projects + workspaces", () => {
    projectStore.setState({ projects: [{ id: "repo-1", name: "Repo 1" }] });
    workspaceStore.setState({
      workspaces: [
        { id: "ws-1", repoId: "repo-1", name: "w", title: "w", sourceBranch: "", branch: "", summaryId: "ws-1" },
      ],
    });

    const tree = selectProjectTree();
    expect(tree.projects[0]?.id).toBe("repo-1");
    expect(tree.workspaces[0]?.id).toBe("ws-1");
  });

  it("resolves the selected workspace with its project", () => {
    projectStore.setState({ projects: [{ id: "repo-1", name: "Repo 1" }] });
    workspaceStore.setState({
      workspaces: [
        {
          id: "ws-1",
          projectId: "repo-1",
          repoId: "repo-1",
          name: "w",
          title: "w",
          sourceBranch: "",
          branch: "",
          summaryId: "ws-1",
        },
      ],
      selectedWorkspaceId: "ws-1",
    });

    const model = selectSelectedWorkspaceWithProject();
    expect(model.selectedWorkspace?.id).toBe("ws-1");
    expect(model.selectedProject?.id).toBe("repo-1");
  });

  it("returns the projection slice for one workspace", () => {
    workspaceProjectionStore.setState({
      pullRequestByWorkspaceId: { "ws-1": { number: 42 } },
      currentBranchByWorkspaceId: { "ws-1": "feature/a" },
      gitChangeTotalsByWorkspaceId: { "ws-1": { additions: 1, deletions: 2 } },
      gitRefreshVersionByWorktreePath: { "/tmp/repo": 3 },
    });

    const projection = selectWorkspaceProjection("ws-1");
    expect(projection.pullRequest).toEqual({ number: 42 });
    expect(projection.currentBranch).toBe("feature/a");
    expect(projection.gitChangeTotals).toEqual({ additions: 1, deletions: 2 });
  });

  it("reads the last-used external app id from the project store", () => {
    projectStore.setState({ lastUsedExternalAppId: "cursor" });
    expect(selectLastUsedExternalAppId()).toBe("cursor");
  });

  it("composes workspace pane collapsed flags from the three store slices", () => {
    expect(
      selectWorkspacePaneVisibility({
        leftHidden: true,
        selectedWorkspaceId: "ws-1",
        rightHiddenByWorkspaceId: { "ws-1": false },
      }),
    ).toEqual({ leftCollapsed: true, rightCollapsed: false });

    // Unknown workspace defaults to collapsed right pane.
    expect(
      selectWorkspacePaneVisibility({
        leftHidden: false,
        selectedWorkspaceId: "ws-missing",
        rightHiddenByWorkspaceId: {},
      }),
    ).toEqual({ leftCollapsed: false, rightCollapsed: true });
  });
});
