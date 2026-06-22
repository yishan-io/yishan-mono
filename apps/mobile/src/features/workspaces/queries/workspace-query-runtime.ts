import type { AuthStatus } from "@/features/auth";

type WorkspaceQueryContext = {
  organizationId: string;
  projectId: string;
  workspaceId?: string;
};

export function hasWorkspaceQueryContext({ organizationId, projectId, workspaceId }: WorkspaceQueryContext): boolean {
  if (organizationId.length === 0 || projectId.length === 0) {
    return false;
  }

  if (workspaceId !== undefined && workspaceId.length === 0) {
    return false;
  }

  return true;
}

export function hasWorkspaceQueryPath(path: string): boolean {
  return path.trim().length > 0;
}

export function isWorkspaceQueryEnabled({
  accessToken,
  enabled,
  organizationId,
  projectId,
  status,
  workspaceId,
}: WorkspaceQueryContext & {
  accessToken: string | null | undefined;
  enabled: boolean;
  status: AuthStatus;
}): boolean {
  return (
    enabled &&
    status === "authenticated" &&
    !!accessToken &&
    hasWorkspaceQueryContext({
      organizationId,
      projectId,
      workspaceId,
    })
  );
}

export function requireWorkspaceQueryAccessToken(accessToken: string | null | undefined): string {
  if (!accessToken) {
    throw new Error("Missing access token");
  }

  return accessToken;
}
