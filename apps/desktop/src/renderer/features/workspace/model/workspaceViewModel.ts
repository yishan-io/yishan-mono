/**
 * Workspace view model + API/RPC mappers.
 *
 * Phase 3: the UI-consumed workspace shape, mapped from transport records.
 * Transport DTOs (api/types, rpc/daemonTypes) do not enter feature stores;
 * mappers live in the model layer and stores hold view models.
 */
import type { WorkspaceRecord } from "../../../api/types";
import type { DaemonWorkspacePullRequest } from "../../../rpc/daemonTypes";

/** Feature-owned workspace lifecycle status (replaces api WorkspaceRecord["status"] refs in stores). */
export type WorkspaceStatus = "active" | "closed" | "provisioning";

export type WorkspaceViewModel = {
  id: string;
  organizationId?: string;
  projectId?: string;
  repoId: string;
  name: string;
  title: string;
  sourceBranch: string;
  branch: string;
  summaryId: string;
  worktreePath?: string;
  nodeId?: string;
  kind?: "managed" | "local" | "folder";
  status?: WorkspaceStatus;
};

/**
 * Maps a backend workspace record into the UI workspace view model. Closed
 * tombstones and unknown-project rows are filtered by the caller/reconciler;
 * this mapper only reshapes fields.
 */
export function mapWorkspaceToViewModel(record: WorkspaceRecord): WorkspaceViewModel {
  return {
    id: record.id,
    organizationId: record.organizationId,
    projectId: record.projectId,
    repoId: record.projectId,
    name: record.branch ?? "",
    title: record.branch ?? "",
    sourceBranch: record.sourceBranch ?? "",
    branch: record.branch ?? "",
    summaryId: record.id,
    worktreePath: record.localPath,
    nodeId: record.nodeId,
    kind: "managed",
    status: record.status,
  };
}

export type WorkspacePullRequestViewModel = {
  id?: string;
  title?: string;
  number?: number;
  branch?: string;
  state?: string;
  checks?: unknown;
  mergeable?: boolean;
  author?: string;
  createdAt?: string;
  updatedAt?: string;
  headSha?: string;
  baseSha?: string;
  // Loose view shape: PR details are display-oriented and daemon-provided.
  [key: string]: unknown;
};

/**
 * Maps a daemon PR DTO into the PR view model. The projection store holds view
 * models only; raw daemon types stay in the RPC layer.
 */
export function mapPullRequestToViewModel(dto: DaemonWorkspacePullRequest): WorkspacePullRequestViewModel {
  return {
    number: dto.number,
    title: dto.title,
    branch: dto.branch,
    state: dto.status,
    checks: dto.checks,
    updatedAt: dto.updatedAt,
  };
}
