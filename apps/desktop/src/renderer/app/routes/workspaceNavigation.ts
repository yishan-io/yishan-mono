const WORKSPACE_PATHNAME = "/";

type WorkspaceSessionFocus = {
  workspaceId?: string;
  sessionId?: string;
  tabId?: string;
};

/**
 * Builds one workspace navigation path that includes optional workspace/session focus query params.
 */
export function buildWorkspaceSessionNavigationPath(workspaceId: string, sessionId: string): string {
  const params = new URLSearchParams({
    workspaceId,
    sessionId,
  });

  return `${WORKSPACE_PATHNAME}?${params.toString()}`;
}

/**
 * Builds one workspace navigation path that focuses one workspace without a specific session.
 */
export function buildWorkspaceNavigationPath(workspaceId: string): string {
  const params = new URLSearchParams({
    workspaceId,
  });

  return `${WORKSPACE_PATHNAME}?${params.toString()}`;
}

/**
 * Builds one workspace navigation path that focuses one workspace tab directly.
 */
export function buildWorkspaceTabNavigationPath(workspaceId: string, tabId: string): string {
  const params = new URLSearchParams({
    workspaceId,
    tabId,
  });

  return `${WORKSPACE_PATHNAME}?${params.toString()}`;
}

/**
 * Parses one app navigation path and resolves optional workspace/session focus metadata.
 */
export function parseWorkspaceSessionNavigationPath(path: string): WorkspaceSessionFocus {
  const [pathname = "", search = ""] = path.split("?");
  if (pathname !== WORKSPACE_PATHNAME) {
    return {};
  }

  const params = new URLSearchParams(search);
  const workspaceId = params.get("workspaceId")?.trim();
  const sessionId = params.get("sessionId")?.trim();
  const tabId = params.get("tabId")?.trim();

  return {
    workspaceId: workspaceId && workspaceId.length > 0 ? workspaceId : undefined,
    sessionId: sessionId && sessionId.length > 0 ? sessionId : undefined,
    tabId: tabId && tabId.length > 0 ? tabId : undefined,
  };
}
