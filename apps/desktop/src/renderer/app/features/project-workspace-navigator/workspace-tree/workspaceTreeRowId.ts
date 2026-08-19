import type { WorkspaceTreeRow } from "./types";

/** Parse a composite node row id in by_project mode. */
export function parseCompositeNodeRowId(id: string): { projectId: string; nodeId: string } | null {
  const value = id.replace(/^node:/, "");
  const splitIndex = value.indexOf(":");
  if (splitIndex <= 0) {
    return null;
  }

  return {
    projectId: value.slice(0, splitIndex),
    nodeId: value.slice(splitIndex + 1),
  };
}

/** Parse a project row id in either tree hierarchy mode. */
export function parseProjectRowId(id: string): { projectId: string; nodeId?: string } | null {
  const value = id.replace(/^project:/, "");
  const splitIndex = value.indexOf(":");
  if (splitIndex <= 0) {
    return { projectId: value };
  }

  return {
    nodeId: value.slice(0, splitIndex),
    projectId: value.slice(splitIndex + 1),
  };
}

/** Remove the workspace row prefix from a row id. */
export function parseWorkspaceRowId(id: string): string {
  return id.replace(/^workspace:/, "");
}

/** Check whether a row is selected for the current tree selection. */
export function isWorkspaceTreeRowSelected({
  row,
  hierarchyMode,
  selectedProjectId,
  selectedNodeId,
  selectedWorkspaceId,
}: {
  row: WorkspaceTreeRow;
  hierarchyMode: "by_project" | "by_node";
  selectedProjectId?: string;
  selectedNodeId?: string;
  selectedWorkspaceId?: string;
}): boolean {
  if (row.kind === "project") {
    return !selectedWorkspaceId && parseProjectRowId(row.id)?.projectId === (selectedProjectId ?? "");
  }

  if (row.kind === "node") {
    return hierarchyMode === "by_project"
      ? row.id === `node:${selectedProjectId ?? ""}:${selectedNodeId ?? ""}`
      : row.id === `node:${selectedNodeId ?? ""}`;
  }

  return row.id === `workspace:${selectedWorkspaceId ?? ""}`;
}
