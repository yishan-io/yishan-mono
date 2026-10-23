// @vitest-environment jsdom

import { projectStore } from "@renderer/domains/project";
import { workspaceStore } from "@renderer/domains/workspace";
import { LOCAL_FOLDER_PROJECT_ID } from "@shared/workspace/localFolderProjectId";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { useVisibleWorkspaceTree } from "./workspace-tree/useVisibleWorkspaceTree";
import { useWorkspaceNavigatorTreeData } from "./useWorkspaceNavigatorTreeData";

function workspace(id: string, createdAt?: string, projectId = "project-a", nodeId = "node-a") {
  return {
    id,
    createdAt,
    projectId,
    repoId: projectId,
    nodeId,
    name: id,
    title: id,
    sourceBranch: "main",
    branch: "main",
    summaryId: id,
  };
}

function mountTree(
  mode: "by_project" | "by_node",
  order: Record<string, string[]> = {},
  nodeOrder: Record<string, string[]> = {},
  projectOrderIds: string[] = [],
) {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    () => {
      const tree = useWorkspaceNavigatorTreeData({
        projectOrderIds,
        nodeOrderByParentId: nodeOrder,
        workspaceOrderByParentId: order,
        foldedProjectIds: [],
        foldedNodeKeys: [],
        workspaceListHierarchyMode: mode,
      });
      const visible = useVisibleWorkspaceTree({
        projects: tree.treeProjects,
        nodes: tree.treeNodes,
        workspaces: tree.treeWorkspaces,
        hierarchyMode: mode,
        expandedItemsOverride: tree.expandedTreeItems,
      });
      return { ...tree, ...visible };
    },
    { wrapper },
  );
}

function loadProjects() {
  projectStore.getState().loadProjects(
    "org",
    [
      { id: "project-b", name: "B", key: "b" },
      { id: "project-a", name: "A", key: "a" },
    ],
    ["project-a", "project-b"],
    undefined,
    undefined,
  );
}

beforeEach(() => {
  workspaceStore.getState().loadLocalFolders([]);
});

const older = "2026-01-01T00:00:00Z";
const newer = "2026-02-01T00:00:00Z";

describe.each(["by_project", "by_node"] as const)("%s deterministic navigator order", (mode) => {
  it("ignores shuffled snapshots; orders by creation time, then ID, with missing/invalid times last", () => {
    loadProjects();
    const siblings = [
      workspace("missing"),
      workspace("z", older),
      workspace("invalid", "bad"),
      workspace("newer", newer),
      workspace("a", older),
    ];
    const otherGroups = [
      workspace("other-node", older, "project-a", "node-b"),
      workspace("other-project", older, "project-b"),
    ];
    workspaceStore.getState().load("org", [...otherGroups, ...siblings]);
    const { result } = mountTree(mode);
    const expected =
      mode === "by_project"
        ? ["a", "z", "newer", "invalid", "missing", "other-node", "other-project"]
        : ["a", "z", "newer", "invalid", "missing", "other-project", "other-node"];
    expect(result.current.filteredProjects.map((project) => project.id)).toEqual(["project-a", "project-b"]);
    expect(result.current.treeWorkspaces.map((row) => row.id)).toEqual(expected);
    act(() => workspaceStore.getState().load("org", [...siblings, ...otherGroups].reverse()));
    expect(result.current.treeWorkspaces.map((row) => row.id)).toEqual(expected);
  });

  it("keeps ranked siblings first, appends new siblings, and preserves survivors on deletion", () => {
    loadProjects();
    const siblings = [workspace("a", older), workspace("b", newer), workspace("c", older)];
    workspaceStore.getState().load("org", siblings);
    const { result } = mountTree(mode, { "project-a:node-a": ["b", "removed", "a"] });
    expect(result.current.treeWorkspaces.map((row) => row.id)).toEqual(["b", "a", "c"]);
    act(() => workspaceStore.getState().load("org", [workspace("new", older), ...siblings].reverse()));
    expect(result.current.treeWorkspaces.map((row) => row.id)).toEqual(["b", "a", "c", "new"]);
    act(() =>
      workspaceStore
        .getState()
        .load("org", [workspace("new", older), ...siblings.filter((sibling) => sibling.id !== "a")]),
    );
    expect(result.current.treeWorkspaces.map((row) => row.id)).toEqual(["b", "c", "new"]);
  });

  it("applies the same persisted sibling ranks to local folders", () => {
    loadProjects();
    workspaceStore.getState().load("org", []);
    workspaceStore.getState().loadLocalFolders([
      { id: "a", path: "/a" },
      { id: "z", path: "/z" },
    ]);
    const nodeId = workspaceStore.getState().workspaces[0]?.nodeId || "unknown";
    const { result } = mountTree(mode, { [`${LOCAL_FOLDER_PROJECT_ID}:${nodeId}`]: ["z", "a"] });
    expect(result.current.treeWorkspaces.map((row) => row.id)).toEqual(["z", "a"]);
  });
});

it("by_node respects saved root node order even for a node with only local folders", () => {
  loadProjects();
  workspaceStore.getState().load("org", [workspace("managed")]);
  workspaceStore.getState().loadLocalFolders([{ id: "folder", path: "/folder" }]);
  const folderNodeId = workspaceStore.getState().workspaces.find((row) => row.id === "folder")?.nodeId || "unknown";
  const { result } = mountTree("by_node", {}, { "root:node": [folderNodeId, "node-a"] });
  expect(result.current.visibleRows.filter((row) => row.depth === 0).map((row) => row.id)).toEqual([
    `node:${folderNodeId}`,
    "node:node-a",
  ]);
});

it("uses saved project and node ranks before deterministic fallback in either mode", () => {
  loadProjects();
  workspaceStore
    .getState()
    .load("org", [
      workspace("aa"),
      workspace("ab", undefined, "project-a", "node-b"),
      workspace("ba", undefined, "project-b"),
      workspace("bb", undefined, "project-b", "node-b"),
    ]);
  const nodeOrder = {
    "root:node": ["node-b"],
    "project:project-a": ["node-b"],
    "project:project-b": ["node-b"],
    "node:node-a": ["project-b"],
    "node:node-b": ["project-b"],
  };
  const byProject = mountTree("by_project", {}, nodeOrder, ["project-b"]);
  expect(byProject.result.current.treeWorkspaces.map((row) => row.id)).toEqual(["bb", "ba", "ab", "aa"]);
  byProject.unmount();
  const byNode = mountTree("by_node", {}, nodeOrder, ["project-b"]);
  expect(byNode.result.current.treeWorkspaces.map((row) => row.id)).toEqual(["bb", "ab", "ba", "aa"]);
});
