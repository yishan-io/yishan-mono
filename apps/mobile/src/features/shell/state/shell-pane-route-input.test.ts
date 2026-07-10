import { describe, expect, it } from "vitest";

import { createEmptyWorkspacePaneStoreState } from "@/features/shell/state/shell-state-helpers";
import { resolveWorkspacePaneRouteInput } from "./shell-pane-route-input";

const WORKSPACE_ID = "workspace-1";
const WORKSPACE_CONTEXT = {
  orgId: "org-1",
  projectId: "project-1",
  workspaceId: WORKSPACE_ID,
} as const;

describe("shell pane route input", () => {
  it("materializes one explicit file route into one durable tab exactly once", () => {
    const firstTransition = resolveWorkspacePaneRouteInput({
      currentWorkspaceContext: WORKSPACE_CONTEXT,
      hydratedWorkspaceId: WORKSPACE_ID,
      isScreenFocused: true,
      lastAppliedRouteInputKey: null,
      routePreview: { kind: "file", path: "README.md" },
      storeState: createEmptyWorkspacePaneStoreState(WORKSPACE_ID),
    });

    expect(firstTransition.shouldApply).toBe(true);
    expect(firstTransition.nextStoreState.tabState.tabs.map((tab) => tab.id)).toEqual(["file:README.md"]);
    expect(firstTransition.nextStoreState.tabState.tabs[0]).toMatchObject({
      data: {
        isTemporary: false,
        path: "README.md",
      },
      id: "file:README.md",
      kind: "file",
    });

    const secondTransition = resolveWorkspacePaneRouteInput({
      currentWorkspaceContext: WORKSPACE_CONTEXT,
      hydratedWorkspaceId: WORKSPACE_ID,
      isScreenFocused: true,
      lastAppliedRouteInputKey: firstTransition.nextRouteInputKey,
      routePreview: { kind: "file", path: "README.md" },
      storeState: firstTransition.nextStoreState,
    });

    expect(secondTransition.shouldApply).toBe(false);
    expect(secondTransition.nextStoreState).toBe(firstTransition.nextStoreState);
  });

  it("does not apply route input before the workspace pane store is hydrated", () => {
    const transition = resolveWorkspacePaneRouteInput({
      currentWorkspaceContext: WORKSPACE_CONTEXT,
      hydratedWorkspaceId: null,
      isScreenFocused: true,
      lastAppliedRouteInputKey: null,
      routePreview: { kind: "file", path: "README.md" },
      storeState: createEmptyWorkspacePaneStoreState(WORKSPACE_ID),
    });

    expect(transition.shouldApply).toBe(false);
    expect(transition.nextStoreState.tabState.tabs).toEqual([]);
  });

  it("clears the remembered route input key when the route preview disappears", () => {
    const transition = resolveWorkspacePaneRouteInput({
      currentWorkspaceContext: WORKSPACE_CONTEXT,
      hydratedWorkspaceId: WORKSPACE_ID,
      isScreenFocused: true,
      lastAppliedRouteInputKey: `${WORKSPACE_ID}:file:README.md`,
      routePreview: null,
      storeState: createEmptyWorkspacePaneStoreState(WORKSPACE_ID),
    });

    expect(transition.shouldApply).toBe(false);
    expect(transition.nextRouteInputKey).toBeNull();
  });
});
