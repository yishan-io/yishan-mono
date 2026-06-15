// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { createWorkspaceSelectionActions } from "./actions.selection";

type TestState = {
  workspaces: Array<{ id: string; repoId: string; projectId?: string }>;
  selectedProjectId: string;
  selectedWorkspaceId: string;
  displayProjectIds: string[];
  lastUsedExternalAppId?: string;
  workspaceListHierarchyMode: "by_project" | "by_node";
};

function createHarness() {
  const state: TestState = {
    workspaces: [
      { id: "workspace-1", repoId: "repo-1", projectId: "repo-1" },
      { id: "workspace-2", repoId: "repo-2", projectId: "repo-2" },
    ],
    selectedProjectId: "repo-1",
    selectedWorkspaceId: "workspace-1",
    displayProjectIds: ["repo-1", "repo-2"],
    workspaceListHierarchyMode: "by_project",
  };

  const set = ((updater: ((current: TestState) => void) | Partial<TestState>) => {
    if (typeof updater === "function") {
      updater(state);
      return;
    }
    Object.assign(state, updater);
  }) as Parameters<typeof createWorkspaceSelectionActions>[0];

  const get = (() => state) as Parameters<typeof createWorkspaceSelectionActions>[1];

  return {
    actions: createWorkspaceSelectionActions(set, get),
    getState: () => state,
  };
}

describe("createWorkspaceSelectionActions", () => {
  it("selects workspace and aligns selected project with workspace project", () => {
    const harness = createHarness();

    harness.actions.setSelectedWorkspaceId("workspace-2");

    const state = harness.getState();
    expect(state.selectedWorkspaceId).toBe("workspace-2");
    expect(state.selectedProjectId).toBe("repo-2");
  });

  it("updates workspace list hierarchy mode", () => {
    const harness = createHarness();

    harness.actions.setWorkspaceListHierarchyMode("by_node");

    expect(harness.getState().workspaceListHierarchyMode).toBe("by_node");
  });
});
