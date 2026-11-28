// @vitest-environment jsdom

import { LOCAL_FOLDER_PROJECT_ID } from "@shared/workspace/localFolderProjectId";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWorkspaceNavigatorTreeHandlers } from "./useWorkspaceNavigatorTreeHandlers";

function makeSetters() {
  const setters = {
    setFoldedProjectIds: vi.fn(),
    setProjectOrderIds: vi.fn(),
    setWorkspaceOrderByParentId: vi.fn(),
    activateProject: vi.fn(),
    activateWorkspace: vi.fn(),
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

function buildInput(overrides: Partial<Parameters<typeof useWorkspaceNavigatorTreeHandlers>[0]> = {}) {
  return {
    treeWorkspaces: [],
    filteredProjects: [],
    projectOrderIds: [],
    workspaceOrderByParentId: {},
    foldedProjectIds: [] as string[],
    ...makeSetters(),
    ...overrides,
  };
}

describe("useWorkspaceNavigatorTreeHandlers onExpandedItemsChange", () => {
  it("folding the Local Folders group persists its sentinel id in foldedProjectIds", () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useWorkspaceNavigatorTreeHandlers(
        buildInput({
          treeWorkspaces: [
            { id: "folder-1", projectId: LOCAL_FOLDER_PROJECT_ID, nodeId: "node-1", isLocalFolder: true },
          ],
          filteredProjects: [{ id: "repo-1" }],
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

  it("expanding the Local Folders group keeps it out of foldedProjectIds", () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useWorkspaceNavigatorTreeHandlers(
        buildInput({
          treeWorkspaces: [
            { id: "folder-1", projectId: LOCAL_FOLDER_PROJECT_ID, nodeId: "node-1", isLocalFolder: true },
          ],
          filteredProjects: [{ id: "repo-1" }],
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
});

describe("full sibling drag order", () => {
  it.each(["repo-1", LOCAL_FOLDER_PROJECT_ID])(
    "persists the entire %s/node group, not just dragged rows",
    (projectId) => {
      let order: Record<string, string[]> = { [`${projectId}:node-1`]: ["c", "deleted"], other: ["untouched"] };
      const { result } = renderHook(() =>
        useWorkspaceNavigatorTreeHandlers(
          buildInput({
            treeWorkspaces: ["c", "a", "b", "d"].map((id) => ({ id, projectId, nodeId: "node-1" })),
            workspaceOrderByParentId: order,
            setWorkspaceOrderByParentId: (updater) => {
              order = updater(order);
            },
          }),
        ),
      );
      act(() =>
        result.current.onRowReorder({
          draggedRowId: "workspace:d",
          targetRowId: "workspace:a",
          rowKind: "workspace",
          position: "before",
        }),
      );
      expect(order).toEqual({ [`${projectId}:node-1`]: ["c", "d", "a", "b"], other: ["untouched"] });
    },
  );
});
