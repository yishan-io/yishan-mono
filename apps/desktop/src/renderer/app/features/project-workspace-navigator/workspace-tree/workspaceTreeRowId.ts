import type { WorkspaceTreeRow } from "./types";

/** Parse a project row id. */
export function parseProjectRowId(id: string): { projectId: string } | null {
  return { projectId: id.replace(/^project:/, "") };
}

/** Remove the workspace row prefix from a row id. */
export function parseWorkspaceRowId(id: string): string {
  return id.replace(/^workspace:/, "");
}

/** Check whether a row is selected for the current tree selection. */
export function isWorkspaceTreeRowSelected({
  row,
  selectedProjectId,
  selectedWorkspaceId,
}: {
  row: WorkspaceTreeRow;
  selectedProjectId?: string;
  selectedWorkspaceId?: string;
}): boolean {
  if (row.kind === "project") {
    return !selectedWorkspaceId && parseProjectRowId(row.id)?.projectId === (selectedProjectId ?? "");
  }

  return row.id === `workspace:${selectedWorkspaceId ?? ""}`;
}
