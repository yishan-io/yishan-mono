import type { WorkspaceKind } from "@/db/schema";
import { RelayNodeOfflineError, RelayRequestFailedError, RelayUnavailableError } from "@/errors";
import { getErrorMessage } from "@/lib/errors";
import { invokeRelayJsonRpc } from "@/lib/relay-client";
import { RelayRpcError } from "@/lib/relay-websocket";
import type { ServiceConfig } from "@/types";

export type WorkspaceProvisionRequest = {
  branch: string | null;
  contextEnabled: boolean;
  kind: WorkspaceKind;
  localPath: string;
  nodeId: string;
  organizationId: string;
  projectId: string;
  repoKey: string | null;
  setupHook: string;
  sourceBranch: string | null;
  workspaceId: string;
  workspaceName: string | null;
};

export type WorkspaceProvisionResult = {
  localPath: string;
  workspaceId: string;
};

export interface WorkspaceProvisioner {
  enqueueWorkspaceProvision(request: WorkspaceProvisionRequest): Promise<WorkspaceProvisionResult>;
}

type RelayWorkspaceCreateResult = {
  id?: string;
  status?: string;
  worktreePath?: string;
};

export class NoopWorkspaceProvisioner implements WorkspaceProvisioner {
  async enqueueWorkspaceProvision(request: WorkspaceProvisionRequest): Promise<WorkspaceProvisionResult> {
    return {
      localPath: request.localPath,
      workspaceId: request.workspaceId,
    };
  }
}

export class RelayWorkspaceProvisioner implements WorkspaceProvisioner {
  constructor(private readonly config: ServiceConfig) {}

  async enqueueWorkspaceProvision(request: WorkspaceProvisionRequest): Promise<WorkspaceProvisionResult> {
    if (request.kind !== "worktree") {
      return {
        localPath: request.localPath,
        workspaceId: request.workspaceId,
      };
    }

    const relayUrl = this.config.relayUrl?.trim();
    const relayApiToken = this.config.relayApiToken?.trim();
    if (!relayUrl || !relayApiToken) {
      throw new RelayUnavailableError();
    }

    const branch = request.branch?.trim() ?? "";
    const sourceBranch = request.sourceBranch?.trim() ?? "";
    const workspaceName = request.workspaceName?.trim() || branch;
    const repoKey = request.repoKey?.trim() || request.projectId;

    try {
      const result = await invokeRelayJsonRpc<RelayWorkspaceCreateResult>({
        apiToken: relayApiToken,
        method: "workspace.create",
        nodeId: request.nodeId,
        params: {
          id: request.workspaceId,
          organizationId: request.organizationId,
          nodeId: request.nodeId,
          projectId: request.projectId,
          repoKey,
          workspaceName,
          sourcePath: request.localPath,
          targetBranch: branch,
          sourceBranch,
          contextEnabled: request.contextEnabled,
          setupHook: request.setupHook || undefined,
        },
        relayUrl,
      });

      const workspaceId = result.id?.trim() || request.workspaceId;
      const localPath = result.worktreePath?.trim();
      if (!localPath) {
        throw new RelayRequestFailedError("workspace.create", {
          cause: "Missing worktreePath in relay response",
          nodeId: request.nodeId,
          workspaceId,
        });
      }

      return {
        localPath,
        workspaceId,
      };
    } catch (error) {
      if (error instanceof RelayRpcError && error.code === -32002) {
        throw new RelayNodeOfflineError(request.nodeId);
      }
      if (error instanceof RelayRequestFailedError || error instanceof RelayUnavailableError) {
        throw error;
      }

      throw new RelayRequestFailedError("workspace.create", {
        cause: getErrorMessage(error),
        nodeId: request.nodeId,
        workspaceId: request.workspaceId,
      });
    }
  }
}
