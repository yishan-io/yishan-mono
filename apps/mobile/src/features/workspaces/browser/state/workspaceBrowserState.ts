import { clearCachedWorkspaceChangesScrollOffset } from "./useWorkspaceChangesScrollState";
import { clearCachedWorkspaceExpandedPaths } from "./useWorkspaceExpandedPathsState";
import { clearCachedWorkspaceFileTreeScrollOffset } from "./useWorkspaceFileTreeScrollState";

export type WorkspaceBrowserTab = "files" | "changes" | "prs";

const browserTabCache = new Map<string, WorkspaceBrowserTab>();

export function createWorkspaceBrowserStateId(organizationId: string, projectId: string, workspaceId: string) {
  if (!organizationId || !projectId || !workspaceId) {
    return "";
  }

  return `${organizationId}:${projectId}:${workspaceId}`;
}

export function getCachedWorkspaceBrowserTab(browserStateId: string): WorkspaceBrowserTab {
  return browserStateId ? (browserTabCache.get(browserStateId) ?? "files") : "files";
}

export function setCachedWorkspaceBrowserTab(browserStateId: string, tab: WorkspaceBrowserTab) {
  if (!browserStateId) {
    return;
  }

  browserTabCache.set(browserStateId, tab);
}

export function clearCachedWorkspaceBrowserTab(browserStateId: string) {
  if (!browserStateId) {
    return;
  }

  browserTabCache.delete(browserStateId);
}

export async function clearWorkspaceBrowserStoredState(browserStateId: string): Promise<void> {
  clearCachedWorkspaceBrowserTab(browserStateId);
  clearCachedWorkspaceExpandedPaths(browserStateId);
  clearCachedWorkspaceFileTreeScrollOffset(browserStateId);
  clearCachedWorkspaceChangesScrollOffset(browserStateId);
}
