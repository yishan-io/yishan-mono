// @vitest-environment jsdom

import { gitProjectionStore } from "@renderer/domains/git";
import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { describe, expect, it } from "vitest";
import { projectStore } from "../domains/project/state/projectStore";
import { workspaceStore } from "../domains/workspace/state/workspaceStore";
import {
  resolveWorkspaceNotificationTone,
  selectProjectTree,
  selectSelectedWorkspaceWithProject,
  selectWorkspaceProjection,
} from "./selectors";

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
    workbenchNavigationStore.setState({
      activeWorkspaceId: "ws-1",
    });
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
    });

    const model = selectSelectedWorkspaceWithProject();
    expect(model.selectedWorkspace?.id).toBe("ws-1");
    expect(model.selectedProject?.id).toBe("repo-1");
  });

  it("returns the projection slice for one workspace", () => {
    gitProjectionStore.setState({
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
});

describe("resolveWorkspaceNotificationTone (desktop8 Phase 30: app selector)", () => {
  it("prefers waiting-for-input over unread activity", () => {
    expect(resolveWorkspaceNotificationTone({ runtimeStatus: "waiting_input", unreadTone: undefined })).toBe(
      "waiting_input",
    );
    expect(resolveWorkspaceNotificationTone({ runtimeStatus: "waiting_input", unreadTone: "error" })).toBe(
      "waiting_input",
    );
    expect(resolveWorkspaceNotificationTone({ runtimeStatus: "waiting_input", unreadTone: "success" })).toBe(
      "waiting_input",
    );
  });

  it.each([
    { runtimeStatus: "running", unreadTone: "error", expectedTone: "failed" },
    { runtimeStatus: "running", unreadTone: "success", expectedTone: "done" },
    { runtimeStatus: "running", unreadTone: undefined, expectedTone: "none" },
    { runtimeStatus: "idle", unreadTone: "error", expectedTone: "failed" },
    { runtimeStatus: "idle", unreadTone: "success", expectedTone: "done" },
    { runtimeStatus: "idle", unreadTone: undefined, expectedTone: "none" },
  ] as const)(
    "resolves $runtimeStatus with $unreadTone to $expectedTone",
    ({ runtimeStatus, unreadTone, expectedTone }) => {
      expect(resolveWorkspaceNotificationTone({ runtimeStatus, unreadTone })).toBe(expectedTone);
    },
  );
});
