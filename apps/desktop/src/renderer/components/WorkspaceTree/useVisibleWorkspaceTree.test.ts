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
  it("renders local-folder workspaces under a synthetic Local Folders group (by_project)", () => {
    const { result } = renderHook(() =>
      useVisibleWorkspaceTree({
        projects: [],
        nodes: [],
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
        nodes: [],
        workspaces: folderWorkspaces,
        expandedItemsOverride: [],
        localFolderGroupLabel: "Local Folders",
      }),
    );

    // Group row still appears as a top-level row even with no projects and no
    // expanded items.
    expect(result.current.visibleRows.some((row) => row.isLocalFolderGroup)).toBe(true);
  });

  it("renders a per-node Local Folders group under each node in by_node hierarchy mode", () => {
    const { result } = renderHook(() =>
      useVisibleWorkspaceTree({
        projects: [],
        nodes: [
          { id: "node-1", name: "Node 1" },
          { id: "node-2", name: "Node 2" },
        ],
        workspaces: folderWorkspaces,
        hierarchyMode: "by_node",
        expandedItemsOverride: [
          "node:node-1",
          "project:node-1:local-folder",
          "node:node-2",
          "project:node-2:local-folder",
        ],
        localFolderGroupLabel: "Local Folders",
      }),
    );

    // Each node hosts its own "Local Folders" group with folder children.
    expect(visibleLabels(result.current.visibleRows)).toEqual([
      "Node 1",
      "Local Folders",
      "My Project",
      "Node 2",
      "Local Folders",
      "Notes",
    ]);
    const groupRows = result.current.visibleRows.filter((row) => row.isLocalFolderGroup);
    expect(groupRows).toHaveLength(2);
    expect(groupRows.map((row) => row.id)).toEqual(["project:node-1:local-folder", "project:node-2:local-folder"]);
    const node1Group = groupRows[0];
    expect(node1Group?.parentId).toBe("node:node-1");
    const folder1Row = result.current.visibleRows.find((row) => row.label === "My Project");
    expect(folder1Row?.parentId).toBe(node1Group?.id);
    expect(folder1Row?.depth).toBe(2);
  });

  it("renders a node row with only folder workspaces as children in by_node mode", () => {
    const { result } = renderHook(() =>
      useVisibleWorkspaceTree({
        projects: [],
        nodes: [{ id: "solo-node", name: "Solo Node" }],
        workspaces: [
          { id: "folder-1", name: "Solo Folder", projectId: "local-folder", nodeId: "solo-node", isLocalFolder: true },
        ],
        hierarchyMode: "by_node",
        expandedItemsOverride: ["node:solo-node", "project:solo-node:local-folder"],
        localFolderGroupLabel: "Local Folders",
      }),
    );

    // Node row renders even though it only hosts folder (non-project) rows.
    expect(visibleLabels(result.current.visibleRows)).toEqual(["Solo Node", "Local Folders", "Solo Folder"]);
    const nodeRow = result.current.visibleRows.find((row) => row.kind === "node");
    expect(nodeRow?.id).toBe("node:solo-node");
    expect(nodeRow?.hasChildren).toBe(true);
    const groupRow = result.current.visibleRows.find((row) => row.isLocalFolderGroup);
    expect(groupRow?.parentId).toBe("node:solo-node");
    const folderRow = result.current.visibleRows.find((row) => row.label === "Solo Folder");
    expect(folderRow?.parentId).toBe(groupRow?.id);
    expect(folderRow?.depth).toBe(2);
  });

  it("hides folder children when the per-node Local Folders group is folded in by_node mode", () => {
    const { result } = renderHook(() =>
      useVisibleWorkspaceTree({
        projects: [],
        nodes: [{ id: "node-1", name: "Node 1" }],
        workspaces: [
          { id: "folder-1", name: "My Project", projectId: "local-folder", nodeId: "node-1", isLocalFolder: true },
        ],
        hierarchyMode: "by_node",
        expandedItemsOverride: ["node:node-1"],
        localFolderGroupLabel: "Local Folders",
      }),
    );

    // Node + group row still render; folder children are hidden when the group
    // is folded.
    expect(visibleLabels(result.current.visibleRows)).toEqual(["Node 1", "Local Folders"]);
    expect(result.current.visibleRows.some((row) => row.isLocalFolder)).toBe(false);
  });

  it("does not render the group when there are no folder workspaces", () => {
    const { result } = renderHook(() =>
      useVisibleWorkspaceTree({
        projects: [{ id: "project-1", name: "Project 1" }],
        nodes: [{ id: "node-1", name: "Node 1" }],
        workspaces: [{ id: "workspace-1", name: "Workspace 1", projectId: "project-1", nodeId: "node-1" }],
        expandedItemsOverride: ["project:project-1", "node:project-1:node-1"],
        localFolderGroupLabel: "Local Folders",
      }),
    );

    expect(result.current.visibleRows.some((row) => row.isLocalFolderGroup)).toBe(false);
    expect(visibleLabels(result.current.visibleRows)).toEqual(["Project 1", "Node 1", "Workspace 1"]);
  });

  it("hides folder children when the group is not expanded", () => {
    const { result } = renderHook(() =>
      useVisibleWorkspaceTree({
        projects: [],
        nodes: [],
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
