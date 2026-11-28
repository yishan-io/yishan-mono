// @vitest-environment jsdom

import { projectStore } from "@renderer/domains/project";
import { workspaceStore } from "@renderer/domains/workspace";
import { LOCAL_FOLDER_PROJECT_ID } from "@shared/workspace/localFolderProjectId";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceNavigatorTreeData } from "./useWorkspaceNavigatorTreeData";
import { useVisibleWorkspaceTree } from "./workspace-tree/useVisibleWorkspaceTree";

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

function mountTree(order: Record<string, string[]> = {}, projectOrderIds: string[] = []) {
  return renderHook(() => {
    const tree = useWorkspaceNavigatorTreeData({
      projectOrderIds,
      workspaceOrderByParentId: order,
      foldedProjectIds: [],
    });
    const visible = useVisibleWorkspaceTree({
      projects: tree.treeProjects,
      workspaces: tree.treeWorkspaces,
      expandedItemsOverride: tree.expandedTreeItems,
    });
    return { ...tree, ...visible };
  });
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

describe("deterministic navigator order", () => {
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
    const { result } = mountTree();
    const expected = ["a", "z", "newer", "invalid", "missing", "other-node", "other-project"];
    expect(result.current.filteredProjects.map((project) => project.id)).toEqual(["project-a", "project-b"]);
    expect(result.current.treeWorkspaces.map((row) => row.id)).toEqual(expected);
    act(() => workspaceStore.getState().load("org", [...siblings, ...otherGroups].reverse()));
    expect(result.current.treeWorkspaces.map((row) => row.id)).toEqual(expected);
  });

  it("keeps ranked siblings first, appends new siblings, and preserves survivors on deletion", () => {
    loadProjects();
    const siblings = [workspace("a", older), workspace("b", newer), workspace("c", older)];
    workspaceStore.getState().load("org", siblings);
    const { result } = mountTree({ "project-a:node-a": ["b", "removed", "a"] });
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
    const { result } = mountTree({ [`${LOCAL_FOLDER_PROJECT_ID}:${nodeId}`]: ["z", "a"] });
    expect(result.current.treeWorkspaces.map((row) => row.id)).toEqual(["z", "a"]);
  });
});

it("uses saved project ranks before deterministic fallback", () => {
  loadProjects();
  workspaceStore
    .getState()
    .load("org", [
      workspace("aa"),
      workspace("ab", undefined, "project-a", "node-b"),
      workspace("ba", undefined, "project-b"),
      workspace("bb", undefined, "project-b", "node-b"),
    ]);
  const tree = mountTree({}, ["project-b"]);
  expect(tree.result.current.treeWorkspaces.map((row) => row.id)).toEqual(["ba", "bb", "aa", "ab"]);
});
