// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { WorkspaceTreeRow } from "./types";
import { useVisibleWorkspaceTree } from "./useVisibleWorkspaceTree";

function visibleLabels(rows: WorkspaceTreeRow[]): string[] {
  return rows.map((row) => row.label);
}

const folderWorkspaces = [
  { id: "folder-1", name: "My Project", projectId: "local-folder", nodeId: "node-1", isLocalFolder: true },
  { id: "folder-2", name: "Notes", projectId: "local-folder", nodeId: "node-2", isLocalFolder: true },
];

describe("useVisibleWorkspaceTree", () => {
  it("renders local-folder workspaces under a synthetic Local Folders group", () => {
    const { result } = renderHook(() =>
      useVisibleWorkspaceTree({
        projects: [],
        workspaces: folderWorkspaces,
        expandedItemsOverride: ["project:local-folder"],
        localFolderGroupLabel: "Local Folders",
      }),
    );

    const labels = visibleLabels(result.current.visibleRows);
    expect(labels).toEqual(["Local Folders", "My Project", "Notes"]);

    const groupRow = result.current.visibleRows.find((row) => row.isLocalFolderGroup);
    expect(groupRow).toBeDefined();
    expect(groupRow?.kind).toBe("project");
    expect(groupRow?.depth).toBe(0);
    expect(groupRow?.hasChildren).toBe(true);
    expect(groupRow?.supportsGitFeatures).toBe(false);
    expect(groupRow?.id).toBe("project:local-folder");

    // Folder child rows are workspace-kind rows under the group.
    const childRows = result.current.visibleRows.filter((row) => row.parentId === groupRow?.id);
    expect(childRows).toHaveLength(2);
    expect(childRows.every((row) => row.kind === "workspace" && row.isLocalFolder && row.depth === 1)).toBe(true);
  });

  it("always renders the group even when project filters hide everything", () => {
    const { result } = renderHook(() =>
      useVisibleWorkspaceTree({
        projects: [],
        workspaces: folderWorkspaces,
        expandedItemsOverride: [],
        localFolderGroupLabel: "Local Folders",
      }),
    );

    // Group row still appears as a top-level row even with no projects and no
    // expanded items.
    expect(result.current.visibleRows.some((row) => row.isLocalFolderGroup)).toBe(true);
  });

  it("does not render the group when there are no folder workspaces", () => {
    const { result } = renderHook(() =>
      useVisibleWorkspaceTree({
        projects: [{ id: "project-1", name: "Project 1" }],
        workspaces: [{ id: "workspace-1", name: "Workspace 1", projectId: "project-1", nodeId: "node-1" }],
        expandedItemsOverride: ["project:project-1"],
        localFolderGroupLabel: "Local Folders",
      }),
    );

    expect(result.current.visibleRows.some((row) => row.isLocalFolderGroup)).toBe(false);
    expect(visibleLabels(result.current.visibleRows)).toEqual(["Project 1", "Workspace 1"]);
  });

  it("hides folder children when the group is not expanded", () => {
    const { result } = renderHook(() =>
      useVisibleWorkspaceTree({
        projects: [],
        workspaces: folderWorkspaces,
        expandedItemsOverride: [],
        localFolderGroupLabel: "Local Folders",
      }),
    );

    const groupRow = result.current.visibleRows.find((row) => row.isLocalFolderGroup);
    expect(groupRow).toBeDefined();
    expect(result.current.visibleRows.filter((row) => row.parentId === groupRow?.id)).toHaveLength(0);
  });
});
