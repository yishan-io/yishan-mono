import type { Node } from "@/features/nodes/nodes.types";
import type { ProjectWithWorkspaces } from "@/features/projects/projects.types";
import type { Workspace } from "@/features/workspaces/workspaces.types";
import { suggestWorkspaceTargetBranchName } from "@yishan/core";

export type WorkspaceCreateNodeOption = {
  localPath: string;
  nodeId: string;
  nodeKind?: Node["kind"];
  nodeName: string;
  nodeScope?: Node["scope"];
  sourceBranch: string;
  workspaceId: string;
};

function resolveDefaultSourceBranch(workspace: Workspace): string {
  const normalizedSourceBranch = workspace.sourceBranch?.trim() ?? "";
  if (normalizedSourceBranch) {
    return normalizedSourceBranch;
  }

  const normalizedBranch = workspace.branch?.trim() ?? "";
  if (!normalizedBranch) {
    return "";
  }

  return normalizedBranch.startsWith("origin/") ? normalizedBranch : `origin/${normalizedBranch}`;
}

/** Returns node options that can create new worktrees for the selected project. */
export function resolveWorkspaceCreateNodeOptions({
  currentNodes,
  project,
}: {
  currentNodes: Node[];
  project: ProjectWithWorkspaces;
}): WorkspaceCreateNodeOption[] {
  const primaryWorkspaceByNodeId = new Map<string, Workspace>();

  for (const workspace of project.workspaces) {
    if (workspace.kind !== "primary" || workspace.status !== "active" || !workspace.localPath.trim()) {
      continue;
    }

    if (!primaryWorkspaceByNodeId.has(workspace.nodeId)) {
      primaryWorkspaceByNodeId.set(workspace.nodeId, workspace);
    }
  }

  return currentNodes.flatMap((node) => {
    const primaryWorkspace = primaryWorkspaceByNodeId.get(node.id);
    if (!primaryWorkspace || !node.canUse || !node.isOnline) {
      return [];
    }

    return [
      {
        localPath: primaryWorkspace.localPath,
        nodeId: primaryWorkspace.nodeId,
        nodeKind: node.kind,
        nodeName: node.name,
        nodeScope: node.scope,
        sourceBranch: resolveDefaultSourceBranch(primaryWorkspace),
        workspaceId: primaryWorkspace.id,
      },
    ];
  });
}

/** Builds a branch name suggestion from the workspace name using desktop-compatible normalization. */
export function suggestWorkspaceCreateBranchName(workspaceName: string): string {
  return suggestWorkspaceTargetBranchName(workspaceName);
}
