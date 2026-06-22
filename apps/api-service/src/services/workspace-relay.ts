import { and, eq } from "drizzle-orm";

import type { AppDb } from "@/db/client";
import { nodes, workspaces } from "@/db/schema";
import {
  OrganizationMembershipRequiredError,
  RelayNodeOfflineError,
  RelayRequestFailedError,
  RelayUnavailableError,
  WorkspaceLocalNodePermissionRequiredError,
  WorkspaceNodeNotFoundError,
  WorkspaceNotFoundError,
} from "@/errors";
import { getErrorMessage } from "@/lib/errors";
import { invokeRelayJsonRpc } from "@/lib/relay-client";
import { RelayRpcError } from "@/lib/relay-websocket";
import type { OrganizationService } from "@/services/organization-service";
import type { ServiceConfig } from "@/types";

export type RelayWorkspaceAccess = {
  id: string;
  localPath: string;
  nodeId: string;
};

export type RelayWorkspaceConnectionAccess = {
  relayApiToken: string;
  relayUrl: string;
  workspace: RelayWorkspaceAccess;
};

export async function resolveWorkspaceRelayAccess({
  actorUserId,
  config,
  db,
  organizationId,
  organizationService,
  projectId,
  workspaceId,
}: {
  actorUserId: string;
  config: ServiceConfig;
  db: AppDb;
  organizationId: string;
  organizationService: OrganizationService;
  projectId: string;
  workspaceId: string;
}): Promise<RelayWorkspaceConnectionAccess> {
  const role = await organizationService.getMembershipRole({
    organizationId,
    userId: actorUserId,
  });

  if (!role) {
    throw new OrganizationMembershipRequiredError();
  }

  const workspaceRows = await db
    .select({
      id: workspaces.id,
      localPath: workspaces.localPath,
      nodeId: workspaces.nodeId,
    })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.id, workspaceId),
        eq(workspaces.organizationId, organizationId),
        eq(workspaces.projectId, projectId),
        eq(workspaces.userId, actorUserId),
        eq(workspaces.status, "active"),
      ),
    )
    .limit(1);

  const workspace = workspaceRows[0];
  if (!workspace) {
    throw new WorkspaceNotFoundError({
      organizationId,
      projectId,
      workspaceId,
    });
  }

  const nodeRows = await db
    .select({
      id: nodes.id,
      ownerUserId: nodes.ownerUserId,
    })
    .from(nodes)
    .where(eq(nodes.id, workspace.nodeId))
    .limit(1);

  const node = nodeRows[0];
  if (!node) {
    throw new WorkspaceNodeNotFoundError(workspace.nodeId);
  }

  if (node.ownerUserId !== actorUserId) {
    throw new WorkspaceLocalNodePermissionRequiredError();
  }

  const relayUrl = config.relayUrl?.trim();
  const relayApiToken = config.relayApiToken?.trim();
  if (!relayUrl || !relayApiToken) {
    throw new RelayUnavailableError();
  }

  return {
    relayApiToken,
    relayUrl,
    workspace,
  };
}

export async function invokeWorkspaceRelay<T>({
  actorUserId,
  config,
  db,
  method,
  organizationId,
  organizationService,
  params,
  projectId,
  workspaceId,
}: {
  actorUserId: string;
  config: ServiceConfig;
  db: AppDb;
  method: string;
  organizationId: string;
  organizationService: OrganizationService;
  params: unknown;
  projectId: string;
  workspaceId: string;
}): Promise<{ result: T; workspace: RelayWorkspaceAccess }> {
  const { relayApiToken, relayUrl, workspace } = await resolveWorkspaceRelayAccess({
    actorUserId,
    config,
    db,
    organizationId,
    organizationService,
    projectId,
    workspaceId,
  });

  try {
    await invokeRelayJsonRpc({
      apiToken: relayApiToken,
      method: "workspace.open",
      nodeId: workspace.nodeId,
      params: {
        id: workspace.id,
        path: workspace.localPath,
      },
      relayUrl,
    });

    const result = await invokeRelayJsonRpc<T>({
      apiToken: relayApiToken,
      method,
      nodeId: workspace.nodeId,
      params,
      relayUrl,
    });

    return { result, workspace };
  } catch (error) {
    if (error instanceof RelayRpcError && error.code === -32002) {
      throw new RelayNodeOfflineError(workspace.nodeId);
    }

    throw new RelayRequestFailedError(method, {
      cause: getErrorMessage(error),
      nodeId: workspace.nodeId,
      workspaceId: workspace.id,
    });
  }
}
