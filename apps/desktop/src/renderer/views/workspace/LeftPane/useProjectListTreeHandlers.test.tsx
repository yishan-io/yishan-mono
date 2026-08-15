// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LOCAL_FOLDER_PROJECT_ID } from "../../../store/types";
import { useProjectListTreeHandlers } from "./useProjectListTreeHandlers";

function makeSetters() {
  const setters = {
    setFoldedProjectIds: vi.fn(),
    setFoldedNodeKeys: vi.fn(),
    setProjectOrderIds: vi.fn(),
    setNodeOrderByParentId: vi.fn(),
    setWorkspaceOrderByParentId: vi.fn(),
    setSelectedRepoId: vi.fn(),
    setSelectedWorkspaceId: vi.fn(),
    reorderWorkspace: vi.fn(),
    closeWorkspaceMenus: vi.fn(),
    closeProjectContextMenu: vi.fn(),
    closeAllContextMenus: vi.fn(),
    openProjectContextMenu: vi.fn(),
    openWorkspaceContextMenu: vi.fn(),
    setProjectActionsAnchorEl: vi.fn(),
    setProjectActionsProjectId: vi.fn(),
    handleOpenCreateWorkspace: vi.fn(),
    handleWorkspaceInfoMouseEnter: vi.fn(),
    handleWorkspaceInfoMouseLeave: vi.fn(),
    handleRequestWorkspaceDeletion: vi.fn(),
  };
  return setters;
}

function buildInput(overrides: Partial<Parameters<typeof useProjectListTreeHandlers>[0]> = {}) {
  return {
    workspaceListHierarchyMode: "by_project" as const,
    treeWorkspaces: [],
    filteredProjects: [],
    projectOrderIds: [],
    nodeOrderByParentId: {},
    workspaceOrderByParentId: {},
    foldedProjectIds: [] as string[],
    foldedNodeKeys: [] as string[],
    ...makeSetters(),
    ...overrides,
  };
}

describe("useProjectListTreeHandlers onExpandedItemsChange", () => {
  it("by_project: folding the Local Folders group persists its sentinel id in foldedProjectIds", () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useProjectListTreeHandlers(
        buildInput({
          workspaceListHierarchyMode: "by_project",
          treeWorkspaces: [
            { id: "folder-1", projectId: LOCAL_FOLDER_PROJECT_ID, nodeId: "node-1", isLocalFolder: true },
          ],
          filteredProjects: [{ id: "repo-1" }],
          foldedProjectIds: [],
          ...setters,
        }),
      ),
    );

    // The group was shown expanded (project:local-folder present in items) and
    // the user folds it, so the sentinel id is removed from expanded items.
    act(() => {
      result.current.onExpandedItemsChange(["project:repo-1"]);
    });

    expect(setters.setFoldedProjectIds).toHaveBeenCalled();
    const updateFn = setters.setFoldedProjectIds.mock.calls[0]?.[0] as string[] | undefined;
    // The group is not in filteredProjects, so it is folded explicitly.
    expect(updateFn).toContain(LOCAL_FOLDER_PROJECT_ID);
  });

  it("by_project: expanding the Local Folders group keeps it out of foldedProjectIds", () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useProjectListTreeHandlers(
        buildInput({
          workspaceListHierarchyMode: "by_project",
          treeWorkspaces: [
            { id: "folder-1", projectId: LOCAL_FOLDER_PROJECT_ID, nodeId: "node-1", isLocalFolder: true },
          ],
          filteredProjects: [{ id: "repo-1" }],
          foldedProjectIds: [LOCAL_FOLDER_PROJECT_ID],
          ...setters,
        }),
      ),
    );

    act(() => {
      result.current.onExpandedItemsChange(["project:repo-1", `project:${LOCAL_FOLDER_PROJECT_ID}`]);
    });

    const updateFn = setters.setFoldedProjectIds.mock.calls[0]?.[0] as string[] | undefined;
    expect(updateFn).not.toContain(LOCAL_FOLDER_PROJECT_ID);
  });

  it("by_node: the per-node Local Folders group key is folded when its group row is collapsed", () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useProjectListTreeHandlers(
        buildInput({
          workspaceListHierarchyMode: "by_node",
          treeWorkspaces: [
            { id: "folder-1", projectId: LOCAL_FOLDER_PROJECT_ID, nodeId: "solo-node", isLocalFolder: true },
          ],
          foldedProjectIds: [],
          ...setters,
        }),
      ),
    );

    act(() => {
      // Node expanded, but the per-node Local Folders group row is collapsed.
      result.current.onExpandedItemsChange(["node:solo-node"]);
    });

    // The group folds via its node-scoped key in foldedNodeKeys; the node
    // itself stays expanded so it is not in foldedProjectIds.
    const foldedProjectUpdate = setters.setFoldedProjectIds.mock.calls[0]?.[0] as string[] | undefined;
    expect(foldedProjectUpdate).not.toContain("solo-node");
    const foldedNodeUpdater = setters.setFoldedNodeKeys.mock.calls[0]?.[0] as (
      current: string[],
    ) => string[] | undefined;
    expect(foldedNodeUpdater).toBeTypeOf("function");
    const foldedNodeUpdate = foldedNodeUpdater?.([]);
    expect(foldedNodeUpdate).toContain(`solo-node:${LOCAL_FOLDER_PROJECT_ID}`);
  });
});
