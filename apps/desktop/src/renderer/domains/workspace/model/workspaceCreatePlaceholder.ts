/**
 * Workspace create placeholder — pure builder for the optimistic workspace
 * row shared by the UI create flow and the backend create-start event.
 *
 * Lives in the Workspace model so both Commands and Events can import it
 * without depending on a command module.
 */
import type { AddWorkspaceInput } from "./workspaceTypes";

export type WorkspaceCreatePlaceholderInput = AddWorkspaceInput;

/** Builds one optimistic workspace row payload shared by UI create and backend create-start flows. */
export function buildWorkspaceCreatePlaceholder(
  input: WorkspaceCreatePlaceholderInput,
): WorkspaceCreatePlaceholderInput {
  return {
    organizationId: input.organizationId,
    projectId: input.projectId,
    repoId: input.repoId ?? input.projectId,
    name: input.name,
    sourceBranch: input.sourceBranch,
    branch: input.branch,
    worktreePath: input.worktreePath ?? "",
    nodeId: input.nodeId,
    workspaceId: input.workspaceId,
    status: input.status,
    preserveOnMissingSnapshot: input.preserveOnMissingSnapshot,
  };
}
